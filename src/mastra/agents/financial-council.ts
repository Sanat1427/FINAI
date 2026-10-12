import { z } from "zod";
import { optimistAgent } from "./optimist";
import { pessimistAgent } from "./pessimist";
import { judgeAgent, judgeOutputSchema } from "./judge";
import { deduplicatedAnswerWithRAG } from "../tools/rag";
import { fallbackAi } from "@/lib/ai/fallback";
import { detectComparisonQuery, executeMultiDocumentComparison } from "@/lib/rag/comparison";
import { isQuotaError, markGeminiQuotaExhausted, isGeminiQuotaExhausted } from "@/lib/ai/quota-tracker";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

export function extractStructuredJson(rawText?: string): any | null {
  if (!rawText || typeof rawText !== "string") return null;
  const sanitized = sanitizeText(rawText);

  // Try extracting markdown JSON block: ```json ... ``` or ``` ... ```
  const codeBlockMatch = sanitized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
  }

  // Try extracting from outermost braces
  const firstBrace = sanitized.indexOf("{");
  const lastBrace = sanitized.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(sanitized.slice(firstBrace, lastBrace + 1));
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
  }

  return null;
}

export function toStringArray(val: any): string[] {
  if (Array.isArray(val)) return val.map(sanitizeText).filter(Boolean);
  if (typeof val === "string" && val.trim()) return [sanitizeText(val)];
  return [];
}

export interface PerspectiveDetails {
  summary: string;
  points: string[];
  caveats?: string[];
}

export interface CouncilResult {
  isFastPath?: boolean;
  routing?: "fast_path" | "financial_council";
  citations?: Array<{
    source: string;
    pageNumber: number | null;
    snippet?: string;
  }>;
  optimistPerspective?: string;
  pessimistPerspective?: string;
  optimistDetails?: PerspectiveDetails;
  pessimistDetails?: PerspectiveDetails;
  optimistModel?: string;
  pessimistModel?: string;
  judgeModel?: string;
  judgeProvider?: string;
  judgeAssessment?: z.infer<typeof judgeOutputSchema>;
  sources?: string[];
  error?: string;
  metrics?: {
    retrievalDurationMs?: number;
    optimistDurationMs?: number;
    pessimistDurationMs?: number;
    judgeDurationMs?: number;
    totalDurationMs?: number;
  };
}

export type HistoryMessage = { role: "user" | "assistant"; content: string };

/**
 * Strips raw HTML tags and AI thinking tags (e.g. <think>...</think>) from model outputs
 */
