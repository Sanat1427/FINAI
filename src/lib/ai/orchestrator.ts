import { fallbackAi as ai } from "@/lib/ai/fallback";
import { answerWithRAG } from "@/lib/rag/rag";
import { generateToolCall } from "@/lib/ai/toolCaller";
import { executeToolCall } from "@/lib/ai/toolExecutor";
import { ToolResult } from "@/lib/tools/types";
import { EMIResult, SimpleInterestResult, CompoundInterestResult } from "@/lib/tools/registry";

export type TaskType = "rag" | "financial" | "general";

export interface OrchestrationTask {
  type: TaskType;
  query: string;
}

export interface OrchestrationPlan {
  tasks: OrchestrationTask[];
}

export interface OrchestrationResult {
  taskType: TaskType;
  result: unknown;
  error?: string;
}

interface HistoryMessage {
  role: string;
  content: string;
}

export async function planTasks(
  query: string,
  history: HistoryMessage[] = []
): Promise<OrchestrationPlan> {
  const conversation = history
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`
    )
    .join("\n");

  const prompt = `
You are an orchestrator planner for a financial AI assistant.
Your job is to break down the user's complex query into one or more discrete tasks.

Available task types:
- "rag": For answering financial knowledge or educational questions using the application's financial knowledge base (e.g., "What is inflation?", "Explain diversification").
- "financial": For performing financial calculations like EMI, simple interest, or compound interest (e.g., "Calculate EMI for 5 lakh at 9% for 5 years").
- "general": For general conversation not related to finance or calculations (e.g., "Hello").

Rules:
- Return ONLY a JSON object with a "tasks" array.
- Each task in the array must have a "type" (rag, financial, or general) and a "query" (the specific part of the user's request that this task should handle).
- Never invent financial values. Preserve the user's actual numerical values.
- Never calculate numbers inside the planner.
- Do not create unnecessary tasks.
- A combined question should produce multiple tasks (e.g., "Explain responsible borrowing according to RBI and calculate EMI for 5 lakh at 9% for 5 years" -> one RAG task, one financial task).
- Handle conversation history so follow-up questions can use previous context.
- Return ONLY valid JSON. Do not include markdown formatting like \`\`\`json.

Previous conversation:
${conversation || "No previous conversation."}

Current User Message:
${query}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text || "";
  const cleanText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: OrchestrationPlan;
  try {
    parsed = JSON.parse(cleanText);
  } catch (error) {
    throw new Error("Failed to parse orchestration plan as JSON.");
  }

  if (!parsed || !Array.isArray(parsed.tasks)) {
    throw new Error("Invalid orchestration plan structure.");
  }

  return parsed;
}

export async function executeOrchestrationTasks(
  tasks: OrchestrationTask[],
  history: HistoryMessage[] = [],
  source?: string
): Promise<OrchestrationResult[]> {
  const results = await Promise.all(
    tasks.map(async (task) => {
      try {
        if (task.type === "rag") {
          const result = await answerWithRAG(task.query, history, source);
          return { taskType: task.type, result };
        } else if (task.type === "financial") {
          const toolCall = await generateToolCall(task.query, history);
          const result = await executeToolCall(toolCall);
          return { taskType: task.type, result };
        } else if (task.type === "general") {
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: task.query,
          });
          return { taskType: task.type, result: response.text };
        } else {
          return { taskType: task.type, result: null, error: `Unknown task type: ${task.type}` };
        }
      } catch (error) {
        return {
          taskType: task.type,
          result: null,
          error: error instanceof Error ? error.message : "Unknown error during task execution",
        };
      }
    })
  );
  return results;
}

export async function generateFinalResponse(
  query: string,
  results: OrchestrationResult[],
  history: HistoryMessage[] = []
): Promise<{ answer: string; sources: any[]; intent: string }> {
  const conversation = history
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`
    )
    .join("\n");

  const contextStrings = results.map((r, i) => {
    let resultStr = "";
    if (r.error) {
      resultStr = `Error: ${r.error}`;
    } else {
      resultStr = JSON.stringify(r.result, null, 2);
    }
    return `Task ${i + 1} (${r.taskType} result):\n${resultStr}`;
  });

  const context = contextStrings.join("\n\n");

  const prompt = `
You are a financial AI assistant synthesizing multiple pieces of information into a natural, cohesive response.

Rules:
- DO NOT invent or alter any numerical results, calculations, or definitions.
- Use the exact numbers provided in the Task results.
- If a task resulted in an error, politely explain what failed in a user-friendly way (e.g., "I could retrieve the RBI information, but I couldn't complete the EMI calculation because..."). Do not expose raw internal errors.
- Synthesize the successful results seamlessly into a conversational response.
- Do not mention "Task 1" or "Task 2" in your response.

Conversation History:
${conversation || "No previous conversation."}

Task Results:
${context}

Current User Question:
${query}
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
  });

  let sources: any[] = [];
  for (const r of results) {
    if (r.taskType === "rag" && !r.error && r.result) {
      const ragResult = r.result as any;
      if (ragResult.sources && Array.isArray(ragResult.sources)) {
        sources = [...sources, ...ragResult.sources];
      }
    }
  }

  // Deduplicate sources based on source and pageNumber
  const uniqueSources = [];
  const seen = new Set();
  for (const s of sources) {
    const key = `${s.source}-${s.pageNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSources.push(s);
    }
  }

  return {
    answer: response.text || "",
    sources: uniqueSources,
    intent: "orchestrator",
  };
}

export async function runOrchestrator(
  query: string,
  history: HistoryMessage[] = [],
  source?: string
) {
  const plan = await planTasks(query, history);
  const results = await executeOrchestrationTasks(plan.tasks, history, source);
  return await generateFinalResponse(query, results, history);
}
