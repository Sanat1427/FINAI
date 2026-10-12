import { runFinancialCouncil, CouncilResult } from "@/mastra/agents/financial-council";
import { createClient } from "@/utils/supabase/server";
import { answerWithRAG } from "@/lib/rag/rag";
import { detectComparisonQuery, executeMultiDocumentComparison } from "@/lib/rag/comparison";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

type HistoryMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

function classifyQueryIntent(message: string): "factual_document" | "financial_decision" {
  const normalized = message.trim().toLowerCase();

  // Strong decision signals requiring multiple Council perspectives (Optimist + Pessimist + Judge)
  const decisionIndicators = [
    /\bshould\s+i\b/,
    /\bis\s+it\s+(good|wise|safe|better|advisable|worth|smart)\b/,
    /\bcan\s+i\s+afford\b/,
    /\bwould\s+you\s+recommend\b/,
    /\bpros\s+and\s+cons\b/,
    /\btrade-?offs?\b/,
    /\badvice\b/,
    /\badvise\s+me\b/,
    /\bdecision\b/,
    /\bchoose\s+between\b/,
    /\bcompare\s+.*\s+(or|versus|vs)\b/,
    /\b(invest|borrow)\s+or\s+(save|prepay)\b/,
    /\bhow\s+much\s+should\s+i\b/,
    /\bfinancial\s+plan(ning)?\b/,
    /\bworth\s+taking\b/,
  ];

  for (const pattern of decisionIndicators) {
    if (pattern.test(normalized)) {
      return "financial_decision";
    }
  }

  // Factual document queries: lookups about specific clauses, guidelines, policies, or loan terms
  const factualIndicators = [
    /\bwhat\s+(is|are|does)\s+the\b/,
    /\bwhat\s+does\s+.*\s+(say|state|specify|define|mention)\b/,
    /\baccording\s+to\b/,
    /\b(prepayment|foreclosure)\s+(charges?|fees?|conditions?|terms?|penalty)\b/,
    /\b(interest\s+rate|apr|processing\s+fee|charges|penalty|terms)\s+(in|of|under|for)\b/,
    /\beligibility\s+(criteria|requirements?)\b/,
    /\bdocuments?\s+required\b/,
    /\bclause\b/,
    /\bkey\s+fact\s+statement\b/,
    /\bkfs\b/,
    /\bmitc\b/,
    /\bdefinition\s+of\b/,
  ];

  for (const pattern of factualIndicators) {
    if (pattern.test(normalized)) {
      return "factual_document";
    }
  }

  // Conservative default: route to full Financial Council
  return "financial_decision";
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ reply: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const message = body.message;
    const history = body.history;
    const source = body.source;
    const requestedMode = body.mode; // "fast" | "council" | undefined (auto)

    if (!message || typeof message !== "string") {
      return Response.json(
        { reply: "Message is required" },
        { status: 400 }
      );
    }

    let parsedHistory: HistoryMessage[] = [];
    if (Array.isArray(history)) {
      parsedHistory = history.map((msg: any) => {
        if (!msg || !["user", "assistant"].includes(msg.role) || typeof msg.content !== "string") {
          throw new Error("Invalid history format");
        }
        return msg.role === "user"
          ? { role: "user", content: msg.content }
          : { role: "assistant", content: msg.content };
      });
    } else if (history !== undefined) {
       throw new Error("Invalid history format");
    }

    // Limit to the last 10 messages for context efficiency
    const recentHistory = parsedHistory.slice(-10);

    const startTime = Date.now();
    const reqId = Math.random().toString(36).substring(7);

    // Routing determination
    const routing =
      requestedMode === "council"
        ? "financial_decision"
        : requestedMode === "fast"
        ? "factual_document"
        : classifyQueryIntent(message);

    // Fast Path: Direct grounded RAG response for straightforward factual queries
    if (routing === "factual_document") {
      console.log(JSON.stringify({
        reqId,
        action: "fast_path_rag",
        message: message.substring(0, 50) + "..."
      }));

      // Check if this is a comparison query naming multiple documents or institutions
      if (detectComparisonQuery(message)) {
        const compResult = await executeMultiDocumentComparison(message, recentHistory, supabase);
        if (compResult.isComparison) {
          const duration = Date.now() - startTime;
          const seenCitationKeys = new Set<string>();
          const deduplicatedCitations: Array<{ source: string; pageNumber: number | null; snippet?: string }> = [];
          const deduplicatedSources: string[] = [];

          for (const s of compResult.sources || []) {
            if (!s.source) continue;
            const key = `${s.source}#${s.pageNumber ?? ""}`;
            if (!seenCitationKeys.has(key)) {
              seenCitationKeys.add(key);
              deduplicatedCitations.push({
                source: s.source,
                pageNumber: s.pageNumber ?? null,
                snippet: s.excerpt || undefined,
              });
              if (!deduplicatedSources.includes(s.source)) {
                deduplicatedSources.push(s.source);
              }
            }
          }

          const hasMissing = compResult.missingSources && compResult.missingSources.length > 0;

          const councilResult: CouncilResult = {
            isFastPath: true,
            routing: "fast_path",
            sources: deduplicatedSources,
            citations: deduplicatedCitations,
            judgeAssessment: {
              verdict: hasMissing ? "Partial Comparison (Missing Sources)" : "Multi-Document Comparison",
              balancedAssessment: compResult.answer,
              benefits: [],
              risks: [],
              assumptions: ["Directly referenced from authorized knowledge base documents."],
              missingInformation: [],
              verificationSteps: [
                "Verify specific terms against your sanction letter and Key Fact Statement (KFS).",
              ],
              evidence: deduplicatedCitations.map((s) => ({
                fact: s.snippet || `Referenced from ${s.source}${s.pageNumber ? ` (Page ${s.pageNumber})` : ""}`,
                source: `${s.source}${s.pageNumber ? ` (Page ${s.pageNumber})` : ""}`,
              })),
            },
            metrics: {
              retrievalDurationMs: duration,
              totalDurationMs: duration,
            },
          };

          return Response.json({
            reply: compResult.answer,
            councilResult,
            routing: "fast_path",
          });
        }
      }

      // Ordinary single-document questions remain on the standard RAG fast path
      const ragResult = await answerWithRAG(message, recentHistory, source, supabase);
      const duration = Date.now() - startTime;

      const isError = typeof ragResult.answer === "string" && ragResult.answer.startsWith("[ERROR:");

      // Deduplicate sources and citations by source + pageNumber
      const seenCitationKeys = new Set<string>();
      const deduplicatedCitations: Array<{ source: string; pageNumber: number | null; snippet?: string }> = [];
      const deduplicatedSources: string[] = [];

      for (const s of ragResult.sources || []) {
        if (!s.source) continue;
        const key = `${s.source}#${s.pageNumber ?? ""}`;
        if (!seenCitationKeys.has(key)) {
          seenCitationKeys.add(key);
          deduplicatedCitations.push({
            source: s.source,
            pageNumber: s.pageNumber ?? null,
            snippet: s.excerpt || undefined,
          });
          if (!deduplicatedSources.includes(s.source)) {
            deduplicatedSources.push(s.source);
          }
        }
      }

      const councilResult: CouncilResult = {
        isFastPath: true,
        routing: "fast_path",
        sources: deduplicatedSources,
        citations: deduplicatedCitations,
        judgeAssessment: {
          verdict: isError ? "Retrieval Issue" : "Grounded Document Extract",
          balancedAssessment: ragResult.answer,
          benefits: [],
          risks: [],
          assumptions: ["Directly referenced from authorized knowledge base documents."],
          missingInformation: [],
          verificationSteps: [
            "Verify specific terms against your sanction letter and Key Fact Statement (KFS).",
          ],
          evidence: deduplicatedCitations.map((s) => ({
            fact: s.snippet || `Referenced from ${s.source}${s.pageNumber ? ` (Page ${s.pageNumber})` : ""}`,
            source: `${s.source}${s.pageNumber ? ` (Page ${s.pageNumber})` : ""}`,
          })),
        },
        metrics: {
          retrievalDurationMs: duration,
          totalDurationMs: duration,
        },
      };

      return Response.json({
        reply: ragResult.answer,
        councilResult,
        routing: "fast_path",
      });
    }

    // Full Financial Council for complex decisions or explicit requests
    console.log(JSON.stringify({
      reqId,
      action: "start_council",
      message: message.substring(0, 50) + "..."
    }));

    const response = await runFinancialCouncil(message, recentHistory, source, supabase);
    response.isFastPath = false;
    response.routing = "financial_council";
    const duration = Date.now() - startTime;

    const hasAnySuccess = Boolean(
      response.judgeAssessment?.balancedAssessment ||
      response.optimistPerspective ||
      response.pessimistPerspective
    );

    const logEntry = {
      reqId,
      durationMs: duration,
      metrics: response.metrics,
      ragUsed: !!source,
      ragChunksRetrieved: response.sources?.length || 0,
      optimistSuccess: !!response.optimistPerspective,
      pessimistSuccess: !!response.pessimistPerspective,
      judgeSuccess: !!response.judgeAssessment,
      error: response.error || null,
      observedOptimistModel: response.optimistModel, 
      observedPessimistModel: response.pessimistModel,
      routing: "financial_council",
    };

    console.log(JSON.stringify(logEntry));

    if (!hasAnySuccess) {
      return Response.json(
        {
          reply: "The Financial Council was unable to process this request. Please try again shortly.",
          error: "All council agents failed to generate an analysis.",
          councilResult: response,
        },
        { status: 500 }
      );
    }

    let replyText = "";
    if (response.judgeAssessment?.balancedAssessment) {
      replyText = response.judgeAssessment.balancedAssessment;
    } else {
      replyText = [response.optimistPerspective, response.pessimistPerspective]
        .filter(Boolean)
        .join("\n\n");
    }

    return Response.json({
      reply: replyText,
      councilResult: response,
      routing: "financial_council",
    });
  } catch (error) {
    console.error("AI Error:", error);

    if (error instanceof Error && error.message === "Invalid history format") {
      return Response.json(
        { reply: "Invalid history format", error: "Invalid history format" },
        { status: 400 }
      );
    }

    return Response.json(
      {
        reply: "Failed to process your request. Please try again.",
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}