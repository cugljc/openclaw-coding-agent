# openclaw-coding-agent

**Ultimate OpenClaw Plugin: dispatch coding tasks to Cursor CLI, Claude Code, and Codex**

[中文文档](README_CN.md)

---

> One plugin, three coding agents, fully cross-platform.

## Features

| Feature | Source | Description |
|---------|--------|-------------|
| **Multi-Agent** | New | Cursor CLI + Claude Code + Codex via unified interface |
| **`/code` Command** | cursor-agent | Explicit task dispatch with full control |
| **`coding_agent` Tool** | cursor-agent | PI Agent auto-invocation for seamless integration |
| **Structured JSON Output** | All agents | stream-json (Cursor/Claude) + JSONL (Codex) |
| **Process Management** | cursor-agent | Concurrent limits, graceful kill, timeout handling |
| **Binary Auto-Detection** | cursor-agent | Cross-platform CLI path resolution |
| **Session Tracking** | All agents | Native resume for all 3 agents |
| **MCP Support** | All agents | Cursor (--approve-mcps) + Claude (--mcp-config) + Codex (config.toml) |
| **Multi-Agent/Teams** | Claude+Codex | Agent Teams (Claude) + Subagents (Codex) |
| **Result Persistence** | coding-agent | JSON + Markdown + Chinese summary files |
| **Telegram Notify** | coding-agent | Push results to Telegram via openclaw CLI |
| **Stop Hooks** | claude-code-hooks | Auto-callback when Claude Code finishes |
| **Cross-Platform** | All | Windows (PowerShell) + macOS/Linux (bash) |

## Agent Feature Matrix

| Feature | Cursor CLI | Claude Code | Codex |
|---------|:---:|:---:|:---:|
| **Structured Output** | ✅ stream-json | ✅ stream-json | ✅ JSONL (--json) |
| **Session Resume** | ✅ --resume/--continue | ✅ --resume/--continue | ✅ exec resume |
| **MCP Support** | ✅ --approve-mcps | ✅ --mcp-config | ✅ config.toml |
| **Multi-Agent** | — | ✅ Agent Teams | ✅ Subagents |
| **Modes** | ✅ agent/ask/plan | ✅ agent/ask/plan | ✅ agent + ask/plan (wrapped) |
| **Git Required** | ❌ | ❌ | ✅ (auto-handled) |
| **PTY Required** | ❌ | ❌ (--print) | ❌ (exec) |

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenClaw Gateway                             │
│                                                                     │
│  ┌─────────────┐   ┌───────────────────────────────────────────┐   │
│  │  Telegram    │   │          openclaw-coding-agent Plugin     │   │
│  │  Discord     │──▶│                                           │   │
│  │  Web UI      │   │  ┌─────────┐  ┌───────┐  ┌───────────┐  │   │
│  └─────────────┘   │  │ /code   │  │ Tool  │  │ Config    │  │   │
│                     │  │ Command │  │ Reg   │  │ Manager   │  │   │
│                     │  └────┬────┘  └───┬───┘  └─────┬─────┘  │   │
│                     │       │           │            │          │   │
│                     │       ▼           ▼            ▼          │   │
│                     │  ┌─────────────────────────────────────┐  │   │
│                     │  │         Command Parser               │  │   │
│                     │  │  /code <agent> <project> [opts] msg  │  │   │
│                     │  └──────────────┬──────────────────────┘  │   │
│                     │                 │                          │   │
│                     │                 ▼                          │   │
│                     │  ┌─────────────────────────────────────┐  │   │
│                     │  │         Agent Router                 │  │   │
│                     │  │   Detect → Resolve → Build → Run    │  │   │
│                     │  └──────────────┬──────────────────────┘  │   │
│                     │                 │                          │   │
│                     └─────────────────┼──────────────────────────┘   │
│                                       │                              │
└───────────────────────────────────────┼──────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
          ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
          │ Cursor CLI  │    │ Claude Code  │    │   Codex     │
          │   (agent)   │    │   (claude)   │    │   (codex)   │
          ├─────────────┤    ├──────────────┤    ├─────────────┤
          │ stream-json │    │ stream-json  │    │   JSONL     │
          │ MCP ✅      │    │ MCP ✅       │    │ MCP ✅      │
          │ Resume ✅   │    │ Resume ✅    │    │ Resume ✅   │
          │ Modes ✅    │    │ Teams ✅     │    │ Subagents ✅│
          └──────┬──────┘    └──────┬───────┘    └──────┬──────┘
                 │                  │                    │
                 └──────────────────┼────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │       Unified JSON Parser        │
                    │  (stream-json / JSONL → events)  │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
          ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
          │  Formatter   │ │ Result Store │ │  Notifier    │
          │  (Markdown)  │ │ (JSON/MD)    │ │ (TG/Web/AGI) │
          └──────────────┘ └──────────────┘ └──────────────┘
