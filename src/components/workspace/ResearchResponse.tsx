"use client";
import { useState } from "react";
import type { ResearchResponse as ResearchResponseType } from "@/lib/schema";
import { formatResponse } from "@/services/conversations";

export function ResearchResponse({ response, onRegenerate, regenerating }: { response: ResearchResponseType; onRegenerate: () => void; regenerating: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(formatResponse(response));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }
  return <article className="research-response">
    <section className="response-section summary-section"><h3>Summary</h3><p>{response.summary}</p></section>
    {response.key_points.length > 0 && <section className="response-section"><h3>Key points</h3><ol className="numbered-list">{response.key_points.map((point, index) => <li key={`${point.title}-${index}`}><span className="item-index">{String(index + 1).padStart(2, "0")}</span><div><h4>{point.title}</h4><p>{point.detail}</p></div></li>)}</ol></section>}
    {response.evidence.length > 0 && <section className="response-section"><h3>Evidence</h3><div className="evidence-list">{response.evidence.map((item, index) => <blockquote key={`${item.documentId}-${index}`}><div className="evidence-heading"><strong>{item.documentName}</strong>{item.page && <span>p. {item.page}</span>}</div><p>“{item.excerpt}”</p></blockquote>)}</div></section>}
    {response.risks.length > 0 && <section className="response-section"><h3>Risks</h3><ul className="plain-list">{response.risks.map((risk, index) => <li key={index}>{risk}</li>)}</ul></section>}
    {response.actions.length > 0 && <section className="response-section"><h3>Next actions</h3><ol className="numbered-list action-list">{response.actions.map((action, index) => <li key={index}><span className="item-index">{String(index + 1).padStart(2, "0")}</span><p>{action}</p></li>)}</ol></section>}
    <div className="response-footer"><span>Confidence: <strong>{response.confidence}</strong></span><div><button className="text-action" type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button><button className="text-action" type="button" onClick={onRegenerate} disabled={regenerating}>{regenerating ? "Regenerating…" : "Regenerate"}</button></div></div>
  </article>;
}
