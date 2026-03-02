#!/bin/bash
# Apply tier1-trace changes to shell hooks
# Usage: bash .omc/patches/apply-tier1-trace.sh
set -euo pipefail

CWD="$(cd "$(dirname "$0")/../.." && pwd)"
CHECK_PHASE="$CWD/.claude/hooks/check-phase.sh"
TRACE_CHANGE="$CWD/.claude/hooks/trace-change.sh"

echo "=== Applying tier1-trace patches ==="

# ─── check-phase.sh: Change 1 — Add ts_bridge_tier1_trace() function ───
# Insert after ts_bridge_tier1() function (after "return 0" + "}" on line ~77-78)
if grep -q 'ts_bridge_tier1_trace' "$CHECK_PHASE"; then
  echo "[SKIP] ts_bridge_tier1_trace() already exists in check-phase.sh"
else
  # Insert the new function before "# TS 브릿지 Gate Check 호출"
  sed -i '' '/^# TS 브릿지 Gate Check 호출/i\
# ── TC Traceability 브릿지 (tier1-trace) ──────────────────────\
# test phase에서 src/ 수정 시 @tc/@req 태그 검증\
# 모든 ASIL/모든 언어에서 호출 (ASIL별 적응형 동작은 TS 핸들러 내부)\
ts_bridge_tier1_trace() {\
  local file_path="${1:-}"\
  local area="${2:-}"\
  [ -z "$file_path" ] \\&\\& return 0\
\
  if [ ! -f "$CWD/dist/bridge/cli-entry.js" ]; then\
    echo "[ProofChain] WARNING: dist/bridge/cli-entry.js not found — tier1-trace skipped (fail-open)" >\\&2\
    return 0\
  fi\
\
  local trace_input\
  trace_input=$(printf '"'"'{"tool_name":"%s","tool_input":%s,"hitl_phase":"test","area":"%s","asil_level":"%s"}'"'"' \\\
    "$TOOL" "$(echo "$INPUT" | jq '"'"'.tool_input'"'"')" "$area" "$ASIL_LEVEL")\
\
  local ts_exit=0\
  echo "$trace_input" | timeout 5 node "$CWD/dist/bridge/cli-entry.js" tier1-trace 2>\\&1 1>/dev/null || ts_exit=$?\
  if [ "$ts_exit" -eq 2 ]; then\
    return 2\
  fi\
  return 0\
}\
' "$CHECK_PHASE"
  echo "[OK] Added ts_bridge_tier1_trace() function"
fi

# ─── check-phase.sh: Change 2 — Add tc_ids/src_file to auto-backward log ───
if grep -q '"tc_ids": \[\]' "$CHECK_PHASE"; then
  echo "[SKIP] tc_ids already in auto-backward log"
else
  # Replace the jq auto-backward command to include new fields
  sed -i '' 's/jq --arg a "$area" --arg ts "$ts" '"'"'/jq --arg a "$area" --arg ts "$ts" --arg sf "${FILE_PATH:-}" '"'"'/' "$CHECK_PHASE"
  sed -i '' 's/"note": "Auto-backward: src\/ modified during test phase"/"note": "Auto-backward: src\/ modified during test phase",\
        "tc_ids": [],\
        "src_file": $sf/' "$CHECK_PHASE"
  echo "[OK] Added tc_ids/src_file to auto-backward log entry"
fi

# ─── check-phase.sh: Change 3 — Add tier1-trace call after auto_backward ───
if grep -q 'ts_bridge_tier1_trace' "$CHECK_PHASE" && ! grep -q 'TRACE_AREA' "$CHECK_PHASE"; then
  # Insert after "auto_backward "$TARGET_AREAS"" + "fi" block (around line 1118)
  sed -i '' '/auto_backward "$TARGET_AREAS"/,/fi/{
    /fi/a\
\
  # ── TC Traceability: tier1-trace (test phase + src/) ──\
  if $IS_SRC \&\& [ -n "$FILE_PATH" ]; then\
    for TRACE_AREA in $TARGET_AREAS; do\
      TRACE_PHASE=$(echo "$AREAS_JSON" | jq -r --arg a "$TRACE_AREA" '"'"'.[$a].phase // "unknown"'"'"')\
      if [ "$TRACE_PHASE" = "test" ] || [ "$TRACE_PHASE" = "code" ]; then\
        ts_bridge_tier1_trace "$FILE_PATH" "$TRACE_AREA" || true\
      fi\
    done\
  fi
  }' "$CHECK_PHASE"
  echo "[OK] Added tier1-trace call after auto_backward"
elif grep -q 'TRACE_AREA' "$CHECK_PHASE"; then
  echo "[SKIP] tier1-trace call already present"
fi

# ─── trace-change.sh: Add @tc/@req extraction to src/ change-log ───
if grep -q 'SRC_TC_IDS' "$TRACE_CHANGE"; then
  echo "[SKIP] @tc/@req extraction already in trace-change.sh"
else
  # Insert tag extraction after "*/src/*)" line
  sed -i '' '/\*\/src\/\*)/a\
    # ── @tc/@req 태그 추출 (Edit: new_string, Write: content) ──\
    EDIT_CONTENT=""\
    if [ "$TOOL" = "Edit" ]; then\
      EDIT_CONTENT=$(echo "$INPUT" | jq -r '"'"'.tool_input.new_string // empty'"'"')\
    elif [ "$TOOL" = "Write" ]; then\
      EDIT_CONTENT=$(echo "$INPUT" | jq -r '"'"'.tool_input.content // empty'"'"')\
    fi\
    SRC_TC_IDS=$(echo "$EDIT_CONTENT" | grep -oE '"'"'@tc TC-[A-Z]{2,4}-[0-9]{3}'"'"' | sed '"'"'s/@tc //'"'"' | sort -u | tr '"'"'\\n'"'"' '"'"','"'"' | sed '"'"'s/,$//'"'"' || true)\
    SRC_REQ_IDS=$(echo "$EDIT_CONTENT" | grep -oE '"'"'@req REQ-[A-Z]{2,4}-[0-9]{3}'"'"' | sed '"'"'s/@req //'"'"' | sort -u | tr '"'"'\\n'"'"' '"'"','"'"' | sed '"'"'s/,$//'"'"' || true)\
' "$TRACE_CHANGE"

  # Update printf to include tc_ids and req_ids
  sed -i '' "s|printf '{\"ts\":\"%s\",\"file\":\"%s\",\"area\":\"%s\",\"phase\":\"%s\",\"tool\":\"%s\"}|printf '{\"ts\":\"%s\",\"file\":\"%s\",\"area\":\"%s\",\"phase\":\"%s\",\"tool\":\"%s\",\"tc_ids\":\"%s\",\"req_ids\":\"%s\"}|" "$TRACE_CHANGE"
  sed -i '' 's/"\$TS" "\$FILE_PATH" "\${AREA:-unmapped}" "\$PHASE" "\$TOOL" >> "\$CHANGE_LOG"/"\$TS" "\$FILE_PATH" "\${AREA:-unmapped}" "\$PHASE" "\$TOOL" "\$SRC_TC_IDS" "\$SRC_REQ_IDS" >> "\$CHANGE_LOG"/' "$TRACE_CHANGE"

  echo "[OK] Added @tc/@req extraction to trace-change.sh"
fi

echo ""
echo "=== All patches applied ==="
echo "Don't forget to restore universal-guard:"
echo "  mv .claude/hooks/universal-guard.sh.disabled .claude/hooks/universal-guard.sh"
echo "  cp .claude/settings.json.bak .claude/settings.json"
