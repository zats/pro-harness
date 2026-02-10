import path from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { z } from "zod";
import type { ProgressEvent, Reporter } from "pro-harness-core";
import { loadConfig, runHarness } from "pro-harness-core";

export const runtime = "nodejs";

// Load root .env so the web UI "just works" without duplicating secrets.
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const BodySchema = z.object({
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

async function nanoTitle(openai: OpenAI, args: { kind: "search" | "thought"; input: string }) {
  const r = await openai.responses.create({
    model: "gpt-5-nano",
    reasoning: { effort: "low" } as any,
    input: [
      `Write a short UI headline for a harness ${args.kind}.`,
      'Style: plain English, like "Searching for …" or "Gathering …".',
      "No quotes, no markdown, no trailing punctuation.",
      "",
      args.input,
    ].join("\n"),
  });
  return (r.output_text ?? "").trim();
}

async function nanoBody(openai: OpenAI, input: string) {
  const r = await openai.responses.create({
    model: "gpt-5-nano",
    reasoning: { effort: "low" } as any,
    input: [
      "Summarize this in 1-2 short sentences for a UI.",
      "Be concrete, no fluff, no internal meta, no policy talk.",
      "",
      input,
    ].join("\n"),
  });
  return (r.output_text ?? "").trim();
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
        controller.enqueue(enc.encode(toSse({ ...obj, elapsedMs: elapsedMs() })));
      };

      const uiItem = (item: UiItem) => send({ type: "ui_item", item });
      const uiPatch = (id: string, patch: Partial<UiItem>) => send({ type: "ui_patch", id, patch });

      req.signal.addEventListener(
        "abort",
        () => {
          send({ type: "error", message: "aborted" });
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
                ? await nanoTitle(openai, { kind: "search", input: `Query: ${e.query}\nDomains: ${domains.map((d) => d.domain).join(", ")}` })
                : `Searching for ${e.query}`;
              uiItem({ id, kind: "search", title, citations, moreCount });
            })().catch(() => {
              uiItem({ id, kind: "search", title: `Searching for ${e.query}`, citations, moreCount });
            });

            pending.push(p);
            return;
          }

          if (e.type === "step_end") {
            // Attach search summaries to the search item created by web_search_result.
            const sid = searchByStepId.get(e.stepId);
            if (sid) {
              const p = (async () => {
                const text = body.data.summarizeUi ? await nanoBody(openai, `Query result summary:\n${e.learned}`) : e.learned;
                uiPatch(sid, { body: text });
              })().catch(() => uiPatch(sid, { body: e.learned }));
              pending.push(p);
              return;
            }

            // Planning: turn into a single "thought" item.
            if (body.data.summarizeUi && e.stepId === "planner") {
              const id = newId("thought");
              const p = (async () => {
                const title = await nanoTitle(openai, { kind: "thought", input: `User prompt:\n${body.data.prompt}` });
                const text = await nanoBody(openai, `What the harness will do next (high level):\n${e.learned}`);
                uiItem({ id, kind: "thought", title, body: text });
              })().catch(() => uiItem({ id, kind: "thought", title: "Planning next steps", body: e.learned }));
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
          send({ type: "final_answer", text: result.finalAnswer });
          await Promise.allSettled(pending);
        } catch (err: any) {
          if (!req.signal.aborted) {
            send({ type: "error", message: String(err?.message ?? err), stack: String(err?.stack ?? "") });
          }
        } finally {
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
