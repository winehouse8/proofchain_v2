#!/bin/bash
# Trace Change — PostToolUse Hook (Layer 2: Guide, v2.0)
# src/ 수정 시 change-log 기록
# tests/ 수정 시 @tc 누락 경고 + @tc 팬텀 참조 경고 (G15) + change-log 기록
# 차단 안 함 — 안내만 (PostToolUse는 exit 0 only)

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

STATE="$CWD/.omc/hitl-state.json"
[ ! -f "$STATE" ] && exit 0

CHANGE_LOG="$CWD/.omc/change-log.jsonl"
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── src/ 수정 → change-log 기록 ──
case "$FILE_PATH" in
  */src/*)
    # ── @tc/@req 태그 추출 (Edit: new_string, Write: content) ──
    EDIT_CONTENT=""
    if [ "$TOOL" = "Edit" ]; then
      EDIT_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
    elif [ "$TOOL" = "Write" ]; then
      EDIT_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
    fi
    SRC_TC_IDS=$(echo "$EDIT_CONTENT" | grep -oE '@tc TC-[A-Z]{2,4}-[0-9]{3}' | sed 's/@tc //' | sort -u | tr '\n' ',' | sed 's/,$//' || true)
    SRC_REQ_IDS=$(echo "$EDIT_CONTENT" | grep -oE '@req REQ-[A-Z]{2,4}-[0-9]{3}' | sed 's/@req //' | sort -u | tr '\n' ',' | sed 's/,$//' || true)

    # 영역 식별 (code.files 매핑)
    AREA=$(jq -r --arg fp "$FILE_PATH" '
      .areas | to_entries[] |
      select(.value.code.files) |
      select([.value.code.files[] | . as $cf | select($fp | endswith($cf))] | length > 0) |
      .key' "$STATE" 2>/dev/null | head -1) || AREA=""

    PHASE="unknown"
    if [ -n "$AREA" ]; then
      PHASE=$(jq -r --arg a "$AREA" '.areas[$a].phase // "unknown"' "$STATE" 2>/dev/null) || PHASE="unknown"
    fi

    # JSONL 항목 추가 (tc_ids, req_ids 포함)
    printf '{"ts":"%s","file":"%s","area":"%s","phase":"%s","tool":"%s","tc_ids":"%s","req_ids":"%s"}\n' \
      "$TS" "$FILE_PATH" "${AREA:-unmapped}" "$PHASE" "$TOOL" "$SRC_TC_IDS" "$SRC_REQ_IDS" >> "$CHANGE_LOG"
    ;;

  */tests/*)
    [ ! -f "$FILE_PATH" ] && exit 0

    # ── area 식별 (디렉토리명에서 추출) ──
    TEST_AREA=$(echo "$FILE_PATH" | grep -oE 'tests/[^/]+/([A-Z]{2})' | grep -oE '[A-Z]{2}$' || true)

    # ── change-log 기록 ──
    PHASE="unknown"
    if [ -n "$TEST_AREA" ]; then
      PHASE=$(jq -r --arg a "$TEST_AREA" '.areas[$a].phase // "unknown"' "$STATE" 2>/dev/null) || PHASE="unknown"
    fi
    printf '{"ts":"%s","file":"%s","area":"%s","phase":"%s","tool":"%s"}\n' \
      "$TS" "$FILE_PATH" "${TEST_AREA:-unmapped}" "$PHASE" "$TOOL" >> "$CHANGE_LOG"

    # ── @tc/@req 누락 경고 ──
    TEST_COUNT=$(grep -cE '\b(it|test)\s*\(' "$FILE_PATH" 2>/dev/null || echo "0")
    TC_COUNT=$(grep -cE '@tc\s+TC-' "$FILE_PATH" 2>/dev/null || echo "0")
    REQ_COUNT=$(grep -cE '@req\s+REQ-' "$FILE_PATH" 2>/dev/null || echo "0")

    if [ "$TEST_COUNT" -gt 0 ]; then
      TC_MISSING=0
      REQ_MISSING=0
      [ "$TC_COUNT" -lt "$TEST_COUNT" ] && TC_MISSING=$((TEST_COUNT - TC_COUNT))
      [ "$REQ_COUNT" -lt "$TEST_COUNT" ] && REQ_MISSING=$((TEST_COUNT - REQ_COUNT))

      if [ "$TC_MISSING" -gt 0 ] || [ "$REQ_MISSING" -gt 0 ]; then
        cat >&2 <<EOF
⚠ TRACEABILITY WARNING: ${FILE_PATH##*/}
  테스트 함수: ${TEST_COUNT}개
  @tc 어노테이션: ${TC_COUNT}개 $([ "$TC_MISSING" -gt 0 ] && echo "→ ${TC_MISSING}개 누락")
  @req 어노테이션: ${REQ_COUNT}개 $([ "$REQ_MISSING" -gt 0 ] && echo "→ ${REQ_MISSING}개 누락")
  ISO 26262 추적성을 위해 모든 테스트에 @tc TC-XX-NNNx 와 @req REQ-XX-NNN 주석을 추가하세요.
EOF
      fi
    fi

    # ── @tc 팬텀 참조 경고 (G15) ──
    if [ -n "$TEST_AREA" ] && [ "$TC_COUNT" -gt 0 ]; then
      # TC JSON 경로 조회
      TC_FILE=$(jq -r --arg a "$TEST_AREA" '.areas[$a].tc.file // empty' "$STATE" 2>/dev/null) || TC_FILE=""

      if [ -n "$TC_FILE" ]; then
        TC_PATH="$CWD/$TC_FILE"
        if [ -f "$TC_PATH" ]; then
          # active TC IDs 수집
          ACTIVE_IDS=$(jq -r '
            [
              (.baseline_tcs // [] | .[] | select(.status != "obsolete") | .tc_id),
              (.supplementary_tcs // [] | .[] | .tc_id)
            ] | .[]
          ' "$TC_PATH" 2>/dev/null) || ACTIVE_IDS=""

          # 테스트 파일의 @tc ID 추출
          FILE_TC_IDS=$(grep -oE '@tc\s+TC-[A-Z]{2}-[0-9]{3}[a-z]?' "$FILE_PATH" 2>/dev/null | \
            sed 's/@tc\s*//' | sort -u) || FILE_TC_IDS=""

          # 팬텀 검사: 파일의 @tc가 TC JSON에 없으면 경고
          PHANTOM=""
          while IFS= read -r ref_id; do
            [ -z "$ref_id" ] && continue
            if [ -n "$ACTIVE_IDS" ] && ! echo "$ACTIVE_IDS" | grep -qw "$ref_id"; then
              PHANTOM="$PHANTOM  - $ref_id"$'\n'
            fi
          done <<< "$FILE_TC_IDS"

          if [ -n "$PHANTOM" ]; then
            cat >&2 <<EOF
⚠ PHANTOM @tc: ${FILE_PATH##*/} — TC JSON에 없는 @tc 참조 발견:
${PHANTOM}  TC JSON(${TC_FILE})에 해당 TC를 추가하거나 @tc 어노테이션을 수정하세요.
EOF
          fi
        fi
      fi
    fi
    ;;
esac

exit 0
