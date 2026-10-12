import { createClient } from "@/utils/supabase/server";
import { generateEmbedding } from "@/lib/ai/embedding";

export async function addDocument(
  content: string,
  metadata: Record<string, unknown> = {},
  pageNumber?: number,
  source?: string,
  documentId?: number,
  customClient?: any
) {
  const supabase = customClient ?? (await createClient());

  // Check if identical chunk already exists for this document (idempotency)
  if (documentId) {
    const { data: existing } = await supabase
      .from("document_chunks")
      .select("id, page_number, source, document_id")
      .eq("document_id", documentId)
      .eq("content", content)
      .maybeSingle();

    if (existing) {
      return { ...existing, skipped: true };
    }
  }

  const embedding = await generateEmbedding(content);

  if (!embedding) {
    throw new Error("Failed to generate embedding");
  }

  const { data, error } = await supabase
    .from("document_chunks")
    .insert({
      content,
      metadata,
      embedding,
      page_number: pageNumber,
      source,
      document_id: documentId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { ...data, skipped: false };
}