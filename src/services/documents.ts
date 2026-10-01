import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { clientFirebase } from "@/lib/firebase/client";
import { documentSchema, maxFileSize, type ResearchDocument } from "@/lib/schema";
import { getLocalFile, keepLocalFile } from "@/lib/documents/local-files";

export function watchDocuments(uid: string, onChange: (documents: ResearchDocument[]) => void, onError: (error: Error) => void) {
  const path = collection(clientFirebase.db(), "users", uid, "documents");
  return onSnapshot(query(path, orderBy("createdAt", "desc")), snapshot => {
    onChange(snapshot.docs.flatMap(item => {
      const parsed = documentSchema.safeParse({ ...item.data(), id: item.id });
      return parsed.success ? [parsed.data] : [];
    }));
  }, onError);
}

async function sendFile(id: string, file: File, onProgress: (progress: number) => void) {
  const user = clientFirebase.auth().currentUser;
  if (!user) throw new Error("Your session has expired. Please refresh.");
  const token = await user.getIdToken();
  const form = new FormData();
  form.set("documentId", id);
  form.set("file", file);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = 70_000;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.min(90, Math.round(event.loaded / event.total * 90)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(); }
      else {
        let message = "Could not process this document. Please try again.";
        try { message = JSON.parse(xhr.responseText).error || message; } catch { /* retain friendly fallback */ }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading. Please try again."));
    xhr.ontimeout = () => reject(new Error("Document processing timed out. Please try again."));
    xhr.send(form);
  });
}

export async function uploadDocument(_uid: string, file: File, onProgress: (progress: number) => void) {
  if (!/\.(pdf|docx|txt|md)$/i.test(file.name)) throw new Error("Supported formats: PDF, DOCX, TXT, and Markdown.");
  if (!file.size || file.size > maxFileSize) throw new Error("The file must be between 1 byte and 20 MB.");
  const id = crypto.randomUUID();
  await keepLocalFile(id, file);
  await sendFile(id, file, onProgress);
  return id;
}

export async function retryDocument(documentId: string) {
  const file = await getLocalFile(documentId);
  if (!file) throw new Error("The original file is only saved on the device that uploaded it. Upload the file again here.");
  await sendFile(documentId, file, () => undefined);
}

export async function openLocalDocument(documentId: string) {
  const file = await getLocalFile(documentId);
  if (!file) throw new Error("The original file is only available on the device that uploaded it.");
  const url = URL.createObjectURL(file);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
