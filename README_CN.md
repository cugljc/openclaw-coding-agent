# openclaw-coding-agent

**究极 OpenClaw 插件：统一调度 Cursor CLI、Claude Code、Codex 三大编码代理**

[English](README.md)

---

> 一个插件，三个代理，全平台兼容。

## 代理功能对比

| 功能 | Cursor CLI | Claude Code | Codex |
|------|:---:|:---:|:---:|
| **结构化输出** | ✅ stream-json | ✅ stream-json | ✅ JSONL (--json) |
| **会话恢复** | ✅ --resume/--continue | ✅ --resume/--continue | ✅ exec resume |
| **MCP 支持** | ✅ --approve-mcps | ✅ --mcp-config | ✅ config.toml |
| **多代理协作** | — | ✅ Agent Teams | ✅ Subagents |
| **执行模式** | ✅ agent/ask/plan | ✅ agent/ask/plan | ✅ agent + ask/plan |
| **需要 Git** | ❌ | ❌ | ✅ (自动处理) |
| **需要 PTY** | ❌ | ❌ (--print) | ❌ (exec) |

## 架构详解

### 整体组件图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenClaw Gateway                             │
│                                                                     │
│  ┌─────────────┐   ┌───────────────────────────────────────────┐   │
│  │  Telegram    │   │          openclaw-coding-agent 插件       │   │
│  │  Discord     │──▶│                                           │   │
│  │  Web UI      │   │  ┌─────────┐  ┌───────┐  ┌───────────┐  │   │
│  └─────────────┘   │  │ /code   │  │ Tool  │  │ Config    │  │   │
│                     │  │ 命令    │  │ 注册   │  │ 管理器    │  │   │
│                     │  └────┬────┘  └───┬───┘  └─────┬─────┘  │   │
│                     │       │           │            │          │   │
│                     │       ▼           ▼            ▼          │   │
│                     │  ┌─────────────────────────────────────┐  │   │
│                     │  │           命令解析器                  │  │   │
│                     │  │  /code <代理> <项目> [选项] 提示词    │  │   │
│                     │  └──────────────┬──────────────────────┘  │   │
│                     │                 │                          │   │
│                     │                 ▼                          │   │
│                     │  ┌─────────────────────────────────────┐  │   │
│                     │  │           代理路由器                  │  │   │
│                     │  │   检测 → 解析 → 构建 → 执行          │  │   │
│                     │  └──────────────┬──────────────────────┘  │   │
│                     └─────────────────┼──────────────────────────┘   │
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
          │ 3种模式 ✅   │    │ Teams ✅     │    │ Subagents ✅│
          └──────┬──────┘    └──────┬───────┘    └──────┬──────┘
                 │                  │                    │
                 └──────────────────┼────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │       统一 JSON 解析器            │
                    │  (stream-json / JSONL → events)  │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
          ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
          │  格式化器     │ │ 结果存储     │ │  通知器       │
          │  (Markdown)  │ │ (JSON/MD)    │ │ (TG/Web/AGI) │
          └──────────────┘ └──────────────┘ └──────────────┘
```

### 执行流程（逐步）

```
1. 用户通过 Telegram/Web/CLI 发送消息
   │
   ▼
2. OpenClaw Gateway 路由到插件
   │
   ├── 方式A: /code 斜杠命令（显式调度）
   │   例: /code claude-code my-app --mode ask 解释缓存策略
   │
   └── 方式B: PI Agent 自动调用 coding_agent 工具
       例: "帮我用 Codex 修复这个 bug"
   │
   ▼
3. parseCommand() 解析命令
   提取: 代理类型、项目名、模式、模型、会话标志
   │
   ▼
4. resolveProjectPath() 解析项目路径
   config.projects 映射 或 使用绝对路径
   │
   ▼
5. buildRunOpts() 构建运行选项
   注入代理特定配置:
   • Cursor: enableMcp, prefixArgs, model
   • Claude Code: permissionMode, mcpConfigPath, enableAgentTeams
   • Codex: approvalMode, continueSession
   │
   ▼
6. runAgent() 执行代理
   │
   ├── 6a. 检查并发限制 (process-registry)
   ├── 6b. 确保 Git 仓库 (仅 Codex)
   ├── 6c. buildSpawnSpec() → 构建CLI参数
   │   ├── cursor.ts:  agent -p --trust --output-format stream-json ...
   │   ├── claude-code.ts:  claude --print --verbose --strict-mcp-config ...
   │   └── codex.ts:  codex exec --full-auto --json ...
   ├── 6d. spawn() 子进程
   ├── 6e. 注册到进程追踪器
   └── 6f. 启动超时计时器
   │
   ▼
