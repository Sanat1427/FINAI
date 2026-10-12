import {
  searchMultipleQueries,
  deduplicateResults,
  rankResults,
  SearchResult,
} from "@/lib/rag/search";

import { decomposeQuery } from "@/lib/rag/query";
import { fallbackAi as ai } from "@/lib/ai/fallback";
import dns from "node:dns";

// Fix for UND_ERR_CONNECT_TIMEOUT with IPv6 addresses
dns.setDefaultResultOrder("ipv4first");



interface HistoryMessage {
  role: string;
  content: string;
}

export async function answerWithRAG(
  query: string,
  history: HistoryMessage[] = [],
  source?: string,
  customClient?: any
) {
  let queries: string[] = [query];
  try {
    // Basic heuristic to skip LLM decomposition for simple questions
    const isMultiTopic = query.includes(" and ") || (query.match(/\?/g) || []).length > 1;
    if (isMultiTopic) {
      queries = await decomposeQuery(query);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("429") || msg.includes("rate limit") || msg.toLowerCase().includes("quota")) {
      return { answer: "[ERROR: RATE_LIMIT] Provider rate limit encountered during query decomposition.", sources: [] };
    }
    return { answer: `[ERROR: DECOMPOSITION_FAILED] Retrieval service failed during query generation: ${msg}`, sources: [] };
  }

  let uniqueResults: any[];
  try {
    const allResults = await searchMultipleQueries(queries, 3, source, customClient);
    uniqueResults = deduplicateResults(allResults);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("429") || msg.includes("rate limit") || msg.toLowerCase().includes("quota")) {
      return { answer: "[ERROR: RATE_LIMIT] Provider rate limit encountered during embedding/search.", sources: [] };
    }
    return { answer: `[ERROR: RETRIEVAL_FAILED] Retrieval service failed: ${msg}`, sources: [] };
  }

  const documents = rankResults(uniqueResults, 5);

  if (!documents || documents.length === 0) {
    if (source) {
      return {
        answer: "No relevant evidence found in the specified document. It may be unavailable, inaccessible under RLS, or lack relevant information.",
        sources: [],
      };
    }
    return {
      answer: "No relevant evidence found in the knowledge base.",
      sources: [],
    };
  }

  const conversation = history
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`
    )
    .join("\n");

  const context = documents
    .map(
      (doc) =>
        `[Source: ${doc.source}, Page: ${doc.page_number}]\n${doc.content}`
    )
    .join("\n\n");

  const prompt = `
You are a financial education assistant.

Use the conversation history to understand the user's current question
and references such as "it", "this", "that", or "they".

Answer the current question using ONLY the provided financial context.

Rules:
- Do not invent financial facts.
- If the context does not contain enough information, say:
  "I don't have enough information in my knowledge base to answer that."
- Give a clear and simple answer.
- Do not provide personalized financial advice.

Conversation History:
${conversation || "No previous conversation."}

Financial Knowledge Context:
${context}

Current User Question:
${query}
`;

  let responseText: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });
    responseText = response.text;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const mappedSources = documents.map((doc) => ({
      pageNumber: doc.page_number,
      source: doc.source,
      similarity: doc.similarity,
      excerpt: doc.content
        ? doc.content.slice(0, 240).replace(/\s+/g, " ").trim() + (doc.content.length > 240 ? "..." : "")
        : undefined,
    }));
    if (msg.includes("429") || msg.includes("rate limit") || msg.toLowerCase().includes("quota")) {
      return {
        answer: "[ERROR: RATE_LIMIT] Provider rate limit encountered during synthesis generation.",
        sources: mappedSources,
      };
    }
    return {
      answer: `[ERROR: GENERATION_FAILED] Synthesis failed: ${msg}`,
      sources: mappedSources,
    };
  }

  return {
    answer: responseText || "No answer generated.",
    sources: documents.map((doc) => ({
      pageNumber: doc.page_number,
      source: doc.source,
      similarity: doc.similarity,
      excerpt: doc.content
        ? doc.content.slice(0, 240).replace(/\s+/g, " ").trim() + (doc.content.length > 240 ? "..." : "")
        : undefined,
    })),
  };
}