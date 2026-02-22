#!/bin/bash
# ProofChain v2.2 — PostToolUse: Phase Commit + HMAC Re-signing
# Detects phase transitions in hitl-state.json and auto-commits
# with structured messages. Creates git tags at verified milestones.
# v2.2: Uses proofchain-hmac-lib.sh for HMAC operations
#
# PostToolUse cannot block — exit 0 always.

set -euo pipefail
trap 'exit 0' ERR  # PostToolUse must never block

INPUT=$(cat)

TOOL=$(echo "$INPUT" | jq -r '.tool_name')
# NOTE: Only Edit|Write can modify hitl-state.json (L1 blocks NotebookEdit/MCP for this path).
# PostToolUse matcher is broader (includes NotebookEdit|mcp__.*) for integrity-audit.sh coverage,
# but phase-commit only needs to handle Edit|Write.
case "$TOOL" in
  Edit|Write) ;;
  *) exit 0 ;;
esac

CWD=$(echo "$INPUT" | jq -r '.cwd')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# ── hitl-state.json 변경만 대상 ──
case "$FILE_PATH" in
  */.omc/hitl-state.json) ;;
  *) exit 0 ;;
esac

STATE="$CWD/.omc/hitl-state.json"
SNAPSHOT="$CWD/.omc/.phase-snapshot.json"

# ── Source HMAC library ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/proofchain-hmac-lib.sh"
proofchain_hmac_vars

# ── git repo 필수 ──
git -C "$CWD" rev-parse --git-dir >/dev/null 2>&1 || exit 0

# ── 현재 영역/phase 읽기 ──
CURRENT=$(jq -r '
  .areas // {} | to_entries[] |
  "\(.key)|\(.value.phase // "unknown")|\(.value.cycle // 1)|\(.value.name // .key)"
' "$STATE" 2>/dev/null) || exit 0

[ -z "$CURRENT" ] && exit 0

# ── 스냅샷 읽기 ──
if [ -f "$SNAPSHOT" ]; then
  PREV=$(jq -r '
    .areas // {} | to_entries[] |
    "\(.key)|\(.value.phase // "unknown")|\(.value.cycle // 1)|\(.value.name // .key)"
  ' "$SNAPSHOT" 2>/dev/null) || PREV=""
else
  cp "$STATE" "$SNAPSHOT"
  PREV=""
fi

# ── 전환 감지 ──
TRANSITIONS=()

while IFS='|' read -r area phase cycle name; do
  [ -z "$area" ] && continue

  OLD_LINE=$(echo "$PREV" | grep "^${area}|" 2>/dev/null || true)

  if [ -z "$OLD_LINE" ]; then
    TRANSITIONS+=("${area}|${name}|(init)|${phase}|${cycle}")
  else
    OLD_PHASE=$(echo "$OLD_LINE" | cut -d'|' -f2)
    OLD_CYCLE=$(echo "$OLD_LINE" | cut -d'|' -f3)

    if [ "$OLD_PHASE" != "$phase" ] || [ "$OLD_CYCLE" != "$cycle" ]; then
      TRANSITIONS+=("${area}|${name}|${OLD_PHASE}|${phase}|${cycle}")
    fi
  fi
done <<< "$CURRENT"

# ── 전환 유효성 검증 (경고만) ──
validate_transition() {
  local from="$1" to="$2"
  [ "$from" = "(init)" ] && return 0
  [ "$to" = "obsolete" ] && return 0
  case "$from" in
    spec)     echo "tc" ;;
    tc)       echo "code spec" ;;
    code)     echo "test tc spec" ;;
    test)     echo "verified code tc spec" ;;
    verified) echo "spec tc code" ;;
    *)        echo "" ;;
  esac | grep -qw "$to"
}

for t in "${TRANSITIONS[@]}"; do
  IFS='|' read -r area name from to cycle <<< "$t"
  if ! validate_transition "$from" "$to"; then
    cat >&2 <<EOF
⚠ INVALID TRANSITION: ${area}(${name}): ${from} → ${to}
  이 전환이 의도된 것인지 확인하세요.
EOF
  fi
done

# ── 전환 없음 ──
if [ ${#TRANSITIONS[@]} -eq 0 ]; then
  cp "$STATE" "$SNAPSHOT"
  exit 0
fi

# ══════════════════════════════════════════════════════════════
# ── v2.2: HMAC Re-signing via shared library ──
# ══════════════════════════════════════════════════════════════
if [ -f "$HMAC_KEY_FILE" ] && [ -d "$INTEGRITY_DIR" ]; then
  proofchain_resign_file "$STATE"
  echo "[ProofChain] HMAC signature updated for hitl-state.json" >&2
fi

# ── 커밋 메시지 구성 ──
TRANS_COUNT=${#TRANSITIONS[@]}
SUBJECT=""
BODY=""
TAG_LIST=()

for t in "${TRANSITIONS[@]}"; do
  IFS='|' read -r area name from to cycle <<< "$t"

  if [ "$TRANS_COUNT" -eq 1 ]; then
    SUBJECT="[proofchain] ${area}(${name}): ${from} → ${to} (cycle ${cycle})"
  else
    SUBJECT="[proofchain] Phase transitions (${TRANS_COUNT} areas)"
  fi

  BODY="${BODY}  ${area}(${name}): ${from} → ${to} [cycle ${cycle}]
"

  if [ "$to" = "verified" ]; then
    TAG_LIST+=("${area}-verified-c${cycle}")
  fi
done

# ── git add + commit ──
git -C "$CWD" add -A 2>/dev/null || exit 0

if git -C "$CWD" diff --cached --quiet 2>/dev/null; then
  cp "$STATE" "$SNAPSHOT"
  exit 0
fi

FULL_MSG=$(printf "%s\n\n%s" "$SUBJECT" "$BODY")
git -C "$CWD" commit --no-verify -m "$FULL_MSG" >/dev/null 2>&1 || {
  cp "$STATE" "$SNAPSHOT"
  exit 0
}

# ── verified 태그 생성 ──
if [ ${#TAG_LIST[@]} -gt 0 ]; then
  for tag in "${TAG_LIST[@]}"; do
    git -C "$CWD" tag "$tag" 2>/dev/null || true
  done
  echo "[proofchain] Tags: ${TAG_LIST[*]}" >&2

  for t in "${TRANSITIONS[@]}"; do
    IFS='|' read -r area name from to cycle <<< "$t"
    if [ "$to" = "verified" ]; then
      cat >&2 <<EOF
[proofchain] ${area} verified — /traceability 실행을 권장합니다.
  추적성 매트릭스로 REQ↔TC↔test 완전성을 확인하세요.
EOF
    fi
  done
fi

# ── 스냅샷 갱신 ──
cp "$STATE" "$SNAPSHOT"

echo "[proofchain] ${SUBJECT}" >&2

exit 0
