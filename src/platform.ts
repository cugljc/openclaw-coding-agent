import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

export const IS_WIN = process.platform === "win32";
export const IS_MAC = process.platform === "darwin";
export const IS_LINUX = process.platform === "linux";
export const HOME = process.env.HOME || process.env.USERPROFILE || "";

/** Run `which` / `where` to locate a binary */
export function whichBinary(name: string): string | null {
  try {
    const cmd = IS_WIN ? `where ${name}` : `which ${name}`;
    const result = execSync(cmd, { encoding: "utf-8", timeout: 5000 }).trim();
    const first = result.split(/\r?\n/)[0]?.trim();
    if (first && existsSync(first)) return first;
  } catch { /* not found */ }
  return null;
}

/** Probe a list of candidate paths, return first existing one */
export function probeFirst(candidates: string[]): string | null {
  for (const p of candidates) {
    const resolved = resolve(p);
    if (existsSync(resolved)) return resolved;
  }
  return null;
}

/** Get default result directory (cross-platform) */
export function defaultResultDir(): string {
  if (IS_WIN) {
    return join(HOME, ".openclaw", "agents", "coding-agent", "results");
  }
  return join(HOME, ".openclaw", "agents", "coding-agent", "results");
}

/** Detect Cursor Agent CLI path */
export function detectCursorAgent(): string | null {
  const found = whichBinary("agent");
  if (found) return found;

  if (!HOME) return null;

  if (IS_WIN) {
    return probeFirst([
      join(HOME, "AppData/Local/cursor-agent/agent.cmd"),
      join(HOME, ".cursor/bin/agent.cmd"),
    ]);
  }
  return probeFirst([
    join(HOME, ".cursor/bin/agent"),
    join(HOME, ".local/bin/agent"),
  ]);
}

/** Detect Claude Code CLI path */
export function detectClaudeCode(): string | null {
  const found = whichBinary("claude");
  if (found) return found;

  if (!HOME) return null;

  if (IS_WIN) {
    return probeFirst([
      join(HOME, "AppData/Local/Programs/claude-code/claude.exe"),
      join(HOME, ".claude/bin/claude.cmd"),
      join(HOME, ".local/bin/claude.cmd"),
    ]);
  }
  return probeFirst([
    join(HOME, ".claude/bin/claude"),
    join(HOME, ".local/bin/claude"),
    "/usr/local/bin/claude",
  ]);
}

/** Detect Codex CLI path */
export function detectCodex(): string | null {
  const found = whichBinary("codex");
  if (found) return found;

  if (!HOME) return null;

  if (IS_WIN) {
    return probeFirst([
      join(HOME, "AppData/Roaming/npm/codex.cmd"),
      "E:\\program\\nodejs\\node_modules\\@openai\\codex\\bin\\codex.js",
    ]);
  }
  return probeFirst([
    join(HOME, ".npm-global/bin/codex"),
    join(HOME, ".local/bin/codex"),
    "/usr/local/bin/codex",
  ]);
}

/** Detect node binary for direct invocation */
export function detectNodeBin(): string | null {
  const found = whichBinary("node");
  if (found) return found;

  if (IS_WIN) {
    return probeFirst([
      "E:\\program\\nodejs\\node.exe",
      join(HOME, "AppData/Local/Programs/nodejs/node.exe"),
    ]);
  }
  return probeFirst([
    "/usr/local/bin/node",
    "/usr/bin/node",
  ]);
}

/** Check if a path is a .cmd/.bat wrapper (Windows) */
export function isCmdWrapper(path: string): boolean {
  return IS_WIN && /\.(cmd|bat)$/i.test(path);
}
