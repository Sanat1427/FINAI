export type Page = {
  pageNumber: number;
  text: string;
};

export type Chunk = {
  content: string;
  pageNumber: number;
};

export function chunkPages(
  pages: Page[],
  chunkSize = 1000,
  overlap = 200
): Chunk[] {
  const chunks: Chunk[] = [];

  for (const page of pages) {
    const sentences = page.text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    let currentChunk = "";

    for (const sentence of sentences) {
      const candidate = currentChunk
        ? `${currentChunk} ${sentence}`
        : sentence;

      if (candidate.length <= chunkSize) {
        currentChunk = candidate;
        continue;
      }

      if (currentChunk) {
        chunks.push({
          content: currentChunk,
          pageNumber: page.pageNumber,
        });
      }

      // Keep the last part of the previous chunk as overlap
      const overlapText = currentChunk.slice(-overlap);

      currentChunk = overlapText
        ? `${overlapText} ${sentence}`
        : sentence;
    }

    if (currentChunk) {
      chunks.push({
        content: currentChunk,
        pageNumber: page.pageNumber,
      });
    }
  }

  return chunks;
}