import type { RunOptions } from "../types.js";
import { isCmdWrapper } from "../platform.js";

/**
 * Build CLI args for Claude Code (`claude` CLI).
 *
 * Enhanced features:
 * - --print mode (headless, non-interactive)
 * - --permission-mode bypassPermissions
 * - stream-json output
 * - Agent Teams via env var
 * - MCP support via --mcp-config
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

  // MCP support: Claude Code supports --mcp-config for MCP server configs
  if (opts.mcpConfigPath) {
    args.push("--mcp-config", opts.mcpConfigPath);
  } else {
    // Default to strict-mcp-config to prevent hanging on broken MCP servers
    args.push("--strict-mcp-config");
  }

  if (opts.enableMcp) {
    args.push("--approve-mcps");
  }

  // --print for headless mode (--verbose required for stream-json with --print)
  args.push("--verbose", "--print", opts.prompt);

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

export const CLAUDE_CODE_OUTPUT_FORMAT = "stream-json" as const;
