#!/bin/bash
# ProofChain v2.1 — SubagentStart Hook
# Layer 1: Injects current phase context into subagent
# Note: Subagents inherit parent hooks (Claude Code guarantee)

set -euo pipefail
trap 'exit 0' ERR  # SubagentStart should not block

CWD=$(pwd)
STATE="$CWD/.omc/hitl-state.json"

[ ! -f "$STATE" ] && exit 0

# 현재 Phase 정보를 stderr로 주입 (서브에이전트 컨텍스트)
PHASES=$(jq -r '
  .areas | to_entries[] |
  "  \(.key): \(.value.phase) [cycle \(.value.cycle // 1)]"
' "$STATE" 2>/dev/null) || exit 0

if [ -n "$PHASES" ]; then
  cat >&2 <<EOF
[ProofChain] 현재 HITL Phase 상태:
$PHASES
  주의: 모든 Phase 규칙이 서브에이전트에도 동일하게 적용됩니다.
EOF
fi

exit 0
