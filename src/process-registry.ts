import { spawn, type ChildProcess } from "node:child_process";
import { IS_WIN } from "./platform.js";
import type { TrackedProcess } from "./types.js";

const DEFAULT_MAX_CONCURRENT = 3;
const FORCE_KILL_DELAY_MS = 5000;

const activeProcesses = new Map<string, TrackedProcess>();
let maxConcurrent = DEFAULT_MAX_CONCURRENT;
let shutdownRegistered = false;

export function setMaxConcurrent(value: number): void {
  maxConcurrent = Math.max(1, value);
}

export function register(id: string, entry: TrackedProcess): void {
  activeProcesses.set(id, entry);
}

export function unregister(id: string): void {
  activeProcesses.delete(id);
}

export function getActiveCount(): number {
  return activeProcesses.size;
}

export function isFull(): boolean {
  return activeProcesses.size >= maxConcurrent;
}

export function getActive(): Map<string, TrackedProcess> {
  return activeProcesses;
}

/** SIGTERM (Unix) or non-forced taskkill (Windows) */
export function gracefulKill(proc: ChildProcess): void {
  if (!proc.pid) return;
  try {
    if (IS_WIN) {
      spawn("taskkill", ["/T", "/PID", String(proc.pid)], { stdio: "ignore" });
    } else {
      process.kill(-proc.pid, "SIGTERM");
    }
  } catch {
    try { proc.kill("SIGTERM"); } catch { /* ignore */ }
  }
}

/** SIGKILL (Unix) or forced taskkill (Windows) */
export function forceKill(proc: ChildProcess): void {
  if (!proc.pid) return;
  try {
    if (IS_WIN) {
      spawn("taskkill", ["/F", "/T", "/PID", String(proc.pid)], { stdio: "ignore" });
    } else {
      process.kill(-proc.pid, "SIGKILL");
    }
  } catch {
    try { proc.kill("SIGKILL"); } catch { /* ignore */ }
  }
}

/** Two-phase termination: graceful → wait → force */
export function killWithGrace(proc: ChildProcess): void {
  gracefulKill(proc);
  const timer = setTimeout(() => {
    if (proc.exitCode === null && !proc.killed) {
      forceKill(proc);
    }
  }, FORCE_KILL_DELAY_MS);
  timer.unref();
}

function shutdownAll(): void {
  for (const [id, entry] of activeProcesses) {
    killWithGrace(entry.proc);
    activeProcesses.delete(id);
  }
}

export function ensureShutdownHook(): void {
  if (shutdownRegistered) return;
  shutdownRegistered = true;
  process.on("exit", shutdownAll);
  process.on("SIGTERM", shutdownAll);
  process.on("SIGINT", shutdownAll);
}