```

### Execution Flow (step by step)

```
                            ┌─────────────────────────┐
                            │  1. User sends message   │
                            │  via Telegram/Web/CLI    │
                            └────────────┬────────────┘
                                         │
                                         ▼
                            ┌─────────────────────────┐
                            │  2. OpenClaw Gateway     │
                            │  routes to plugin        │
                            └────────────┬────────────┘
                                         │
                          ┌──────────────┴──────────────┐
                          │                             │
                          ▼                             ▼
                ┌──────────────────┐          ┌──────────────────┐
                │  3a. /code cmd   │          │ 3b. PI Agent     │
                │  (slash command) │          │ calls tool       │
                │                  │          │ coding_agent()   │
                └────────┬─────────┘          └────────┬─────────┘
                         │                             │
                         └──────────────┬──────────────┘
                                        │
                                        ▼
                            ┌─────────────────────────┐
                            │  4. parseCommand()       │
                            │  Extract: agent, project │
                            │  mode, model, flags      │
                            └────────────┬────────────┘
                                         │
                                         ▼
                            ┌─────────────────────────┐
                            │  5. Resolve project path │
                            │  from config.projects    │
                            │  or use absolute path    │
                            └────────────┬────────────┘
                                         │
                                         ▼
                            ┌─────────────────────────┐
                            │  6. buildRunOpts()       │
                            │  Wire agent-specific     │
                            │  configs (MCP, mode,     │
                            │  approval, session...)   │
                            └────────────┬────────────┘
                                         │
                                         ▼
                            ┌─────────────────────────┐
                            │  7. runAgent()           │
                            │  ┌─────────────────────┐ │
                            │  │ 7a. Check concurr.  │ │
                            │  │     limit           │ │
                            │  └──────────┬──────────┘ │
                            │             │            │
                            │  ┌──────────▼──────────┐ │
                            │  │ 7b. Ensure git repo │ │
                            │  │     (Codex only)    │ │
                            │  └──────────┬──────────┘ │
                            │             │            │
                            │  ┌──────────▼──────────┐ │
                            │  │ 7c. buildSpawnSpec() │ │
                            │  │  cursor.ts          │ │
                            │  │  claude-code.ts     │ │
                            │  │  codex.ts           │ │
                            │  └──────────┬──────────┘ │
                            │             │            │
                            │  ┌──────────▼──────────┐ │
                            │  │ 7d. spawn() child   │ │
                            │  │     process         │ │
                            │  └──────────┬──────────┘ │
                            │             │            │
                            │  ┌──────────▼──────────┐ │
                            │  │ 7e. Register in     │ │
                            │  │ process-registry    │ │
                            │  └──────────┬──────────┘ │
                            │             │            │
                            │  ┌──────────▼──────────┐ │
                            │  │ 7f. Start timers:   │ │
                            │  │ • total timeout     │ │
                            │  │ • no-output timeout │ │
                            │  │ • abort listener    │ │
                            │  └──────────┬──────────┘ │
                            └─────────────┼────────────┘
                                          │
                                          ▼
                            ┌─────────────────────────┐
                            │  8. Stream Processing    │
                            │                          │
                            │  readline → parse JSON   │
                            │  line-by-line:           │
                            │                          │
                            │  system.init → sessionId │
                            │  assistant   → text      │
                            │  tool_call   → started   │
                            │  tool_call   → completed │
                            │  result      → final     │
                            └────────────┬────────────┘
                                         │
                                         ▼
                            ┌─────────────────────────┐
                            │  9. Cleanup & Build      │
                            │     RunResult            │
                            │  {                       │
                            │    success, agentType,   │
                            │    resultText, sessionId │
                            │    durationMs, events[], │
                            │    toolCallCount, usage  │
                            │  }                       │
                            └────────────┬────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
          ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
          │ 10a. Format  │    │ 10b. Save    │    │ 10c. Notify  │
          │  to Markdown │    │ to disk:     │    │              │
          │  with agent  │    │ • result.json│    │ • Telegram   │
          │  info,tools, │    │ • result.md  │    │ • Web agent  │
          │  conclusion  │    │ • 中文摘要.md │    │ • Wake file  │
          └──────┬───────┘    └──────────────┘    └──────────────┘
                 │
                 ▼
          ┌──────────────┐
          │ 11. Return   │
          │ to user via  │
          │ Telegram/Web │
          └──────────────┘
