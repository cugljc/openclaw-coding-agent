#!/bin/bash
# Claude Code Stop Hook — on-complete notification
# Install: copy to ~/.claude/hooks/ and register in ~/.claude/settings.json
# Triggers on Stop + SessionEnd events, with dedup

set -uo pipefail

RESULT_DIR="${CODING_AGENT_RESULT_DIR:-$HOME/.openclaw/agents/coding-agent/results}"
LOG="${RESULT_DIR}/hook.log"
LOCK_FILE="${RESULT_DIR}/.hook-lock"
LOCK_AGE_LIMIT=30

mkdir -p "$RESULT_DIR"

log() { echo "[$(date -Iseconds)] $*" >> "$LOG"; }
log "=== Hook fired ==="

# Read stdin (Claude Code passes JSON context)
INPUT=""
if [ ! -t 0 ] && [ -e /dev/stdin ]; then
  INPUT=$(timeout 2 cat /dev/stdin 2>/dev/null || true)
fi

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")
CWD=$(echo "$INPUT" | jq -r '.cwd // ""' 2>/dev/null || echo "")
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "unknown"' 2>/dev/null || echo "unknown")

log "session=$SESSION_ID cwd=$CWD event=$EVENT"

# Dedup: skip if fired within LOCK_AGE_LIMIT seconds
if [ -f "$LOCK_FILE" ]; then
  LOCK_TIME=$(stat -c %Y "$LOCK_FILE" 2>/dev/null || stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  AGE=$(( NOW - LOCK_TIME ))
  if [ "$AGE" -lt "$LOCK_AGE_LIMIT" ]; then
    log "Duplicate hook within ${AGE}s, skipping"
    exit 0
  fi
fi
touch "$LOCK_FILE"

# Capture Claude Code output
OUTPUT=""
TASK_OUTPUT="${RESULT_DIR}/task-output.txt"
sleep 1

if [ -f "$TASK_OUTPUT" ] && [ -s "$TASK_OUTPUT" ]; then
  OUTPUT=$(tail -c 4000 "$TASK_OUTPUT")
  log "Output from task-output.txt (${#OUTPUT} chars)"
elif [ -f "/tmp/claude-code-output.txt" ] && [ -s "/tmp/claude-code-output.txt" ]; then
  OUTPUT=$(tail -c 4000 /tmp/claude-code-output.txt)
  log "Output from /tmp fallback (${#OUTPUT} chars)"
elif [ -n "$CWD" ] && [ -d "$CWD" ]; then
  FILES=$(ls -1t "$CWD" 2>/dev/null | head -20 | tr '\n' ', ')
  OUTPUT="Working dir: ${CWD}\nFiles: ${FILES}"
  log "Output from dir listing"
fi

# Write result JSON
jq -n \
  --arg sid "$SESSION_ID" \
  --arg ts "$(date -Iseconds)" \
  --arg cwd "$CWD" \
  --arg event "$EVENT" \
  --arg output "$OUTPUT" \
  '{session_id: $sid, timestamp: $ts, cwd: $cwd, event: $event, agent_type: "claude-code", output: $output, status: "done"}' \
  > "${RESULT_DIR}/latest-hook.json" 2>/dev/null

log "Wrote latest-hook.json"

# Notify via openclaw CLI if available
OPENCLAW_BIN=$(which openclaw 2>/dev/null || echo "")
if [ -n "$OPENCLAW_BIN" ]; then
  SUMMARY=$(echo "$OUTPUT" | tail -c 800 | tr '\n' ' ')
  MSG="✅ [Claude Code] Task completed\nSession: ${SESSION_ID}\n${SUMMARY:0:600}"

  "$OPENCLAW_BIN" system event --mode now --text "$MSG" 2>/dev/null \
    && log "Sent system event" \
    || log "System event failed"
fi

# Write pending-wake for heartbeat
jq -n \
  --arg sid "$SESSION_ID" \
  --arg ts "$(date -Iseconds)" \
  --arg summary "$(echo "$OUTPUT" | head -c 500 | tr '\n' ' ')" \
  '{session_id: $sid, agent_type: "claude-code", timestamp: $ts, summary: $summary, processed: false}' \
  > "${RESULT_DIR}/pending-wake.json" 2>/dev/null

log "=== Hook completed ==="
exit 0
