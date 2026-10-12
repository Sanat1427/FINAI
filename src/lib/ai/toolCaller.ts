import { fallbackAi as ai } from "@/lib/ai/fallback";

export type CallableTool =
  | "emi"
  | "simple_interest"
  | "compound_interest";

export interface ToolCall {
  tool: CallableTool;
  arguments: Record<string, number>;
}

export interface HistoryMessage {
  role: string;
  content: string;
}

export async function generateToolCall(
  query: string,
  history: HistoryMessage[] = []
): Promise<ToolCall> {
  const conversation = history
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`
    )
    .join("\n");

  const prompt = `
You are a financial tool-calling assistant.

Your job is NOT to calculate anything.

Your job is to determine:
1. Which financial calculation tool should be called.
2. What numeric arguments should be passed to that tool.

Available tools:

emi:
- Calculates loan EMI.
- Arguments:
  principal
  annualRate
  tenureYears

simple_interest:
- Calculates simple interest.
- Arguments:
  principal
  annualRate
  timeYears

compound_interest:
- Calculates compound interest.
- Arguments:
  principal
  annualRate
  timeYears

Rules:
- Extract numeric values from natural language.
- Convert lakh to rupees.
- Convert crore to rupees.
- Preserve percentages correctly.
- Understand years.
- Use conversation history for follow-up questions.
- Allow the current user message to override older values.
- NEVER invent a missing parameter.
- NEVER perform the calculation.
- NEVER return calculated EMI/interest values.
- Return only the parameters required by the selected tool.
- If a parameter is not provided by the user, return its value strictly as null. Do not guess it.
- Return ONLY valid JSON.

Valid JSON example:
{
  "tool": "emi",
  "arguments": {
    "principal": 500000,
    "annualRate": 9,
    "tenureYears": null
  }
}

Previous conversation:
${conversation || "No previous conversation."}

Current user message:
${query}
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  let text = response.text || "";
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Failed to parse tool call response as JSON.");
  }

  if (!parsed.tool || !parsed.arguments) {
    throw new Error("Invalid tool call structure received.");
  }

  const missing: string[] = [];

  if (parsed.tool === "emi") {
    if (parsed.arguments.principal == null) missing.push("principal");
    if (parsed.arguments.annualRate == null) missing.push("annualRate");
    if (parsed.arguments.tenureYears == null) missing.push("tenureYears");
  } else if (parsed.tool === "simple_interest") {
    if (parsed.arguments.principal == null) missing.push("principal");
    if (parsed.arguments.annualRate == null) missing.push("annualRate");
    if (parsed.arguments.timeYears == null) missing.push("timeYears");
  } else if (parsed.tool === "compound_interest") {
    if (parsed.arguments.principal == null) missing.push("principal");
    if (parsed.arguments.annualRate == null) missing.push("annualRate");
    if (parsed.arguments.timeYears == null) missing.push("timeYears");
  } else {
    throw new Error(`Unsupported tool selected: ${parsed.tool}`);
  }

  if (missing.length > 0) {
    throw new Error(`Missing ${parsed.tool} parameters: ${missing.join(", ")}`);
  }

  return parsed as ToolCall;
}
