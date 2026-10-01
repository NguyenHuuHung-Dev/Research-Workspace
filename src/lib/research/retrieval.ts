import type { UserFirestore } from "@/lib/firebase/rest";
import type { ResearchDocument } from "@/lib/schema";

export type RetrievedChunk = {
  id: string; documentId: string; documentName: string; text: string;
  index: number; pageNumber: number | null; score: number;
};

const stopWords = new Set(["the", "and", "for", "with", "this", "that", "from", "what", "does", "about", "these", "those", "into", "your", "their", "are", "how", "which", "trong", "những", "được", "của", "và", "cho", "các", "một", "này"]);
function tokens(input: string) {
  return (input.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(word => word.length > 2 && !stopWords.has(word));
}

export async function retrieveChunks(store: UserFirestore, uid: string, documentIds: string[], question: string): Promise<RetrievedChunk[]> {
  const words = [...new Set(tokens(question))];
  const groups = await Promise.all(documentIds.map(async documentId => {
    const path = `users/${uid}/documents/${documentId}`;
    const document = await store.getDoc<ResearchDocument>(path);
    if (!document || document.status !== "ready") return [];
    const chunks = await store.listDocs<{ id: string; text: string; index: number; pageNumber: number | null }>(`${path}/chunks`);
    return chunks.map(chunk => {
      const text = String(chunk.text || "");
      const normalized = text.toLocaleLowerCase();
      const score = words.reduce((sum, word) => sum + (normalized.includes(word) ? 1 : 0), 0);
      return {
        id: chunk.id, documentId, documentName: String(document.name || "Document"),
        text, index: Number(chunk.index || 0), pageNumber: chunk.pageNumber ?? null,
        score,
      } satisfies RetrievedChunk;
    });
  }));
  const ranked = groups.flat().sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Map<string, RetrievedChunk>();
  for (const documentId of documentIds) {
    const best = ranked.find(chunk => chunk.documentId === documentId);
    if (best) selected.set(best.id + best.documentId, best);
  }
  for (const chunk of ranked) {
    if (selected.size >= 24) break;
    selected.set(chunk.id + chunk.documentId, chunk);
  }
  return [...selected.values()].slice(0, 24);
}
