import type OpenAI from "openai";
import type { HarnessConfig } from "../config.js";
import type { CostTracker } from "../CostTracker.js";

export type LlmCall = {
  model: string;
  input: string;
  temperature?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "none";
};

function normalizeReasoningEffort(model: string, reasoningEffort?: LlmCall["reasoningEffort"]) {
  const m = model.toLowerCase();

  // Observed behavior (2026-02): gpt-5 / gpt-5-mini / gpt-5-nano return empty output unless effort="minimal".
  const isGpt5MiniFamily = m.startsWith("gpt-5-mini") || m.startsWith("gpt-5-nano");
  const isDatedGpt5 = m.startsWith("gpt-5-") && !m.startsWith("gpt-5.1") && !m.startsWith("gpt-5.2");
  const isPlainGpt5 = m === "gpt-5";

  const excluded = m.startsWith("gpt-5-pro") || m.startsWith("gpt-5-chat") || m.startsWith("gpt-5-search");
  if (!excluded && (isPlainGpt5 || isDatedGpt5 || isGpt5MiniFamily)) return "minimal";

  // gpt-5-pro currently only supports "high".
  if (m.startsWith("gpt-5-pro")) return "high";

  return reasoningEffort;
}

function supportsTemperature(model: string, reasoningEffort?: LlmCall["reasoningEffort"]) {
  // Per OpenAI docs: temperature is only supported for GPT-5.2/5.1 when reasoning effort is "none".
  // Other GPT-5 family models (gpt-5, gpt-5-mini, gpt-5-nano) reject temperature.
  const m = model.toLowerCase();
  if (m.startsWith("gpt-5.2") || m.startsWith("gpt-5.1")) return reasoningEffort === "none";
  if (m.startsWith("gpt-5")) return false;
  return true;
}

export async function callText(openai: OpenAI, cfg: HarnessConfig, call: LlmCall, opts?: { costTracker?: CostTracker }) {
  const effort = normalizeReasoningEffort(call.model, call.reasoningEffort);
  const reasoning = effort ? ({ effort } as any) : undefined;
  const resp = await openai.responses.create({
    model: call.model,
    input: call.input,
    ...(supportsTemperature(call.model, effort) && call.temperature !== undefined
      ? { temperature: call.temperature }
      : {}),
    // SDK typings may lag behind API capabilities; treat as best-effort.
    reasoning,
  });

  opts?.costTracker?.record(call.model, (resp as any).usage);

  return {
    id: resp.id,
    text: resp.output_text ?? "",
    usage: (resp as any).usage as any,
  };
}
