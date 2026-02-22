#!/bin/bash
# Artifact Commit — PostToolUse Hook
# SPEC/TC JSON 파일 수정 시 개별 자동 커밋.
# ISO 26262 Part 8 §7.4.5: 형상 항목 변경 이력 기록
#
# 대상: .omc/specs/SPEC-*.md, .omc/test-cases/TC-*.json
# PostToolUse — exit 0 only (차단 불가).

set -euo pipefail
INPUT=$(cat)

TOOL=$(echo "$INPUT" | jq -r '.tool_name')
case "$TOOL" in
  Edit|Write) ;;
  *) exit 0 ;;
esac

CWD=$(echo "$INPUT" | jq -r '.cwd')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE_PATH" ] && exit 0

# ── SPEC 또는 TC JSON만 대상 ──
ARTIFACT_TYPE=""
case "$FILE_PATH" in
  */.omc/specs/SPEC-*.md)       ARTIFACT_TYPE="spec" ;;
  */.omc/test-cases/TC-*.json)  ARTIFACT_TYPE="tc" ;;
  *) exit 0 ;;
esac

# ── git repo 필수 ──
git -C "$CWD" rev-parse --git-dir >/dev/null 2>&1 || exit 0

STATE="$CWD/.omc/hitl-state.json"
[ ! -f "$STATE" ] && exit 0

# ── 영역 식별 (파일명에서 추출) ──
FILENAME=$(basename "$FILE_PATH")
case "$ARTIFACT_TYPE" in
  spec)
    # SPEC-CP-component.md → CP
    AREA=$(echo "$FILENAME" | sed -n 's/^SPEC-\([A-Z]\{2,\}\)-.*/\1/p')
    ;;
  tc)
    # TC-CP.json → CP
    AREA=$(echo "$FILENAME" | sed -n 's/^TC-\([A-Z]\{2,\}\)\.json$/\1/p')
    ;;
esac

[ -z "${AREA:-}" ] && exit 0

# ── 영역명 + phase + cycle 조회 ──
AREA_NAME=$(jq -r --arg a "$AREA" '.areas[$a].name // $a' "$STATE" 2>/dev/null) || AREA_NAME="$AREA"
PHASE=$(jq -r --arg a "$AREA" '.areas[$a].phase // "unknown"' "$STATE" 2>/dev/null) || PHASE="unknown"
CYCLE=$(jq -r --arg a "$AREA" '.areas[$a].cycle // 1' "$STATE" 2>/dev/null) || CYCLE="1"

# ── git add (해당 파일만) + commit ──
git -C "$CWD" add "$FILE_PATH" 2>/dev/null || exit 0

# 변경 없으면 스킵
if git -C "$CWD" diff --cached --quiet 2>/dev/null; then
  exit 0
fi

# ── 커밋 메시지 ──
MSG="[artifact] ${AREA}(${AREA_NAME}): ${FILENAME} [${PHASE}, cycle ${CYCLE}]"

git -C "$CWD" commit --no-verify -m "$MSG" >/dev/null 2>&1 || exit 0

echo "[artifact] ${FILENAME} committed (${AREA}, ${PHASE})" >&2

exit 0
