# Repository Agent Instructions
These instructions apply to work in this repository.

## Codex Agent Runtime Rules
1. Capture long CLI output with `mktemp -d` + files, or filter at the source if you can bound the output.
2. Keep build artifacts and logs out of the repo; only use temp directories (clean them up afterwards with `trash`).
3. Never use `rm`; send any deletions—including temp files and directories—to the trash via `trash [--help][--stopOnError][--verbose] fileToMoveToTrash...`.
4. When capturing CLI output with large or unpredictable size, never rely on tailing the last N lines; capture the entire log and search for failure markers (e.g. "error:", non-zero exits) so earlier failures aren't missed.
5. Remember the `ast-grep` semantic search tool lives at `~/.codex/docs/ast-grep.md` if you need syntax-aware search.

## Terminal
- User uses fish, but commands printed for the user should be fish-compatible.
- Prefer `uv` for Python environment management.
- Prefer `pnpm` for JS.

## Swift
- When using `guard let` and the variable name is the same, don't write it twice: `guard let self else { return }`.
- Avoid adding `@MainActor` annotations (project is structured `@MainActor` by default).
- Avoid default initializer parameters that instantiate new objects; create instances explicitly at call sites.
- When changing Swift code, run an Xcode build and scan the full log for errors (grep), rather than streaming full output.

## Version Control
- Repo might use `sl` or `git`; check via `.sl`/`.git` or `sl root`.
- Assume multiple agents may be working; don't touch unrelated changes.
- Sapling notes:
  - Use `sl addremove` to stage new files (not `sl add <path>`).
  - Avoid `sl status -s` (flag does not exist); use `sl status`.
  - For partial commits, prefer glob patterns (`-I 'glob:**/File.swift'`) rather than direct file paths.

