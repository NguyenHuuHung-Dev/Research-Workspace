import { GoogleGenAI } from "@google/genai";
import { researchResponseSchema, type ResearchResponse } from "@/lib/schema";
import type { RetrievedChunk } from "@/lib/research/retrieval";

export const aiModel = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

const responseSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    key_points: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } }, required: ["title", "detail"] } },
    evidence: { type: "array", items: { type: "object", properties: { documentId: { type: "string" }, documentName: { type: "string" }, excerpt: { type: "string" }, page: { type: "integer", nullable: true } }, required: ["documentId", "documentName", "excerpt"] } },
    risks: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["summary", "key_points", "evidence", "risks", "actions", "confidence"],
};

function client() {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini is not configured.");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function prompt(question: string, chunks: RetrievedChunk[]) {
  return `You are a document research assistant. Answer primarily from the provided excerpts. Never fabricate evidence. If the documents are insufficient, say so clearly and set confidence to low. Keep the answer concise and useful. Return JSON only. Each evidence excerpt must be a short exact quotation from a supplied excerpt. Cite only supplied document IDs and pages.\n\nQUESTION: ${question}\n\nDOCUMENT EXCERPTS:\n${chunks.map((chunk, i) => `[${i + 1}] Document ID: ${chunk.documentId}; Name: ${chunk.documentName}; Page: ${chunk.pageNumber ?? "unknown"}\n${chunk.text}`).join("\n\n")}`;
}

function validateEvidence(response: ResearchResponse, chunks: RetrievedChunk[]) {
  return {
    ...response,
    evidence: response.evidence.filter(item => chunks.some(chunk =>
      chunk.documentId === item.documentId &&
      chunk.text.toLocaleLowerCase().includes(item.excerpt.trim().toLocaleLowerCase())
    )).map(item => {
      const chunk = chunks.find(part => part.documentId === item.documentId && part.text.toLocaleLowerCase().includes(item.excerpt.trim().toLocaleLowerCase()))!;
      return { ...item, documentName: chunk.documentName, page: chunk.pageNumber };
    }),
  };
}

export async function generateResearchAnswer(question: string, chunks: RetrievedChunk[], onDelta: (delta: string) => void): Promise<ResearchResponse> {
  const ai = client();
  const content = prompt(question, chunks);
  let raw = "";
  const stream = await ai.models.generateContentStream({
    model: aiModel, contents: content,
    config: { responseMimeType: "application/json", responseSchema, abortSignal: AbortSignal.timeout(45_000) },
  });
  for await (const part of stream) {
    const text = part.text || "";
    raw += text;
    if (text) onDelta(text);
  }
  let parsed = researchResponseSchema.safeParse(parseJson(raw));
  if (!parsed.success) {
    const repaired = await ai.models.generateContent({
      model: aiModel,
      contents: `${content}\n\nYour previous response failed schema validation. Return valid JSON matching the required schema only. Previous response:\n${raw.slice(0, 12000)}`,
      config: { responseMimeType: "application/json", responseSchema, abortSignal: AbortSignal.timeout(12_000) },
    });
    parsed = researchResponseSchema.safeParse(parseJson(repaired.text || ""));
  }
  if (!parsed.success) {
    return { summary: raw.trim() || "The research assistant returned an empty response.", key_points: [], evidence: [], risks: [], actions: [], confidence: "low" };
  }
  return validateEvidence(parsed.data, chunks);
}

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch { /* fallback below */ } }
    return null;
  }
}
