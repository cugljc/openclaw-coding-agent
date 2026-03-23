import type { RunOptions } from "../types.js";
import { isCmdWrapper, detectNodeBin } from "../platform.js";

/**
 * Build CLI args for Codex (`codex` CLI).
 *
 * Key design:
 * - Uses `codex exec` for one-shot execution
 * - Requires a git repo (caller ensures this)
 * - Approval modes: default (sandboxed), --full-auto, --yolo
 * - Output is plain text (not stream-json), parsed line-by-line
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
  // default = no flag (interactive sandbox)

  if (opts.model) {
    args.push("--model", opts.model);
  }

  args.push(opts.prompt);

  if (resolved) {
    return { cmd: resolved.nodeBin, args, shell: false };
  }

  // If the binary path points to a .js file, invoke via node
  if (opts.binaryPath.endsWith(".js")) {
    const node = detectNodeBin();
    if (node) {
      return { cmd: node, args: [opts.binaryPath, ...args], shell: false };
    }
  }

  const needsShell = isCmdWrapper(opts.binaryPath);
  return { cmd: opts.binaryPath, args, shell: needsShell };
}

/** Codex output is plain text */
export const CODEX_OUTPUT_FORMAT = "text" as const;
