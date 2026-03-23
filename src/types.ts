/** Supported agent backends */
export type AgentType = "cursor" | "claude-code" | "codex";

/** Execution mode */
export type AgentMode = "agent" | "ask" | "plan";

/** Resolved binary for Node.js-based CLIs (Cursor CLI, Codex) */
export interface ResolvedBinary {
  nodeBin: string;
  entryScript: string;
}

/** Per-agent configuration */
export interface CursorAgentCfg {
  path?: string;
  nodeBin?: string;
  entryScript?: string;
  enableMcp?: boolean;
  model?: string;
  prefixArgs?: string[];
}

export interface ClaudeCodeAgentCfg {
  path?: string;
  permissionMode?: string;
  enableAgentTeams?: boolean;
  teammateMode?: string;
  model?: string;
  mcpConfigPath?: string;
}

export interface CodexAgentCfg {
  path?: string;
  nodeBin?: string;
  codexScript?: string;
  approvalMode?: string; // "full-auto" | "yolo" | default
  sessionDir?: string;
}

/** Notification configuration */
export interface NotifyCfg {
  telegram?: boolean;
  telegramTarget?: string;
  web?: boolean;
  webAgentId?: string;
}

/** Plugin configuration */
export interface PluginConfig {
  projects?: Record<string, string>;
  defaultAgent?: AgentType;
  defaultTimeoutSec?: number;
  noOutputTimeoutSec?: number;
  maxConcurrent?: number;
  enableAgentTool?: boolean;
  resultDir?: string;
  notify?: NotifyCfg;
  agents?: {
    cursor?: CursorAgentCfg;
    claudeCode?: ClaudeCodeAgentCfg;
    codex?: CodexAgentCfg;
  };
}

/** Parsed /code command */
export interface ParsedCommand {
  agent: AgentType;
  project: string;
  prompt: string;
  mode: AgentMode;
  model?: string;
  continueSession?: boolean;
  resumeSessionId?: string;
  enableAgentTeams?: boolean;
}

/** Unified run options passed to agent runners */
export interface RunOptions {
  agentType: AgentType;
  binaryPath: string;
  resolvedBinary?: ResolvedBinary;
  projectPath: string;
  prompt: string;
  mode: AgentMode;
  timeoutSec: number;
  noOutputTimeoutSec: number;
  model?: string;
  signal?: AbortSignal;
  runId?: string;

  // Cursor-specific
  enableMcp?: boolean;
  prefixArgs?: string[];
  continueSession?: boolean;
  resumeSessionId?: string;

  // Claude Code-specific
  permissionMode?: string;
  enableAgentTeams?: boolean;
  teammateMode?: string;
  mcpConfigPath?: string;

  // Codex-specific
  approvalMode?: string;
  codexSessionDir?: string;
}

/** Base stream event from Cursor CLI stream-json */
export interface StreamEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  model_call_id?: string;
  timestamp_ms?: number;
}

export interface SystemInitEvent extends StreamEvent {
  type: "system";
  subtype: "init";
  model: string;
  cwd: string;
  session_id: string;
}

export interface AssistantEvent extends StreamEvent {
  type: "assistant";
  message: {
    role: "assistant";
    content: Array<{ type: "text"; text: string }>;
  };
}

export interface ToolCallEvent extends StreamEvent {
  type: "tool_call";
  subtype: "started" | "completed";
  call_id: string;
  tool_call: Record<string, unknown>;
}

export interface ResultEvent extends StreamEvent {
  type: "result";
  subtype: "success" | "error";
  result: string;
  duration_ms: number;
  is_error: boolean;
  usage?: TokenUsage;
}

export interface UserEvent extends StreamEvent {
  type: "user";
  message: {
    role: "user";
    content: Array<{ type: "text"; text: string }>;
  };
}

export type CursorStreamEvent =
  | SystemInitEvent
  | AssistantEvent
  | ToolCallEvent
  | ResultEvent
  | UserEvent
  | StreamEvent;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Collected event for formatting */
export interface CollectedEvent {
  type: "assistant" | "tool_start" | "tool_end" | "result" | "user";
  timestamp?: number;
  text?: string;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  resultData?: ResultEvent;
}

/** Unified run result */
export interface RunResult {
  success: boolean;
  agentType: AgentType;
  resultText: string;
  sessionId?: string;
  durationMs: number;
  toolCallCount: number;
  error?: string;
  usage?: TokenUsage;
  events: CollectedEvent[];
}

/** Persisted task result */
export interface TaskResult {
  taskId: string;
  agentType: AgentType;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  project: string;
  prompt: string;
  mode: AgentMode;
  sessionId?: string;
  summary: string;
  finalAnswer?: string;
  durationMs: number;
  toolCallCount: number;
  error?: string;
  resultFile: string;
  reported: boolean;
}

/** Tracked process entry */
export interface TrackedProcess {
  proc: import("node:child_process").ChildProcess;
  projectPath: string;
  startTime: number;
  agentType: AgentType;
}
