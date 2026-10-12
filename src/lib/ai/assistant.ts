import { fallbackAi as ai } from "@/lib/ai/fallback";
import { selectTool } from "@/lib/ai/toolSelector";
import { generateToolCall } from "@/lib/ai/toolCaller";
import { executeToolCall } from "@/lib/ai/toolExecutor";
import { answerWithRAG } from "@/lib/rag/rag";
import { getTool, EMIResult, SimpleInterestResult, CompoundInterestResult } from "@/lib/tools/registry";
import { ToolResult } from "@/lib/tools/types";
import { runOrchestrator } from "@/lib/ai/orchestrator";
import { runAgentLoop } from "@/lib/ai/agent";




interface HistoryMessage {
  role: string;
  content: string;
}

function formatEMIResult(result: ToolResult<EMIResult>): string {
  if (!result.success) {
    return result.error ?? "Unable to calculate EMI.";
  }

  const data = result.data;
  if (!data) {
    return "EMI calculation succeeded, but no data was returned.";
  }

  return `
For a loan of ₹${data.principal.toLocaleString("en-IN")}
at ${data.annualRate}% annual interest
for ${data.tenureYears} years:

Monthly EMI: ₹${data.emi.toFixed(2)}
Total Payment: ₹${data.totalPayment.toFixed(2)}
Total Interest: ₹${data.totalInterest.toFixed(2)}
  `.trim();
}

function formatSimpleInterestResult(result: ToolResult<SimpleInterestResult>): string {
  if (!result.success) {
    return result.error ?? "Unable to calculate simple interest.";
  }

  const data = result.data;
  if (!data) {
    return "Simple interest calculation succeeded, but no data was returned.";
  }

  return `
For a principal of ₹${data.principal.toLocaleString("en-IN")}
at ${data.annualRate}% annual interest
for ${data.timeYears} years:

Simple Interest: ₹${data.simpleInterest.toLocaleString("en-IN")}
Total Amount: ₹${data.totalAmount.toLocaleString("en-IN")}
  `.trim();
}

function formatCompoundInterestResult(result: ToolResult<CompoundInterestResult>): string {
  if (!result.success) {
    return result.error ?? "Unable to calculate compound interest.";
  }

  const data = result.data;
  if (!data) {
    return "Compound interest calculation succeeded, but no data was returned.";
  }

  return `
For a principal of ₹${data.principal.toLocaleString("en-IN")}
at ${data.annualRate}% annual interest
for ${data.timeYears} years:

Compound Interest: ₹${data.compoundInterest.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
Total Amount: ₹${data.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
  `.trim();
}


export async function answerAssistant(
  query: string,
  history: HistoryMessage[] = [],
  source?: string
) {
  let toolName = "general";
  try {
    const selection = await selectTool(query, history);
    toolName = selection.tool;
    console.log("Selected tool:", toolName);
  } catch (error) {
    console.error("Tool selection error:", error);
    return {
      answer: "Sorry, I’m temporarily unable to determine which financial tool to use. Please try again in a moment.",
      sources: [],
      intent: "error",
    };
  }

  // RAG request
  if (toolName === "rag") {
    const ragResponse = await answerWithRAG(
      query,
      history,
      source
    );
    return {
      ...ragResponse,
      intent: "rag",
    };
  }

  // Orchestrator request (multi-capability)
  if (toolName === "orchestrator") {
    const orchestratorResponse = await runOrchestrator(query, history, source);
    return {
      ...orchestratorResponse,
      intent: "orchestrator",
    };
  }

  // Agent request (sequential reasoning)
  if (toolName === "agent") {
    const agentResponse = await runAgentLoop(query, history, source);
    return {
      ...agentResponse,
      intent: "agent",
    };
  }

  // Calculator requests
  if (
    toolName === "emi" ||
    toolName === "simple_interest" ||
    toolName === "compound_interest"
  ) {
    try {
      const toolCall = await generateToolCall(query, history);
      console.log("Generated tool call:", toolCall);

      const result = await executeToolCall(toolCall);

      let answer = "";
      if (toolCall.tool === "emi") {
        answer = formatEMIResult(result as ToolResult<EMIResult>);
      } else if (toolCall.tool === "simple_interest") {
        answer = formatSimpleInterestResult(result as ToolResult<SimpleInterestResult>);
      } else if (toolCall.tool === "compound_interest") {
        answer = formatCompoundInterestResult(result as ToolResult<CompoundInterestResult>);
      }

      return {
        answer,
        sources: [],
        intent: toolCall.tool,
      };
    } catch (error) {
      console.error("Tool execution error:", error);
      return {
        answer:
          error instanceof Error
            ? error.message
            : "I encountered an error while calculating. Please try again.",
        sources: [],
        intent: toolName,
      };
    }
  }

  // General request
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: query,
  });

  return {
    answer: response.text,
    sources: [],
    intent: toolName,
  };
}