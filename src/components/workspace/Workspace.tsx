"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { clientFirebase, firebaseConfigured } from "@/lib/firebase/client";
import type { Conversation, ResearchDocument, ResearchMessage, ResearchResponse as ResponseType } from "@/lib/schema";
import { researchStream, watchConversations, watchMessages } from "@/services/conversations";
import { watchDocuments } from "@/services/documents";
import { DocumentPanel } from "./DocumentPanel";
import { ConversationPanel } from "./ConversationPanel";
import { ResearchResponse } from "./ResearchResponse";
import { Composer } from "./Composer";

type Pending = { question: string; draft: string; regeneratingId?: string; response?: ResponseType };

function partialSummary(json: string) {
  const match = json.match(/"summary"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (!match) return "";
  try { return JSON.parse(`"${match[1]}"`); } catch { return match[1].replace(/\\n/g, " "); }
}

function readableError(error: unknown) {
  if (error instanceof Error && error.message.includes("permission-denied")) return "Your workspace could not be loaded. Check Firebase access rules.";
  return "Your workspace is temporarily unavailable. Please refresh and try again.";
}

export function Workspace() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState<ResearchDocument[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const knownReady = useRef(new Set<string>());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ResearchMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [lastFailure, setLastFailure] = useState<{ question: string; regenerateMessageId?: string; documentIds: string[] } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!firebaseConfigured) { setAuthLoading(false); return; }
    const unsubscribe = onAuthStateChanged(clientFirebase.auth(), current => {
      if (current) { setUser(current); setAuthLoading(false); }
      else signInAnonymously(clientFirebase.auth()).catch(() => {
        setError("Could not create a workspace session. Enable Anonymous Authentication in Firebase.");
        setAuthLoading(false);
      });
    }, caught => { setError(readableError(caught)); setAuthLoading(false); });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    const stopDocuments = watchDocuments(user.uid, items => {
      setDocuments(items);
      const newReady = items.filter(item => item.status === "ready" && !knownReady.current.has(item.id));
      newReady.forEach(item => knownReady.current.add(item.id));
      if (newReady.length) setSelected(previous => [...new Set([...previous, ...newReady.map(item => item.id)])]);
    }, caught => setError(readableError(caught)));
    const stopConversations = watchConversations(user.uid, setConversations, caught => setError(readableError(caught)));
    return () => { stopDocuments(); stopConversations(); };
  }, [user]);

  useEffect(() => {
    if (!user || !activeId) { setMessages([]); setMessagesLoading(false); return; }
    setMessagesLoading(true);
    return watchMessages(user.uid, activeId, items => { setMessages(items); setMessagesLoading(false); }, caught => { setError(readableError(caught)); setMessagesLoading(false); });
  }, [user, activeId]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, pending]);

  const readyIds = selected.filter(id => documents.some(document => document.id === id && document.status === "ready"));

  const ask = useCallback(async (question: string, regenerateMessageId?: string, contextIds?: string[]) => {
    const documentIds = contextIds || readyIds;
    if (!user || pending || documentIds.length === 0) return;
    setError("");
    setLastFailure(null);
    setPending({ question, draft: "", regeneratingId: regenerateMessageId });
    let streamed = "";
    let startedMessageId: string | undefined;
    try {
      const token = await user.getIdToken();
      await researchStream(token, { question, documentIds, conversationId: activeId || undefined, regenerateMessageId }, event => {
        if (event.type === "start") { startedMessageId = event.messageId; setActiveId(event.conversationId); }
        if (event.type === "delta") {
          streamed += event.text;
          setPending(previous => previous ? { ...previous, draft: partialSummary(streamed) } : null);
        }
        if (event.type === "complete") {
          setPending(previous => previous ? { ...previous, response: event.response } : null);
        }
      });
      setPending(null);
    } catch (caught) {
      setPending(null);
      setLastFailure({ question, regenerateMessageId: regenerateMessageId || startedMessageId, documentIds });
      setError(caught instanceof Error ? caught.message : "Something went wrong while processing this request. Please try again.");
    }
  }, [user, pending, readyIds, activeId]);

  function regenerate(messageId: string, index: number) {
    const question = [...messages.slice(0, index)].reverse().find(message => message.role === "user")?.content;
    if (question) ask(question, messageId, messages[index].documentIds);
  }

  function newResearch() { setActiveId(null); setMessages([]); setPending(null); setDrawerOpen(false); setError(""); setLastFailure(null); }

  if (!firebaseConfigured) return <div className="setup-screen"><div className="brand-mark">R<span>—</span></div><h1>Research Workspace</h1><p>Connect a Firebase project to start your workspace.</p><code>Copy .env.example to .env.local and add your Firebase configuration.</code></div>;
  if (authLoading) return <div className="loading-screen"><span className="brand-mark">R<span>—</span></span><p>Opening workspace…</p></div>;

  const sidebar = <><div className="sidebar-top"><div className="sidebar-label">Workspace</div><button type="button" className="workspace-link" onClick={newResearch}>Research <span>↗</span></button></div><DocumentPanel uid={user?.uid || ""} documents={documents} selected={selected} onToggle={id => setSelected(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])} onUploadSuccess={id => setSelected(previous => [...new Set([...previous, id])])} /><ConversationPanel conversations={conversations} activeId={activeId} onSelect={id => { setActiveId(id); setDrawerOpen(false); setPending(null); setError(""); }} onNew={newResearch} /></>;

  return <div className="app-shell">
    <header className="app-header"><div className="header-left"><button type="button" className="menu-button" aria-label="Open workspace navigation" onClick={() => setDrawerOpen(true)}>☰</button><button type="button" className="brand" onClick={newResearch}><span className="brand-mark">R<span>—</span></span><span>Research Workspace</span></button></div><div className="header-right"><span className="header-caption">Document intelligence, distilled.</span><span className="profile-mark" title="Private workspace">W</span></div></header>
    <div className="workspace-layout"><aside className="sidebar">{sidebar}</aside><main className="main-area"><div className="research-scroll"><div className="research-content">
      {!activeId && !pending && <div className="welcome"><div className="eyebrow">YOUR RESEARCH DESK</div><h1>{documents.length ? "Start with a question." : "A clearer way to research."}</h1><p>{documents.length ? "Your documents are ready when you are. Ask a question to surface the findings that matter." : "Upload a few documents to start researching. Your sources, findings, and next steps will stay together here."}</p><div className="welcome-rule" /><div className="suggestions"><span>TRY ASKING</span>{["Summarize the main findings", "Compare two reports", "Find risks and action items"].map(question => <button type="button" key={question} onClick={() => ask(question)} disabled={readyIds.length === 0}>{question}<span aria-hidden="true">↗</span></button>)}</div></div>}
      {activeId && <div className="conversation-header"><div className="eyebrow">RESEARCH / {conversations.find(item => item.id === activeId)?.title || "NEW QUESTION"}</div><h1>{conversations.find(item => item.id === activeId)?.title || "Research"}</h1><p>{readyIds.length} selected {readyIds.length === 1 ? "document" : "documents"}</p></div>}
      {messagesLoading && <p className="quiet-loading">Loading research…</p>}
      <div className="message-stack">{messages.map((message, index) => message.role === "user" ? <section className="question-block" key={message.id}><div className="eyebrow">QUESTION {String(messages.slice(0, index + 1).filter(item => item.role === "user").length).padStart(2, "0")}</div><h2>{message.content}</h2></section> : <div key={message.id}>{pending?.regeneratingId === message.id ? <div className="generation-state"><span>Regenerating research…</span>{pending.draft && <p>{pending.draft}</p>}</div> : message.structuredResponse ? <ResearchResponse response={message.structuredResponse} onRegenerate={() => regenerate(message.id, index)} regenerating={Boolean(pending)} /> : <div className="generation-state"><p>{message.status === "failed" ? "This answer could not be completed." : message.content}</p>{message.status === "failed" && <button className="text-action" type="button" onClick={() => regenerate(message.id, index)}>Try again</button>}</div>}</div>)}
      {pending && !pending.regeneratingId && <><section className="question-block pending-question"><div className="eyebrow">QUESTION</div><h2>{pending.question}</h2></section><div className="generation-state" role="status"><span>Generating research…</span>{pending.draft && <div className="draft-summary"><div className="eyebrow">SUMMARY · DRAFT</div><p>{pending.draft}</p></div>}</div></>}
      </div>
      {error && <div className="request-error" role="alert"><p>{error}</p><div>{lastFailure && <button type="button" onClick={() => ask(lastFailure.question, lastFailure.regenerateMessageId, lastFailure.documentIds)}>Try again</button>}<button type="button" onClick={() => { setError(""); setLastFailure(null); }}>Dismiss</button></div></div>}
      <div ref={bottom} />
    </div></div><Composer onSubmit={question => ask(question)} disabled={!user || readyIds.length === 0} busy={Boolean(pending)} documentCount={readyIds.length} /></main></div>
    {drawerOpen && <div className="drawer-layer"><button className="drawer-scrim" type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} /><aside className="mobile-sidebar"><div className="drawer-heading"><span>Workspace</span><button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close navigation">×</button></div>{sidebar}</aside></div>}
  </div>;
}
