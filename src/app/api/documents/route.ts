import { NextRequest } from "next/server";
import { authenticateUser, FirebaseAuthError } from "@/lib/firebase/rest";
import { chunkText, extractText } from "@/lib/documents/extract";
import { maxFileSize, uploadMetadataSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

function fileType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "md") return "text/markdown";
  if (extension === "txt") return "text/plain";
  throw new Error("Supported formats: PDF, DOCX, TXT, and Markdown.");
}

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof authenticateUser>>;
  try { user = await authenticateUser(request); }
  catch (error) { return Response.json({ error: error instanceof FirebaseAuthError ? error.message : "Could not connect to Firebase." }, { status: 401 }); }

  let file: File;
  let documentId: string;
  let mimeType: string;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (!(candidate instanceof File)) throw new Error("Choose a document to upload.");
    file = candidate;
    documentId = String(form.get("documentId") || "");
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new Error("Invalid document ID.");
    mimeType = fileType(file);
    uploadMetadataSchema.parse({ name: file.name, mimeType, size: file.size });
    if (file.size > maxFileSize) throw new Error("The file must be 20 MB or smaller.");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not read this document." }, { status: 400 });
  }

  const path = `users/${user.uid}/documents/${documentId}`;
  const existing = await user.store.getDoc<{ status: string; createdAt: number }>(path);
  if (existing && existing.status !== "failed") {
    return Response.json({ error: "This document has already been uploaded." }, { status: 409 });
  }
  const now = Date.now();
  const base = {
    id: documentId, userId: user.uid, name: file.name, mimeType, size: file.size,
    status: "processing", createdAt: existing?.createdAt || now,
    updatedAt: now, textExtracted: false, processingError: null,
  };
  await user.store.setDoc(path, base);
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const pages = await extractText(buffer, mimeType);
    const chunks = chunkText(pages);
    if (!chunks.length) throw new Error("No selectable text was found in this document.");
    if (chunks.length > 400) throw new Error("This document exceeds the 400-section limit.");
    const old = await user.store.listDocs<{ id: string }>(`${path}/chunks`);
    for (let i = 0; i < old.length; i += 400) await user.store.commit([], old.slice(i, i + 400).map(item => `${path}/chunks/${item.id}`));
    for (let i = 0; i < chunks.length; i += 400) {
      await user.store.commit(chunks.slice(i, i + 400).map(chunk => ({
        path: `${path}/chunks/${String(chunk.index).padStart(5, "0")}`, data: chunk,
      })));
    }
    await user.store.setDoc(path, { ...base, status: "ready", textExtracted: true, pageCount: pages.length, updatedAt: Date.now() });
    return Response.json({ documentId, status: "ready" });
  } catch (error) {
    console.error("Document processing failed", { documentId, error });
    const message = error instanceof Error ? error.message : "Could not process this document.";
    await user.store.setDoc(path, { ...base, status: "failed", processingError: message, updatedAt: Date.now() });
    return Response.json({ error: message }, { status: 422 });
  }
}
