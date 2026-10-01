import mammoth from "mammoth";
import pdf from "pdf-parse/lib/pdf-parse.js";

type Page = { pageNumber: number | null; text: string };

export async function extractText(buffer: Buffer, mimeType: string): Promise<Page[]> {
  if (mimeType === "application/pdf") {
    const pages: Page[] = [];
    await pdf(buffer, {
      pagerender: async (page: { getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }) => {
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str || "").join(" ");
        pages.push({ pageNumber: pages.length + 1, text });
        return text;
      },
    });
    return pages;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    return [{ pageNumber: null, text: result.value }];
  }
  if (["text/plain", "text/markdown", "text/x-markdown"].includes(mimeType)) {
    return [{ pageNumber: null, text: buffer.toString("utf8") }];
  }
  throw new Error("Unsupported document type");
}

export function chunkText(pages: Page[]) {
  const chunks: Array<{ index: number; text: string; pageNumber: number | null }> = [];
  for (const page of pages) {
    const normalized = page.text.replace(/\r/g, "\n").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    for (let start = 0; start < normalized.length; start += 1100) {
      const text = normalized.slice(start, start + 1300).trim();
      if (text) chunks.push({ index: chunks.length, text, pageNumber: page.pageNumber });
    }
  }
  return chunks;
}
