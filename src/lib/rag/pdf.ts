import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

export async function extractPdfPages(filePath: string) {
  const buffer = await readFile(filePath);

  const parser = new PDFParse({
    data: buffer,
  });

  try {
    const info = await parser.getInfo();

    const pages = [];

    for (let pageNumber = 1; pageNumber <= info.total; pageNumber++) {
      const result = await parser.getText({
        partial: [pageNumber],
      });

      pages.push({
        pageNumber,
        text: result.text,
      });
    }

    return pages;
  } finally {
    await parser.destroy();
  }
}