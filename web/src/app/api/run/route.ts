import path from "node:path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { z } from "zod";
import type { ProgressEvent, Reporter } from "pro-harness-core";
import { loadConfig, runHarness } from "pro-harness-core";

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

async function nanoSummarize(openai: OpenAI, input: string) {
  const r = await openai.responses.create({
    model: "gpt-5-nano",
    reasoning: { effort: "low" } as any,
    input: [
      "Summarize this harness progress event for a UI in 1 short sentence.",
      "Be concrete, no fluff, no internal meta. If it's a step, say what is happening/finished.",
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
  const cfg = loadConfig({ pretty: false, jsonl: true, verbosity: body.data.verbosity });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const startNs = process.hrtime.bigint();
      const pending: Promise<unknown>[] = [];
      let closed = false;

      const elapsedMs = () => Number((process.hrtime.bigint() - startNs) / 1_000_000n);

      const send = (obj: any) => {
        if (closed) return;
        controller.enqueue(enc.encode(toSse({ ...obj, elapsedMs: elapsedMs() })));
      };

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
          send(e);
          if (!body.data.summarizeUi) return;
          if (e.type !== "step_start" && e.type !== "step_end" && e.type !== "run_end") return;

          // Run nano summaries without blocking the harness.
          const p = nanoSummarize(openai, JSON.stringify(e))
            .then((text) => {
              if (!text) return;
              send({ type: "ui_summary", stepId: (e as any).stepId, title: (e as any).title, text, costSoFarUsd: (e as any).costSoFarUsd });
            })
            .catch(() => {});
          pending.push(p);
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