export function sanitizeText(text?: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    // Strip <think> blocks
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    // Strip other potential raw HTML tags
    .replace(/<[^>]*>/g, "")
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parses raw perspective text into structured components (summary, points, caveats)
 */
export function parsePerspective(text?: string, type: "optimist" | "pessimist" = "optimist"): PerspectiveDetails {
  const sanitized = sanitizeText(text);
  if (!sanitized) {
    return {
      summary: type === "optimist" 
        ? "The Optimist agent was unable to formulate an analysis." 
        : "The Pessimist agent was unable to formulate an analysis.",
      points: [],
      caveats: [],
    };
  }

  const lines = sanitized.split("\n").map((l) => l.trim()).filter(Boolean);
  const points: string[] = [];
  const caveats: string[] = [];
  const summaryLines: string[] = [];

  for (const line of lines) {
    const isBullet = line.startsWith("- ") || line.startsWith("* ") || /^\d+\.\s/.test(line);
    const cleaned = line.replace(/^[-*]\s+|\d+\.\s+/, "").trim();

    if (isBullet) {
      if (
        cleaned.toLowerCase().includes("unknown") ||
        cleaned.toLowerCase().includes("unverified") ||
        cleaned.toLowerCase().includes("consideration") ||
        cleaned.toLowerCase().includes("depends on") ||
        cleaned.toLowerCase().includes("subject to")
      ) {
        caveats.push(cleaned);
      } else {
        points.push(cleaned);
      }
    } else if (!line.startsWith("#") && !line.startsWith("<") && !line.endsWith(">")) {
      summaryLines.push(line);
    }
  }

  const summary = summaryLines.slice(0, 3).join(" ") || sanitized.slice(0, 300);

  return {
    summary,
    points: points.slice(0, 6),
    caveats: caveats.slice(0, 4),
  };
}

export async function runFinancialCouncil(
  question: string,
  history: HistoryMessage[] = [],
  source?: string,
  customClient?: any
): Promise<CouncilResult> {
  const councilStartTime = Date.now();

  // 1. Single grounded retrieval upfront to prevent redundant tool loops between parallel agents
  let retrievalDuration = 0;
  const uniqueSources = new Set<string>();
  const evidence: { fact: string; source: string }[] = [];

  const tRetrieval = Date.now();
  try {
    const isComparison = detectComparisonQuery(question);
    if (isComparison && customClient) {
      const compRes = await executeMultiDocumentComparison(question, history, customClient);
      if (compRes.isComparison && compRes.sources.length > 0) {
        for (const s of compRes.sources) {
          evidence.push({
            fact: s.excerpt || `Clause from ${s.source} (Page ${s.pageNumber})`,
            source: `${s.source}${s.pageNumber ? ` (Page ${s.pageNumber})` : ""}`,
          });
          uniqueSources.add(s.source);
        }
      }
    } else {
      const preloadedRAG = await deduplicatedAnswerWithRAG(question, source, customClient);
      if (preloadedRAG?.sources?.length > 0 && preloadedRAG.answer) {
        const sourceString = preloadedRAG.sources
          .map((s: any) => `${s.source}${s.pageNumber ? ` (Page ${s.pageNumber})` : ""}`)
          .join(", ");
        evidence.push({
          fact: sanitizeText(preloadedRAG.answer),
          source: sourceString,
        });
        preloadedRAG.sources.forEach((s: any) => uniqueSources.add(s.source));
      }
    }
  } catch (retrievalErr) {
    console.warn("Upfront retrieval encountered error, continuing with perspectives:", retrievalErr);
  }
  retrievalDuration = Date.now() - tRetrieval;

  // Efficiency optimization: limit history to the last 4 messages to reduce redundant prompt overhead
  const boundedHistory = history.slice(-4);

  // If evidence was preloaded, include it directly in prompt so agents generate in 1 call without tool loops!
  let contextualizedQuestion = question;
  if (evidence.length > 0) {
    const evidenceBlock = evidence.map((e) => `[Source: ${e.source}]\n${e.fact}`).join("\n\n");
    contextualizedQuestion = `User Question: ${question}

Grounded Knowledge Evidence (Retrieved from authorized documents):
${evidenceBlock}

Instructions: Ground your analysis strictly on the verified facts above. Focus on concrete financial opportunities/caveats or risks. Keep response concise (under 200 words). Do not repeat retrieval unless a different sub-query is strictly required.`;
  } else if (source) {
    contextualizedQuestion = `[CRITICAL INSTRUCTION: You MUST use the 'financial-rag' tool with the 'source' argument set exactly to "${source}". Do not omit it.]\n\n${question}`;
  }

  const messages = [...boundedHistory, { role: "user" as const, content: contextualizedQuestion }];

  // Measure parallel Optimist and Pessimist duration
  const parallelStartTime = Date.now();
  const [optimistResult, pessimistResult] = await Promise.allSettled([
    optimistAgent.generate(messages as any),
    pessimistAgent.generate(messages as any),
  ]);
  const parallelDuration = Date.now() - parallelStartTime;

  // Circuit breaker: If either perspective failed due to quota exhaustion, trip the breaker immediately
  for (const res of [optimistResult, pessimistResult]) {
    if (res.status === "rejected") {
      const err = res.reason;
      if (isQuotaError(err)) {
        markGeminiQuotaExhausted(
          undefined,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  const rawOptimistText = optimistResult.status === "fulfilled" ? optimistResult.value.text : undefined;
  const rawPessimistText = pessimistResult.status === "fulfilled" ? pessimistResult.value.text : undefined;

  const optimistPerspective = sanitizeText(rawOptimistText) || undefined;
  const pessimistPerspective = sanitizeText(rawPessimistText) || undefined;

  const optimistDetails = parsePerspective(optimistPerspective, "optimist");
  const pessimistDetails = parsePerspective(pessimistPerspective, "pessimist");

  // Extract actual models used from Mastra response
  const optimistModel =
    optimistResult.status === "fulfilled"
      ? (optimistResult.value as any).steps?.[0]?.modelId ||
        (optimistResult.value as any).response?.modelId ||
        "unknown"
      : undefined;
  const pessimistModel =
    pessimistResult.status === "fulfilled"
      ? (pessimistResult.value as any).steps?.[0]?.modelId ||
        (pessimistResult.value as any).response?.modelId ||
        "unknown"
      : undefined;

  if (!optimistPerspective && !pessimistPerspective) {
    return {
      error: "Both perspective agents failed to generate an analysis.",
      metrics: {
        retrievalDurationMs: retrievalDuration,
        totalDurationMs: Date.now() - councilStartTime,
      },
    };
  }

  let calculationResults: any = undefined;

  const responses = [
    optimistResult.status === "fulfilled" ? optimistResult.value : null,
    pessimistResult.status === "fulfilled" ? pessimistResult.value : null,
  ];

  // Merge any additional tool results invoked by agents (e.g. calculation tools or sub-queries)
  for (const response of responses) {
    if (!response) continue;
    const toolResults: any[] =
      (response as any).toolResults ||
      ((response as any).steps && (response as any).steps.flatMap((s: any) => s.toolResults || [])) ||
      [];

    for (const tr of toolResults) {
      if (tr.toolName === "financial-rag" && tr.result) {
        const { answer, sources, error } = tr.result;
        if (error || (typeof answer === "string" && answer.startsWith("[ERROR:"))) {
          evidence.push({
            fact: `[RETRIEVAL_ERROR: ${error || answer}]`,
            source: "System Error (Knowledge retrieval encountered a failure; not an empty match)",
          });
        } else if (answer && sources && sources.length > 0) {
          const sourceString = sources
            .map((s: any) => `${s.source}${s.pageNumber ? ` (Page ${s.pageNumber})` : ""}`)
            .join(", ");
          evidence.push({
            fact: sanitizeText(answer),
            source: sourceString,
          });
          sources.forEach((s: any) => uniqueSources.add(s.source));
        }
      }

      if (tr.toolName === "calculate-emi" && tr.result) {
        calculationResults = tr.result;
      }
    }
  }

  // Compact formatted evidence & calculations to respect provider token limits
  const formattedEvidence = evidence.length > 0
    ? evidence.slice(0, 6).map((e, idx) => `[${idx + 1}] (${e.source}): ${e.fact.slice(0, 200).replace(/\s+/g, " ")}`).join("\n")
    : "No document evidence retrieved.";

  const formattedCalculations = calculationResults
    ? `EMI: ${calculationResults.emi ?? "N/A"}, Total Payment: ${calculationResults.totalPayment ?? "N/A"}, Total Interest: ${calculationResults.totalInterest ?? "N/A"}`
    : "None";

  // Concise bounded summaries for Judge prompt to keep input token budget low
  const boundedOptimist = (optimistDetails?.summary || optimistPerspective || "").slice(0, 350).trim();
  const boundedPessimist = (pessimistDetails?.summary || pessimistPerspective || "").slice(0, 350).trim();

  const prompt = `Please evaluate the following perspectives and data.

Question: ${question}

Optimist Analysis:
${boundedOptimist || "Not available"}

Pessimist Analysis:
${boundedPessimist || "Not available"}

Retrieved Evidence:
${formattedEvidence}

Calculation Results:
${formattedCalculations}

Instructions for Judge:
- Do NOT perform additional document retrieval or recalculations; all evidence and calculations are provided above.
- Distinguish 4 claim types:
  1. Document Claims (ground strictly on retrieved evidence above, preserving source and page references).
  2. Deterministic Calculations (incorporate calculated figures without recalculation).
  3. General Financial Reasoning (frame as standard economic principles; do NOT attribute to RBI FAME, ICICI, SBI or documents unless text says so).
  4. Unknown or Unverified Information (state unknowns only in assumptions or verification steps).
- Avoid redundancy: Do NOT repeat the same evidence gap across multiple sections.
- Deliver a clear, concise bottom-line verdict statement under 25 words.
- Synthesize both perspectives concisely in balancedAssessment under 120 words.
- Identify top 2-3 supported benefits and top 2-3 supported risks.
- Output valid JSON matching the schema.
`;

  let judgeAssessment: z.infer<typeof judgeOutputSchema> | undefined;
  let errorMsg: string | undefined;

  const judgeStartTime = Date.now();
  let primaryDuration = 0;
  let fallbackDuration = 0;
  let validationDuration = 0;
  let observedJudgeModel = "unknown";
  let observedJudgeProvider = "unknown";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let actualFailureReason: string | undefined;
  let parsed: any = undefined;

  // 1. Primary Attempt: Mastra judgeAgent structured generation
  const tPrimaryStart = Date.now();
  try {
    const judgeResponse = await judgeAgent.generate(prompt, {
      structuredOutput: {
        schema: judgeOutputSchema,
      },
    });
    primaryDuration = Date.now() - tPrimaryStart;

    observedJudgeModel =
      (judgeResponse as any).steps?.[0]?.modelId ||
      (judgeResponse as any).response?.modelId ||
      (isGeminiQuotaExhausted() ? "groq/qwen/qwen3.8-27b" : "google/gemini-3.5-flash");
    observedJudgeProvider = observedJudgeModel.includes("google")
      ? "google"
      : observedJudgeModel.includes("groq") || observedJudgeModel.includes("qwen")
      ? "groq"
      : "mastra";

    inputTokens = (judgeResponse as any).usage?.inputTokens ?? (judgeResponse as any).usage?.promptTokens;
    outputTokens = (judgeResponse as any).usage?.outputTokens ?? (judgeResponse as any).usage?.completionTokens;

    parsed = judgeResponse.object;

    // 2. Recovery Attempt: If structuredOutput was undefined, extract JSON from raw response text
    if (!parsed && judgeResponse.text) {
      parsed = extractStructuredJson(judgeResponse.text);
    }
  } catch (primaryErr: any) {
    primaryDuration = Date.now() - tPrimaryStart;
    actualFailureReason = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);

    if (isQuotaError(primaryErr)) {
      markGeminiQuotaExhausted(
        undefined,
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      );
    }

    console.warn("Judge primary generation threw error, attempting provider fallback:", actualFailureReason);
  }

  // 3. Fallback Attempt: If primary attempt failed or returned no parsable object, call fallbackAi
  if (!parsed) {
    const tFallbackStart = Date.now();
    try {
      const fallbackPrompt = `You are a Financial Judge. Synthesize the council perspectives below into a balanced verdict.
Return ONLY a valid JSON object matching this schema:
{
  "verdict": "Clear concise verdict statement under 25 words",
  "balancedAssessment": "Balanced synthesis under 120 words distinguishing document facts, deterministic calculations, and general reasoning",
  "benefits": ["Top benefit 1", "Top benefit 2"],
  "risks": ["Top risk 1", "Top risk 2"],
  "assumptions": ["Key assumption"],
  "verificationSteps": ["Verification step"]
}

Question: ${question}
Optimist Analysis: ${boundedOptimist}
Pessimist Analysis: ${boundedPessimist}
Evidence: ${formattedEvidence}
Calculations: ${formattedCalculations}

Grounding instructions:
- Distinguish document facts, calculations, general financial reasoning, and unknowns.
- Do NOT repeat the same evidence gap across multiple sections.
- Do NOT attribute general reasoning to RBI FAME or documents without source evidence.
`;

      const fbResponse = await fallbackAi.models.generateContent({
        model: "gemini-3.5-flash",
        contents: fallbackPrompt,
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 600,
        },
      });
      fallbackDuration = Date.now() - tFallbackStart;
      observedJudgeModel = fbResponse.model || "fallback-model";
      observedJudgeProvider = fbResponse.provider || "fallbackAi";

      const fbUsage = (fbResponse as any).usage;
      if (fbUsage) {
        inputTokens = fbUsage.prompt_tokens ?? fbUsage.promptTokens ?? inputTokens;
        outputTokens = fbUsage.completion_tokens ?? fbUsage.completionTokens ?? outputTokens;
      }

      parsed = extractStructuredJson(fbResponse.text);
    } catch (fallbackErr: any) {
      fallbackDuration = Date.now() - tFallbackStart;
      const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      actualFailureReason = actualFailureReason ? `${actualFailureReason} | Fallback Error: ${fbMsg}` : fbMsg;
      console.error("Judge fallback provider call failed:", fbMsg);
    }
  }

  // 4. Construct validated judgeAssessment if any attempt succeeded
  if (parsed && typeof parsed === "object") {
    const tValidationStart = Date.now();
    const verdict = sanitizeText(parsed.verdict || parsed.balancedAssessment || "Council Consensus");
    const balancedAssessment = sanitizeText(parsed.balancedAssessment || parsed.verdict || "");
    const benefits = toStringArray(parsed.benefits);
    const risks = toStringArray(parsed.risks);
    const assumptions = toStringArray(parsed.assumptions);
    const missingInformation = toStringArray(parsed.missingInformation);
    const verificationSteps = toStringArray(parsed.verificationSteps);

    judgeAssessment = {
      verdict,
      balancedAssessment,
      benefits,
      risks,
      assumptions,
      missingInformation,
      verificationSteps,
      evidence:
        Array.isArray(parsed.evidence) && parsed.evidence.length > 0
          ? parsed.evidence.map((e: any) => ({
              fact: sanitizeText(e.fact),
              source: sanitizeText(e.source),
            }))
          : evidence,
    };
    validationDuration = Date.now() - tValidationStart;
  } else {
    // 5. Honest failure state when all recovery attempts fail
    console.error("Judge verdict synthesis completely unavailable after all attempts", {
      hasOptimist: Boolean(optimistPerspective),
      hasPessimist: Boolean(pessimistPerspective),
      evidenceCount: evidence.length,
      actualFailureReason,
    });
    errorMsg = "Council verdict unavailable. Review the individual perspectives above or retry.";
  }
  const judgeDuration = Date.now() - judgeStartTime;

  // Task 1 Diagnostic Log: Log all 7 diagnostic fields required
  console.log("[Judge Latency Diagnosis]", JSON.stringify({
    provider: observedJudgeProvider,
    model: observedJudgeModel,
    providerRequestDurationMs: primaryDuration,
    retryAndFallbackDurationMs: fallbackDuration,
    structuredOutputValidationDurationMs: validationDuration,
    totalJudgeStageDurationMs: judgeDuration,
    inputTokenCount: inputTokens ?? "N/A",
    outputTokenCount: outputTokens ?? "N/A",
    repeatedToolCallsOrRetrieval: 0,
    actualFailureReason: actualFailureReason || null,
  }, null, 2));

  // Construct partial and total failure messages
  if (!optimistPerspective && !pessimistPerspective) {
    errorMsg = errorMsg
      ? `${errorMsg} Both Optimist and Pessimist agents failed.`
      : "Both Optimist and Pessimist agents failed to generate analyses.";
  } else if (!optimistPerspective && pessimistPerspective) {
    errorMsg = errorMsg ? `${errorMsg} Optimist agent also failed.` : "Optimist agent failed to generate an analysis.";
  } else if (optimistPerspective && !pessimistPerspective) {
    errorMsg = errorMsg ? `${errorMsg} Pessimist agent also failed.` : "Pessimist agent failed to generate an analysis.";
  }

  const totalDuration = Date.now() - councilStartTime;

  return {
    optimistPerspective,
    pessimistPerspective,
    optimistDetails,
    pessimistDetails,
    optimistModel,
    pessimistModel,
    judgeModel: observedJudgeModel,
    judgeProvider: observedJudgeProvider,
    judgeAssessment,
    sources: Array.from(uniqueSources),
    metrics: {
      retrievalDurationMs: retrievalDuration,
      optimistDurationMs: parallelDuration,
      pessimistDurationMs: parallelDuration,
      judgeDurationMs: judgeDuration,
      totalDurationMs: totalDuration,
    },
    ...(errorMsg ? { error: errorMsg } : {}),
  };
}
