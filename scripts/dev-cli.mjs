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

const forwarded = process.argv.slice(2); // everything after `pnpm dev --`
const procs = [];

// Ensure initial dist exists, then watch-build shared + core + cli.
await runAndWait("pnpm", ["--filter", "pro-harness-cli", "build"]);
procs.push(
  run("pnpm", [
    "-r",
    "--parallel",
    "--stream",
    "--filter",
    "pro-harness-shared",
    "--filter",
    "pro-harness-core",
    "--filter",
    "pro-harness-cli",
    "watch",
  ]),
);

// Run CLI, restarting automatically when the compiled output changes.
procs.push(run("node", ["--watch", "packages/cli/dist/cli.js", ...forwarded]));

const shutdown = () => {
  for (const p of procs) {
    try {
      p.kill("SIGTERM");
    } catch {}
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
