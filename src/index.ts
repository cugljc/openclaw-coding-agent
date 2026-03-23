import { existsSync } from "node:fs";
import {
  detectCursorAgent, detectClaudeCode, detectCodex,
} from "./platform.js";
import { resolveAgentBinary } from "./resolve-binary.js";
import { runAgent } from "./runner.js";
import { formatRunResult, extractModifiedFiles } from "./formatter.js";
import { saveResult, setResultDir } from "./result-store.js";
import { notifyCompletion } from "./notifier.js";
import { ensureShutdownHook, setMaxConcurrent } from "./process-registry.js";
import type {
  PluginConfig, ParsedCommand, AgentType, AgentMode,
  ResolvedBinary, RunOptions,
} from "./types.js";

const PLUGIN_ID = "openclaw-coding-agent";

const DEFAULTS = {
  agent: "cursor" as AgentType,
  timeoutSec: 600,
  noOutputTimeoutSec: 120,
  maxConcurrent: 3,
} as const;

const AGENT_NAMES: AgentType[] = ["cursor", "claude-code", "codex"];

// ── Agent detection ──

interface DetectedAgent {
  type: AgentType;
  path: string;
  resolved?: ResolvedBinary;
}

function detectAgents(cfg: PluginConfig): DetectedAgent[] {
  const agents: DetectedAgent[] = [];

  // Cursor
  const cursorPath = cfg.agents?.cursor?.path ?? detectCursorAgent();
  if (cursorPath) {
    let resolved: ResolvedBinary | undefined;
    if (cfg.agents?.cursor?.nodeBin && cfg.agents?.cursor?.entryScript) {
      if (existsSync(cfg.agents.cursor.nodeBin) && existsSync(cfg.agents.cursor.entryScript)) {
        resolved = { nodeBin: cfg.agents.cursor.nodeBin, entryScript: cfg.agents.cursor.entryScript };
      }
    }
    if (!resolved) {
      resolved = resolveAgentBinary(cursorPath) ?? undefined;
    }
    agents.push({ type: "cursor", path: cursorPath, resolved });
  }

  // Claude Code
  const ccPath = cfg.agents?.claudeCode?.path ?? detectClaudeCode();
  if (ccPath) {
    agents.push({ type: "claude-code", path: ccPath });
  }

  // Codex
  const codexPath = cfg.agents?.codex?.path ?? detectCodex();
  if (codexPath) {
    let resolved: ResolvedBinary | undefined;
    if (cfg.agents?.codex?.nodeBin && cfg.agents?.codex?.codexScript) {
      if (existsSync(cfg.agents.codex.nodeBin) && existsSync(cfg.agents.codex.codexScript)) {
        resolved = { nodeBin: cfg.agents.codex.nodeBin, entryScript: cfg.agents.codex.codexScript };
      }
    }
    if (!resolved && codexPath) {
      resolved = resolveAgentBinary(codexPath) ?? undefined;
    }
    agents.push({ type: "codex", path: codexPath, resolved });
  }

  return agents;
}

