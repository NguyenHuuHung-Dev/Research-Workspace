import { NextRequest } from "next/server";
import { authenticateUser, FirebaseAuthError } from "@/lib/firebase/rest";
import { aiModel, generateResearchAnswer } from "@/lib/gemini/research";
import { retrieveChunks } from "@/lib/research/retrieval";
import { researchRequestSchema, type ResearchDocument, type ResearchMessage } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof authenticateUser>>;
  try { user = await authenticateUser(request); }
  catch (error) { return Response.json({ error: error instanceof FirebaseAuthError ? error.message : "Could not connect to Firebase." }, { status: 401 }); }
  try {
    const body = researchRequestSchema.parse(await request.json());
    const { uid, store } = user;
    const docs = await Promise.all(body.documentIds.map(id => store.getDoc<ResearchDocument>(`users/${uid}/documents/${id}`)));
    if (docs.some(doc => !doc || doc.status !== "ready")) {
      return Response.json({ error: "Select documents that are ready to research." }, { status: 400 });
    }
    const chunks = await retrieveChunks(store, uid, body.documentIds, body.question);
    if (!chunks.length) return Response.json({ error: "No searchable content was found in these documents." }, { status: 400 });
    const conversationId = body.conversationId || crypto.randomUUID();
    const conversationPath = `users/${uid}/conversations/${conversationId}`;
    if (body.conversationId && !(await store.getDoc(conversationPath))) {
      return Response.json({ error: "This conversation was not found." }, { status: 404 });
    }
    const messageId = body.regenerateMessageId || crypto.randomUUID();
    const messagePath = `${conversationPath}/messages/${messageId}`;
    if (body.regenerateMessageId) {
      const previous = await store.getDoc<ResearchMessage>(messagePath);
      if (!previous || previous.role !== "assistant") return Response.json({ error: "This answer cannot be regenerated." }, { status: 400 });
    }
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        const start = Date.now();
        let started = false;
        try {
          if (!body.conversationId) await store.setDoc(conversationPath, {
            id: conversationId, title: body.question.slice(0, 72), documentIds: body.documentIds,
            createdAt: start, updatedAt: start,
          });
          if (!body.regenerateMessageId) {
            const questionId = crypto.randomUUID();
            await store.setDoc(`${conversationPath}/messages/${questionId}`, {
              id: questionId, role: "user", content: body.question, createdAt: start,
              status: "complete", documentIds: body.documentIds,
            });
          }
          send({ type: "start", conversationId, messageId });
          started = true;
          const response = await generateResearchAnswer(body.question, chunks, text => send({ type: "delta", text }));
          const previous = body.regenerateMessageId ? await store.getDoc<ResearchMessage>(messagePath) : null;
          await store.setDoc(messagePath, {
            id: messageId, role: "assistant", content: response.summary, structuredResponse: response,
            createdAt: previous?.createdAt || Date.now(), status: "complete", documentIds: body.documentIds,
            latency: Date.now() - start, model: aiModel, version: (previous?.version || 0) + 1,
          });
          const conversation = await store.getDoc<{ title: string; createdAt: number }>(conversationPath);
          await store.setDoc(conversationPath, {
            id: conversationId, title: conversation?.title || body.question.slice(0, 72),
            createdAt: conversation?.createdAt || start, updatedAt: Date.now(), documentIds: body.documentIds,
          });
          send({ type: "complete", response, conversationId, messageId });
        } catch (error) {
          console.error("Research failed", error);
          if (started && !body.regenerateMessageId) {
            await store.setDoc(messagePath, {
              id: messageId, role: "assistant", content: "", structuredResponse: null,
              createdAt: Date.now(), status: "failed", documentIds: body.documentIds,
              latency: Date.now() - start, model: aiModel, version: 0,
            }).catch(writeError => console.error("Could not save failed answer", writeError));
          }
          send({ type: "error", message: "The research assistant is temporarily unavailable. Please try again." });
        } finally { controller.close(); }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("Invalid research request", error);
    return Response.json({ error: "Could not start this research request. Please try again." }, { status: 400 });
  }
}