```

### Agent Adapter Details

#### Cursor CLI (`src/agents/cursor.ts`)

```
Input: RunOptions
  │
  ├─ -p --trust              (headless, non-interactive)
  ├─ --output-format stream-json
  ├─ --resume <id>           (session resume)
  ├─ --continue              (continue last session)
  ├─ --mode ask|plan         (native mode support)
  ├─ --approve-mcps --force  (MCP enabled)
  ├─ --model <model>         (model override)
  └─ <prompt>
  │
  ▼
Output: stream-json events → unified parser
```

#### Claude Code (`src/agents/claude-code.ts`)

```
Input: RunOptions
  │
  ├─ --permission-mode bypassPermissions
  ├─ --output-format stream-json
  ├─ --verbose               (required for stream-json + --print)
  ├─ --strict-mcp-config     (prevent MCP server hang)
  ├─ --mcp-config <path>     (custom MCP servers)
  ├─ --resume <id>           (session resume)
  ├─ --continue              (continue last session)
  ├─ --model <model>         (model override)
  ├─ --print <prompt>        (headless mode)
  │
  ├─ ENV: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1  (multi-agent)
  │
  ▼
Output: stream-json events → unified parser
```

#### Codex (`src/agents/codex.ts`)

```
Input: RunOptions
  │
  ├─ exec                    (one-shot execution)
  │   └─ resume <id>|--last  (native session resume)
  ├─ --full-auto             (sandboxed auto-approval)
  ├─ --json                  (structured JSONL output)
  ├─ --model <model>         (model override)
  ├─ <prompt + mode wrapper> (ask/plan via prompt injection)
  │
  ├─ MCP: configured via ~/.codex/config.toml [mcp_servers]
  ├─ Subagents: native multi-agent support
  │
  ▼
Output: JSONL events → unified parser (same as stream-json)
```

### Module Dependency Graph

```
index.ts ──────────────────────────────────────────────────
  │  Plugin entry point                                    │
  │  • registerCommand("/code")                            │
  │  • registerTool("coding_agent")                        │
  │  • detect available agents                             │
  │  • parseCommand() / buildRunOpts()                     │
  ├──────────────────────────────────────────────────────── │
  │                                                        │
  ├─── platform.ts          OS detection, binary lookup    │
  │      └── resolve-binary.ts  Unwrap .cmd/.sh wrappers   │
  │                                                        │
  ├─── agents/cursor.ts     buildCursorCommand()           │
  ├─── agents/claude-code.ts buildClaudeCodeCommand()      │
  ├─── agents/codex.ts      buildCodexCommand()            │
  │                                                        │
  ├─── runner.ts            runAgent() orchestrator        │
  │      ├── parser.ts      parseStreamLine() + helpers    │
  │      └── process-registry.ts  tracking + kill          │
  │                                                        │
  ├─── formatter.ts         formatRunResult() → Markdown   │
  ├─── result-store.ts      saveResult() → JSON/MD files   │
  └─── notifier.ts          notify() → TG/Web/Wake        │
```

## Prerequisites

| Dependency | Required |
|------------|----------|
| [OpenClaw Gateway](https://openclaw.dev) | v2026.2.26+ |
| At least one agent CLI | Yes |

Supported agent CLIs:

| Agent | Install | Docs |
|-------|---------|------|
| **Cursor CLI** (`agent`) | `irm 'https://cursor.com/install?win32=true' \| iex` (Win) / `curl https://cursor.com/install -fsSL \| bash` (Unix) | [Cursor Docs](https://cursor.com/docs/cli) |
| **Claude Code** (`claude`) | `npm i -g @anthropic-ai/claude-code` | [Claude Code Docs](https://docs.anthropic.com/en/docs/claude-code) |
| **Codex** (`codex`) | `npm i -g @openai/codex` | [Codex Docs](https://github.com/openai/codex) |

## Quick Start

### 1. Install Plugin

**Source path (dev):**

```json
{
  "plugins": {
    "load": {
      "paths": ["/path/to/openclaw-coding-agent"]
    }
  }
}
```

**Or build & install:**

```bash
git clone https://github.com/cugljc/openclaw-coding-agent.git
cd openclaw-coding-agent
npm ci && npm run build && npm pack
openclaw plugins install openclaw-coding-agent-1.0.0.tgz
```

### 2. Configure

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "openclaw-coding-agent": {
        "enabled": true,
        "config": {
          "projects": {
            "my-app": "/home/user/projects/my-app",
            "backend": "/home/user/projects/backend"
          },
          "defaultAgent": "claude-code",
          "defaultTimeoutSec": 600,
          "noOutputTimeoutSec": 120,
          "maxConcurrent": 3,
          "agents": {
            "cursor": {
              "enableMcp": true,
              "model": "kimi-k2.5"
            },
            "claudeCode": {
              "permissionMode": "bypassPermissions",
              "enableAgentTeams": false,
              "mcpConfigPath": null
            },
            "codex": {
              "approvalMode": "full-auto"
            }
          }
        }
      }
    }
  }
}
```

### 3. Use

```bash
# Default agent
/code my-app Fix the authentication bug in src/auth.ts

