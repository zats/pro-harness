#!/usr/bin/env node
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHarness, loadConfig } from "pro-harness-core";
import { PRODUCT_NAME } from "pro-harness-shared";
import { ConsoleReporter } from "./progress/ConsoleReporter.js";

// Load repo-root .env even when running from packages/cli.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const out: Record<string, string | boolean | number> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") continue; // pnpm sometimes forwards this when scripts contain `&&`
    if (/^-v+$/.test(a)) {
      out.verbosity = Number(out.verbosity ?? 0) + (a.length - 1);
      continue;
    }
    if (a === "--pretty") out.pretty = true;
    else if (a === "--jsonl") out.jsonl = true;
    else if (a === "--max-steps") out.maxSteps = args[++i] ?? "";
    else if (a === "--help" || a === "-h") out.help = true;
    else positional.push(a);
  }
  return { flags: out, positional };
}

function help() {
  const key = process.env.OPENAI_API_KEY ?? "";
  const thinking = process.env.HARNESS_MODEL_THINKING ?? "gpt-5.2";
  const cheap = process.env.HARNESS_MODEL_CHEAP ?? "gpt-5-mini";
  const effort = process.env.HARNESS_REASONING_EFFORT ?? "high";
  const maxSteps = process.env.HARNESS_MAX_STEPS ?? "20";
  const verbosity = process.env.HARNESS_VERBOSITY ?? "0";

  // fish-compatible example commands in docs are fine; this help is plain.
  // Keep it short to avoid noisy CLI output.
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage:",
      `  ${PRODUCT_NAME} [--pretty|--jsonl] [--max-steps N] \"your task\"`,
      "",
      "Env:",
      `  OPENAI_API_KEY (${key ? `set (len: ${key.length})` : "NOT SET"}; not printed)`,
      `  HARNESS_MODEL_THINKING (current: ${thinking})`,
      `  HARNESS_MODEL_CHEAP (current: ${cheap})`,
      `  HARNESS_REASONING_EFFORT (current: ${effort})`,
      `  HARNESS_MAX_STEPS (current: ${maxSteps})`,
      `  HARNESS_VERBOSITY (current: ${verbosity})`,
    ].join("\n"),
  );
}

async function main() {
  const { flags, positional } = parseArgs(process.argv);
  if (flags.help || positional.length === 0) {
    help();
    process.exit(flags.help ? 0 : 1);
  }

  const input = positional.join(" ").trim();
  const overrides: Parameters<typeof loadConfig>[0] = {
    pretty: Boolean(flags.pretty) || (!flags.jsonl && process.env.HARNESS_PRETTY === "1"),
    jsonl: Boolean(flags.jsonl),
  };
  if (typeof flags.maxSteps === "string" && flags.maxSteps) overrides.maxSteps = Number(flags.maxSteps);
  if (typeof flags.verbosity === "number") {
    const v = Math.max(0, Math.min(3, Math.trunc(flags.verbosity)));
    overrides.verbosity = v as 0 | 1 | 2 | 3;
  }

  const config = loadConfig(overrides);

  const reporter = new ConsoleReporter({ pretty: config.pretty, jsonl: config.jsonl, verbosity: config.verbosity });
  const result = await runHarness({ input, config, reporter });
  if (config.jsonl) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ type: "final_answer", text: result.finalAnswer }));
  } else {
    // eslint-disable-next-line no-console
    console.log(result.finalAnswer);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(String(err?.stack ?? err));
  process.exit(1);
});
