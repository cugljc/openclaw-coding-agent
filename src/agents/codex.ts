import type { RunOptions, AgentMode } from "../types.js";
import { isCmdWrapper, detectNodeBin } from "../platform.js";

const MODE_WRAPPERS: Record<AgentMode, string> = {
  agent: "",
  ask: "\n\n[IMPORTANT: READ-ONLY MODE — Analyze and explain only. Do NOT modify any files. Do NOT create files. Only read, analyze, and respond with your findings.]",
  plan: "\n\n[IMPORTANT: PLAN-ONLY MODE — Create a detailed implementation plan. Do NOT execute any changes. Do NOT modify files. Output a step-by-step plan with file paths and code snippets.]",
};

/**
 * Build CLI args for Codex (`codex` CLI).
 *
 * Full feature support:
 * - Structured JSONL output via --json (parsed same as stream-json)
 * - Native session resume via `exec resume --last` or `exec resume <id>`
 * - MCP servers loaded from ~/.codex/config.toml (transparent)
 * - ask/plan mode via prompt wrapping
 * - Subagents (multi-agent) supported natively by Codex
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

  // Native session resume: `codex exec resume --last` or `codex exec resume <session-id>`
  if (opts.resumeSessionId) {
    args.push("exec", "resume", opts.resumeSessionId);
  } else if (opts.continueSession) {
    args.push("exec", "resume", "--last");
  } else {
    args.push("exec");
  }

  const approval = opts.approvalMode ?? "full-auto";
  if (approval === "yolo") {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else if (approval === "full-auto") {
    args.push("--full-auto");
  }

  // Structured JSONL output (like stream-json for Cursor/Claude Code)
  args.push("--json");

  if (opts.model) {
    args.push("--model", opts.model);
  }

  // Only add prompt if not resuming
  if (!opts.resumeSessionId && !opts.continueSession) {
    const modeWrapper = MODE_WRAPPERS[opts.mode] ?? "";
    const fullPrompt = opts.prompt + modeWrapper;
    args.push(fullPrompt);
  }

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

/** Codex now outputs structured JSONL via --json */
export const CODEX_OUTPUT_FORMAT = "jsonl" as const;
