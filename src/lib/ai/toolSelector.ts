import { fallbackAi as ai } from "@/lib/ai/fallback";

export type SelectedTool =
  | "emi"
  | "simple_interest"
  | "compound_interest"
  | "rag"
  | "general"
  | "orchestrator"
  | "agent";

export interface ToolSelection {
  tool: SelectedTool;
}

export interface HistoryMessage {
  role: string;
  content: string;
}

export async function selectTool(
  query: string,
  history: HistoryMessage[] = []
): Promise<ToolSelection> {
  const conversation = history
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`
    )
    .join("\n");

  const prompt = `
You are a tool-selection agent for a financial AI assistant.

Your task is to select the most appropriate capability based on the user's current query and conversation history.

AVAILABLE TOOLS:

1. emi
Description: Calculate monthly EMI for a loan when the user provides or asks for loan amount, annual interest rate, and tenure.
Examples: "Calculate EMI for 5 lakh at 9% for 5 years", "What will be my monthly payment for a 10 lakh loan?", "What is the EMI?"

2. simple_interest
Description: Calculate simple interest and total amount when the user asks for a simple-interest calculation.
Examples: "Calculate simple interest on 50000 at 8% for 3 years", "How much simple interest will I earn?"

3. compound_interest
Description: Calculate compound interest and total amount when the user asks for a compound-interest calculation.
Examples: "Calculate compound interest on 50000 at 8% for 3 years", "How much will my money grow with compound interest?"

4. rag
Description: Answer financial questions and retrieve evidence using the application's financial documents, including user-uploaded loan agreements, lender terms (such as ICICI unsecured personal loans), regulatory guidelines, and RBI awareness materials.
Examples: "What is inflation?", "Explain diversification", "What are the prepayment conditions for ICICI unsecured personal loans?", "Summarize the terms in my uploaded loan document", "What does RBI say about digital payment safety?"
IMPORTANT: If the user asks for a calculation, prefer the appropriate calculation tool instead of rag.

5. general
Description: General conversation or questions that are not related to the financial knowledge base or financial calculation tools.
Examples: "Hello", "Who are you?", "Tell me a joke"

6. orchestrator
Description: Use this when the user's query requires MULTIPLE parallel capabilities at the same time, such as answering a question from the knowledge base AND performing a financial calculation, or performing multiple different calculations.
Examples: "Explain responsible borrowing according to RBI and calculate EMI for 5 lakh at 9% for 5 years.", "What is inflation and what is the simple interest on 50000 at 8% for 3 years?"

7. agent
Description: Use this when the user query requires a multi-step sequential thought process, where one action's result might be needed to decide the next action, or complex problem-solving.
Examples: "Calculate my EMI, and then tell me if that's more than 30% of my 1 lakh salary", "Explain inflation, then use it to adjust my investment return."


RULES:
- Select exactly one tool from the available tools list.
- Select based on the user's intent.
- Use conversation history to understand follow-up questions.
- Do not perform calculations.
- Do not answer the user.
- Only select the tool.
- Return ONLY valid JSON.
- Never invent a tool.
- Calculation requests should use calculation tools.
- Financial educational questions should use rag.
- If the query requires multiple independent tools, select "orchestrator".
- If the query requires sequential multi-step problem solving, select "agent".

Previous conversation:
${conversation || "No previous conversation."}

Current User Message:
${query}
`;

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });
  } catch (error) {
    throw new Error(`Gemini API failure during tool selection: ${error instanceof Error ? error.message : String(error)}`);
  }

  const text = response.text || "";
  const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleanText);
  } catch (error) {
    throw new Error(`Invalid JSON returned from Gemini: ${cleanText}`);
  }

  const validTools: SelectedTool[] = [
    "emi",
    "simple_interest",
    "compound_interest",
    "rag",
    "general",
    "orchestrator",
    "agent",
  ];

  if (!parsed || !parsed.tool) {
    throw new Error("Invalid JSON structure: missing 'tool' key.");
  }

  if (!validTools.includes(parsed.tool)) {
    throw new Error(`Unsupported tool selected by Gemini: ${parsed.tool}`);
  }

  return parsed as ToolSelection;
}
