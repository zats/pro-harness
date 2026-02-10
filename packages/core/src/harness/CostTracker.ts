type UsageLike = {
  input_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
  output_tokens?: number;
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
  total_tokens?: number;
};

export type CostSummary = {
  totals: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    costUsd?: number;
    toolCostUsd?: number;
    webSearchCalls: number;
  };
  byModel: Record<
    string,
    {
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      totalTokens: number;
      costUsd?: number;
    }
  >;
  priced: boolean; // fully priced (all models + tools)
  partiallyPriced: boolean; // some cost computed, but missing rates for some models/tools
  missingPricingFor: string[];
};

export class CostTracker {
  private byModel = new Map<string, { input: number; cachedInput: number; output: number; reasoning: number; total: number }>();
  private webSearchCalls = 0;

  record(model: string, usage: UsageLike | null | undefined) {
    const input = Number(usage?.input_tokens ?? 0);
    const cachedInput = Number(usage?.input_tokens_details?.cached_tokens ?? 0);
    const output = Number(usage?.output_tokens ?? 0);
    const reasoning = Number(usage?.output_tokens_details?.reasoning_tokens ?? 0);
    const total = Number(usage?.total_tokens ?? input + output);
    const prev = this.byModel.get(model) ?? { input: 0, cachedInput: 0, output: 0, reasoning: 0, total: 0 };
    this.byModel.set(model, {
      input: prev.input + input,
      cachedInput: prev.cachedInput + cachedInput,
      output: prev.output + output,
      reasoning: prev.reasoning + reasoning,
      total: prev.total + total,
    });
  }

  recordWebSearchCall() {
    this.webSearchCalls += 1;
  }

  summary(args: {
    pricingUsdPer1MTokens?: Record<string, { input: number; output: number; cached_input?: number }>;
    webSearchUsdPer1KCalls?: number;
  }): CostSummary {
    const byModel: CostSummary["byModel"] = {};
    let totalInput = 0;
    let totalCachedInput = 0;
    let totalOutput = 0;
    let totalReasoning = 0;
    let totalTotal = 0;
    let modelCost = 0;
    let toolCost = 0;
    const missing: string[] = [];

    for (const [model, t] of this.byModel.entries()) {
      totalInput += t.input;
      totalCachedInput += t.cachedInput;
      totalOutput += t.output;
      totalReasoning += t.reasoning;
      totalTotal += t.total;

      const price = args.pricingUsdPer1MTokens?.[model];
      if (!price) {
        missing.push(`model:${model}`);
        byModel[model] = {
          inputTokens: t.input,
          cachedInputTokens: t.cachedInput,
          outputTokens: t.output,
          reasoningTokens: t.reasoning,
          totalTokens: t.total,
        };
        continue;
      }

      const cachedRate = price.cached_input ?? price.input;
      const nonCachedInput = Math.max(0, t.input - t.cachedInput);
      const cost = (nonCachedInput * price.input + t.cachedInput * cachedRate + t.output * price.output) / 1_000_000;
      modelCost += cost;
      byModel[model] = {
        inputTokens: t.input,
        cachedInputTokens: t.cachedInput,
        outputTokens: t.output,
        reasoningTokens: t.reasoning,
        totalTokens: t.total,
        costUsd: cost,
      };
    }

    // Tools: web_search has a per-call fee that is not represented by token usage.
    if (this.webSearchCalls > 0) {
      const p = args.webSearchUsdPer1KCalls;
      if (p === undefined) {
        missing.push("tool:web_search");
      } else {
        toolCost += (this.webSearchCalls * p) / 1000;
      }
    }

    const haveAnyPricing = Boolean(args.pricingUsdPer1MTokens) || (args.webSearchUsdPer1KCalls !== undefined && this.webSearchCalls > 0);
    const fullyPriced = haveAnyPricing && missing.length === 0;
    const partiallyPriced = haveAnyPricing && missing.length > 0 && (modelCost + toolCost) > 0;

    const totals: CostSummary["totals"] = {
      inputTokens: totalInput,
      cachedInputTokens: totalCachedInput,
      outputTokens: totalOutput,
      reasoningTokens: totalReasoning,
      totalTokens: totalTotal,
      webSearchCalls: this.webSearchCalls,
      ...(haveAnyPricing ? { costUsd: modelCost + toolCost } : {}),
      ...(haveAnyPricing ? { toolCostUsd: toolCost } : {}),
    };

    return { totals, byModel, priced: fullyPriced, partiallyPriced, missingPricingFor: missing };
  }
}
