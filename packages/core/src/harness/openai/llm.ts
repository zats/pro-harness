import type OpenAI from "openai";
import type { HarnessConfig } from "../config.js";
import type { CostTracker } from "../CostTracker.js";

export type LlmCall = {
  model: string;
  input: string;
  temperature?: number;
  reasoningEffort?: "low" | "medium" | "high" | "none";
};

function supportsTemperature(model: string, reasoningEffort?: LlmCall["reasoningEffort"]) {
  // Per OpenAI docs: temperature is only supported for GPT-5.2/5.1 when reasoning effort is "none".
  // Other GPT-5 family models (gpt-5, gpt-5-mini, gpt-5-nano) reject temperature.
  const m = model.toLowerCase();
  if (m.startsWith("gpt-5.2") || m.startsWith("gpt-5.1")) return reasoningEffort === "none";
  if (m.startsWith("gpt-5")) return false;
  return true;
}

export async function callText(openai: OpenAI, cfg: HarnessConfig, call: LlmCall, opts?: { costTracker?: CostTracker }) {
  const reasoning = call.reasoningEffort ? ({ effort: call.reasoningEffort } as any) : undefined;
  const resp = await openai.responses.create({
    model: call.model,
    input: call.input,
    ...(supportsTemperature(call.model, call.reasoningEffort) && call.temperature !== undefined
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