# Specify agent
/code claude-code my-app --mode ask Explain the caching strategy

# Codex
/code codex backend --mode agent Add rate limiting to the API

# Continue session (all 3 agents support this)
/code cursor my-app --continue Add tests for the fix

# Resume specific session
/code my-app --resume abc123 Also fix the related edge case

# Claude Code Agent Teams
/code claude-code my-app --teams Refactor the entire test suite
```

### 4. Codex MCP Setup (optional)

Codex MCP servers are configured in `~/.codex/config.toml`:

```toml
[mcp_servers.my-server]
enabled = true
url = "https://example.com/mcp"

[mcp_servers.my-server.http_headers]
Authorization = "Bearer YOUR_TOKEN"
```

Or via CLI: `codex mcp add <name> -- <command>`

### 5. Install Claude Code Hooks (optional)

```bash
# macOS/Linux
bash scripts/install-hooks.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install-hooks.ps1
```

## File Structure

```
src/
├── index.ts              # Plugin entry: /code command + coding_agent tool
├── types.ts              # Shared type definitions (AgentType, RunOptions, etc.)
├── platform.ts           # Cross-platform binary detection (Win/Mac/Linux)
├── resolve-binary.ts     # Node.js CLI binary resolution (.cmd unwrapping)
├── process-registry.ts   # Concurrent process tracking & graceful kill
├── runner.ts             # Unified agent execution engine
├── parser.ts             # stream-json / JSONL output parsers
├── formatter.ts          # Rich Markdown output formatting
├── result-store.ts       # Task result persistence (JSON/MD/中文)
├── notifier.ts           # Telegram, web, wake-file notifications
└── agents/
    ├── cursor.ts         # Cursor CLI adapter (stream-json, MCP, modes)
    ├── claude-code.ts    # Claude Code adapter (stream-json, MCP, Teams)
    └── codex.ts          # Codex adapter (JSONL, MCP, resume, subagents)

hooks/
├── on-complete.sh        # Claude Code stop hook (Unix)
└── on-complete.ps1       # Claude Code stop hook (Windows)

scripts/
├── install-hooks.sh      # Hook installer (Unix)
└── install-hooks.ps1     # Hook installer (Windows)

test-agents.mjs           # Smoke test: verify all 3 agents work
```

## Configuration Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `projects` | `object` | `{}` | Project name → path mapping |
| `defaultAgent` | `string` | first detected | Default agent type |
| `defaultTimeoutSec` | `number` | `600` | Max execution time |
| `noOutputTimeoutSec` | `number` | `120` | No-output timeout |
| `maxConcurrent` | `number` | `3` | Max concurrent processes |
| `enableAgentTool` | `boolean` | `true` | Register tool for PI Agent |
| `resultDir` | `string` | `~/.openclaw/...` | Result persistence directory |
| `agents.cursor.enableMcp` | `boolean` | `true` | Enable Cursor MCP |
| `agents.cursor.model` | `string` | — | Cursor model override |
| `agents.claudeCode.permissionMode` | `string` | `bypassPermissions` | Permission mode |
| `agents.claudeCode.enableAgentTeams` | `boolean` | `false` | Enable Agent Teams |
| `agents.claudeCode.mcpConfigPath` | `string` | — | Custom MCP config path |
| `agents.codex.approvalMode` | `string` | `full-auto` | Approval: full-auto/yolo |
| `notify.telegram` | `boolean` | `false` | Enable Telegram notifications |
| `notify.telegramTarget` | `string` | — | Telegram chat ID |

## Credits

Built by combining the best ideas from:

- [toheart/cursor-agent](https://github.com/toheart/cursor-agent) — Cursor CLI OpenClaw plugin
- [win4r/claude-code-hooks](https://github.com/win4r/claude-code-hooks) — Claude Code stop hooks
- [Composio MCP Guide](https://composio.dev/content/how-to-mcp-with-codex) — Codex MCP setup reference
- OpenClaw coding-agent skill — Multi-agent task dispatch

## License

MIT
