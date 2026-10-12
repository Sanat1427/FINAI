import { createClient } from "@/utils/supabase/server";
import { generateEmbedding } from "../ai/embedding";

export interface SearchResult {
  id: number;
  content: string;
  metadata: Record<string, unknown> | null;
  page_number: number | null;
  source: string | null;
  similarity: number;
}

export async function searchDocuments(
  query: string,
  matchCount = 5,
  source?: string,
  customClient?: any,
  similarityThreshold = 0.48
): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query);

  if (!embedding) {
    throw new Error("Failed to generate embedding");
  }

  const supabase = customClient ?? (await createClient());
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_count: matchCount,
    similarity_threshold: similarityThreshold,
    filter_source: source ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  console.log("SEARCH RESULTS:", data);

  return (data ?? []) as SearchResult[];
}

export async function searchMultipleQueries(
  queries: string[],
  matchCount = 3,
  source?: string,
  customClient?: any
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  // Process sequentially to bound concurrency and avoid hitting rate limits instantly
  for (const query of queries) {
    const res = await searchDocuments(query, matchCount, source, customClient);
    results.push(...res);
  }

  return results;
}

export function deduplicateResults(
  results: SearchResult[]
): SearchResult[] {
  const seen = new Set<number>();

  return results.filter((result) => {
    if (seen.has(result.id)) {
      return false;
    }

    seen.add(result.id);
    return true;
  });
}

export function rankResults(
  results: SearchResult[],
  limit = 5
): SearchResult[] {
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}