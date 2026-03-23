/**
 * Quick smoke test: run each of the 3 agents with a simple prompt.
 * Usage: node test-agents.mjs
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";

const IS_WIN = platform() === "win32";
const PROXY = "http://127.0.0.1:7980";
const PROJECT = "E:\\code file\\openclaw-coding-agent";

const tests = [
  {
    name: "Claude Code",
    cmd: IS_WIN ? "claude.cmd" : "claude",
    args: [
      "--print",
      "--permission-mode", "bypassPermissions",
      "--strict-mcp-config",
      "--output-format", "stream-json",
      "--verbose",
      `"Say hello and confirm you are Claude Code. One sentence max."`,
    ],
    env: { HTTPS_PROXY: PROXY, HTTP_PROXY: PROXY },
    timeout: 30_000,
    isStreamJson: true,
  },
  {
    name: "Codex",
    cmd: IS_WIN ? "codex.cmd" : "codex",
    args: [
      "exec",
      "--full-auto",
      `"Say hello and confirm you are Codex. One sentence max."`,
    ],
    env: { HTTPS_PROXY: PROXY },
    timeout: 60_000,
    isStreamJson: false,
  },
  {
    name: "Cursor CLI",
    cmd: IS_WIN ? "agent.cmd" : "agent",
    args: [
      "-p", "--trust",
      "--output-format", "stream-json",
      "--model", "kimi-k2.5",
      `"Say hello and confirm you are Cursor Agent. One sentence max."`,
    ],
    env: { HTTPS_PROXY: PROXY },
    timeout: 30_000,
    isStreamJson: true,
  },
];

async function runTest(test) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Testing: ${test.name}`);
  console.log(`${"=".repeat(50)}`);

  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawn(test.cmd, test.args, {
      cwd: PROJECT,
      env: { ...process.env, ...test.env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => { stderr += d; });

    const timer = setTimeout(() => {
      console.log(`  TIMEOUT after ${test.timeout}ms`);
      try { proc.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 2000);
    }, test.timeout);

    proc.on("error", (err) => {
      clearTimeout(timer);
      console.log(`  Spawn error: ${err.message}`);
      console.log(`  Status: ❌ FAIL (spawn error)`);
      resolve({ name: test.name, passed: false, elapsed: Date.now() - start });
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      const elapsed = Date.now() - start;

      console.log(`  Exit code: ${code}`);
      console.log(`  Duration: ${(elapsed / 1000).toFixed(1)}s`);

      if (test.isStreamJson) {
        const lines = stdout.trim().split("\n");
        let resultText = "";
        let sessionId = "";
        for (const line of lines) {
          try {
            const ev = JSON.parse(line);
            if (ev.type === "system" && ev.subtype === "init") {
              sessionId = ev.session_id;
            }
            if (ev.type === "result") {
              resultText = ev.result;
            }
            if (ev.type === "assistant" && ev.message?.content?.[0]?.text) {
              resultText = ev.message.content[0].text;
            }
          } catch {}
        }
        console.log(`  Session: ${sessionId || "N/A"}`);
        console.log(`  Result: ${resultText.slice(0, 200)}`);
      } else {
        const lastLines = stdout.trim().split("\n").slice(-5).join("\n");
        console.log(`  Output (last 5 lines):\n${lastLines}`);
      }

      if (stderr.trim()) {
        console.log(`  Stderr: ${stderr.trim().slice(0, 200)}`);
      }

      const passed = code === 0 && (stdout.length > 10);
      console.log(`  Status: ${passed ? "✅ PASS" : "❌ FAIL"}`);
      resolve({ name: test.name, passed, elapsed });
    });
  });
}

console.log("OpenClaw Coding Agent - Three-Agent Smoke Test");
console.log(`Project: ${PROJECT}`);
console.log(`Time: ${new Date().toISOString()}`);

const results = [];
for (const test of tests) {
  const r = await runTest(test);
  results.push(r);
}

console.log("\n" + "=".repeat(50));
console.log("SUMMARY");
console.log("=".repeat(50));
for (const r of results) {
  console.log(`  ${r.passed ? "✅" : "❌"} ${r.name} (${(r.elapsed / 1000).toFixed(1)}s)`);
}
const allPassed = results.every((r) => r.passed);
console.log(`\nOverall: ${allPassed ? "ALL PASSED ✅" : "SOME FAILED ❌"}`);
process.exit(allPassed ? 0 : 1);
