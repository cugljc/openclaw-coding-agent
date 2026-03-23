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
| **Stream-JSON Parsing** | cursor-agent | Real-time structured output from Cursor/Claude Code |
| **Process Management** | cursor-agent | Concurrent limits, graceful kill, timeout handling |
| **Binary Auto-Detection** | cursor-agent | Cross-platform CLI path resolution |
| **Session Tracking** | cursor-agent | Auto-resume per agent+project |
| **Result Persistence** | coding-agent | JSON + Markdown + Chinese summary files |
| **Telegram Notify** | coding-agent | Push results to Telegram via openclaw CLI |
| **Web/Agent Notify** | coding-agent | Direct delivery to OpenClaw web session |
| **Pending-Wake** | claude-code-hooks | Heartbeat-compatible wake file for AGI |
| **Stop Hooks** | claude-code-hooks | Auto-callback when Claude Code finishes |
| **Dedup** | claude-code-hooks | 30s lock prevents duplicate notifications |
| **Agent Teams** | claude-code-hooks | Claude Code multi-agent orchestration |
| **Cross-Platform** | All | Windows (PowerShell) + macOS/Linux (bash) |

## Prerequisites

| Dependency | Required |
|------------|----------|
| [OpenClaw Gateway](https://openclaw.dev) | v2026.3.2+ |
| At least one agent CLI | Yes |

Supported agent CLIs:

| Agent | Install | Docs |
|-------|---------|------|
| **Cursor CLI** (`agent`) | `curl https://cursor.com/install -fsSL \| bash` | [Cursor Docs](https://cursor.com/docs/cli) |
| **Claude Code** (`claude`) | `npm i -g @anthropic-ai/claude-code` | [Claude Code Docs](https://code.claude.com/docs) |
| **Codex** (`codex`) | `npm i -g @openai/codex` | [Codex Docs](https://openai.com/codex) |

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
npm ci && npm run build && npm pack
openclaw plugins install openclaw-coding-agent-1.0.0.tgz
```

### 2. Configure

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
          "defaultAgent": "cursor",
          "defaultTimeoutSec": 600,
          "noOutputTimeoutSec": 120,
          "maxConcurrent": 3,
          "enableAgentTool": true,
          "resultDir": "/home/user/.openclaw/agents/coding-agent/results",
          "notify": {
            "telegram": true,
            "telegramTarget": "YOUR_CHAT_ID",
            "web": true,
            "webAgentId": "main"
          },
          "agents": {
            "cursor": {
              "enableMcp": true,
              "model": "claude-4-sonnet"
            },
            "claudeCode": {
              "permissionMode": "bypassPermissions",
              "enableAgentTeams": false
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
# Default agent (cursor)
/code my-app Fix the authentication bug in src/auth.ts

# Specify agent
/code claude-code my-app --mode ask Explain the caching strategy

# Codex
/code codex backend --mode agent Add rate limiting to the API

# Continue session
/code cursor my-app --continue Add tests for the fix

# Resume specific session
/code my-app --resume abc123 Also fix the related edge case

# Claude Code Agent Teams
/code claude-code my-app --teams Refactor the entire test suite
```

### 4. Install Claude Code Hooks (optional)

```bash
# macOS/Linux
bash scripts/install-hooks.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install-hooks.ps1
```

## Architecture

```
src/
├── index.ts              # Plugin entry: /code command + coding_agent tool
├── types.ts              # Shared type definitions
├── platform.ts           # Cross-platform binary detection (Win/Mac/Linux)
├── resolve-binary.ts     # Node.js CLI binary resolution
├── process-registry.ts   # Concurrent process tracking & graceful kill
├── runner.ts             # Unified agent execution engine
├── parser.ts             # Stream-JSON + plain text output parsers
├── formatter.ts          # Rich Markdown output formatting
├── result-store.ts       # Task result persistence (JSON/MD)
├── notifier.ts           # Telegram, web, wake-file notifications
└── agents/
    ├── cursor.ts         # Cursor CLI adapter
    ├── claude-code.ts    # Claude Code adapter
    └── codex.ts          # Codex adapter

hooks/
├── on-complete.sh        # Claude Code stop hook (Unix)
└── on-complete.ps1       # Claude Code stop hook (Windows)

scripts/
├── install-hooks.sh      # Hook installer (Unix)
└── install-hooks.ps1     # Hook installer (Windows)
```

### Execution Flow

```
User Message
  ├─ /code command ──→ parseCommand ──→ runAgent ──→ format + save + notify → result
  └─ PI Agent ──→ coding_agent tool ──→ runAgent ──→ format + save + notify → tool result
```

### Agent Comparison

| Feature | Cursor CLI | Claude Code | Codex |
|---------|-----------|-------------|-------|
| Output Format | stream-json | stream-json | plain text |
| Session Resume | ✅ | ✅ | ❌ |
| MCP Support | ✅ | ❌ | ❌ |
| Agent Teams | ❌ | ✅ | ❌ |
| Git Required | ❌ | ❌ | ✅ |
| PTY Required | ❌ | ❌ (--print) | ❌ (exec) |
| Modes | agent/ask/plan | agent/ask/plan | exec only |

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
| `notify.telegram` | `boolean` | `false` | Enable Telegram notifications |
| `notify.telegramTarget` | `string` | — | Telegram chat ID |
| `notify.web` | `boolean` | `false` | Enable web/agent notifications |
| `notify.webAgentId` | `string` | `"main"` | OpenClaw agent ID for delivery |

## Credits

Built by combining the best ideas from:

- [toheart/cursor-agent](https://github.com/toheart/cursor-agent) — Cursor CLI OpenClaw plugin
- [win4r/claude-code-hooks](https://github.com/win4r/claude-code-hooks) — Claude Code stop hooks
- OpenClaw coding-agent skill — Multi-agent task dispatch

## License

MIT
