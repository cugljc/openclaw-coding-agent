import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultResultDir } from "./platform.js";
import type { TaskResult, RunResult, AgentMode, AgentType } from "./types.js";

let resultDir: string | null = null;

export function setResultDir(dir: string): void {
  resultDir = dir;
  mkdirSync(dir, { recursive: true });
}

function getResultDir(): string {
  if (!resultDir) {
    resultDir = defaultResultDir();
    mkdirSync(resultDir, { recursive: true });
  }
  return resultDir;
}

function generateTaskId(agentType: AgentType): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${agentType}-${ts}`;
}

/** Save task result as JSON + Markdown + Chinese summary */
export function saveResult(
  result: RunResult,
  project: string,
  prompt: string,
  mode: AgentMode,
): TaskResult {
  const dir = getResultDir();
  const taskId = generateTaskId(result.agentType);

  const lastAssistant = [...result.events]
    .reverse()
    .find((e) => e.type === "assistant")?.text ?? "";

  const summary = lastAssistant
    ? lastAssistant.split("\n").slice(0, 20).join("\n")
    : result.resultText.split("\n").slice(0, 20).join("\n");

  const taskResult: TaskResult = {
    taskId,
    agentType: result.agentType,
    status: result.success ? "completed" : "failed",
    startedAt: new Date(Date.now() - result.durationMs).toISOString(),
    completedAt: new Date().toISOString(),
    project,
    prompt,
    mode,
    sessionId: result.sessionId,
    summary,
    finalAnswer: lastAssistant || undefined,
    durationMs: result.durationMs,
    toolCallCount: result.toolCallCount,
    error: result.error,
    resultFile: join(dir, `${taskId}.json`),
    reported: false,
  };

  // JSON
  writeFileSync(
    join(dir, `${taskId}.json`),
    JSON.stringify(taskResult, null, 2),
    "utf-8"
  );

  // Markdown
  const md = `# Task Result: ${taskId}

- **Agent**: ${result.agentType}
- **Status**: ${taskResult.status}
- **Project**: ${project}
- **Duration**: ${(result.durationMs / 1000).toFixed(1)}s
- **Tool Calls**: ${result.toolCallCount}
${result.sessionId ? `- **Session**: ${result.sessionId}` : ""}
${result.error ? `- **Error**: ${result.error}` : ""}

## Prompt
${prompt}

## Result
${summary}

${lastAssistant ? `## Full Answer\n${lastAssistant}` : ""}
`;

  writeFileSync(join(dir, `${taskId}.md`), md, "utf-8");

  // Chinese summary
  const cn = `# 任务结果: ${taskId}

- **代理**: ${result.agentType}
- **状态**: ${taskResult.status === "completed" ? "已完成" : "失败"}
- **项目**: ${project}
- **耗时**: ${(result.durationMs / 1000).toFixed(1)}秒
${result.error ? `- **错误**: ${result.error}` : ""}

## 任务内容
${prompt}

## 结果摘要
${summary}
`;

  writeFileSync(join(dir, `${taskId}-cn.md`), cn, "utf-8");

  // Update latest pointer
  writeFileSync(join(dir, "latest.json"), JSON.stringify(taskResult, null, 2), "utf-8");

  return taskResult;
}
