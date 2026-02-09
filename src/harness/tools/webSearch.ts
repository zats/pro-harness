import type OpenAI from "openai";
import type { HarnessConfig } from "../config.js";
import { callText } from "../openai/llm.js";
import type { EvidenceItem } from "../types.js";
import type { CostTracker } from "../CostTracker.js";

type WebSearchSource = {
  url?: string;
  title?: string;
  snippet?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}`;
}

function collectWebSources(resp: any): WebSearchSource[] {
  const out: WebSearchSource[] = [];
  const items = Array.isArray(resp?.output) ? resp.output : [];
  for (const it of items) {
    if (it?.type !== "web_search_call") continue;
    const sources = it?.action?.sources;
    if (!Array.isArray(sources)) continue;
    for (const s of sources) {
      if (typeof s?.url !== "string") continue;
      out.push({ url: s.url, title: s.title, snippet: s.snippet });
    }
  }
  return out;
}

export async function webSearch(
  openai: OpenAI,
  cfg: HarnessConfig,
  args: { query: string; topK?: number },
  opts?: { costTracker?: CostTracker },
) {
  opts?.costTracker?.recordWebSearchCall();
  // Use the OpenAI-hosted web_search tool; model will call the tool internally.
  // We keep the request short and extract sources from the tool call metadata.
  const resp = await openai.responses.create({
    model: cfg.models.cheap,
    tools: [{ type: "web_search" }],
    // The API supports this include path, but SDK typings may lag.
    include: ["web_search_call.action.sources"] as any,
    input: `Search the web for: ${args.query}\nReturn a short, high-signal summary in plain text.`,
    reasoning: { effort: "low" },
  });

  opts?.costTracker?.record(cfg.models.cheap, (resp as any).usage);

  const sources = collectWebSources(resp);
  const evidence: EvidenceItem[] = sources.slice(0, args.topK ?? 8).map((s) => ({
    id: randomId("web"),
    url: s.url,
    title: s.title,
    snippet: s.snippet,
    fetched_at: nowIso(),
  }));

  // Optional: compress the model's summary into something stable for progress output.
  const summary = (resp.output_text ?? "").trim();

  return { evidence, summary };
}

export async function summarizeForProgress(openai: OpenAI, cfg: HarnessConfig, args: { title: string; raw: string }) {
  const prompt = [
    "Summarize the following tool output in 1-2 sentences for a progress log.",
    "Be concrete: include counts, key outcomes, and any errors.",
    "",
    `Title: ${args.title}`,
    "",
    args.raw,
  ].join("\n");
  const r = await callText(openai, cfg, { model: cfg.models.cheap, input: prompt, temperature: 0 });
  return r.text.trim() || "No notable output.";
}
