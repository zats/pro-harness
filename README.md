# pro-harness

A TypeScript "Pro-style" harness that improves answer quality via:
- routing (task/stakes/recipe)
- optional plan+tool execution
- best-of-N drafting
- critique + (optional) verification + repair
- polish pass
- progress events + hard step budget failsafe

## Setup

1. Install deps:
```sh
pnpm install
```

2. Configure env:
```sh
cp .env.example .env
# edit .env and set OPENAI_API_KEY
```

3. Build:
```sh
pnpm build
```

## Run (CLI)

```sh
pnpm dev -- --pretty "Explain X and cite sources"
pnpm dev -- --jsonl "Do Y"
pnpm dev -- --max-steps 20 "Research Z"
pnpm dev -- -vv --pretty "Show more per-step details"
```

Notes:
- In `--pretty` mode, progress logs go to stderr and the final answer goes to stdout.
- In `--jsonl` mode, stdout is JSONL events, including a final `{"type":"final_answer",...}` line.
- Pretty mode progress prefixes include `%`, elapsed time, and (when priced) running cost, e.g. `[ 33%][  2m10s][$<0.01]`.

## Run (Web UI)

```sh
pnpm dev:web
```

Then open `http://localhost:3000`.

## Cost Tracking

OpenAI Responses return token usage; this harness sums usage across the run.

If you set `HARNESS_PRICING_USD_PER_1M_TOKENS_JSON` (USD per 1M tokens per model id), the harness also prints an estimated `$ cost` at the end of the run.

## Tools

The harness only uses:
- `web_search` via OpenAI Responses API tool calling
- `python` via local `uv run python` in a temporary sandbox directory (moved to Trash after execution)

## Notes

- `.env` is ignored by git; treat it like production environment configuration.
- `HARNESS_MAX_STEPS` / `--max-steps` is a hard failsafe budget for total harness steps (LLM calls + tool calls).
