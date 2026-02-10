import { z } from "zod";

const PricingSchema = z
  .record(
    z.object({
      // USD per 1M tokens.
      input: z.number().nonnegative(),
      output: z.number().nonnegative(),
      cached_input: z.number().nonnegative().optional(),
    }),
  )
  .optional();

const DEFAULT_PRICING_USD_PER_1M_TOKENS: NonNullable<z.infer<typeof PricingSchema>> = {
  // Keep in sync with https://openai.com/api/pricing/ (override in .env if you want).
  "gpt-5.2": { input: 1.75, cached_input: 0.175, output: 14.0 },
  "gpt-5-mini": { input: 0.25, cached_input: 0.025, output: 2.0 },
};

const ConfigSchema = z.object({
  openaiApiKey: z.string().min(1, "OPENAI_API_KEY is required"),
  models: z.object({
    thinking: z.string().min(1),
    cheap: z.string().min(1),
  }),
  reasoningEffort: z.enum(["low", "medium", "high"]),
  maxSteps: z.number().int().positive(),
  pretty: z.boolean(),
  jsonl: z.boolean(),
  verbosity: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  // USD per 1M tokens, by model id: {"gpt-5.2":{"input":X,"output":Y},...}
  pricingUsdPer1MTokens: PricingSchema,
  // USD per 1K web_search tool calls.
  webSearchUsdPer1KCalls: z.number().nonnegative(),
});

export type HarnessConfig = z.infer<typeof ConfigSchema>;

function parsePricingJson() {
  const raw = (process.env.HARNESS_PRICING_USD_PER_1M_TOKENS_JSON ?? "").trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return PricingSchema.parse(parsed);
  } catch (e) {
    throw new Error(`Invalid HARNESS_PRICING_USD_PER_1M_TOKENS_JSON: ${String((e as any)?.message ?? e)}`);
  }
}

function parseWebSearchToolPrice() {
  const raw = (process.env.HARNESS_WEB_SEARCH_USD_PER_1K_CALLS ?? "").trim();
  if (!raw) return 10.0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid HARNESS_WEB_SEARCH_USD_PER_1K_CALLS (must be a non-negative number).");
  return n;
}

function parseVerbosityEnv(): 0 | 1 | 2 | 3 {
  const raw = (process.env.HARNESS_VERBOSITY ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  return 0;
}

export function loadConfig(overrides?: Partial<Pick<HarnessConfig, "maxSteps" | "pretty" | "jsonl" | "verbosity">>): HarnessConfig {
  const env = {
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    models: {
      thinking: process.env.HARNESS_MODEL_THINKING ?? "gpt-5.2",
      cheap: process.env.HARNESS_MODEL_CHEAP ?? "gpt-5-mini",
    },
    reasoningEffort: (process.env.HARNESS_REASONING_EFFORT ?? "high") as "low" | "medium" | "high",
    maxSteps: Number(process.env.HARNESS_MAX_STEPS ?? "20"),
    pretty: true,
    jsonl: false,
    verbosity: parseVerbosityEnv(),
    pricingUsdPer1MTokens: parsePricingJson() ?? DEFAULT_PRICING_USD_PER_1M_TOKENS,
    webSearchUsdPer1KCalls: parseWebSearchToolPrice(),
  };

  // Important: don't let `undefined` override env/default values.
  const raw = {
    ...env,
    maxSteps: overrides?.maxSteps ?? env.maxSteps,
    pretty: overrides?.pretty ?? env.pretty,
    jsonl: overrides?.jsonl ?? env.jsonl,
    verbosity: overrides?.verbosity ?? env.verbosity,
  };

  return ConfigSchema.parse(raw);
}
