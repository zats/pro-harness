import path from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { z } from "zod";
import type { ProgressEvent, Reporter } from "pro-harness-core";
import { loadConfig, runHarness } from "pro-harness-core";
import { appendEvent, finishConversation, initConversation, newConversationId } from "../../../server/convoStore";

export const runtime = "nodejs";

// Load root .env so the web UI "just works" without duplicating secrets.
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const BodySchema = z.object({
  id: z.string().optional(),
  prompt: z.string().min(1),
  verbosity: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(1),
  summarizeUi: z.boolean().optional().default(true),
});

function toSse(obj: unknown) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

type UiItem = {
  id: string;
  kind: "thought" | "search";
  title: string;
  body?: string;
  citations?: { domain: string; url: string; faviconUrl: string; title?: string }[];
  moreCount?: number;
};

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}`;
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\\./, "");
  } catch {
    return url;
  }
}

function faviconUrl(domain: string) {
  // Simple and works well in practice.
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

async function nanoTitle(openai: OpenAI, args: { kind: "search" | "thought"; input: string }, opts?: { debug?: boolean }) {
  try {
    const r = await openai.responses.create({
      model: "gpt-5-nano",
      reasoning: { effort: "minimal" } as any,
      // Keep headlines short and stable.
      max_output_tokens: 24 as any,
      input: [
        `Write a short UI headline for a harness ${args.kind}.`,
        'Style: plain English, like "Searching for …" or "Gathering …".',
        "Hard limits: <= 9 words, <= 60 characters.",
        "No quotes, no markdown, no trailing punctuation.",
        "",
        args.input,
      ].join("\n"),
    });
    const t = (r.output_text ?? "").trim();
    if (!t) throw new Error("nanoTitle: empty");
    return t;
  } catch (e: any) {
    if (opts?.debug) console.error("[ui] nanoTitle failed:", e?.message ?? e);
    throw e;
  }
}

async function nanoBody(openai: OpenAI, input: string, opts?: { debug?: boolean }) {
  try {
    const r = await openai.responses.create({
      model: "gpt-5-nano",
      reasoning: { effort: "minimal" } as any,
      // Force short UI summaries.
      max_output_tokens: 80 as any,
      input: [
        "Summarize this for a UI.",
        "Hard limits: 1-2 sentences total, <= 220 characters.",
        "Be concrete. No fluff. No internal meta.",
        "",
        input,
      ].join("\n"),
    });
    const t = (r.output_text ?? "").trim();
    if (!t) throw new Error("nanoBody: empty");
    // As a final guard, cap to keep the activity feed compact.
    return t.length > 260 ? `${t.slice(0, 246).trimEnd()}…` : t;
  } catch (e: any) {
    if (opts?.debug) console.error("[ui] nanoBody failed:", e?.message ?? e);
    throw e;
  }
}

export async function POST(req: Request) {
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return new Response(JSON.stringify({ error: body.error.message }), { status: 400 });
  }

  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not set (web server env)" }), { status: 400 });
  }

  const openai = new OpenAI({ apiKey: key });
  // Always run core at max verbosity so we can generate clean UI summaries, even if the UI hides details.
  const cfg = loadConfig({ pretty: false, jsonl: true, verbosity: 3 });

  const convoId = body.data.id ?? newConversationId();
  const debug = process.env.NODE_ENV !== "production";
  const dbg = (...args: any[]) => {
    if (!debug) return;
    // eslint-disable-next-line no-console
    console.error("[run]", convoId, ...args);
  };
  try {
    await initConversation({ id: convoId, prompt: body.data.prompt });
  } catch (e: any) {
    if (String(e?.message) === "invalid_conversation_id") {
      return new Response(JSON.stringify({ error: "invalid_id" }), { status: 400 });
    }
    throw e;
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const startNs = process.hrtime.bigint();
      const pending: Promise<unknown>[] = [];
      let closed = false;
      const searchByStepId = new Map<string, string>();

      const elapsedMs = () => Number((process.hrtime.bigint() - startNs) / 1_000_000n);

      const send = (obj: any) => {
        if (closed) return;
        dbg("sse_send", obj?.type ?? "unknown");
        controller.enqueue(enc.encode(toSse({ ...obj, elapsedMs: elapsedMs() })));
      };

      const uiItem = (item: UiItem) => send({ type: "ui_item", item });
      const uiPatch = (id: string, patch: Partial<UiItem>) => send({ type: "ui_patch", id, patch });

      dbg("start", {
        summarizeUi: body.data.summarizeUi,
        verbosity: body.data.verbosity,
        promptLen: body.data.prompt.length,
        promptPreview: body.data.prompt.replace(/\s+/g, " ").slice(0, 120),
      });

      // First event: conversation id, so the client can update URL.
      void appendEvent({ id: convoId, event: { type: "convo_id", id: convoId } });
      send({ type: "convo_id", id: convoId });

      req.signal.addEventListener(
        "abort",
        () => {
          send({ type: "error", message: "aborted" });
          void appendEvent({ id: convoId, event: { type: "error", message: "aborted" } });
          void finishConversation({ id: convoId, error: "aborted" });
          closed = true;
          try {
            controller.close();
          } catch {
            // ignore
          }
        },
        { once: true },
      );

      const reporter: Reporter = {
        emit(e: ProgressEvent) {
          if (req.signal.aborted) return;

          // Convert core progress into a small set of user-facing items.
          if (e.type === "web_search_result") {
            dbg("core_event", { type: e.type, stepId: e.stepId, query: e.query, sources: (e.sources ?? []).length });
            const stepId = e.stepId;
            const id = newId("search");
            searchByStepId.set(stepId, id);

            const seen = new Set<string>();
            const domains: { domain: string; url: string; title?: string }[] = [];
            for (const s of e.sources ?? []) {
              const d = domainFromUrl(s.url);
              if (seen.has(d)) continue;
              seen.add(d);
              domains.push({ domain: d, url: s.url, title: s.title });
            }

            const citations = domains.slice(0, 3).map((d) => ({
              domain: d.domain,
              url: d.url,
              title: d.title,
              faviconUrl: faviconUrl(d.domain),
            }));

            const moreCount = Math.max(0, domains.length - citations.length);

            // Generate a short, friendly title from the query.
            const p = (async () => {
              const title = body.data.summarizeUi
                ? await nanoTitle(
                    openai,
                    { kind: "search", input: `Query: ${e.query}\nDomains: ${domains.map((d) => d.domain).join(", ")}` },
                    { debug },
                  )
                : `Searching for ${e.query}`;
              const item: UiItem = { id, kind: "search", title, citations, moreCount };
              await appendEvent({ id: convoId, event: { type: "ui_item", item } });
              dbg("ui_item", { id: item.id, kind: item.kind, title: item.title, citations: item.citations?.length ?? 0 });
              uiItem(item);
            })().catch((err) => {
              if (debug) console.error("[ui] failed to create search item:", err?.message ?? err);
              const item: UiItem = { id, kind: "search", title: `Searching for ${e.query}`, citations, moreCount };
              void appendEvent({ id: convoId, event: { type: "ui_item", item } });
              dbg("ui_item_fallback", { id: item.id, kind: item.kind, title: item.title, citations: item.citations?.length ?? 0 });
              uiItem(item);
            });

            pending.push(p);
            return;
          }

          if (e.type === "step_end") {
            if (e.stepId === "planner") {
              dbg("core_event", { type: e.type, stepId: e.stepId, learnedLen: e.learned?.length ?? 0 });
            }
            // Attach search summaries to the search item created by web_search_result.
            const sid = searchByStepId.get(e.stepId);
            if (sid) {
              const p = (async () => {
                const text = body.data.summarizeUi
                  ? await nanoBody(openai, `Query result summary:\n${e.learned}`, { debug })
                  : e.learned;
                await appendEvent({ id: convoId, event: { type: "ui_patch", id: sid, patch: { body: text } } });
                dbg("ui_patch", { id: sid, bodyLen: text.length });
                uiPatch(sid, { body: text });
              })().catch((err) => {
                if (debug) console.error("[ui] failed to summarize search result; falling back to raw learned:", err?.message ?? err);
                uiPatch(sid, { body: e.learned });
              });
              pending.push(p);
              return;
            }

            // Planning: turn into a single "thought" item.
            if (body.data.summarizeUi && e.stepId === "planner") {
              const id = newId("thought");
              const p = (async () => {
                const title = await nanoTitle(openai, { kind: "thought", input: `User prompt:\n${body.data.prompt}` }, { debug });
                const text = await nanoBody(openai, `What the harness will do next (high level):\n${e.learned}`, { debug });
                const item: UiItem = { id, kind: "thought", title, body: text };
                await appendEvent({ id: convoId, event: { type: "ui_item", item } });
                dbg("ui_item", { id: item.id, kind: item.kind, title: item.title, bodyLen: item.body?.length ?? 0 });
                uiItem(item);
              })().catch((err) => {
                if (debug) console.error("[ui] failed to create planning item:", err?.message ?? err);
                const item: UiItem = { id, kind: "thought", title: "Planning next steps", body: e.learned };
                void appendEvent({ id: convoId, event: { type: "ui_item", item } });
                dbg("ui_item_fallback", { id: item.id, kind: item.kind, title: item.title, bodyLen: item.body?.length ?? 0 });
                uiItem(item);
              });
              pending.push(p);
              return;
            }

            return;
          }
        },
      };

      (async () => {
        try {
          const result = await runHarness({ input: body.data.prompt, config: cfg, reporter, signal: req.signal });
          await appendEvent({ id: convoId, event: { type: "final_answer", text: result.finalAnswer } });
          send({ type: "final_answer", text: result.finalAnswer });
          await Promise.allSettled(pending);
          await finishConversation({ id: convoId });
        } catch (err: any) {
          if (!req.signal.aborted) {
            const msg = String(err?.message ?? err);
            dbg("run_error", msg);
            await appendEvent({ id: convoId, event: { type: "error", message: msg } });
            await finishConversation({ id: convoId, error: msg });
            send({ type: "error", message: msg, stack: String(err?.stack ?? "") });
          }
        } finally {
          dbg("close");
          closed = true;
          try {
            controller.close();
          } catch {
            // ignore
          }
        }
      })().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