7. 流式处理 (readline 逐行解析 JSON)
   │
   ├── system.init  → 获取 sessionId
   ├── assistant    → 收集文本回复
   ├── tool_call    → 记录工具调用
   └── result       → 获取最终结果
   │
   ▼
8. 构建 RunResult
   { success, agentType, resultText, sessionId, events[], usage }
   │
   ├── 8a. formatter → Markdown 格式化
   ├── 8b. result-store → 持久化到磁盘 (JSON + MD + 中文摘要)
   └── 8c. notifier → 发送通知 (Telegram / Web / AGI唤醒)
   │
   ▼
9. 返回结果给用户
```

### 三个代理适配器详解

#### Cursor CLI 适配器 (`src/agents/cursor.ts`)

| 参数 | 说明 |
|------|------|
| `-p --trust` | 无头模式，非交互 |
| `--output-format stream-json` | 结构化输出 |
| `--resume <id>` / `--continue` | 会话恢复 |
| `--mode ask\|plan` | 原生模式切换 |
| `--approve-mcps --force` | 启用 MCP 服务器 |
| `--model <model>` | 模型覆盖 |

#### Claude Code 适配器 (`src/agents/claude-code.ts`)

| 参数 | 说明 |
|------|------|
| `--print <prompt>` | 无头模式（无 PTY） |
| `--verbose` | stream-json + --print 必需 |
| `--permission-mode bypassPermissions` | 无人值守执行 |
| `--strict-mcp-config` | 防止 MCP 服务器启动卡死 |
| `--mcp-config <path>` | 自定义 MCP 配置 |
| `--resume <id>` / `--continue` | 会话恢复 |
| `ENV: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` | 多代理协作 |

#### Codex 适配器 (`src/agents/codex.ts`)

| 参数 | 说明 |
|------|------|
| `exec` | 一次性执行 |
| `exec resume <id>\|--last` | 原生会话恢复 |
| `--full-auto` | 沙盒自动审批 |
| `--json` | 结构化 JSONL 输出 |
| `--model <model>` | 模型覆盖 |
| MCP: `~/.codex/config.toml` | MCP 服务器透传 |
| 多代理: Subagents | 原生子代理支持 |

## 安装

### 方式一：源码路径（开发模式）

```json
// ~/.openclaw/openclaw.json
{
  "plugins": {
    "load": {
      "paths": ["/path/to/openclaw-coding-agent"]
    }
  }
}
```

### 方式二：构建安装

```bash
git clone https://github.com/cugljc/openclaw-coding-agent.git
cd openclaw-coding-agent
npm ci           # 安装依赖
npm run build    # TypeScript → dist/index.js
npm pack         # 打包为 .tgz
openclaw plugins install openclaw-coding-agent-1.0.0.tgz
```

## 使用示例

```bash
# 默认代理
/code my-app 修复 src/auth.ts 的认证 bug

# 指定 Claude Code + ask 模式
/code claude-code my-app --mode ask 解释缓存策略

# Codex + plan 模式
/code codex backend --mode plan 添加限流方案

# 继续上次会话（三个代理都支持）
/code cursor my-app --continue 再补充测试用例

# 恢复指定会话
/code my-app --resume abc123 处理那个边界情况

# Claude Code Agent Teams
/code claude-code my-app --teams 重构整个测试套件
```

## 配置参考

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `projects` | `object` | `{}` | 项目名 → 路径映射 |
| `defaultAgent` | `string` | 首个检测到的 | 默认代理类型 |
| `defaultTimeoutSec` | `number` | `600` | 最大执行时间(秒) |
| `noOutputTimeoutSec` | `number` | `120` | 无输出超时(秒) |
| `maxConcurrent` | `number` | `3` | 最大并发进程数 |
| `agents.cursor.enableMcp` | `boolean` | `true` | 启用 Cursor MCP |
| `agents.claudeCode.mcpConfigPath` | `string` | — | Claude Code MCP 配置路径 |
| `agents.claudeCode.enableAgentTeams` | `boolean` | `false` | 启用 Agent Teams |
| `agents.codex.approvalMode` | `string` | `full-auto` | 审批模式 |

## 鸣谢

整合自以下项目的最佳实践:

- [toheart/cursor-agent](https://github.com/toheart/cursor-agent) — Cursor CLI OpenClaw 插件
- [win4r/claude-code-hooks](https://github.com/win4r/claude-code-hooks) — Claude Code 完成回调
- [Composio Codex MCP 指南](https://composio.dev/content/how-to-mcp-with-codex) — Codex MCP 配置参考
- OpenClaw coding-agent skill — 多代理任务调度

## 许可证

MIT
