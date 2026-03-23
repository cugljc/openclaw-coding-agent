import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { IS_WIN, HOME } from "./platform.js";
import type { NotifyCfg, TaskResult } from "./types.js";

const LOCK_DURATION_MS = 30_000;
let lastNotifyTime = 0;

function dedup(): boolean {
  const now = Date.now();
  if (now - lastNotifyTime < LOCK_DURATION_MS) return true;
  lastNotifyTime = now;
  return false;
}

function findOpenclaw(): string | null {
  const candidates = IS_WIN
    ? ["openclaw.cmd", "openclaw"]
    : ["openclaw"];

  for (const name of candidates) {
    try {
      const cmd = IS_WIN ? `where ${name}` : `which ${name}`;
      const result = execSync(cmd, { encoding: "utf-8", timeout: 3000 }).trim();
      if (result) return result.split(/\r?\n/)[0]!.trim();
    } catch { /* ignore */ }
  }
  return null;
}

/** Send Telegram notification via openclaw CLI */
function sendTelegram(
  openclawBin: string,
  target: string,
  message: string,
): boolean {
  try {
    execSync(
      `"${openclawBin}" message send --channel telegram --target "${target}" --message "${message.replace(/"/g, '\\"')}"`,
      { encoding: "utf-8", timeout: 15000, stdio: "ignore" }
    );
    return true;
  } catch {
    return false;
  }
}

/** Send web/agent notification via openclaw CLI */
function sendWebNotify(
  openclawBin: string,
  agentId: string,
  message: string,
): boolean {
  try {
    execSync(
      `"${openclawBin}" agent --agent "${agentId}" --message "${message.replace(/"/g, '\\"')}" --deliver`,
      { encoding: "utf-8", timeout: 15000, stdio: "ignore" }
    );
    return true;
  } catch {
    // Fallback to system event
    try {
      execSync(
        `"${openclawBin}" system event --mode now --text "${message.replace(/"/g, '\\"').slice(0, 200)}"`,
        { encoding: "utf-8", timeout: 10000, stdio: "ignore" }
      );
      return true;
    } catch {
      return false;
    }
  }
}

/** Write pending-wake.json for AGI heartbeat pickup */
function writePendingWake(resultDir: string, task: TaskResult): void {
  const wakeFile = join(resultDir, "pending-wake.json");
  const data = {
    task_id: task.taskId,
    agent_type: task.agentType,
    status: task.status,
    summary: task.summary.slice(0, 500),
    timestamp: new Date().toISOString(),
    processed: false,
  };
  try {
    writeFileSync(wakeFile, JSON.stringify(data, null, 2), "utf-8");
  } catch { /* best effort */ }
}

/** Send completion notifications (Telegram, web, wake file) */
export function notifyCompletion(
  cfg: NotifyCfg,
  task: TaskResult,
  resultDir: string,
): { telegram: string; web: string; wake: string } {
  const status = { telegram: "skipped", web: "skipped", wake: "skipped" };

  if (dedup()) {
    return { telegram: "dedup", web: "dedup", wake: "dedup" };
  }

  const openclawBin = findOpenclaw();

  const statusEmoji = task.status === "completed" ? "✅" : "❌";
  const agentLabel = task.agentType.toUpperCase();
  const briefSummary = task.summary.split("\n").slice(0, 5).join(" | ").slice(0, 400);

  const message =
    `${statusEmoji} [${agentLabel}] ${task.taskId}\n` +
    `项目: ${task.project}\n` +
    `状态: ${task.status}\n` +
    `耗时: ${(task.durationMs / 1000).toFixed(1)}s\n` +
    `摘要: ${briefSummary}`;

  // Telegram
  if (cfg.telegram && cfg.telegramTarget && openclawBin) {
    const ok = sendTelegram(openclawBin, cfg.telegramTarget, message);
    status.telegram = ok ? "ok" : "failed";
  }

  // Web / Agent
  if (cfg.web && openclawBin) {
    const agentId = cfg.webAgentId ?? "main";
    const ok = sendWebNotify(openclawBin, agentId, message);
    status.web = ok ? "ok" : "failed";
  }

  // Pending wake file (always written)
  writePendingWake(resultDir, task);
  status.wake = "ok";

  return status;
}
