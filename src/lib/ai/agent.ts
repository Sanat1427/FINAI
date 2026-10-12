import { fallbackAi as ai } from "@/lib/ai/fallback";
import { answerWithRAG } from "@/lib/rag/rag";
import { generateToolCall } from "@/lib/ai/toolCaller";
import { executeToolCall } from "@/lib/ai/toolExecutor";
import { generateFinalResponse, OrchestrationResult, TaskType } from "@/lib/ai/orchestrator";

export interface HistoryMessage {
  role: string;
  content: string;
}

export interface AgentStep {
  action: "rag" | "financial" | "general" | "done";
  query: string;
  result: unknown;
  error?: string;
}

export interface AgentState {
  originalQuery: string;
  history: HistoryMessage[];
  source?: string;
  steps: AgentStep[];
  currentStep: number;
  maxSteps: number;
}

interface PlannerAction {
  action: "rag" | "financial" | "general" | "done";
  query?: string;
}

interface InspectionResult {
  continue: boolean;
  reason: string;
}

export async function planNextAction(state: AgentState): Promise<PlannerAction> {
  const conversation = state.history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const stepsContext = state.steps
    .map(
      (s, i) =>
        `Step ${i + 1}: Action ${s.action} - Query: ${s.query}\nResult: ${
          s.error || JSON.stringify(s.result)
        }`
    )
    .join("\n\n");

  const prompt = `
You are an agent planning the NEXT step to answer the user's query.

Original Query:
${state.originalQuery}

Conversation History:
${conversation || "None"}

Previous Steps Taken:
${stepsContext || "None so far"}

Based on what we have done so far, determine the NEXT action required.

Options for "action":
- "rag": For answering financial knowledge or educational questions.
- "financial": For performing calculations (EMI, simple/compound interest).
- "general": For generic conversational responses or simple calculations that don't need tools.
- "done": If you already have enough information from Previous Steps to answer the Original Query fully.

Rules:
- If we have all needed information, return "done".
- If "done", you do not need to provide a "query".
- Do not repeat an action for the same query if it has already been successfully taken.
- If a calculation is needed, action is "financial" and query is the calculation request.
- Return ONLY valid JSON format. Do not use markdown.

JSON Example:
{
  "action": "financial",
  "query": "Calculate EMI for 5 lakh at 9% for 5 years"
}
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

  let parsed: PlannerAction;
  try {
    parsed = JSON.parse(cleanText);
  } catch (e) {
    throw new Error("Failed to parse agent planner JSON");
  }

  // Validate the action
  const validActions = ["rag", "financial", "general", "done"];
  if (!parsed || !validActions.includes(parsed.action)) {
    throw new Error(`Invalid agent action: ${parsed?.action}`);
  }

  return parsed;
}

export async function inspectResult(state: AgentState, lastStep: AgentStep): Promise<InspectionResult> {
  if (state.currentStep >= state.maxSteps) {
    return { continue: false, reason: "Max steps reached." };
  }
  if (lastStep.action === "done") {
    return { continue: false, reason: "Planner returned done." };
  }

  const conversation = state.history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const stepsContext = state.steps
    .map(
      (s, i) =>
        `Step ${i + 1}: Action ${s.action} - Query: ${s.query}\nResult: ${
          s.error || JSON.stringify(s.result)
        }`
    )
    .join("\n\n");

  const prompt = `
You are inspecting the progress of an AI agent trying to answer a user's query.

Original Query:
${state.originalQuery}

Conversation History:
${conversation || "None"}

Agent Steps Executed So Far:
${stepsContext}

Determine if ANOTHER action is required, or if the agent has gathered enough information to construct the final response to the Original Query.

Rules:
- Return ONLY valid JSON.
- If enough information exists, set "continue" to false and provide a reason.
- If another capability is required, set "continue" to true and state what is missing.

JSON Example:
{
  "continue": false,
  "reason": "The required information has been collected."
}
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

  let parsed: InspectionResult;
  try {
    parsed = JSON.parse(cleanText);
  } catch (e) {
    return { continue: false, reason: "Inspection failed to parse JSON, stopping for safety." };
  }

  if (typeof parsed.continue !== "boolean") {
    return { continue: false, reason: "Invalid inspection result structure." };
  }

  return parsed;
}

export async function executeAgentAction(action: PlannerAction, state: AgentState): Promise<AgentStep> {
  if (action.action === "done") {
    return { action: "done", query: "", result: "Agent loop complete." };
  }

  const query = action.query || "";
  try {
    if (action.action === "rag") {
      const result = await answerWithRAG(query, state.history, state.source);
      return { action: action.action, query, result };
    } else if (action.action === "financial") {
      const toolCall = await generateToolCall(query, state.history);
      const result = await executeToolCall(toolCall);
      return { action: action.action, query, result };
    } else if (action.action === "general") {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: query,
      });
      return { action: action.action, query, result: response.text };
    } else {
      return { action: action.action, query, result: null, error: `Unknown action ${action.action}` };
    }
  } catch (error) {
    return {
      action: action.action,
      query,
      result: null,
      error: error instanceof Error ? error.message : "Execution failed",
    };
  }
}

export async function runAgentLoop(query: string, history: HistoryMessage[] = [], source?: string) {
  const state: AgentState = {
    originalQuery: query,
    history,
    source,
    steps: [],
    currentStep: 0,
    maxSteps: 3,
  };

  let keepGoing = true;

  while (keepGoing && state.currentStep < state.maxSteps) {
    try {
      const action = await planNextAction(state);

      if (action.action === "done") {
        break;
      }

      const stepResult = await executeAgentAction(action, state);
      state.steps.push(stepResult);
      state.currentStep++;

      const inspection = await inspectResult(state, stepResult);
      keepGoing = inspection.continue;

      if (!keepGoing) {
        break;
      }
    } catch (error) {
      console.error("Agent loop error:", error);
      state.steps.push({
        action: "general",
        query: "Agent loop failure",
        result: null,
        error: error instanceof Error ? error.message : "Unknown loop error",
      });
      break;
    }
  }

  // Reuse orchestrator's response generation for identical final output format
  const orchestrationResults: OrchestrationResult[] = state.steps.map((s) => ({
    taskType: (s.action === "done" ? "general" : s.action) as TaskType,
    result: s.result,
    error: s.error,
  }));

  const finalResponse = await generateFinalResponse(
    state.originalQuery,
    orchestrationResults,
    state.history
  );

  // Overwrite intent to clarify it came from the agent
  finalResponse.intent = "agent";

  return finalResponse;
}
