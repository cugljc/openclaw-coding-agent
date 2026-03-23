import type { CursorStreamEvent, ToolCallEvent, CollectedEvent } from "./types.js";

/** Parse a stream-json line (Cursor CLI / Claude Code) */
export function parseStreamLine(line: string): CursorStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as CursorStreamEvent;
  } catch {
    return null;
  }
}

/** Extract tool name from tool_call event */
export function extractToolName(event: ToolCallEvent): string {
  const tc = event.tool_call;
  if (!tc) return "unknown";
  const keys = Object.keys(tc);
  for (const key of keys) {
    if (key.endsWith("ToolCall")) {
      return key.replace("ToolCall", "");
    }
  }
  return keys[0] ?? "unknown";
}

/** Extract tool argument summary */
export function extractToolArgs(event: ToolCallEvent): string {
  const tc = event.tool_call;
  if (!tc) return "";
  for (const value of Object.values(tc)) {
    const v = value as Record<string, unknown>;
    if (v?.args) {
      const args = v.args as Record<string, unknown>;
      if (args.path) return String(args.path).split(/[/\\]/).pop() ?? "";
      if (args.pattern) return String(args.pattern);
      if (args.globPattern) return String(args.globPattern);
      if (args.command) {
        const cmd = String(args.command);
        return cmd.length > 40 ? cmd.slice(0, 40) + "..." : cmd;
      }
    }
  }
  return "";
}

/** Extract result text from tool_call completed event */
export function extractToolResult(event: ToolCallEvent): string {
  const tc = event.tool_call;
  if (!tc) return "";
  for (const value of Object.values(tc)) {
    const v = value as Record<string, unknown>;
    if (typeof v?.result === "string") return truncate(v.result, 2000);
    if (v?.output && typeof v.output === "string") return truncate(v.output as string, 2000);
    if (v?.content) {
      const content = v.content;
      if (Array.isArray(content)) {
        const texts = content
          .filter((c: Record<string, unknown>) => c.type === "text" && c.text)
          .map((c: Record<string, unknown>) => String(c.text));
        if (texts.length > 0) return truncate(texts.join("\n"), 2000);
      }
    }
  }
  return "";
}

/**
 * Parse plain-text Codex output into CollectedEvents.
 * Codex doesn't use stream-json, so we extract the final answer heuristically.
 */
export function parseCodexOutput(text: string): CollectedEvent[] {
  const events: CollectedEvent[] = [];
  if (!text.trim()) return events;

  const lines = text.split(/\r?\n/);
  let finalStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]!.trim() === "codex") {
      finalStart = i;
      break;
    }
  }

  if (finalStart >= 0 && finalStart < lines.length - 1) {
    let end = lines.length;
    for (let j = finalStart + 1; j < lines.length; j++) {
      if (lines[j]!.trim().startsWith("tokens used")) {
        end = j;
        break;
      }
    }
    const finalAnswer = lines.slice(finalStart + 1, end).join("\n").trim();
    if (finalAnswer) {
      events.push({ type: "assistant", text: finalAnswer });
    }
  }

  if (events.length === 0) {
    // Fallback: use the whole output as one assistant event
    const trimmed = text.trim();
    if (trimmed) {
      events.push({ type: "assistant", text: trimmed });
    }
  }

  return events;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n... (truncated, ${s.length - max} chars omitted)`;
}
