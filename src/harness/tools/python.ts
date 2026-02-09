import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import trash from "trash";

export type PythonResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  sandboxDir: string;
};

function run(cmd: string, args: string[], opts: { cwd: string; timeoutMs: number }) {
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    const t = setTimeout(() => {
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });

    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

export async function runPythonSandboxed(args: { code: string; timeoutMs?: number }): Promise<PythonResult> {
  const sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "pro-harness-sandbox-"));
  const scriptPath = path.join(sandboxDir, "main.py");
  await fs.writeFile(scriptPath, args.code, "utf8");

  // We rely on user instruction + harness prompting to keep python code sandboxed.
  // The process itself is not OS-sandboxed.
  const timeoutMs = args.timeoutMs ?? 30_000;
  const { exitCode, stdout, stderr } = await run("uv", ["run", "python", scriptPath], { cwd: sandboxDir, timeoutMs });

  // Keep artifacts out of repo; move sandbox to trash after execution.
  await trash([sandboxDir]);

  return { ok: exitCode === 0, exitCode, stdout, stderr, sandboxDir };
}

