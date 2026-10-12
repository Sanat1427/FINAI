import { createClient } from "@/utils/supabase/server";
import { extractPdfPages } from "@/lib/rag/pdf";
import { chunkPages } from "@/lib/rag/chunk";
import { addDocument } from "@/lib/rag/ingest";

export interface IngestPdfOptions {
  existingDocumentId?: number;
  customClient?: any;
  delayBetweenChunksMs?: number;
}

export interface IngestPdfResult {
  documentId: number;
  pages: number;
  chunksGenerated: number;
  chunksInserted: number;
  chunksSkipped: number;
  failedChunks: number;
  errors: string[];
}

export async function ingestPdf(
  filePath: string,
  source: string,
  ownerId?: string,
  visibility: "private" | "shared" = "private",
  options?: IngestPdfOptions
): Promise<IngestPdfResult> {
  const supabase = options?.customClient ?? (await createClient());

  // 1. Extract PDF pages
  const pages = await extractPdfPages(filePath);

  // 2. Create chunks
  const chunks = chunkPages(pages);

  // 3. Document record (reuse existing or create new)
  let document: { id: number };

  if (options?.existingDocumentId) {
    const { data: existingDoc, error: fetchError } = await supabase
      .from("documents")
      .select("id, name, page_count, chunk_count, owner_id, visibility")
      .eq("id", options.existingDocumentId)
      .single();

    if (fetchError || !existingDoc) {
      throw new Error(`Existing document with ID ${options.existingDocumentId} not found: ${fetchError?.message}`);
    }

    // Update chunk count and page count if needed
    await supabase
      .from("documents")
      .update({
        page_count: pages.length,
        chunk_count: chunks.length,
      })
      .eq("id", existingDoc.id);

    document = existingDoc;
  } else {
    const { data: newDoc, error: documentError } = await supabase
      .from("documents")
      .insert({
        name: source,
        page_count: pages.length,
        chunk_count: chunks.length,
        owner_id: ownerId ?? null,
        visibility: visibility,
      })
      .select()
      .single();

    if (documentError) {
      throw new Error(documentError.message);
    }
    document = newDoc;
  }

  // 4. Insert chunks with pacing and error tracking
  let chunksInserted = 0;
  let chunksSkipped = 0;
  const errors: string[] = [];
  const delayMs = options?.delayBetweenChunksMs ?? 150;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const res = await addDocument(
        chunk.content,
        { type: "pdf", chunkIndex: i },
        chunk.pageNumber,
        source,
        document.id,
        supabase
      );

      if ((res as any)?.skipped) {
        chunksSkipped++;
      } else {
        chunksInserted++;
      }
    } catch (err: any) {
      const msg = `Chunk ${i + 1} (Page ${chunk.pageNumber}) failed: ${err.message}`;
      console.error(msg);
      errors.push(msg);
    }

    if (delayMs > 0 && i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    documentId: document.id,
    pages: pages.length,
    chunksGenerated: chunks.length,
    chunksInserted,
    chunksSkipped,
    failedChunks: errors.length,
    errors,
  };
}