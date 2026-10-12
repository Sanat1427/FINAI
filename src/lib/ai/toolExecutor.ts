import { ToolCall } from "@/lib/ai/toolCaller";
import { 
  getTool, 
  EMIParams, 
  EMIResult, 
  SimpleInterestParams, 
  SimpleInterestResult, 
  CompoundInterestParams, 
  CompoundInterestResult 
} from "@/lib/tools/registry";
import { ToolResult, FinancialTool } from "@/lib/tools/types";

function validateParameter(name: string, value: unknown, toolPrefix: string): number {
  if (
    value === undefined || 
    value === null || 
    typeof value !== "number" || 
    !Number.isFinite(value) || 
    Number.isNaN(value)
  ) {
    throw new Error(`Invalid ${toolPrefix} parameter: ${name}`);
  }
  return value;
}

export async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  const toolName = toolCall.tool;

  switch (toolName) {
    case "emi": {
      const tool = getTool("emi") as FinancialTool<EMIParams, EMIResult>;
      if (!tool) {
        throw new Error("Unsupported financial tool: emi");
      }

      const principal = validateParameter("principal", toolCall.arguments.principal, "EMI");
      const annualRate = validateParameter("annualRate", toolCall.arguments.annualRate, "EMI");
      const tenureYears = validateParameter("tenureYears", toolCall.arguments.tenureYears, "EMI");

      return tool.execute({ principal, annualRate, tenureYears });
    }

    case "simple_interest": {
      const tool = getTool("simple_interest") as FinancialTool<SimpleInterestParams, SimpleInterestResult>;
      if (!tool) {
        throw new Error("Unsupported financial tool: simple_interest");
      }

      const principal = validateParameter("principal", toolCall.arguments.principal, "Simple Interest");
      const annualRate = validateParameter("annualRate", toolCall.arguments.annualRate, "Simple Interest");
      const timeYears = validateParameter("timeYears", toolCall.arguments.timeYears, "Simple Interest");

      return tool.execute({ principal, annualRate, timeYears });
    }

    case "compound_interest": {
      const tool = getTool("compound_interest") as FinancialTool<CompoundInterestParams, CompoundInterestResult>;
      if (!tool) {
        throw new Error("Unsupported financial tool: compound_interest");
      }

      const principal = validateParameter("principal", toolCall.arguments.principal, "Compound Interest");
      const annualRate = validateParameter("annualRate", toolCall.arguments.annualRate, "Compound Interest");
      const timeYears = validateParameter("timeYears", toolCall.arguments.timeYears, "Compound Interest");

      return tool.execute({ principal, annualRate, timeYears });
    }

    default: {
      const exhaustiveCheck: never = toolName;
      throw new Error(`Unsupported financial tool: ${toolName}`);
    }
  }
}
