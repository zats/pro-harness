import type OpenAI from "openai";
import type { HarnessConfig } from "../config.js";
import { callText } from "./llm.js";
import type { CostTracker } from "../CostTracker.js";

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function extractJson<T extends object>(
  openai: OpenAI,
  cfg: HarnessConfig,
  args: { instruction: string; input: string },
  opts?: { costTracker?: CostTracker },
) {
  const base = [
    "You are a JSON extractor.",
    "Return JSON only. No prose, no markdown, no code fences.",
    "If the input is ambiguous, choose the most reasonable interpretation and proceed.",
    "",
    "Instruction:",
    args.instruction,
    "",
    "Input:",
    args.input,
  ].join("\n");

  const first = await callText(openai, cfg, { model: cfg.models.cheap, input: base, temperature: 0 }, opts);
  const parsed1 = safeParseJson(first.text);
  if (parsed1 && typeof parsed1 === "object") return parsed1 as T;

  const repairPrompt = [
    "Fix the following into valid JSON that satisfies the instruction.",
    "Return JSON only. No prose, no markdown, no code fences.",
    "",
    "Instruction:",
    args.instruction,
    "",
    "Bad JSON:",
    first.text,
  ].join("\n");

  const repaired = await callText(openai, cfg, { model: cfg.models.cheap, input: repairPrompt, temperature: 0 }, opts);
  const parsed2 = safeParseJson(repaired.text);
  if (parsed2 && typeof parsed2 === "object") return parsed2 as T;

  throw new Error("Failed to extract valid JSON from model output.");
}
