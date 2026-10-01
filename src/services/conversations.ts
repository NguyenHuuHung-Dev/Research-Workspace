import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { clientFirebase } from "@/lib/firebase/client";
import type { Conversation, ResearchMessage, ResearchResponse } from "@/lib/schema";
import { conversationSchema, messageSchema } from "@/lib/schema";

export function watchConversations(uid: string, onChange: (items: Conversation[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(collection(clientFirebase.db(), "users", uid, "conversations"), orderBy("updatedAt", "desc"), limit(30)),
    snapshot => onChange(snapshot.docs.flatMap(doc => {
      const parsed = conversationSchema.safeParse({ ...doc.data(), id: doc.id });
      return parsed.success ? [parsed.data] : [];
    })), onError);
}

export function watchMessages(uid: string, conversationId: string, onChange: (items: ResearchMessage[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(collection(clientFirebase.db(), "users", uid, "conversations", conversationId, "messages"), orderBy("createdAt", "asc"), limit(100)),
    snapshot => onChange(snapshot.docs.flatMap(doc => {
      const parsed = messageSchema.safeParse({ ...doc.data(), id: doc.id });
      return parsed.success ? [parsed.data] : [];
    })), onError);
}

type StreamEvent =
  | { type: "start"; conversationId: string; messageId: string }
  | { type: "delta"; text: string }
  | { type: "complete"; response: ResearchResponse; conversationId: string; messageId: string }
  | { type: "error"; message: string };

export async function researchStream(
  token: string,
  body: { question: string; documentIds: string[]; conversationId?: string; regenerateMessageId?: string },
  onEvent: (event: StreamEvent) => void,
) {
  const response = await fetch("/api/research", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "The research assistant is temporarily unavailable.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as StreamEvent;
      if (event.type === "error") throw new Error(event.message);
      onEvent(event);
    }
  }
}

export function formatResponse(value: ResearchResponse) {
  return [
    `Summary\n${value.summary}`,
    value.key_points.length ? `Key points\n${value.key_points.map((point, index) => `${index + 1}. ${point.title}: ${point.detail}`).join("\n")}` : "",
    value.evidence.length ? `Evidence\n${value.evidence.map(item => `${item.documentName}${item.page ? `, p. ${item.page}` : ""}: “${item.excerpt}”`).join("\n")}` : "",
    value.risks.length ? `Risks\n${value.risks.map(item => `• ${item}`).join("\n")}` : "",
    value.actions.length ? `Next actions\n${value.actions.map((item, index) => `${index + 1}. ${item}`).join("\n")}` : "",
    `Confidence: ${value.confidence}`,
  ].filter(Boolean).join("\n\n");
}
