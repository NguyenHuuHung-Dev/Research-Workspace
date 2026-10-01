import { z } from "zod";

export const researchResponseSchema = z.object({
  summary: z.string(),
  key_points: z.array(z.object({ title: z.string(), detail: z.string() })),
  evidence: z.array(z.object({
    documentId: z.string(), documentName: z.string(), excerpt: z.string().min(1),
    page: z.number().nullable().optional(),
  })),
  risks: z.array(z.string()),
  actions: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});

export const researchRequestSchema = z.object({
  question: z.string().trim().min(2).max(3000),
  conversationId: z.string().min(1).optional(),
  documentIds: z.array(z.string().min(1)).min(1).max(20),
  regenerateMessageId: z.string().optional(),
});

export type ResearchResponse = z.infer<typeof researchResponseSchema>;

export type DocumentStatus = "uploading" | "processing" | "ready" | "failed";
export type ResearchDocument = {
  id: string; userId: string; name: string; mimeType: string; size: number;
  status: DocumentStatus; createdAt: number; updatedAt: number;
  pageCount?: number; processingError?: string | null; textExtracted?: boolean;
};
export type Conversation = {
  id: string; title: string; documentIds: string[]; createdAt: number; updatedAt: number;
};
export type ResearchMessage = {
  id: string; role: "user" | "assistant"; content: string;
  structuredResponse?: ResearchResponse | null; createdAt: number;
  status: "complete" | "failed"; documentIds: string[];
  latency?: number; model?: string; version?: number;
};

export const supportedTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain", "text/markdown", "text/x-markdown",
];
export const maxFileSize = 20 * 1024 * 1024;

export const uploadMetadataSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain", "text/markdown", "text/x-markdown",
  ]),
  size: z.number().int().positive().max(maxFileSize),
});

export const documentSchema = z.object({
  id: z.string(), userId: z.string(), name: z.string(), mimeType: z.string(),
  size: z.number(),
  status: z.enum(["uploading", "processing", "ready", "failed"]),
  createdAt: z.number(), updatedAt: z.number(), pageCount: z.number().optional(),
  processingError: z.string().nullable().optional(), textExtracted: z.boolean().optional(),
});

export const conversationSchema = z.object({
  id: z.string(), title: z.string(), documentIds: z.array(z.string()),
  createdAt: z.number(), updatedAt: z.number(),
});

export const messageSchema = z.object({
  id: z.string(), role: z.enum(["user", "assistant"]), content: z.string(),
  structuredResponse: researchResponseSchema.nullable().optional(), createdAt: z.number(),
  status: z.enum(["complete", "failed"]), documentIds: z.array(z.string()),
  latency: z.number().optional(), model: z.string().optional(), version: z.number().optional(),
});
