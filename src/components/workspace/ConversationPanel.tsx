"use client";
import type { Conversation } from "@/lib/schema";

type Props = { conversations: Conversation[]; activeId: string | null; onSelect: (id: string) => void; onNew: () => void };

function timeAgo(timestamp: number) {
  const delta = Date.now() - timestamp;
  if (delta < 3600000) return `${Math.max(1, Math.round(delta / 60000))} min ago`;
  if (delta < 86400000) return `${Math.round(delta / 3600000)} hr ago`;
  if (delta < 172800000) return "Yesterday";
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ConversationPanel({ conversations, activeId, onSelect, onNew }: Props) {
  return <section className="panel-section conversations-section" aria-labelledby="history-heading">
    <div className="panel-heading"><h2 id="history-heading">Recent research</h2><button type="button" className="new-button" onClick={onNew} aria-label="New research">＋</button></div>
    {conversations.length === 0 ? <p className="empty-list">Your questions will be saved here.</p> : <nav aria-label="Recent research"><div className="conversation-list">{conversations.map(conversation => <button type="button" key={conversation.id} className={`conversation-row ${activeId === conversation.id ? "active" : ""}`} onClick={() => onSelect(conversation.id)}><span className="conversation-title">{conversation.title}</span><span className="conversation-time">{timeAgo(conversation.updatedAt)}</span></button>)}</div></nav>}
  </section>;
}
