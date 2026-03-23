import type { RunOptions } from "../types.js";
import { isCmdWrapper, IS_WIN } from "../platform.js";

/** Build CLI args for Cursor Agent (`agent` CLI) */
export function buildCursorCommand(opts: RunOptions): { cmd: string; args: string[]; shell: boolean } {
  const resolved = opts.resolvedBinary;
  const cliArgs: string[] = [];

  if (resolved) {
    cliArgs.push(resolved.entryScript);
  }

  cliArgs.push(
    ...(opts.prefixArgs ?? []),
    "-p", "--trust",
    "--output-format", "stream-json",
  );

  if (opts.resumeSessionId) {
    cliArgs.push("--resume", opts.resumeSessionId);
  } else if (opts.continueSession) {
    cliArgs.push("--continue");
  } else if (opts.mode !== "agent") {
    cliArgs.push("--mode", opts.mode);
  }

  if (opts.enableMcp) {
    cliArgs.push("--approve-mcps", "--force");
  }
  if (opts.model) {
    cliArgs.push("--model", opts.model);
  }

  cliArgs.push(opts.prompt);

  if (resolved) {
    return { cmd: resolved.nodeBin, args: cliArgs, shell: false };
  }

  const needsShell = isCmdWrapper(opts.binaryPath);
  return { cmd: opts.binaryPath, args: cliArgs, shell: needsShell };
}

/** Output format for Cursor Agent is stream-json, parsed by parser.ts */
export const CURSOR_OUTPUT_FORMAT = "stream-json" as const;
