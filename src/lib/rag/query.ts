import { fallbackAi as ai } from "@/lib/ai/fallback";
import dns from "node:dns";
import { withRetry } from "@/lib/utils/retry";

// Fix for UND_ERR_CONNECT_TIMEOUT with IPv6 addresses
dns.setDefaultResultOrder("ipv4first");



export async function decomposeQuery(query: string) {
  const prompt = `
You are a query analysis assistant.

Determine whether the user's question contains multiple
independent financial topics.

If it contains only one topic, return the original question.

If it contains multiple topics, split it into concise,
independent search queries.

Return ONLY a JSON array of strings.

Examples:

Question:
"What is inflation?"

Output:
["What is inflation?"]

Question:
"What is inflation, what is diversification, and how are they related?"

Output:
[
  "What is inflation?",
  "What is diversification?",
  "How are inflation and diversification related?"
]

User question:
${query}
`;

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
  }));

 const text = response.text?.trim();

console.log("RAW GEMINI RESPONSE:", text);

const cleanedText = text
  ?.replace(/^```json\s*/, "")
  .replace(/\s*```$/, "");

if (!cleanedText) {
  return [query];
}

try {
  return JSON.parse(cleanedText) as string[];
} catch {
  return [query];
}
}