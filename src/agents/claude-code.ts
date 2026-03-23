import type { RunOptions } from "../types.js";
import { isCmdWrapper } from "../platform.js";

/**
 * Build CLI args for Claude Code (`claude` CLI).
 *
 * Key design:
 * - Uses `--print` mode (headless, non-interactive) — no PTY needed
 * - Uses `--permission-mode bypassPermissions` for unattended execution
 * - Output format `stream-json` for structured parsing (same as Cursor)
 * - Supports Agent Teams via env var
 */
export function buildClaudeCodeCommand(opts: RunOptions): {
  cmd: string;
  args: string[];
  shell: boolean;
  env?: Record<string, string>;
} {
  const args: string[] = [];

  const permMode = opts.permissionMode ?? "bypassPermissions";
  args.push("--permission-mode", permMode);

  args.push("--output-format", "stream-json");

  if (opts.resumeSessionId) {
    args.push("--resume", opts.resumeSessionId);
  } else if (opts.continueSession) {
    args.push("--continue");
  }

  if (opts.model) {
    args.push("--model", opts.model);
  }

  // --print for headless mode
  args.push("--print", opts.prompt);

  const env: Record<string, string> = {};
  if (opts.enableAgentTeams) {
    env["CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"] = "1";
  }

  const needsShell = isCmdWrapper(opts.binaryPath);
  return {
    cmd: opts.binaryPath,
    args,
    shell: needsShell,
    env: Object.keys(env).length > 0 ? env : undefined,
  };
}

/** Claude Code also supports stream-json, uses same parser */
export const CLAUDE_CODE_OUTPUT_FORMAT = "stream-json" as const;
