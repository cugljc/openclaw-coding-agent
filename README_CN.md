# openclaw-coding-agent

**OpenClaw 终极编码代理插件：统一调度 Cursor CLI、Claude Code、Codex 执行编码任务**

[English](README.md)

---

> 一个插件，三种编码代理，全平台兼容。

## 功能特性

| 特性 | 来源 | 说明 |
|------|------|------|
| **多代理支持** | 新增 | Cursor CLI + Claude Code + Codex 统一接口 |
| **`/code` 命令** | cursor-agent | 显式任务派发，完全控制 |
| **`coding_agent` 工具** | cursor-agent | PI Agent 自动调用，无缝集成 |
| **Stream-JSON 解析** | cursor-agent | 实时解析 Cursor/Claude Code 结构化输出 |
| **进程管理** | cursor-agent | 并发限制、优雅终止、超时处理 |
| **二进制自动检测** | cursor-agent | 跨平台 CLI 路径自动解析 |
| **会话追踪** | cursor-agent | 按代理+项目自动恢复会话 |
| **结果持久化** | coding-agent | JSON + Markdown + 中文摘要 |
| **Telegram 通知** | coding-agent | 通过 openclaw CLI 推送结果到 Telegram |
| **Web/Agent 通知** | coding-agent | 直接投递到 OpenClaw web 会话 |
| **Pending-Wake** | claude-code-hooks | 心跳兼容的唤醒文件 |
| **Stop Hooks** | claude-code-hooks | Claude Code 完成时自动回调 |
| **防重复** | claude-code-hooks | 30秒锁防止重复通知 |
| **Agent Teams** | claude-code-hooks | Claude Code 多代理协作 |
| **跨平台** | 全部 | Windows (PowerShell) + macOS/Linux (bash) |

## 前置要求

| 依赖 | 版本要求 |
|------|----------|
| [OpenClaw Gateway](https://openclaw.dev) | v2026.3.2+ |
| 至少一个代理 CLI | 必需 |

支持的代理 CLI：

| 代理 | 安装方式 |
|------|----------|
| **Cursor CLI** (`agent`) | `curl https://cursor.com/install -fsSL \| bash`（Linux/Mac）<br>`irm https://cursor.com/install \| iex`（Windows） |
| **Claude Code** (`claude`) | `npm i -g @anthropic-ai/claude-code` |
| **Codex** (`codex`) | `npm i -g @openai/codex` |

## 快速开始

### 1. 安装插件

**源码路径（开发模式）：**

```json
{
  "plugins": {
    "load": {
      "paths": ["C:/path/to/openclaw-coding-agent"]
    }
  }
}
```

**构建安装：**

```bash
npm ci && npm run build && npm pack
openclaw plugins install openclaw-coding-agent-1.0.0.tgz
```

### 2. 配置

```json
{
  "plugins": {
    "entries": {
      "openclaw-coding-agent": {
        "enabled": true,
        "config": {
          "projects": {
            "my-app": "E:\\projects\\my-app",
            "backend": "E:\\projects\\backend"
          },
          "defaultAgent": "cursor",
          "defaultTimeoutSec": 600,
          "maxConcurrent": 3,
          "enableAgentTool": true,
          "notify": {
            "telegram": true,
            "telegramTarget": "你的Chat_ID",
            "web": true
          },
          "agents": {
            "cursor": { "enableMcp": true },
            "claudeCode": { "permissionMode": "bypassPermissions" },
            "codex": { "approvalMode": "full-auto" }
          }
        }
      }
    }
  }
}
```

### 3. 使用

```bash
# 使用默认代理（cursor）
/code my-app 修复 src/auth.ts 中的认证 bug

# 指定代理
/code claude-code my-app --mode ask 解释缓存策略

# 使用 Codex
/code codex backend --mode agent 给 API 添加限流

# 继续上次会话
/code cursor my-app --continue 补充一下测试

# 恢复指定会话
/code my-app --resume abc123 再修一下边界情况

# Claude Code Agent Teams
/code claude-code my-app --teams 重构整个测试套件
```

### 4. 安装 Claude Code Hooks（可选）

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\install-hooks.ps1

# macOS/Linux
bash scripts/install-hooks.sh
```

## 架构

```
src/
├── index.ts              # 插件入口：/code 命令 + coding_agent 工具
├── types.ts              # 类型定义
├── platform.ts           # 跨平台二进制检测 (Win/Mac/Linux)
├── resolve-binary.ts     # Node.js CLI 二进制解析
├── process-registry.ts   # 并发进程追踪与优雅终止
├── runner.ts             # 统一代理执行引擎
├── parser.ts             # Stream-JSON + 纯文本输出解析器
├── formatter.ts          # 富文本 Markdown 格式化
├── result-store.ts       # 任务结果持久化 (JSON/MD)
├── notifier.ts           # Telegram、web、唤醒文件通知
└── agents/
    ├── cursor.ts         # Cursor CLI 适配器
    ├── claude-code.ts    # Claude Code 适配器
    └── codex.ts          # Codex 适配器

hooks/
├── on-complete.sh        # Claude Code 停止钩子 (Unix)
└── on-complete.ps1       # Claude Code 停止钩子 (Windows)

scripts/
├── install-hooks.sh      # 钩子安装器 (Unix)
└── install-hooks.ps1     # 钩子安装器 (Windows)
```

### 调用路径

```
用户消息
  ├─ /code 命令 ──→ parseCommand ──→ runAgent ──→ 格式化 + 保存 + 通知 → 返回结果
  └─ 普通对话 ──→ PI Agent ──→ coding_agent 工具 ──→ runAgent ──→ 同上
```

### 三种代理对比

| 特性 | Cursor CLI | Claude Code | Codex |
|------|-----------|-------------|-------|
| 输出格式 | stream-json | stream-json | 纯文本 |
| 会话恢复 | ✅ | ✅ | ❌ |
| MCP 支持 | ✅ | ❌ | ❌ |
| Agent Teams | ❌ | ✅ | ❌ |
| 需要 Git | ❌ | ❌ | ✅ |
| 需要 PTY | ❌ | ❌ (--print) | ❌ (exec) |
| 模式 | agent/ask/plan | agent/ask/plan | exec only |

## 致谢

整合了以下项目的最佳实践：

- [toheart/cursor-agent](https://github.com/toheart/cursor-agent) — Cursor CLI OpenClaw 插件
- [win4r/claude-code-hooks](https://github.com/win4r/claude-code-hooks) — Claude Code 停止钩子
- OpenClaw coding-agent skill — 多代理任务派发

## 许可证

MIT