// ── Command parsing ──

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (const ch of input) {
    if (inQuote) {
      if (ch === inQuote) { inQuote = null; } else { current += ch; }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === " " || ch === "\t") {
      if (current) { tokens.push(current); current = ""; }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Parse /code command:
 *   /code [agent] <project> [options] <prompt>
 *
 * Agent defaults to config.defaultAgent or "cursor".
 * If the first token matches an agent name, it's consumed.
 */
function parseCommand(
  args: string,
  availableAgents: AgentType[],
  defaultAgent: AgentType,
): ParsedCommand | { error: string } {
  if (!args?.trim()) {
    return {
      error: [
        "Usage: /code [agent] <project> [options] <prompt>",
        "",
        `Agents: ${availableAgents.join(", ")}`,
        "Options:",
        "  --mode <agent|ask|plan>",
        "  --model <model-name>",
        "  --continue",
        "  --resume <sessionId>",
        "  --teams  (Claude Code Agent Teams)",
      ].join("\n"),
    };
  }

  const tokens = tokenize(args.trim());
  if (tokens.length === 0) return { error: "Missing arguments" };

  let idx = 0;
  let agent: AgentType = defaultAgent;

  // Check if first token is an agent name
  if (AGENT_NAMES.includes(tokens[0] as AgentType)) {
    agent = tokens[0] as AgentType;
    if (!availableAgents.includes(agent)) {
      return { error: `Agent "${agent}" not available. Available: ${availableAgents.join(", ")}` };
    }
    idx++;
  }

  if (idx >= tokens.length) return { error: "Missing project" };
  const project = tokens[idx]!;
  idx++;

  let mode: AgentMode = "agent";
  let model: string | undefined;
  let continueSession = false;
  let resumeSessionId: string | undefined;
  let enableAgentTeams = false;
  const promptParts: string[] = [];

  while (idx < tokens.length) {
    const token = tokens[idx]!;
    if (token === "--continue") {
      continueSession = true;
      idx++;
    } else if (token === "--resume") {
      idx++;
      if (idx >= tokens.length) return { error: "--resume requires a sessionId" };
      resumeSessionId = tokens[idx]!;
      idx++;
    } else if (token === "--mode") {
      idx++;
      if (idx >= tokens.length) return { error: "--mode requires agent|ask|plan" };
      const m = tokens[idx]! as AgentMode;
      if (!["agent", "ask", "plan"].includes(m)) {
        return { error: `Invalid mode: ${m}` };
      }
      mode = m;
      idx++;
    } else if (token === "--model") {
      idx++;
      if (idx >= tokens.length) return { error: "--model requires a name" };
      model = tokens[idx]!;
      idx++;
    } else if (token === "--teams") {
      enableAgentTeams = true;
      idx++;
    } else {
      promptParts.push(tokens.slice(idx).join(" "));
      break;
    }
  }

  const prompt = promptParts.join(" ").trim();
  if (!prompt) return { error: "Missing prompt" };

  return { agent, project, prompt, mode, model, continueSession, resumeSessionId, enableAgentTeams };
}

function resolveProjectPath(key: string, projects: Record<string, string>): string | null {
  if (projects[key]) return projects[key]!;
  const lower = key.toLowerCase();
  for (const [name, path] of Object.entries(projects)) {
    if (name.toLowerCase() === lower) return path;
  }
  if (existsSync(key)) return key;
  return null;
}

// ── DO NOT SUMMARIZE directive ──

const DO_NOT_SUMMARIZE = [
  "",
  "─".repeat(40),
  "⚠️ CRITICAL: The COMPLETE output is shown above.",
  "Do NOT summarize, rephrase, or comment on the above content.",
  'Simply say: "Task completed, results shown above."',
  "─".repeat(40),
].join("\n");

// ── Plugin entry ──

export default {
  id: PLUGIN_ID,
  configSchema: { type: "object" as const },

  register(api: any) {
    const cfg: PluginConfig = api.pluginConfig ?? {};

    if (cfg.resultDir) setResultDir(cfg.resultDir);
    if (cfg.maxConcurrent) setMaxConcurrent(cfg.maxConcurrent);
    ensureShutdownHook();

    const agents = detectAgents(cfg);
    if (agents.length === 0) {
      console.warn(`[${PLUGIN_ID}] No coding agents found (cursor/claude/codex). Plugin disabled.`);
      return;
    }

    const availableTypes = agents.map((a) => a.type);
    const agentMap = new Map(agents.map((a) => [a.type, a]));
    const projects = cfg.projects ?? {};
    const projectNames = Object.keys(projects);
    const defaultAgent = cfg.defaultAgent && availableTypes.includes(cfg.defaultAgent)
      ? cfg.defaultAgent
      : availableTypes[0]!;

    const agentListStr = availableTypes.join(", ");
    const projectListStr = projectNames.length > 0
      ? `Projects: ${projectNames.join(", ")}`
      : "No pre-configured projects (use absolute path)";

    // Session tracking per agent+project
    const lastSession = new Map<string, string>();
    function sessionKey(agent: AgentType, project: string): string {
      return `${agent}::${project}`;
    }

    // Build RunOptions from parsed command + detected agent
    function buildRunOpts(
      parsed: ParsedCommand,
      projectPath: string,
      signal?: AbortSignal,
    ): RunOptions {
      const detected = agentMap.get(parsed.agent)!;

      const base: RunOptions = {
        agentType: parsed.agent,
        binaryPath: detected.path,
        resolvedBinary: detected.resolved,
        projectPath,
        prompt: parsed.prompt,
        mode: parsed.mode,
        timeoutSec: cfg.defaultTimeoutSec ?? DEFAULTS.timeoutSec,
        noOutputTimeoutSec: cfg.noOutputTimeoutSec ?? DEFAULTS.noOutputTimeoutSec,
        model: parsed.model,
        signal,
      };

      // Cursor-specific
      if (parsed.agent === "cursor") {
        base.enableMcp = cfg.agents?.cursor?.enableMcp ?? true;
        base.prefixArgs = cfg.agents?.cursor?.prefixArgs;
        base.continueSession = parsed.continueSession;
        base.resumeSessionId = parsed.resumeSessionId
          ?? (parsed.continueSession ? undefined : lastSession.get(sessionKey(parsed.agent, projectPath)));
      }

      // Claude Code-specific
      if (parsed.agent === "claude-code") {
        base.permissionMode = cfg.agents?.claudeCode?.permissionMode ?? "bypassPermissions";
        base.enableAgentTeams = parsed.enableAgentTeams || cfg.agents?.claudeCode?.enableAgentTeams;
        base.teammateMode = cfg.agents?.claudeCode?.teammateMode;
        base.mcpConfigPath = cfg.agents?.claudeCode?.mcpConfigPath;
        base.enableMcp = !!cfg.agents?.claudeCode?.mcpConfigPath;
        base.continueSession = parsed.continueSession;
        base.resumeSessionId = parsed.resumeSessionId
          ?? (parsed.continueSession ? undefined : lastSession.get(sessionKey(parsed.agent, projectPath)));
      }

      // Codex-specific
      if (parsed.agent === "codex") {
        base.approvalMode = cfg.agents?.codex?.approvalMode ?? "full-auto";
        base.codexSessionDir = cfg.agents?.codex?.sessionDir;
        base.continueSession = parsed.continueSession;
        base.resumeSessionId = parsed.resumeSessionId
          ?? (parsed.continueSession ? undefined : lastSession.get(sessionKey(parsed.agent, projectPath)));
      }

      return base;
    }

    // ── /code command ──
    api.registerCommand({
      name: "code",
      description: `Dispatch coding tasks to ${agentListStr}. ${projectListStr}`,
      acceptsArgs: true,
      requireAuth: false,

      async handler(ctx: any) {
        const parsed = parseCommand(ctx.args ?? "", availableTypes, defaultAgent);
        if ("error" in parsed) return { text: parsed.error };

        const projectPath = resolveProjectPath(parsed.project, projects);
        if (!projectPath) {
          return { text: `Project not found: ${parsed.project}\n${projectListStr}` };
        }

        const opts = buildRunOpts(parsed, projectPath);
        const result = await runAgent(opts);

        // Track session
        if (result.sessionId) {
          lastSession.set(sessionKey(parsed.agent, projectPath), result.sessionId);
        }

        // Persist result
        const taskResult = saveResult(result, parsed.project, parsed.prompt, parsed.mode);

        // Notify
        if (cfg.notify) {
          const notifyStatus = notifyCompletion(cfg.notify, taskResult, cfg.resultDir ?? "");
          console.log(`[${PLUGIN_ID}] notify: ${JSON.stringify(notifyStatus)}`);
        }

        const messages = formatRunResult(result);
        return { text: messages.join("\n\n---\n\n") };
      },
    });

    // ── coding_agent tool (for PI Agent auto-invocation) ──
    if (cfg.enableAgentTool !== false && projectNames.length > 0) {
      api.registerTool(
        createCodingAgentTool({
          availableTypes,
          agentMap,
          projects,
          cfg,
          defaultAgent,
          lastSession,
          sessionKey,
          buildRunOpts,
        }),
        { name: "coding_agent", optional: true },
      );
      console.log(`[${PLUGIN_ID}] registered coding_agent tool`);
    }

    console.log(
      `[${PLUGIN_ID}] ready — agents: [${agentListStr}], ` +
      `projects: [${projectNames.join(", ") || "none"}], default: ${defaultAgent}`
    );
  },
};

// ── Tool factory ──

function createCodingAgentTool(params: {
  availableTypes: AgentType[];
  agentMap: Map<AgentType, DetectedAgent>;
  projects: Record<string, string>;
  cfg: PluginConfig;
  defaultAgent: AgentType;
  lastSession: Map<string, string>;
  sessionKey: (agent: AgentType, project: string) => string;
  buildRunOpts: (parsed: ParsedCommand, projectPath: string, signal?: AbortSignal) => RunOptions;
}) {
  const agentListStr = params.availableTypes.join(", ");
  const projectListStr = Object.keys(params.projects).join(", ");

  return (_ctx: any) => ({
    name: "coding_agent",
    label: "Coding Agent",
    description:
      `Invoke local coding agent CLI (${agentListStr}) to analyze, modify, or plan code changes. ` +
      `Available projects: ${projectListStr}. ` +
      `IMPORTANT: Results are returned verbatim. Do NOT summarize or rephrase.`,
    parameters: {
      type: "object" as const,
      properties: {
        agent: {
          type: "string" as const,
          enum: params.availableTypes,
          description: `Agent to use (default: ${params.defaultAgent})`,
        },
        project: {
          type: "string" as const,
          description: `Project name (${projectListStr}) or absolute path`,
        },
        prompt: {
          type: "string" as const,
          description: "Task description — be specific",
        },
        mode: {
          type: "string" as const,
          enum: ["agent", "ask", "plan"],
          description: "ask (read-only, default for tool), plan, or agent (can modify files)",
        },
        model: {
          type: "string" as const,
          description: "Model override",
        },
        newSession: {
          type: "boolean" as const,
          description: "Force new session (default: false, auto-resumes)",
        },
        teams: {
          type: "boolean" as const,
          description: "Enable Agent Teams (Claude Code only)",
        },
      },
      required: ["project", "prompt"],
    },

    async execute(
      _toolCallId: string,
      args: Record<string, unknown>,
      signal?: AbortSignal,
    ) {
      const agent = (args.agent as AgentType) ?? params.defaultAgent;
      const project = String(args.project ?? "");
      const prompt = String(args.prompt ?? "");
      const mode = (args.mode as AgentMode) ?? "ask";
      const forceNew = args.newSession === true;
      const teams = args.teams === true;

      if (!project || !prompt) {
        return { content: [{ type: "text", text: "Missing: project and prompt required" }] };
      }

      if (!params.availableTypes.includes(agent)) {
        return { content: [{ type: "text", text: `Agent "${agent}" unavailable. Available: ${agentListStr}` }] };
      }

      const projectPath = resolveProjectPath(project, params.projects);
      if (!projectPath) {
        return { content: [{ type: "text", text: `Project not found: ${project}. Available: ${projectListStr}` }] };
      }

      const parsed: ParsedCommand = {
        agent,
        project,
        prompt,
        mode,
        model: args.model as string | undefined,
        continueSession: false,
        resumeSessionId: forceNew ? undefined : params.lastSession.get(params.sessionKey(agent, projectPath)),
        enableAgentTeams: teams,
      };

      const opts = params.buildRunOpts(parsed, projectPath, signal);
      const result = await runAgent(opts);

      if (result.sessionId) {
        params.lastSession.set(params.sessionKey(agent, projectPath), result.sessionId);
      }

      const taskResult = saveResult(result, project, prompt, mode);

      if (params.cfg.notify) {
        notifyCompletion(params.cfg.notify, taskResult, params.cfg.resultDir ?? "");
      }

      const messages = formatRunResult(result);
      const combined = messages.join("\n\n---\n\n");
      const modifiedFiles = extractModifiedFiles(result.events);

      return {
        content: [{ type: "text", text: combined + DO_NOT_SUMMARIZE }],
        details: {
          success: result.success,
          agentType: result.agentType,
          sessionId: result.sessionId,
          modifiedFiles,
        },
      };
    },
  });
}
