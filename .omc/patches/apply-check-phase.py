#!/usr/bin/env python3
"""Apply tier1-trace changes to check-phase.sh → .omc/patches/check-phase.sh"""
import os

base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src = os.path.join(base, '.claude', 'hooks', 'check-phase.sh')
dst = os.path.join(base, '.omc', 'patches', 'check-phase.sh')

with open(src, 'r') as f:
    content = f.read()

# ─── Change 1: Insert ts_bridge_tier1_trace() function ───
NEW_FUNC = '''
# ── TC Traceability 브릿지 (tier1-trace) ──────────────────────
# test phase에서 src/ 수정 시 @tc/@req 태그 검증
# 모든 ASIL/모든 언어에서 호출 (ASIL별 적응형 동작은 TS 핸들러 내부)
ts_bridge_tier1_trace() {
  local file_path="${1:-}"
  local area="${2:-}"
  [ -z "$file_path" ] && return 0

  if [ ! -f "$CWD/dist/bridge/cli-entry.js" ]; then
    echo "[ProofChain] WARNING: dist/bridge/cli-entry.js not found — tier1-trace skipped (fail-open)" >&2
    return 0
  fi

  local trace_input
  trace_input=$(printf '{"tool_name":"%s","tool_input":%s,"hitl_phase":"test","area":"%s","asil_level":"%s"}' \\
    "$TOOL" "$(echo "$INPUT" | jq '.tool_input')" "$area" "$ASIL_LEVEL")

  local ts_exit=0
  echo "$trace_input" | timeout 5 node "$CWD/dist/bridge/cli-entry.js" tier1-trace 2>&1 1>/dev/null || ts_exit=$?
  if [ "$ts_exit" -eq 2 ]; then
    return 2
  fi
  return 0
}

'''

marker1 = '# TS 브릿지 Gate Check 호출 (verified 전환용)'
if 'ts_bridge_tier1_trace' not in content:
    content = content.replace(marker1, NEW_FUNC + marker1)
    print('[OK] Change 1: Added ts_bridge_tier1_trace() function')
else:
    print('[SKIP] Change 1: ts_bridge_tier1_trace() already exists')

# ─── Change 2: Add tc_ids/src_file to auto-backward jq log ───
OLD_JQ = '''    jq --arg a "$area" --arg ts "$ts" '
      .areas[$a].phase = "code" |
      .log += [{
        "timestamp": $ts,
        "area": $a,
        "from": "test",
        "to": "code",
        "actor": "hook",
        "type": "auto-backward",
        "note": "Auto-backward: src/ modified during test phase"
      }]
    \' "$STATE" > "${STATE}.tmp" && mv "${STATE}.tmp" "$STATE"'''

NEW_JQ = '''    jq --arg a "$area" --arg ts "$ts" --arg sf "${FILE_PATH:-}" '
      .areas[$a].phase = "code" |
      .log += [{
        "timestamp": $ts,
        "area": $a,
        "from": "test",
        "to": "code",
        "actor": "hook",
        "type": "auto-backward",
        "note": "Auto-backward: src/ modified during test phase",
        "tc_ids": [],
        "src_file": $sf
      }]
    \' "$STATE" > "${STATE}.tmp" && mv "${STATE}.tmp" "$STATE"'''

if '"tc_ids": []' not in content:
    content = content.replace(OLD_JQ, NEW_JQ)
    print('[OK] Change 2: Added tc_ids/src_file to auto-backward log')
else:
    print('[SKIP] Change 2: tc_ids already in auto-backward log')

# ─── Change 3: Add tier1-trace call after auto_backward ───
OLD_BLOCK = '''  # auto-backward: mapped src/ + test phase
  if $IS_SRC; then
    auto_backward "$TARGET_AREAS"
  fi

  # TS Bridge Tier 1 (ASIL A+ && C/C++)'''

NEW_BLOCK = '''  # auto-backward: mapped src/ + test phase
  if $IS_SRC; then
    auto_backward "$TARGET_AREAS"
  fi

  # ── TC Traceability: tier1-trace (test phase + src/) ──
  if $IS_SRC && [ -n "$FILE_PATH" ]; then
    for TRACE_AREA in $TARGET_AREAS; do
      TRACE_PHASE=$(echo "$AREAS_JSON" | jq -r --arg a "$TRACE_AREA" '.[$a].phase // "unknown"')
      if [ "$TRACE_PHASE" = "test" ] || [ "$TRACE_PHASE" = "code" ]; then
        ts_bridge_tier1_trace "$FILE_PATH" "$TRACE_AREA" || true
      fi
    done
  fi

  # TS Bridge Tier 1 (ASIL A+ && C/C++)'''

if 'TRACE_AREA' not in content:
    content = content.replace(OLD_BLOCK, NEW_BLOCK)
    print('[OK] Change 3: Added tier1-trace call after auto_backward')
else:
    print('[SKIP] Change 3: tier1-trace call already present')

# ─── Write output ───
os.makedirs(os.path.dirname(dst), exist_ok=True)
with open(dst, 'w') as f:
    f.write(content)

print(f'\nPatched file written to: {dst}')
print('Apply with: cp .omc/patches/check-phase.sh .claude/hooks/check-phase.sh')
