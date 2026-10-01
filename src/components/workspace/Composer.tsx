"use client";
import { useState } from "react";

export function Composer({ onSubmit, disabled, busy, documentCount }: { onSubmit: (question: string) => void; disabled: boolean; busy: boolean; documentCount: number }) {
  const [value, setValue] = useState("");
  function submit() { const question = value.trim(); if (question && !disabled && !busy) { onSubmit(question); setValue(""); } }
  return <div className="composer-wrap"><div className="composer-inner"><div className="composer-context">{documentCount > 0 ? `Researching across ${documentCount} ${documentCount === 1 ? "document" : "documents"}` : "Select a ready document to begin"}</div><div className="composer"><textarea aria-label="Ask about your documents" placeholder="Ask about your documents…" value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} rows={2} disabled={disabled || busy} /><button type="button" onClick={submit} disabled={disabled || busy || !value.trim()} aria-label="Send question">Ask <span aria-hidden="true">↗</span></button></div><div className="composer-hint">Enter to ask · Shift + Enter for a new line</div></div></div>;
}
