import type { ProgressEvent, Reporter } from "pro-harness-core";

type Opts = {
  pretty: boolean;
  jsonl: boolean;
  verbosity: 0 | 1 | 2 | 3;
};

function truncate(s: string, maxChars: number) {
  if (maxChars <= 0) return "";
  const t = s.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 14)).trimEnd()} …(truncated)`;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);

  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function formatUsdLabel(costUsd: number) {
  if (!Number.isFinite(costUsd) || costUsd < 0) return "";
  if (costUsd > 0 && costUsd < 0.01) return "$<0.01";
  return `$${costUsd.toFixed(2)}`;
}

export class ConsoleReporter implements Reporter {
  private startNs = process.hrtime.bigint();

  constructor(private opts: Opts) {}

  private lastPct = 0;

  emit(e: ProgressEvent) {
    const elapsedMs = Number((process.hrtime.bigint() - this.startNs) / 1_000_000n);
    if (this.opts.jsonl || !this.opts.pretty) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ ...(e as any), elapsedMs }));
      return;
    }

    let pct = e.type === "run_start" ? 0 : Math.min(100, Math.round((e.completedSteps / e.estimatedTotalSteps) * 100));
    if (e.type === "run_end") pct = 100;
    if (pct < this.lastPct) pct = this.lastPct; // keep progress monotonic even if estimate changes
    this.lastPct = pct;
    const costLabel = e.costSoFarUsd !== undefined ? formatUsdLabel(e.costSoFarUsd) : "";
    const prefix = `[${String(pct).padStart(3, " ")}%][${formatElapsed(elapsedMs).padStart(8, " ")}]${costLabel ? `[${costLabel}]` : ""}`;

    if (e.type === "run_start") {
      // eslint-disable-next-line no-console
      console.error(`${prefix} starting: ${e.input}`);
      return;
    }
    if (e.type === "step_start") {
      // eslint-disable-next-line no-console
      const id = this.opts.verbosity >= 2 ? ` [${e.stepId}]` : "";
      console.error(`${prefix} -> ${e.title}${id}${e.detail ? ` (${e.detail})` : ""}`);
      return;
    }
    if (e.type === "step_end") {
      // eslint-disable-next-line no-console
      const id = this.opts.verbosity >= 2 ? ` [${e.stepId}]` : "";
      console.error(`${prefix} <- ${e.title}${id}: ${e.learned}`);
      return;
    }
    if (e.type === "step_detail") {
      if (this.opts.verbosity < e.level) return;
      const max = this.opts.verbosity === 1 ? 400 : this.opts.verbosity === 2 ? 1400 : 4500;
      const msg = truncate(e.message, max);
      if (!msg) return;
      // eslint-disable-next-line no-console
      console.error(`${prefix}    ${e.title} [v${e.level}]: ${msg}`);
      return;
    }
    if (e.type === "budget_update") {
      // eslint-disable-next-line no-console
      console.error(`${prefix} budget: ${e.remainingSteps} steps remaining`);
      return;
    }
    if (e.type === "run_end") {
      // eslint-disable-next-line no-console
      const usage = e.usage
        ? `, tokens=${e.usage.totalTokens} (in=${e.usage.inputTokens}, out=${e.usage.outputTokens})`
        : "";
      const usageDetails = e.usageDetails
        ? `, cached_in=${e.usageDetails.cachedInputTokens}, reasoning=${e.usageDetails.reasoningTokens}, web_search_calls=${e.usageDetails.webSearchCalls}`
        : "";
      const cost =
        e.costPriced && e.costUsd !== undefined
          ? `, cost=$${e.costUsd.toFixed(4)}`
          : e.costPartiallyPriced && e.costUsd !== undefined
            ? `, cost~$${e.costUsd.toFixed(4)} (partial; missing ${e.costMissingPricingFor?.join(", ")})`
            : e.costPriced === false
              ? ", cost=unpriced"
              : "";
      console.error(`${prefix} done (${e.finalAnswerChars} chars${usage}${usageDetails}${cost})`);
    }
  }
}
