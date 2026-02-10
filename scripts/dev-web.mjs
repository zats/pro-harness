import { spawn } from "node:child_process";

function run(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: "inherit", ...opts });
  p.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) process.exitCode = code;
  });
  return p;
}

function runAndWait(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("exit", (code, signal) => {
      if (signal) return reject(new Error(`${cmd} ${args.join(" ")} exited with signal ${signal}`));
      if (code && code !== 0) return reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
      resolve();
    });
  });
}

const procs = [];

// Ensure dist outputs exist before Next starts importing workspace packages.
await runAndWait("pnpm", ["--filter", "pro-harness-shared", "build"]);
await runAndWait("pnpm", ["--filter", "pro-harness-core", "build"]);

// Run both watchers under one recursive pnpm for clearer output (prefixed per package).
procs.push(
  run("pnpm", ["-r", "--parallel", "--stream", "--filter", "pro-harness-shared", "--filter", "pro-harness-core", "watch"]),
);
procs.push(run("pnpm", ["--filter", "pro-harness-web", "dev:next"]));

const shutdown = () => {
  for (const p of procs) {
    try {
      p.kill("SIGTERM");
    } catch {}
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
