import type { AgentType, CollectedEvent, RunResult } from "./types.js";

const MAX_MESSAGE_LENGTH = 3800;

const AGENT_LABELS: Record<AgentType, string> = {
  "cursor": "Cursor Agent",
  "claude-code": "Claude Code",
  "codex": "Codex",
};

export function formatRunResult(result: RunResult): string[] {
  const sections: string[] = [];

  sections.push(buildHeader(result));

  const fileSummary = buildFileSummary(result.events);
  if (fileSummary) sections.push(fileSummary);

  const conclusion = buildConclusion(result.events);
  if (conclusion) {
    sections.push(conclusion);
  } else if (!result.success && result.resultText) {
    sections.push(result.resultText);
  }

  sections.push(buildFooter(result));

  return splitMessages(sections);
}

function buildHeader(result: RunResult): string {
  const label = AGENT_LABELS[result.agentType] ?? result.agentType;
  const icon = result.success ? "✅" : "❌";
  const status = result.success ? "Completed" : "Failed";
  return `${icon} **${label}** ${status}`;
}

function buildFileSummary(events: CollectedEvent[]): string {
  const pairs = collectToolPairs(events);
  if (pairs.length === 0) return "";

  const lines: string[] = ["**Tool Calls:**"];
  for (const pair of pairs) {
    const icon = getToolIcon(pair.name);
    const target = pair.args ? ` \`${pair.args}\`` : "";
    lines.push(`${icon} ${pair.name}${target}`);
  }
  return lines.join("\n");
}

interface ToolPair { name: string; args: string; }

function collectToolPairs(events: CollectedEvent[]): ToolPair[] {
  const pairs: ToolPair[] = [];
  for (const event of events) {
    if (event.type === "tool_start") {
      pairs.push({ name: event.toolName ?? "unknown", args: event.toolArgs ?? "" });
    }
  }
  return pairs;
}

function getToolIcon(toolName: string): string {
  const name = toolName.toLowerCase();
  if (name.includes("edit") || name.includes("write") || name.includes("replace")) return "📝";
  if (name.includes("read") || name.includes("view")) return "📖";
  if (name.includes("shell") || name.includes("bash") || name.includes("command")) return "⚙️";
  if (name.includes("search") || name.includes("grep") || name.includes("glob") || name.includes("find")) return "🔍";
  if (name.includes("delete") || name.includes("remove")) return "🗑️";
  if (name.includes("list")) return "📋";
  return "🔧";
}

function buildConclusion(events: CollectedEvent[]): string {
  let lastAssistantText = "";
  for (const event of events) {
    if (event.type === "assistant" && event.text) {
      lastAssistantText = event.text;
    }
  }
  return lastAssistantText;
}

function buildFooter(result: RunResult): string {
  const label = AGENT_LABELS[result.agentType] ?? result.agentType;
  const parts: string[] = [
    `⏱ ${(result.durationMs / 1000).toFixed(1)}s`,
    `🤖 ${label}`,
  ];
  if (result.toolCallCount > 0) {
    parts.push(`🔧 ${result.toolCallCount} tool calls`);
  }
  if (result.usage) {
    parts.push(`📊 ${result.usage.inputTokens}in / ${result.usage.outputTokens}out`);
  }
  if (result.error) {
    parts.push(`⚠️ ${result.error}`);
  }
  if (result.sessionId) {
    parts.push(`💬 ${result.sessionId}`);
  }
  return `\n---\n_${parts.join(" | ")}_`;
}

/** Extract list of modified files */
export function extractModifiedFiles(events: CollectedEvent[]): string[] {
  const files = new Set<string>();
  for (const event of events) {
    if (event.type !== "tool_start") continue;
    const name = (event.toolName ?? "").toLowerCase();
    const isWrite = name.includes("edit") || name.includes("write")
      || name.includes("replace") || name.includes("delete");
    if (isWrite && event.toolArgs) {
      files.add(event.toolArgs);
    }
  }
  return Array.from(files);
}

function splitMessages(sections: string[]): string[] {
  const messages: string[] = [];
  let current = "";

  for (const section of sections) {
    if (section.length > MAX_MESSAGE_LENGTH) {
      if (current.trim()) {
        messages.push(current.trim());
        current = "";
      }
      messages.push(...splitLongText(section, MAX_MESSAGE_LENGTH));
      continue;
    }
    const candidate = current ? current + "\n\n" + section : section;
    if (candidate.length > MAX_MESSAGE_LENGTH) {
      if (current.trim()) messages.push(current.trim());
      current = section;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) messages.push(current.trim());
  return messages.length > 0 ? messages : ["Agent produced no output"];
}

function splitLongText(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  const lines = text.split("\n");
  let current = "";

  for (const line of lines) {
    const candidate = current ? current + "\n" + line : line;
    if (candidate.length > maxLen && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
