import { existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { IS_WIN } from "./platform.js";
import type { ResolvedBinary } from "./types.js";

const VERSION_PATTERN = /^\d{4}\.\d{1,2}\.\d{1,2}-[a-f0-9]+$/;

function versionToNum(name: string): number {
  const datePart = name.split("-")[0]!;
  const [year, month, day] = datePart.split(".");
  return parseInt(`${year}${month!.padStart(2, "0")}${day!.padStart(2, "0")}`, 10);
}

function nodeBinName(): string {
  return IS_WIN ? "node.exe" : "node";
}

function probeDir(dir: string): ResolvedBinary | null {
  const nodeBin = join(dir, nodeBinName());
  const entry = join(dir, "index.js");
  if (existsSync(nodeBin) && existsSync(entry)) {
    return { nodeBin, entryScript: entry };
  }
  return null;
}

function probeVersions(baseDir: string): ResolvedBinary | null {
  const versionsDir = join(baseDir, "versions");
  if (!existsSync(versionsDir)) return null;

  let entries: string[];
  try {
    entries = readdirSync(versionsDir);
  } catch {
    return null;
  }

  const matched = entries
    .filter((name) => VERSION_PATTERN.test(name))
    .sort((a, b) => versionToNum(b) - versionToNum(a));

  for (const ver of matched) {
    const result = probeDir(join(versionsDir, ver));
    if (result) return result;
  }
  return null;
}

/**
 * Resolve underlying node + index.js from a CLI wrapper path.
 * Works for Cursor Agent CLI and Codex CLI (both are Node.js apps
 * wrapped in .cmd/.sh scripts).
 */
export function resolveAgentBinary(agentPath: string): ResolvedBinary | null {
  const baseDir = dirname(resolve(agentPath));

  const direct = probeDir(baseDir);
  if (direct) return direct;

  const versioned = probeVersions(baseDir);
  if (versioned) return versioned;

  return null;
}
