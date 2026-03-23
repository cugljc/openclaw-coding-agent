import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseStreamLine, extractToolName, extractToolArgs, extractToolResult } from "./parser.js";
import { buildCursorCommand } from "./agents/cursor.js";
import { buildClaudeCodeCommand } from "./agents/claude-code.js";
import { buildCodexCommand } from "./agents/codex.js";
import { IS_WIN } from "./platform.js";
import * as registry from "./process-registry.js";
import type {
  RunOptions, RunResult, AgentType,
  AssistantEvent, ResultEvent, ToolCallEvent, SystemInitEvent, CollectedEvent,
} from "./types.js";

interface SpawnSpec {
  cmd: string;
  args: string[];
  shell: boolean;
  env?: Record<string, string>;
}

function buildSpawnSpec(opts: RunOptions): SpawnSpec {
  switch (opts.agentType) {
    case "cursor":
      return buildCursorCommand(opts);
    case "claude-code":
      return buildClaudeCodeCommand(opts);
    case "codex":
      return buildCodexCommand(opts);
    default:
      throw new Error(`Unknown agent type: ${opts.agentType}`);
  }
}

/** Whether the agent outputs structured JSON (parseable line-by-line) */
function isStreamJson(agentType: AgentType): boolean {
  // All 3 agents now output structured JSON (Codex via --json JSONL)
  return true;
}

/**
 * Ensure project path is a git repo (required for Codex).
 * Creates temp git init if needed.
 */
function ensureGitRepo(projectPath: string): string {
  if (existsSync(join(projectPath, ".git"))) return projectPath;

  // For Codex: if no git repo, create a temp one
  const tmpDir = join(
    process.env.TEMP || process.env.TMPDIR || "/tmp",
    `codex-workdir-${Date.now()}`
  );
  mkdirSync(tmpDir, { recursive: true });
  try {
    const { execSync } = require("node:child_process");
    execSync("git init", { cwd: tmpDir, stdio: "ignore" });
  } catch { /* best effort */ }
  return tmpDir;
}

/** Unified agent execution engine */
export async function runAgent(opts: RunOptions): Promise<RunResult> {
  if (registry.isFull()) {
    return {
      success: false,
      agentType: opts.agentType,
      resultText: `Concurrency limit reached (${registry.getActiveCount()}), try again later`,
      durationMs: 0,
      toolCallCount: 0,
      error: "max concurrency reached",
      events: [],
    };
  }

  const runId = opts.runId ?? randomUUID();
  const startTime = Date.now();

  // Codex requires git repo
  const effectiveCwd = opts.agentType === "codex"
    ? ensureGitRepo(opts.projectPath)
    : opts.projectPath;

  const spec = buildSpawnSpec(opts);

  const spawnEnv = spec.env
    ? { ...process.env, ...spec.env }
    : undefined;

  const isUnix = !IS_WIN;
  const proc = spawn(spec.cmd, spec.args, {
    cwd: effectiveCwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: spec.shell,
    detached: isUnix,
    env: spawnEnv,
  });
  if (isUnix) proc.unref();

  registry.register(runId, {
    proc,
    projectPath: opts.projectPath,
    startTime,
    agentType: opts.agentType,
  });

  let sessionId: string | undefined;
  let resultText = "";
  let toolCallCount = 0;
  let completed = false;
  let error: string | undefined;
  let usage: ResultEvent["usage"];
  let lastOutputTime = Date.now();
  const events: CollectedEvent[] = [];
  const stderrChunks: string[] = [];
  const rawOutputChunks: string[] = [];

  const terminateProcess = () => {
    if (proc.exitCode !== null || proc.killed) return;
    registry.killWithGrace(proc);
  };

  const totalTimeout = setTimeout(() => {
    if (!completed) {
      error = `total timeout (${opts.timeoutSec}s)`;
      terminateProcess();
    }
  }, opts.timeoutSec * 1000);

  const noOutputCheck = setInterval(() => {
    if (Date.now() - lastOutputTime > opts.noOutputTimeoutSec * 1000) {
      if (!completed) {
        error = `no output timeout (${opts.noOutputTimeoutSec}s)`;
        terminateProcess();
      }
    }
  }, 5000);

  const onAbort = () => {
    if (!completed) {
      error = "aborted";
      terminateProcess();
    }
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  return new Promise<RunResult>((resolve) => {
    if (proc.stderr) {
      proc.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk.toString());
      });
    }

    if (isStreamJson(opts.agentType)) {
      // Parse structured JSON output (Cursor stream-json / Claude Code stream-json / Codex JSONL)
      const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });

      rl.on("line", (line) => {
        lastOutputTime = Date.now();
        rawOutputChunks.push(line);
        const event = parseStreamLine(line);
        if (!event) return;

        switch (event.type) {
          case "system":
            if (event.subtype === "init") {
              sessionId = (event as SystemInitEvent).session_id;
            }
            break;

          case "user": {
            const ue = event as { message?: { content?: Array<{ text?: string }> } };
            const text = ue.message?.content?.[0]?.text;
            if (text) {
              events.push({ type: "user", text, timestamp: event.timestamp_ms });
            }
            break;
          }

          case "assistant": {
            const ae = event as AssistantEvent;
            const text = ae.message?.content?.[0]?.text;
            if (text) {
              events.push({ type: "assistant", text, timestamp: event.timestamp_ms });
            }
            break;
          }

          case "tool_call": {
            const tc = event as ToolCallEvent;
            if (tc.subtype === "started") {
              toolCallCount++;
              events.push({
                type: "tool_start",
                toolName: extractToolName(tc),
                toolArgs: extractToolArgs(tc),
                timestamp: event.timestamp_ms,
              });
            } else if (tc.subtype === "completed") {
              events.push({
                type: "tool_end",
                toolName: extractToolName(tc),
                toolResult: extractToolResult(tc),
                timestamp: event.timestamp_ms,
              });
            }
            break;
          }

          case "result": {
            const re = event as ResultEvent;
            resultText = re.result ?? "";
            usage = re.usage;
            completed = true;
            events.push({ type: "result", resultData: re, timestamp: event.timestamp_ms });
            break;
          }
        }
      });
    }

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;

      clearTimeout(totalTimeout);
      clearInterval(noOutputCheck);
      opts.signal?.removeEventListener("abort", onAbort);
      registry.unregister(runId);

      if (proc.exitCode === null && !proc.killed) {
        registry.killWithGrace(proc);
      }

      const durationMs = Date.now() - startTime;
      const stderrText = stderrChunks.join("").trim();

      if (!error && !completed && stderrText) {
        error = stderrText;
      }

      resolve({
        success: !error && completed,
        agentType: opts.agentType,
        resultText: resultText || (stderrText ? stderrText : (error ? `Agent execution failed: ${error}` : "No output")),
        sessionId,
        durationMs,
        toolCallCount,
        error,
        usage,
        events,
      });
    };

    proc.on("close", cleanup);
    proc.on("error", (err) => {
      error = err.message;
      cleanup();
    });
  });
}
