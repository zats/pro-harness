import OpenAI from "openai";
import type { HarnessConfig } from "../config.js";

export function makeOpenAI(config: HarnessConfig) {
  return new OpenAI({ apiKey: config.openaiApiKey });
}

