import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunOptions, AgentMode } from "../types.js";
import { isCmdWrapper, detectNodeBin, HOME } from "../platform.js";

const MODE_WRAPPERS: Record<AgentMode, string> = {
  agent: "",
  ask: "\n\n[IMPORTANT: READ-ONLY MODE — Analyze and explain only. Do NOT modify any files. Do NOT create files. Only read, analyze, and respond with your findings.]",
  plan: "\n\n[IMPORTANT: PLAN-ONLY MODE — Create a detailed implementation plan. Do NOT execute any changes. Do NOT modify files. Output a step-by-step plan with file paths and code snippets.]",
};

function getSessionDir(opts: RunOptions): string {
  const dir = opts.codexSessionDir ?? join(HOME, ".openclaw", "agents", "codex-sessions");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function projectHash(path: string): string {
  let h = 0;
  for (let i = 0; i < path.length; i++) {
    h = ((h << 5) - h + path.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function loadSessionContext(opts: RunOptions): string {
  if (!opts.resumeSessionId && !opts.continueSession) return "";

  const dir = getSessionDir(opts);
  const key = opts.resumeSessionId ?? projectHash(opts.projectPath);
  const ctxFile = join(dir, `${key}.ctx.md`);

  if (!existsSync(ctxFile)) return "";

  try {
    const ctx = readFileSync(ctxFile, "utf-8");
    return `\n\n[PREVIOUS SESSION CONTEXT]\n${ctx}\n[END PREVIOUS CONTEXT]\n\nContinue from where we left off. `;
  } catch {
    return "";
  }
}

/** Save session context after execution (called by runner) */
export function saveCodexSession(
  projectPath: string,
  sessionId: string,
  summary: string,
  sessionDir?: string,
): void {
  const dir = sessionDir ?? join(HOME, ".openclaw", "agents", "codex-sessions");
  mkdirSync(dir, { recursive: true });

  const key = projectHash(projectPath);
  writeFileSync(join(dir, `${key}.ctx.md`), summary.slice(0, 4000), "utf-8");
  writeFileSync(join(dir, `${key}.sid`), sessionId, "utf-8");
}

/** Load last session ID for a project */
export function loadCodexSessionId(projectPath: string, sessionDir?: string): string | undefined {
  const dir = sessionDir ?? join(HOME, ".openclaw", "agents", "codex-sessions");
  const key = projectHash(projectPath);
  const sidFile = join(dir, `${key}.sid`);
  try {
    if (existsSync(sidFile)) return readFileSync(sidFile, "utf-8").trim();
  } catch {}
  return undefined;
}

/**
 * Build CLI args for Codex (`codex` CLI).
 *
 * Enhanced features:
 * - ask/plan mode via prompt wrapping
 * - Session resume via context file persistence
 * - Auto git-init handled by runner
 */
export function buildCodexCommand(opts: RunOptions): {
  cmd: string;
  args: string[];
  shell: boolean;
} {
  const resolved = opts.resolvedBinary;
  const args: string[] = [];

  if (resolved) {
    args.push(resolved.entryScript);
  }

  args.push("exec");

  const approval = opts.approvalMode ?? "full-auto";
  if (approval === "yolo") {
    args.push("--yolo");
  } else if (approval === "full-auto") {
    args.push("--full-auto");
  }

  if (opts.model) {
    args.push("--model", opts.model);
  }

  // Build enhanced prompt with mode wrapper + session context
  const modeWrapper = MODE_WRAPPERS[opts.mode] ?? "";
  const sessionCtx = loadSessionContext(opts);
  const fullPrompt = sessionCtx + opts.prompt + modeWrapper;

  args.push(fullPrompt);

  if (resolved) {
    return { cmd: resolved.nodeBin, args, shell: false };
  }

  if (opts.binaryPath.endsWith(".js")) {
    const node = detectNodeBin();
    if (node) {
      return { cmd: node, args: [opts.binaryPath, ...args], shell: false };
    }
  }

  const needsShell = isCmdWrapper(opts.binaryPath);
  return { cmd: opts.binaryPath, args, shell: needsShell };
}

export const CODEX_OUTPUT_FORMAT = "text" as const;
