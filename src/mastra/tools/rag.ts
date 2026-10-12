import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { answerWithRAG } from "../../lib/rag/rag";
import { createClient } from "../../utils/supabase/server";

// Short-lived in-flight request deduplication scoped by user ID to prevent duplicate retrieval
// between parallel council agents while strictly isolating private documents across users
const inFlightRetrieval = new Map<string, { promise: Promise<any>; timestamp: number }>();

export async function deduplicatedAnswerWithRAG(
  query: string,
  source?: string,
  customClient?: any
) {
  let userId = "anonymous";
  try {
    const supabase = customClient ?? (await createClient());
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      userId = user.id;
    }
  } catch {
    // If not in a request context with cookies, isolate safely
  }

  // Scoped key prevents any cross-user sharing of private documents
  const normalizedKey = `${userId}::${query.trim().toLowerCase()}::${(source || "").trim().toLowerCase()}`;
  const now = Date.now();
  const existing = inFlightRetrieval.get(normalizedKey);

  // Reuse if active within the short execution window (5 seconds)
  if (existing && now - existing.timestamp < 5000) {
    return existing.promise;
  }

  // Handle immediate rejection cleanup to prevent caching failed promises
  const promise = answerWithRAG(query, [], source, customClient)
    .catch((error) => {
      inFlightRetrieval.delete(normalizedKey);
      throw error;
    })
    .finally(() => {
      setTimeout(() => {
        inFlightRetrieval.delete(normalizedKey);
      }, 5000);
    });

  inFlightRetrieval.set(normalizedKey, { promise, timestamp: now });
  return promise;
}

export const ragTool = createTool({
  id: "financial-rag",

  description:
    "Search the financial knowledge base and answer questions using available authorized financial documents, including user-uploaded loan agreements, lender terms and conditions (such as ICICI personal loans), regulatory material, and RBI financial-awareness documents.",

  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("The user's financial question to answer from the knowledge base."),

    source: z
      .string()
      .optional()
      .describe("Optional document source filename or identifier to restrict the search to. Leave undefined unless a specific document is explicitly requested."),
  }),

  execute: async (input) => {
    return await deduplicatedAnswerWithRAG(input.query, input.source);
  },
});