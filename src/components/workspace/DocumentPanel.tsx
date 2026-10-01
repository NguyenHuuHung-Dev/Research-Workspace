"use client";
import { useRef, useState } from "react";
import type { ResearchDocument } from "@/lib/schema";
import { openLocalDocument, retryDocument, uploadDocument } from "@/services/documents";

type Props = {
  uid: string; documents: ResearchDocument[]; selected: string[];
  onToggle: (id: string) => void; onUploadSuccess: (id: string) => void;
};

function fileSize(bytes: number) { return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`; }

export function DocumentPanel({ uid, documents, selected, onToggle, onUploadSuccess }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    for (const file of Array.from(files)) {
      try {
        setUploading({ name: file.name, progress: 0 });
        const id = await uploadDocument(uid, file, progress => setUploading({ name: file.name, progress }));
        onUploadSuccess(id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not upload this document. Please try again.");
      }
    }
    setUploading(null);
    if (input.current) input.current.value = "";
  }

  async function retry(id: string) {
    setError(""); setRetrying(id);
    try { await retryDocument(id); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "This document could not be processed. Please try again."); }
    finally { setRetrying(null); }
  }

  async function openDocument(id: string) {
    try { await openLocalDocument(id); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not open this document."); }
  }

  return <section className="panel-section" aria-labelledby="documents-heading">
    <div className="panel-heading"><h2 id="documents-heading">Documents <span>{documents.length}</span></h2></div>
    <input ref={input} className="sr-only" type="file" multiple accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={event => onFiles(event.target.files)} aria-label="Select documents to upload" />
    <button className="upload-button" type="button" onClick={() => input.current?.click()} disabled={Boolean(uploading)}><span aria-hidden="true">＋</span> Upload documents</button>
    {uploading && <div className="upload-progress" role="status"><span className="truncate">{uploading.progress >= 90 ? "Processing" : "Uploading"} {uploading.name}</span><span>{uploading.progress < 90 ? `${uploading.progress}%` : ""}</span><div className="progress-track"><div style={{ width: `${uploading.progress}%` }} /></div></div>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="document-list">
      {documents.length === 0 && !uploading && <p className="empty-list">Your documents will appear here.</p>}
      {documents.map(document => <div className="document-row" key={document.id}>
        <label className="document-select">
          <input type="checkbox" checked={selected.includes(document.id)} onChange={() => onToggle(document.id)} disabled={document.status !== "ready"} aria-label={`Include ${document.name} in research`} />
          <span className="selection-box" aria-hidden="true" />
        </label>
        <div className="document-info">
          <button type="button" className="document-name" onClick={() => openDocument(document.id)} title={`Open ${document.name}`}>{document.name}</button>
          <div className="document-meta"><span>{fileSize(document.size)}</span><span className="meta-dot">·</span><span className={`status status-${document.status}`}>{document.status === "uploading" ? "Uploading" : document.status === "processing" ? "Processing" : document.status === "ready" ? "Ready" : "Failed"}</span></div>
          {document.status === "failed" && <button className="text-action retry-action" type="button" onClick={() => retry(document.id)} disabled={retrying === document.id}>{retrying === document.id ? "Retrying…" : "Try again"}</button>}
        </div>
      </div>)}
    </div>
  </section>;
}
