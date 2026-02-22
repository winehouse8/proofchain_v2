#!/bin/bash
# ProofChain v2.2 — Layer 2: Deterministic Command Hook (강화된 Phase Guard)
# Called by Layer 1 (universal-guard.sh) for Edit/Write/Bash/NotebookEdit/MCP tools
#
# 5-Phase Model: spec, tc, code, test, verified
# Defense enhancements over v1:
#   V1:  hitl-state.json Bash direct manipulation detection
#   V2:  Multi-stage script attack detection (python3 -c, perl -e, etc.)
#   V3:  Edit transition validation completeness
#   V4:  Indirect git command detection (sh -c 'git...')
#   V5:  Symlink resolution (readlink -f) + ln -s creation detection
#   V15: .claude/settings.json modification detection
#   NEW: Fail-closed (trap 'exit 2' ERR)
#   NEW: Encoding bypass detection (base64, xxd, hex)
#   NEW: Background process blocking (&, nohup, disown)
#   NEW: Expanded write detection patterns (dd, install, curl, wget)
#   NEW: Protected path deny-by-default strategy
#
# Gate checks preserved from v1:
#   Gate #1: @tc ↔ TC JSON mapping
#   Gate #2: Supplementary TC schema (§6.3)
#   Gate #3: Change-log coverage warning (§6.1)
#   Gate #4: Baseline TC immutability (git tag)
#   Gate #5: Reentry log validation (§8.4.1, §8.7)
#   Gate #6: Active TC existence
#   Gate #7: TS bridge gate check (ASIL A+)
#
# exit 0 = allow, exit 2 = block

set -euo pipefail
trap 'echo "HOOK CRASH: fail-closed (check-phase)" >&2; exit 2' ERR

INPUT=$(cat)

TOOL=$(echo "$INPUT" | jq -r '.tool_name')
CWD=$(echo "$INPUT" | jq -r '.cwd')
STATE="$CWD/.omc/hitl-state.json"

# ── Bash 휴리스틱용 코드 확장자 패턴 ──
BASH_CODE_EXT='ts|tsx|js|jsx|mjs|cjs|py|rs|go|c|h|cpp|hpp|cs|java|kt|scala|swift|dart|rb|php|lua|sh|bash|ex|hs|vue|svelte|css|scss|sass|html|htm|sql|graphql|wasm|zig|nim|jl|cr|elm|sol'

# ══════════════════════════════════════════════════════════════
# ── ASIL Configuration ──
# ══════════════════════════════════════════════════════════════

ASIL_LEVEL="QM"
PC_CONFIG="$CWD/.proofchain/config.json"
if [ -f "$PC_CONFIG" ]; then
  ASIL_LEVEL=$(jq -r '.asil_level // "QM"' "$PC_CONFIG" 2>/dev/null) || ASIL_LEVEL="QM"
fi

# C/C++ 파일 판별
is_c_file() {
  case "${1##*.}" in
    c|h|cpp|hpp|cc|cxx|hh|hxx) return 0 ;;
    *) return 1 ;;
  esac
}

# TS 브릿지 Tier 1 호출 (조건부: ASIL A+ && C/C++ 파일)
ts_bridge_tier1() {
  local file_path="${1:-}"
  [ -z "$file_path" ] && return 0
  [ "$ASIL_LEVEL" = "QM" ] && return 0
  is_c_file "$file_path" || return 0

  if [ ! -f "$CWD/dist/bridge/cli-entry.js" ]; then
    echo "[ProofChain] WARNING: dist/bridge/cli-entry.js not found — TS tier1 skipped (fail-open)" >&2
    return 0
  fi

  local ts_exit=0
  echo "$INPUT" | timeout 5 node "$CWD/dist/bridge/cli-entry.js" tier1 2>/dev/null || ts_exit=$?
  if [ "$ts_exit" -eq 2 ]; then
    return 2
  fi
  return 0
}

# TS 브릿지 Gate Check 호출 (verified 전환용)
ts_bridge_gate_check() {
  local area="${1:-}"
  [ -z "$area" ] && return 0

  if [ ! -f "$CWD/dist/bridge/cli-entry.js" ]; then
    echo "[ProofChain] WARNING: dist/bridge/cli-entry.js not found — TS gate-check skipped" >&2
    case "$ASIL_LEVEL" in
      QM|A) return 0 ;;
      *) echo "[ProofChain] BLOCKED: TS gate-check required for ASIL $ASIL_LEVEL but bridge not built" >&2; return 2 ;;
    esac
  fi

  local ts_exit=0
  printf '{"area":"%s"}' "$area" | timeout 30 node "$CWD/dist/bridge/cli-entry.js" gate-check 2>/dev/null || ts_exit=$?
  if [ "$ts_exit" -eq 2 ]; then
    return 2
  fi
  return 0
}

# ── ASIL 적응형 Phase Guard 종료 ──
# QM/A → exit 0 + 경고, B+ → exit 2 (차단)
# 자기보호(.claude/), 파괴적 git, hitl-state 직접 수정은 항상 exit 2
asil_phase_exit() {
  case "$ASIL_LEVEL" in
    QM|A)
      echo "⚠ WARNING (ASIL $ASIL_LEVEL): 위 내용은 ASIL B+ 에서 차단되는 위반입니다. 현재 ASIL에서는 경고만 표시합니다." >&2
      exit 0
      ;;
    *)
      exit 2
      ;;
  esac
}

# ── phase별 가능한 전환 출력 ──
print_transitions() {
  local phase="$1"
  case "$phase" in
    spec)
      cat >&2 <<'TRANSITIONS'
현재 spec 단계에서 가능한 전환:
  → forward → tc : SPEC 완료 + 사람 승인 → /test-gen-design
TRANSITIONS
      ;;
    tc)
      cat >&2 <<'TRANSITIONS'
현재 tc 단계에서 가능한 전환:
  → forward  → code : TC 승인 → 코딩 시작
  → backward → spec : SPEC 수정 필요 → /ears-spec
TRANSITIONS
      ;;
    code)
      cat >&2 <<'TRANSITIONS'
현재 code 단계에서 가능한 전환:
  → forward  → test : 코딩 완료 → /test-gen-code
  → backward → spec : SPEC 문제 발견 → /ears-spec
  → backward → tc   : TC 보강 필요 → /test-gen-design
TRANSITIONS
      ;;
    test)
      cat >&2 <<'TRANSITIONS'
현재 test 단계에서 가능한 전환:
  → forward  → verified : 전부 통과 + 사람 최종 검증
  → backward → spec     : SPEC 문제 → /ears-spec
  → backward → tc       : TC 부족 → /test-gen-design
  → backward → code     : 코드 수정 필요
TRANSITIONS
      ;;
  esac
}

# ══════════════════════════════════════════════════════════════
# ── Auto-backward (test→code) ──
# ══════════════════════════════════════════════════════════════
auto_backward() {
  local target_areas="$1"
  local areas_json
  areas_json=$(jq '.areas // {}' "$STATE" 2>/dev/null) || return

  local backward_areas=""

  if [ -n "$target_areas" ]; then
    for area in $target_areas; do
      local phase
      phase=$(echo "$areas_json" | jq -r --arg a "$area" '.[$a].phase // "unknown"') || continue
      [ "$phase" = "test" ] && backward_areas="$backward_areas $area"
    done
  else
    backward_areas=$(echo "$areas_json" | jq -r '
      to_entries[] | select(.value.phase == "test") | .key
    ' 2>/dev/null) || backward_areas=""
  fi

  backward_areas=$(echo "$backward_areas" | xargs)
  [ -z "$backward_areas" ] && return

  for area in $backward_areas; do
    local ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    jq --arg a "$area" --arg ts "$ts" '
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
    ' "$STATE" > "${STATE}.tmp" && mv "${STATE}.tmp" "$STATE"

    cat >&2 <<EOF
⚠ AUTO-BACKWARD: ${area} — test → code
  test phase에서 src/ 수정이 감지되어 자동으로 code phase로 전환했습니다.
  수정 완료 후:
  1. TC JSON에 supplementary TC를 추가하세요 (origin: "supplementary", added_reason 필수)
  2. 테스트 코드에 @tc 어노테이션을 부착하세요
  3. 테스트를 재실행하여 code → test로 복귀하세요
EOF
  done
}

# ══════════════════════════════════════════════════════════════
# ── Verified Gate (추적성 전수 검사) ──
# ══════════════════════════════════════════════════════════════
verified_gate() {
  local area="$1"
  local tc_file
  tc_file=$(jq -r --arg a "$area" '.areas[$a].tc.file // empty' "$STATE" 2>/dev/null) || return 0
  [ -z "$tc_file" ] && return 0

  local tc_path="$CWD/$tc_file"
  [ ! -f "$tc_path" ] && return 0

  # ── Gate #1: active TC ↔ @tc 매핑 ──
  local active_tc_ids
  active_tc_ids=$(jq -r '
    [
      (.baseline_tcs // [] | .[] | select(.status != "obsolete") | .tc_id),
      (.supplementary_tcs // [] | .[] | .tc_id)
    ] | .[]
  ' "$tc_path" 2>/dev/null) || return 0

  # ── Gate #6: Active TC 존재 검증 ──
  if [ -z "$active_tc_ids" ]; then
    cat >&2 <<EOF
BLOCKED: ${area} — verified 전환 차단 (Active TC 0개)
  TC JSON에 active TC가 없습니다.
  최소 1개의 baseline 또는 supplementary TC가 필요합니다.
  ISO 26262 Part 6 §9.3 (테스트 추적성 필수)
EOF
    return 1
  fi

  local tc_req_map
  tc_req_map=$(jq -r '
    [
      (.baseline_tcs // [] | .[] | select(.status != "obsolete") | "\(.tc_id)|\(.req_id)"),
      (.supplementary_tcs // [] | .[] | "\(.tc_id)|\(.req_id)")
    ] | .[]
  ' "$tc_path" 2>/dev/null) || tc_req_map=""

  local test_dir="$CWD/tests"
  local found_tcs=""
  local found_reqs=""
  if [ -d "$test_dir" ]; then
    found_tcs=$(grep -rhoE '@tc\s+TC-[A-Z]{2}-[0-9]{3}[a-z]?' "$test_dir" 2>/dev/null | \
      sed 's/@tc\s*//' | sort -u) || found_tcs=""
    found_reqs=$(grep -rhoE '@req\s+REQ-[A-Z]{2}-[0-9]{3}' "$test_dir" 2>/dev/null | \
      sed 's/@req\s*//' | sort -u) || found_reqs=""
  fi

  local missing=""
  local missing_count=0
  local total_count=0

  while IFS= read -r tc_id; do
    [ -z "$tc_id" ] && continue
    total_count=$((total_count + 1))
    if ! echo "$found_tcs" | grep -qw "$tc_id"; then
      missing="$missing  - $tc_id (@tc 누락)"$'\n'
      missing_count=$((missing_count + 1))
    fi
  done <<< "$active_tc_ids"

  local req_missing=""
  local req_missing_count=0
  local checked_reqs=""

  while IFS='|' read -r tc_id req_id; do
    [ -z "$req_id" ] && continue
    if echo "$checked_reqs" | grep -qw "$req_id" 2>/dev/null; then
      continue
    fi
    checked_reqs="$checked_reqs $req_id"
    if [ -n "$found_reqs" ]; then
      if ! echo "$found_reqs" | grep -qw "$req_id"; then
        req_missing="$req_missing  - $req_id (@req 누락 — $tc_id 에서 참조)"$'\n'
        req_missing_count=$((req_missing_count + 1))
      fi
    else
      req_missing="$req_missing  - $req_id (@req 누락 — $tc_id 에서 참조)"$'\n'
      req_missing_count=$((req_missing_count + 1))
    fi
  done <<< "$tc_req_map"

  if [ "$missing_count" -gt 0 ] || [ "$req_missing_count" -gt 0 ]; then
    cat >&2 <<EOF
BLOCKED: ${area} — verified 전환 차단 (추적성 미충족)
EOF
    if [ "$missing_count" -gt 0 ]; then
      cat >&2 <<EOF
  Active TC: ${total_count}개 중 ${missing_count}개 @tc 어노테이션 누락:
${missing}
EOF
    fi
    if [ "$req_missing_count" -gt 0 ]; then
      cat >&2 <<EOF
  REQ 추적: ${req_missing_count}개 @req 어노테이션 누락:
${req_missing}
EOF
    fi
    cat >&2 <<EOF
  모든 테스트에 @tc TC-XX-NNNx 와 @req REQ-XX-NNN 주석을 추가한 후 다시 시도하세요.
  ISO 26262 Part 6 §9.3 추적성 요구사항을 충족해야 합니다.
EOF
    return 1
  fi

  # ── Gate #2: Supplementary TC 스키마 검증 (§6.3) ──
  if [ "$ASIL_LEVEL" = "QM" ]; then
    return 0
  fi
  local supp_errors=""
  local supp_error_count=0
  local required_fields="tc_id origin req_id type level title given when then added_reason"

  local supp_count
  supp_count=$(jq '.supplementary_tcs // [] | length' "$tc_path" 2>/dev/null) || supp_count=0

  if [ "$supp_count" -gt 0 ]; then
    local i=0
    while [ "$i" -lt "$supp_count" ]; do
      local tc_id_val
      tc_id_val=$(jq -r --argjson idx "$i" '.supplementary_tcs[$idx].tc_id // "unknown"' "$tc_path" 2>/dev/null)

      for field in $required_fields; do
        local val
        val=$(jq -r --argjson idx "$i" --arg f "$field" '.supplementary_tcs[$idx][$f] // empty' "$tc_path" 2>/dev/null)
        if [ -z "$val" ]; then
          supp_errors="$supp_errors  - ${tc_id_val}: \"${field}\" 필드 누락"$'\n'
          supp_error_count=$((supp_error_count + 1))
        elif [ "$field" = "added_reason" ] && [ "${#val}" -lt 10 ]; then
          supp_errors="$supp_errors  - ${tc_id_val}: \"added_reason\" 최소 10자 필요 (현재: ${#val}자)"$'\n'
          supp_error_count=$((supp_error_count + 1))
        fi
      done

      local origin_val
      origin_val=$(jq -r --argjson idx "$i" '.supplementary_tcs[$idx].origin // empty' "$tc_path" 2>/dev/null)
      if [ -n "$origin_val" ] && [ "$origin_val" != "supplementary" ]; then
        supp_errors="$supp_errors  - ${tc_id_val}: origin은 \"supplementary\"여야 함 (현재: \"${origin_val}\")"$'\n'
        supp_error_count=$((supp_error_count + 1))
      fi

      i=$((i + 1))
    done
  fi

  if [ "$supp_error_count" -gt 0 ]; then
    cat >&2 <<EOF
BLOCKED: ${area} — verified 전환 차단 (Supplementary TC 스키마 오류)
  ${supp_error_count}개 필드 문제:
${supp_errors}
  필수 필드: tc_id, origin("supplementary"), req_id, type, level,
             title, given, when, then, added_reason
EOF
    return 1
  fi

  # ── Gate #3: Change-log 커버리지 경고 ──
  local change_log="$CWD/.omc/change-log.jsonl"
  if [ -f "$change_log" ]; then
    local unmapped_files
    unmapped_files=$(grep '"area":"unmapped"' "$change_log" 2>/dev/null | \
      jq -r '.file' 2>/dev/null | sort -u) || unmapped_files=""

    if [ -n "$unmapped_files" ]; then
      cat >&2 <<EOF
⚠ COVERAGE WARNING: ${area} — 영역 미매핑 src/ 변경 감지
  다음 파일이 어떤 영역에도 매핑되지 않은 채 수정되었습니다:
EOF
      echo "$unmapped_files" | while IFS= read -r f; do
        [ -n "$f" ] && echo "  - $f" >&2
      done
      echo "  hitl-state.json의 code.files에 파일을 등록하면 추적성이 향상됩니다." >&2
    fi

    local has_autobackward
    has_autobackward=$(jq --arg a "$area" '
      [.log // [] | .[] | select(.area == $a and .type == "auto-backward")] | length
    ' "$STATE" 2>/dev/null) || has_autobackward=0

    if [ "$has_autobackward" -gt 0 ] && [ "$supp_count" -eq 0 ]; then
      cat >&2 <<EOF
⚠ HOTFIX WARNING: ${area} — auto-backward 이력 ${has_autobackward}건 있으나 supplementary TC 없음
  test phase에서 코드 수정이 발생했으므로 보완 TC 추가를 권장합니다.
EOF
    fi
  fi

  # ── Gate #4: Baseline TC 내용 불변 (git tag 비교) ──
  local first_tag="${area}-verified-c1"
  if git -C "$CWD" rev-parse "$first_tag" >/dev/null 2>&1; then
    local original_tc_json
    original_tc_json=$(git -C "$CWD" show "${first_tag}:${tc_file}" 2>/dev/null) || original_tc_json=""

    if [ -n "$original_tc_json" ]; then
      local original_baselines
      original_baselines=$(echo "$original_tc_json" | jq -r '
        .baseline_tcs // [] | .[] | .tc_id
      ' 2>/dev/null) || original_baselines=""

      if [ -n "$original_baselines" ]; then
        local baseline_errors=""
        local baseline_error_count=0

        while IFS= read -r orig_id; do
          [ -z "$orig_id" ] && continue

          local cur_status
          cur_status=$(jq -r --arg id "$orig_id" '
            .baseline_tcs // [] | .[] | select(.tc_id == $id) | .status // "active"
          ' "$tc_path" 2>/dev/null) || cur_status=""

          if [ -z "$cur_status" ]; then
            baseline_errors="${baseline_errors}  - ${orig_id}: TC JSON에서 삭제됨 (삭제 금지, obsolete 마킹 필요)\n"
            baseline_error_count=$((baseline_error_count + 1))
            continue
          fi

          [ "$cur_status" = "obsolete" ] && continue

          local orig_gwt cur_gwt
          orig_gwt=$(echo "$original_tc_json" | jq -r --arg id "$orig_id" '
            .baseline_tcs[] | select(.tc_id == $id) |
            (.given // "") + "|||" + (.when // "") + "|||" + (.then // "")
          ' 2>/dev/null) || continue
          cur_gwt=$(jq -r --arg id "$orig_id" '
            .baseline_tcs[] | select(.tc_id == $id) |
            (.given // "") + "|||" + (.when // "") + "|||" + (.then // "")
          ' "$tc_path" 2>/dev/null) || continue

          if [ "$orig_gwt" != "$cur_gwt" ]; then
            baseline_errors="${baseline_errors}  - ${orig_id}: given/when/then 내용이 변경됨\n"
            baseline_error_count=$((baseline_error_count + 1))
          fi
        done <<< "$original_baselines"

        if [ "$baseline_error_count" -gt 0 ]; then
          cat >&2 <<EOF
BLOCKED: ${area} — verified 전환 차단 (Baseline TC 불변 위반)
  ${baseline_error_count}개 baseline TC 문제:
$(printf "$baseline_errors")
  Baseline TC의 given/when/then은 최초 verified 이후 수정할 수 없습니다.
  변경이 필요하면: status를 "obsolete"로 마킹 + supplementary TC 생성
  불변 규칙 #1 (ISO 26262 Part 8 §7.4.3)
EOF
          return 1
        fi
      fi
    fi
  fi

  # ── Gate #5: Reentry 로그 필수 필드 검증 (§8.4.1, §8.7) ──
  local area_cycle
  area_cycle=$(jq -r --arg a "$area" '.areas[$a].cycle // 1' "$STATE" 2>/dev/null) || area_cycle=1

  if [ "$area_cycle" -gt 1 ]; then
    local reentry_entry
    reentry_entry=$(jq --arg a "$area" '
      [.log // [] | .[] | select(.area == $a and (.from == "verified" or .type == "reentry"))] | last
    ' "$STATE" 2>/dev/null) || reentry_entry="null"

    if [ "$reentry_entry" = "null" ] || [ -z "$reentry_entry" ]; then
      cat >&2 <<EOF
BLOCKED: ${area} — verified 전환 차단 (Reentry 로그 부재)
  cycle ${area_cycle}이지만 reentry 로그 항목이 없습니다.
  ISO 26262 Part 8 §8.4.1 (변경 요청), §8.7 (단계 생략 근거)
EOF
      return 1
    fi

    local log_errors=""
    local log_error_count=0

    for field in type reason affected_reqs; do
      local val
      val=$(echo "$reentry_entry" | jq -r --arg f "$field" '.[$f] // empty' 2>/dev/null)
      if [ -z "$val" ]; then
        log_errors="${log_errors}  - \"${field}\" 필드 누락\n"
        log_error_count=$((log_error_count + 1))
      fi
    done

    local skipped
    skipped=$(echo "$reentry_entry" | jq -r '
      if .skipped_phases then
        (.skipped_phases | if type == "array" then join(", ") else tostring end)
      else empty end
    ' 2>/dev/null) || skipped=""

    if [ -n "$skipped" ]; then
      local skip_reason_val
      skip_reason_val=$(echo "$reentry_entry" | jq -r '.skip_reason // empty' 2>/dev/null)
      if [ -z "$skip_reason_val" ]; then
        log_errors="${log_errors}  - \"skip_reason\" 필드 누락 (skipped_phases: ${skipped})\n"
        log_error_count=$((log_error_count + 1))
      fi
    fi

    if [ "$log_error_count" -gt 0 ]; then
      cat >&2 <<EOF
BLOCKED: ${area} — verified 전환 차단 (Reentry 로그 불완전)
  cycle ${area_cycle} reentry 로그에 ${log_error_count}개 필수 필드 누락:
$(printf "$log_errors")
  ISO 26262 Part 8 §8.4.1 (변경 요청), §8.7 (단계 생략 근거)
EOF
      return 1
    fi
  fi

  return 0
}

# ══════════════════════════════════════════════════════════════
# ── NEVER_ALLOW: 절대 수정 불가 경로 (모든 ASIL, 모든 Phase) ──
# ══════════════════════════════════════════════════════════════
NEVER_ALLOW_PATTERNS=(
  ".claude/hooks/"
  ".claude/settings.json"
  ".proofchain/config.json"
)

check_never_allow() {
  local path="$1"
  for pattern in "${NEVER_ALLOW_PATTERNS[@]}"; do
    case "$path" in
      *"$pattern"*) return 1 ;;
    esac
  done
  return 0
}

# ══════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════
# ── Bash 도구 핸들러 ──
# ══════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════
if [ "$TOOL" = "Bash" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

  # ══════════════════════════════════════════════════════════
  # ── NEVER_ALLOW check: deny-by-default for protected paths ──
  # ══════════════════════════════════════════════════════════
  if ! check_never_allow "$CMD"; then
    echo "BLOCKED: Bash 명령에서 보호 경로(.claude/hooks/, .claude/settings.json, .proofchain/config.json) 접근이 감지되었습니다." >&2
    echo "  이 경로들은 모든 ASIL 레벨, 모든 Phase에서 수정이 차단됩니다." >&2
    exit 2
  fi

  # ══════════════════════════════════════════════════════════
  # ── v2.1 NEW: V1 Defense — hitl-state.json 직접 접근 차단 ──
  # ══════════════════════════════════════════════════════════
  if echo "$CMD" | grep -qiE 'hitl-state|hitl.state|\.omc/.*state'; then
    echo "BLOCKED: 상태 파일(hitl-state.json)은 /phase 스킬로만 수정 가능합니다." >&2
    echo "  → Phase 전이: /phase advance" >&2
    echo "  → Phase 초기화: /reset" >&2
    exit 2
  fi

  # ══════════════════════════════════════════════════════════
  # ── v2.1 NEW: V2 Defense — 다단계 스크립트 공격 차단 ──
  # ══════════════════════════════════════════════════════════
  # python3 -c, perl -e, ruby -e, node -e with protected path references
  if echo "$CMD" | grep -qE '(python[23]?|perl|ruby|node|lua|php)\s+(-[ce]\s|--eval)'; then
    # Check if the inline code references protected paths
    if echo "$CMD" | grep -qiE '(\.omc|\.claude|\.proofchain|hitl.state|hmac.key)'; then
      echo "BLOCKED: 인라인 스크립트에서 보호 경로 접근이 감지되었습니다." >&2
      echo "  python3 -c, perl -e 등으로 보호 파일을 수정할 수 없습니다." >&2
      exit 2
    fi
  fi

  # ══════════════════════════════════════════════════════════
  # ── v2.1 NEW: Encoding bypass detection ──
  # ══════════════════════════════════════════════════════════
  # Detect base64/hex encoding that could hide protected paths
  if echo "$CMD" | grep -qE '(base64\s+(-d|--decode)|xxd\s+-r|printf\s+.*\\x)'; then
    if echo "$CMD" | grep -qE '(>[^&]|>>|\btee\b|\b(cp|mv)\s)'; then
      echo "BLOCKED: 인코딩된 데이터의 파일 쓰기가 감지되었습니다." >&2
      echo "  base64/hex 디코딩 후 쓰기는 보호 우회 가능성이 있습니다." >&2
      asil_phase_exit
    fi
  fi

  # ══════════════════════════════════════════════════════════
  # ── v2.1 NEW: Background process blocking ──
  # ══════════════════════════════════════════════════════════
  # Prevent spawning background processes that could modify files
  if echo "$CMD" | grep -qE '(\s&\s*$|&\s*$|\bnohup\b|\bdisown\b|\bsetsid\b)'; then
    if echo "$CMD" | grep -qiE '(\.omc|\.claude|\.proofchain|hitl.state)'; then
      echo "BLOCKED: 보호 경로를 참조하는 백그라운드 프로세스가 차단되었습니다." >&2
      exit 2
    fi
  fi

  # ══════════════════════════════════════════════════════════
  # ── .claude/ 보호 — 쓰기 연산만 차단 (v2.1: 강화된 패턴) ──
  # ══════════════════════════════════════════════════════════
  if echo "$CMD" | grep -qE '\.claude/' && \
      ! echo "$CMD" | grep -qE '^\s*git\s' && \
      echo "$CMD" | grep -qE '(sed\s.*-i|\btee\b|>[^&]|>>|\b(cp|mv|rm|mkdir|chmod|chown|install|dd|curl|wget)\b)'; then
    echo "BLOCKED: .claude/ 디렉토리 쓰기가 차단되었습니다." >&2
    echo "  HITL 훅과 스킬 설정은 보호됩니다. 읽기/VCS 명령은 허용됩니다." >&2
    exit 2
  fi

  # ── .proofchain/ 보호 (v2.1 NEW) ──
  if echo "$CMD" | grep -qE '\.proofchain/' && \
      echo "$CMD" | grep -qE '(sed\s.*-i|\btee\b|>[^&]|>>|\b(cp|mv|rm|mkdir|chmod|chown|install|dd|curl|wget)\b)'; then
    echo "BLOCKED: .proofchain/ 디렉토리 쓰기가 차단되었습니다." >&2
    echo "  ProofChain 설정은 보호됩니다." >&2
    exit 2
  fi

  # ── ~/.proofchain/ 보호 (V12 — key storage) ──
  PROOFCHAIN_HOME="$HOME/.proofchain"
  if echo "$CMD" | grep -qE "(${PROOFCHAIN_HOME}|~/\.proofchain|\\$HOME/\.proofchain)"; then
    echo "BLOCKED: ~/.proofchain/ 키 저장소 접근이 차단되었습니다." >&2
    echo "  HMAC 서명 키와 무결성 데이터는 보호됩니다." >&2
    exit 2
  fi

  # ══════════════════════════════════════════════════════════
  # ── 파괴적 git 명령 차단 ──
  # ══════════════════════════════════════════════════════════
  if echo "$CMD" | grep -qE '^\s*git\s'; then
    # git tag -d / --delete
    if echo "$CMD" | grep -qE '^\s*git\s+tag\s+(-d|--delete)\b'; then
      cat >&2 <<EOF
BLOCKED: git tag 삭제가 차단되었습니다.
  verified 태그는 Baseline TC 불변 검증(Check 4)에 필수입니다.
  ISO 26262 Part 8 §7.4.3 (형상 관리)
EOF
      exit 2
    fi

    # git checkout/restore .claude/ 파일 복원
    if echo "$CMD" | grep -qE '^\s*git\s+(checkout|restore)\b' && \
       echo "$CMD" | grep -qE '\.claude/' && \
       ! echo "$CMD" | grep -qE '^\s*git\s+checkout\s+-[bB]\b'; then
      cat >&2 <<EOF
BLOCKED: .claude/ 파일 복원이 차단되었습니다.
  git checkout/restore로 hook을 이전 버전으로 되돌릴 수 없습니다.
EOF
      exit 2
    fi

    # git reset --hard
    if echo "$CMD" | grep -qE '^\s*git\s+reset\s+--hard\b'; then
      cat >&2 <<EOF
BLOCKED: git reset --hard가 차단되었습니다.
  HITL 상태, 형상 이력, 그리고 진행 중인 작업이 파괴될 수 있습니다.
  특정 파일만 되돌리려면 git checkout -- <file>을 사용하세요.
EOF
      exit 2
    fi

    # git push --force / -f
    if echo "$CMD" | grep -qE '^\s*git\s+push\s+.*(-f|--force)\b'; then
      cat >&2 <<EOF
BLOCKED: git push --force가 차단되었습니다.
  원격 저장소의 형상 이력이 파괴될 수 있습니다.
EOF
      exit 2
    fi
  fi

  # ══════════════════════════════════════════════════════════
  # ── v2.1 NEW: V4 Defense — 간접 Git 명령 (sh -c, bash -c) ──
  # ══════════════════════════════════════════════════════════
  if echo "$CMD" | grep -qE '(sh|bash|zsh)\s+(-c\s+)'; then
    # Extract inner command from sh -c '...' or sh -c "..."
    INNER=$(echo "$CMD" | sed "s/.*-c\s*['\"]*//" | sed "s/['\"].*//")
    if echo "$INNER" | grep -qE 'git\s+(tag\s+(-d|--delete)|reset\s+--hard|push\s+(-f|--force))'; then
      echo "BLOCKED: 간접 git 명령으로 보호된 작업이 감지되었습니다." >&2
      echo "  sh -c 또는 bash -c 내부에서 파괴적 git 명령은 차단됩니다." >&2
      exit 2
    fi
    # Also check for protected path manipulation in inner command
    if echo "$INNER" | grep -qiE '(hitl-state|\.claude/|\.proofchain/|hmac.key)'; then
      echo "BLOCKED: 간접 셸에서 보호 경로 접근이 감지되었습니다." >&2
      exit 2
    fi
  fi

  # ══════════════════════════════════════════════════════════
  # ── 쓰기 연산 감지 (v2.1: 확장된 패턴) ──
  # ── V5 NOTE: Bash 핸들러에서는 명령 문자열에 readlink -f를 적용할 수 없으므로
  # ── 심볼릭 링크 해석은 Edit/Write 핸들러(line ~800)에서만 수행됩니다.
  # ── 사전 존재하는 심볼릭 링크를 통한 Bash 우회는 Layer 6(prompt hook)과
  # ── Layer 3(PostToolUse rollback)이 방어합니다. ──
  # ══════════════════════════════════════════════════════════
  IS_WRITE=false
  echo "$CMD" | grep -qE 'sed\s.*-i' && IS_WRITE=true
  echo "$CMD" | grep -qE '\btee\b' && IS_WRITE=true
  echo "$CMD" | grep -qE '(>[^&]|>>)' && IS_WRITE=true
  echo "$CMD" | grep -qE '\b(cp|mv|rm)\s' && IS_WRITE=true
  # v2.1 NEW: expanded patterns
  echo "$CMD" | grep -qE '\b(dd|install)\s' && IS_WRITE=true
  echo "$CMD" | grep -qE '\b(curl|wget)\s.*(-o|--output|>)' && IS_WRITE=true

  # ── v2.1 NEW: V5 Defense — ln -s 심볼릭 링크 생성 감지 ──
  if echo "$CMD" | grep -qE '^\s*ln\s'; then
    IS_WRITE=true
    # Check if symlink target is a protected path
    if echo "$CMD" | grep -qiE '(\.omc|\.claude|\.proofchain|hitl-state)'; then
      echo "BLOCKED: 보호 경로를 대상으로 하는 심볼릭 링크 생성이 차단되었습니다." >&2
      exit 2
    fi
  fi

  if $IS_WRITE && [ -f "$STATE" ]; then
    BASH_SRC=false; BASH_SPEC=false; BASH_TC=false; BASH_TEST=false
    echo "$CMD" | grep -qE '\bsrc/' && BASH_SRC=true
    echo "$CMD" | grep -qE '\.omc/specs/' && BASH_SPEC=true
    echo "$CMD" | grep -qE '\.omc/test-cases/' && BASH_TC=true
    echo "$CMD" | grep -qE '\btests/' && BASH_TEST=true

    if $BASH_SRC || $BASH_SPEC || $BASH_TC || $BASH_TEST; then
      # ── 관리 경로 대상: phase 검사 ──
      AREAS_JSON=$(jq '.areas // {}' "$STATE" 2>/dev/null)
      AREA_COUNT=$(echo "$AREAS_JSON" | jq 'length')
      [ "$AREA_COUNT" = "0" ] && exit 0
      BLOCKED_PATH=""

      if $BASH_SPEC; then
        CNT=$(echo "$AREAS_JSON" | jq '[to_entries[] | select(.value.phase == "spec")] | length')
        [ "$CNT" = "0" ] && BLOCKED_PATH=".omc/specs/"
      fi
      if $BASH_TC && [ -z "$BLOCKED_PATH" ]; then
        CNT=$(echo "$AREAS_JSON" | jq '[to_entries[] | select(.value.phase == "tc" or .value.phase == "code" or .value.phase == "test")] | length')
        [ "$CNT" = "0" ] && BLOCKED_PATH=".omc/test-cases/"
      fi
      if $BASH_SRC && [ -z "$BLOCKED_PATH" ]; then
        CNT=$(echo "$AREAS_JSON" | jq '[to_entries[] | select(.value.phase == "code" or .value.phase == "test")] | length')
        [ "$CNT" = "0" ] && BLOCKED_PATH="src/"
      fi
      if $BASH_TEST && [ -z "$BLOCKED_PATH" ]; then
        CNT=$(echo "$AREAS_JSON" | jq '[to_entries[] | select(.value.phase == "code" or .value.phase == "test")] | length')
        [ "$CNT" = "0" ] && BLOCKED_PATH="tests/"
      fi

      # auto-backward: src/ write in test phase
      if $BASH_SRC && [ -z "$BLOCKED_PATH" ]; then
        auto_backward ""
      fi

      if [ -n "$BLOCKED_PATH" ]; then
        echo "BLOCKED: Bash 쓰기 명령이 보호 경로(${BLOCKED_PATH})를 수정하려 합니다." >&2
        echo "활성 영역 중 해당 경로를 수정할 수 있는 phase가 없습니다." >&2
        echo "" >&2
        echo "hitl-state.json을 확인하고, 사람에게 진행 방향을 안내하세요." >&2
        echo "CLAUDE.md의 Phase 안내와 Reentry 시나리오를 참조하세요." >&2
        asil_phase_exit
      fi
    else
      # ── 관리 경로 외부: 코드 확장자 감지 ──
      if echo "$CMD" | grep -qiE "\.(${BASH_CODE_EXT})\b"; then
        CODE_FILE=$(echo "$CMD" | grep -oiE '/[^ >"'"'"']*\.('"${BASH_CODE_EXT}"')' | head -1 || true)
        if [ -n "$CODE_FILE" ]; then
          case "$CODE_FILE" in
            "$CWD"/*) ;;
            *) exit 0 ;;
          esac
        fi
        if ! echo "$CMD" | grep -qE '\.(config|setup|rc)\.(ts|js|mjs|cjs|mts)\b'; then
          AREAS_JSON=$(jq '.areas // {}' "$STATE" 2>/dev/null)
          AREA_COUNT=$(echo "$AREAS_JSON" | jq 'length')
          if [ "$AREA_COUNT" != "0" ]; then
            echo "BLOCKED: Bash 쓰기 명령이 관리 경로 외부에서 코드 파일을 수정하려 합니다." >&2
            echo "" >&2
            echo "프로덕트 코드는 src/에, 테스트 코드는 tests/에 작성하세요." >&2
            echo "ISO 26262 추적성(Part 6 §9.3)을 위해 관리 경로 내에서 작업해야 합니다." >&2
            asil_phase_exit
          fi
        fi
      fi
    fi
  fi

  exit 0
fi

# ══════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════
# ── Edit/Write 핸들러 ──
# ══════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════
# ── [IR-3] v2.2: NotebookEdit/MCP도 phase 검사 대상 ──
if [ "$TOOL" != "Edit" ] && [ "$TOOL" != "Write" ] && \
   [ "$TOOL" != "NotebookEdit" ] && [[ "$TOOL" != mcp__* ]]; then
  exit 0
fi

# ── 파일 경로 추출 (v2.2: NotebookEdit/MCP 지원) ──
case "$TOOL" in
  Edit|Write)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
    ;;
  NotebookEdit)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.notebook_path // empty')
    ;;
  mcp__*)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // .tool_input.file // .tool_input.filename // .tool_input.target // empty')
    ;;
esac
[ -z "$FILE_PATH" ] && exit 0

# ── v2.1 NEW: V5 Defense — 심볼릭 링크 해석 ──
FILE_PATH=$(readlink -f "$FILE_PATH" 2>/dev/null || \
            realpath "$FILE_PATH" 2>/dev/null || \
            echo "$FILE_PATH")

# ── 프로젝트 외부 파일은 통과 ──
case "$FILE_PATH" in
  "$CWD"/*) ;;
  *) exit 0 ;;
esac

# ── 자기 보호: .claude/ 수정 차단 (불변 — 모든 ASIL) ──
case "$FILE_PATH" in
  */.claude/*|*/.claude/)
    echo "BLOCKED: .claude/ 디렉토리는 보호됩니다." >&2
    echo "  HITL 훅과 스킬 설정을 수정할 수 없습니다." >&2
    exit 2
    ;;
esac

# ── v2.1 NEW: .proofchain/ 설정 보호 ──
case "$FILE_PATH" in
  */.proofchain/*)
    echo "BLOCKED: .proofchain/ 설정은 보호됩니다." >&2
    echo "  ProofChain 설정은 세션 외부에서만 변경할 수 있습니다." >&2
    exit 2
    ;;
esac

# ── hitl-state.json이 없으면 통과 ──
[ ! -f "$STATE" ] && exit 0

# ══════════════════════════════════════════════════════════════
# ── hitl-state.json 전환 유효성 + verified gate ──
# ══════════════════════════════════════════════════════════════
case "$FILE_PATH" in
  */.omc/hitl-state.json)
    # Write tool: 전환 유효성 검사 + verified gate
    if [ "$TOOL" = "Write" ]; then
      NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
      if [ -n "$NEW_CONTENT" ]; then
        TRANSITION_ERRORS=""
        TRANSITION_ERROR_COUNT=0

        NEW_AREAS=$(echo "$NEW_CONTENT" | jq -r '
          .areas // {} | to_entries[] | "\(.key)|\(.value.phase // "unknown")"
        ' 2>/dev/null) || NEW_AREAS=""

        while IFS='|' read -r T_AREA T_NEW_PHASE; do
          [ -z "$T_AREA" ] || [ -z "$T_NEW_PHASE" ] && continue

          T_CUR_PHASE=$(jq -r --arg a "$T_AREA" '.areas[$a].phase // "unknown"' "$STATE" 2>/dev/null) || T_CUR_PHASE="unknown"

          [ "$T_CUR_PHASE" = "$T_NEW_PHASE" ] && continue
          [ "$T_CUR_PHASE" = "unknown" ] && continue

          T_VALID=false
          ALLOWED_TRANSITIONS=" spec_tc tc_code code_test test_verified tc_spec code_spec code_tc test_spec test_tc test_code verified_spec verified_tc verified_code "
          T_KEY="${T_CUR_PHASE}_${T_NEW_PHASE}"
          case "$ALLOWED_TRANSITIONS" in
            *" ${T_KEY} "*) T_VALID=true ;;
          esac

          if ! $T_VALID; then
            TRANSITION_ERRORS="${TRANSITION_ERRORS}  - ${T_AREA}: ${T_CUR_PHASE} → ${T_NEW_PHASE} (허용되지 않는 전환)\n"
            TRANSITION_ERROR_COUNT=$((TRANSITION_ERROR_COUNT + 1))
          fi

          # Reentry: cycle 증가 검증
          if [ "$T_CUR_PHASE" = "verified" ] && $T_VALID; then
            T_CUR_CYCLE=$(jq -r --arg a "$T_AREA" '.areas[$a].cycle // 1' "$STATE" 2>/dev/null) || T_CUR_CYCLE=1
            T_NEW_CYCLE=$(echo "$NEW_CONTENT" | jq -r --arg a "$T_AREA" '.areas[$a].cycle // 1' 2>/dev/null) || T_NEW_CYCLE=1
            if [ "$T_NEW_CYCLE" -le "$T_CUR_CYCLE" ]; then
              TRANSITION_ERRORS="${TRANSITION_ERRORS}  - ${T_AREA}: reentry 시 cycle 증가 필요 (현재: ${T_CUR_CYCLE}, 새 값: ${T_NEW_CYCLE})\n"
              TRANSITION_ERROR_COUNT=$((TRANSITION_ERROR_COUNT + 1))
            fi
          fi

          # verified 전환: shell gates + TS bridge
          if [ "$T_NEW_PHASE" = "verified" ]; then
            if ! verified_gate "$T_AREA"; then
              exit 2
            fi
            if ! ts_bridge_gate_check "$T_AREA"; then
              exit 2
            fi
          fi
        done <<< "$NEW_AREAS"

        if [ "$TRANSITION_ERROR_COUNT" -gt 0 ]; then
          cat >&2 <<EOF
BLOCKED: hitl-state.json — Phase 전환 유효성 위반
  ${TRANSITION_ERROR_COUNT}개 문제:
$(printf "$TRANSITION_ERRORS")
  허용된 전환:
    Forward:  spec→tc, tc→code, code→test, test→verified
    Backward: tc→spec, code→spec, code→tc, test→spec, test→tc, test→code
    Reentry:  verified→spec/tc/code (cycle++ 필수)
  CLAUDE.md의 5-Phase 상태 머신을 참조하세요.
EOF
          exit 2
        fi
      fi
    fi

    # Edit tool: new_string에 "verified" 포함 시 검사 (V3 완전화)
    if [ "$TOOL" = "Edit" ]; then
      NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
      if echo "$NEW_STRING" | grep -q '"verified"'; then
        TEST_AREAS=$(jq -r '.areas | to_entries[] | select(.value.phase == "test") | .key' "$STATE" 2>/dev/null) || TEST_AREAS=""
        for area in $TEST_AREAS; do
          if ! verified_gate "$area"; then
            exit 2
          fi
          if ! ts_bridge_gate_check "$area"; then
            exit 2
          fi
        done
      fi

      # v2.1 NEW: Edit으로 phase를 직접 변경하는 모든 경우 검증
      if echo "$NEW_STRING" | grep -qE '"phase"\s*:\s*"'; then
        NEW_PHASE=$(echo "$NEW_STRING" | grep -oP '"phase"\s*:\s*"\K[^"]+' 2>/dev/null || true)
        if [ -n "$NEW_PHASE" ]; then
          # 모든 현재 area의 phase와 비교
          ALL_AREAS=$(jq -r '.areas | keys[]' "$STATE" 2>/dev/null) || ALL_AREAS=""
          for area in $ALL_AREAS; do
            CUR_PHASE=$(jq -r --arg a "$area" '.areas[$a].phase // "unknown"' "$STATE" 2>/dev/null) || continue
            [ "$CUR_PHASE" = "$NEW_PHASE" ] && continue

            T_VALID=false
            ALLOWED_TRANSITIONS=" spec_tc tc_code code_test test_verified tc_spec code_spec code_tc test_spec test_tc test_code verified_spec verified_tc verified_code "
            T_KEY="${CUR_PHASE}_${NEW_PHASE}"
            case "$ALLOWED_TRANSITIONS" in
              *" ${T_KEY} "*) T_VALID=true ;;
            esac

            if ! $T_VALID; then
              echo "BLOCKED: Edit으로 hitl-state.json의 phase를 직접 변경할 수 없습니다." >&2
              echo "  ${area}: ${CUR_PHASE} → ${NEW_PHASE} (허용되지 않는 전환)" >&2
              echo "  → Phase 전이는 /phase advance 스킬을 사용하세요." >&2
              exit 2
            fi
          done
        fi
      fi
    fi

    exit 0
    ;;
esac

# ── 보호 대상 판별 ──
IS_SRC=false
IS_SPEC=false
IS_TC=false
IS_TEST=false

case "$FILE_PATH" in
  */.omc/specs/*)      IS_SPEC=true ;;
  */.omc/test-cases/*) IS_TC=true ;;
  */.omc/*)            exit 0 ;;
  */src/*)             IS_SRC=true ;;
  */tests/*)           IS_TEST=true ;;
  *)
    # ── 관리 경로 외부 코드 확장자 검사 ──
    EXT="${FILE_PATH##*.}"
    EXT_LOWER=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')
    case "$EXT_LOWER" in
      ts|tsx|js|jsx|mjs|cjs|mts|cts|py|pyx|pyi|rs|go|c|h|cpp|hpp|cc|hh|cxx|hxx|cs|java|kt|kts|scala|groovy|gvy|swift|dart|rb|php|pl|pm|lua|ps1|sh|bash|zsh|fish|ex|exs|erl|hrl|hs|lhs|ml|mli|clj|cljs|cljc|fs|fsx|elm|re|rei|zig|nim|cr|jl|v|r|sol|move|cairo|vue|svelte|astro|css|scss|sass|less|styl|html|htm|pug|ejs|hbs|njk|sql|graphql|gql|wasm|wat)
        BASENAME=$(basename "$FILE_PATH")
        case "$BASENAME" in
          *.config.*|*.setup.*|.?*rc|.?*rc.*) exit 0 ;;
        esac

        AREAS_JSON=$(jq '.areas // {}' "$STATE" 2>/dev/null)
        AREA_COUNT=$(echo "$AREAS_JSON" | jq 'length')
        [ "$AREA_COUNT" = "0" ] && exit 0

        cat >&2 <<EOF
BLOCKED: 코드 파일이 관리 경로(src/, tests/) 외부에 있습니다.
파일: $FILE_PATH

프로덕트 코드는 src/에, 테스트 코드는 tests/에 작성하세요.
ISO 26262 추적성(Part 6 §9.3)을 위해 관리 경로 내에서 작업해야 합니다.

이 파일이 설정 파일이라면, 허용되는 네이밍 패턴:
  *.config.* | *.setup.* | .*rc | .*rc.*
EOF
        asil_phase_exit
        ;;
      *)
        exit 0 ;;
    esac
    ;;
esac

# ══════════════════════════════════════════════════════════════
# ── 영역 phase 수집 ──
# ══════════════════════════════════════════════════════════════
AREAS_JSON=$(jq '.areas // {}' "$STATE" 2>/dev/null)
AREA_COUNT=$(echo "$AREAS_JSON" | jq 'length')
[ "$AREA_COUNT" = "0" ] && exit 0

# ── 파일이 속한 영역 찾기 ──
TARGET_AREAS=""

if $IS_SPEC; then
  TARGET_AREAS=$(jq -r --arg fp "$FILE_PATH" '
    .areas | to_entries[] | select(.value.spec.file) |
    .value.spec.file as $sf | select($fp | endswith($sf)) |
    .key' "$STATE" 2>/dev/null)
fi

if $IS_TC; then
  TARGET_AREAS=$(jq -r --arg fp "$FILE_PATH" '
    .areas | to_entries[] | select(.value.tc.file) |
    .value.tc.file as $tf | select($fp | endswith($tf)) |
    .key' "$STATE" 2>/dev/null)
fi

if $IS_SRC; then
  TARGET_AREAS=$(jq -r --arg fp "$FILE_PATH" '
    .areas | to_entries[] |
    select(.value.code.files) |
    select([.value.code.files[] | . as $cf | select($fp | endswith($cf))] | length > 0) |
    .key' "$STATE" 2>/dev/null)
fi

if $IS_TEST; then
  TARGET_AREAS=$(echo "$FILE_PATH" | grep -oE 'tests/[^/]+/([A-Z]{2})' | grep -oE '[A-Z]{2}$' || true)
fi

if [ -z "$TARGET_AREAS" ]; then
  ACTIVE=$(echo "$AREAS_JSON" | jq '[to_entries[] | select(
    .value.phase == "spec" or
    .value.phase == "tc" or
    .value.phase == "code" or
    .value.phase == "test"
  )] | length')
  if [ "$ACTIVE" -gt 0 ]; then
    if $IS_SRC; then
      auto_backward ""
    fi
    exit 0
  fi
  cat >&2 <<EOF
BLOCKED: 이 파일은 어떤 영역에도 매핑되지 않았고, 활성 영역이 없습니다.

가능한 행동:
  → 기존 영역의 reentry 시작 (사람에게 시나리오 A/B/C 확인)
  → 새 영역 등록 (hitl-state.json에 area 추가, phase: "spec")

사람에게 이 파일이 어떤 영역에 속하는지 확인하세요.
EOF
  asil_phase_exit
fi

# ══════════════════════════════════════════════════════════════
# ── 모든 매칭 영역의 phase를 검사 ──
# ══════════════════════════════════════════════════════════════
BLOCKED_AREA=""
BLOCKED_PHASE=""
BLOCKED_CYCLE=""

for AREA in $TARGET_AREAS; do
  PHASE=$(echo "$AREAS_JSON" | jq -r --arg area "$AREA" '.[$area].phase // "unknown"')

  AREA_ALLOWED=false

  if $IS_SPEC; then
    [ "$PHASE" = "spec" ] && AREA_ALLOWED=true
  fi

  if $IS_TC; then
    case "$PHASE" in
      tc|code|test) AREA_ALLOWED=true ;;
    esac
  fi

  if $IS_SRC; then
    case "$PHASE" in
      code|test) AREA_ALLOWED=true ;;
    esac
  fi

  if $IS_TEST; then
    case "$PHASE" in
      code|test) AREA_ALLOWED=true ;;
    esac
  fi

  if ! $AREA_ALLOWED; then
    BLOCKED_AREA="$AREA"
    BLOCKED_PHASE="$PHASE"
    BLOCKED_CYCLE=$(echo "$AREAS_JSON" | jq -r --arg area "$AREA" '.[$area].cycle // 1')
    break
  fi
done

if [ -z "$BLOCKED_AREA" ]; then
  # auto-backward: mapped src/ + test phase
  if $IS_SRC; then
    auto_backward "$TARGET_AREAS"
  fi

  # TS Bridge Tier 1 (ASIL A+ && C/C++)
  if $IS_SRC && [ -n "$FILE_PATH" ]; then
    if ! ts_bridge_tier1 "$FILE_PATH"; then
      exit 2
    fi
  fi

  exit 0
fi

# ══════════════════════════════════════════════════════════════
# ── 차단: 상태 머신 기반 피드백 ──
# ══════════════════════════════════════════════════════════════
AREA_NAME=$(echo "$AREAS_JSON" | jq -r --arg area "$BLOCKED_AREA" '.[$area].name // $area')

TRIED_PATH=""
$IS_SRC && TRIED_PATH="src/"
$IS_SPEC && TRIED_PATH=".omc/specs/"
$IS_TC && TRIED_PATH=".omc/test-cases/"
$IS_TEST && TRIED_PATH="tests/"

NEEDED_PHASES=""
$IS_SRC && NEEDED_PHASES="code 또는 test"
$IS_SPEC && NEEDED_PHASES="spec"
$IS_TC && NEEDED_PHASES="tc, code, 또는 test"
$IS_TEST && NEEDED_PHASES="code 또는 test"

if [ "$BLOCKED_PHASE" = "verified" ]; then
  cat >&2 <<EOF
BLOCKED: ${BLOCKED_AREA}(${AREA_NAME}) — verified [cycle ${BLOCKED_CYCLE}]
${TRIED_PATH} 수정은 ${NEEDED_PHASES} 단계에서 가능합니다.

사람에게 reentry 시나리오를 확인하세요:
  A. SPEC 변경 필요  → spec  (cycle++) → /ears-spec
  B. 코드 버그       → tc    (cycle++) → /test-gen-design
  C. 테스트 코드 오류 → code  (cycle++) → /test-gen-code

reentry 시 hitl-state.json 변경:
  phase → 진입 phase, cycle → $((BLOCKED_CYCLE + 1)),
  cycle_entry, cycle_reason, log 기록 필수
EOF
  exit 2
else
  cat >&2 <<EOF
BLOCKED: ${BLOCKED_AREA}(${AREA_NAME}) — ${BLOCKED_PHASE} [cycle ${BLOCKED_CYCLE}]
${TRIED_PATH} 수정은 ${NEEDED_PHASES} 단계에서 가능합니다.

EOF
  print_transitions "$BLOCKED_PHASE"

  AREA_WORD_COUNT=$(echo "$TARGET_AREAS" | wc -w | tr -d ' ')
  if [ "$AREA_WORD_COUNT" -gt 1 ]; then
    cat >&2 <<EOF

주의: 이 파일은 여러 영역에 매핑되어 있습니다: $TARGET_AREAS
차단 원인: ${BLOCKED_AREA}(${BLOCKED_PHASE})
→ 이 영역도 해당 경로를 수정할 수 있는 phase로 전환해야 합니다.
EOF
  fi

  echo "" >&2
  echo "사람에게 진행 방향을 확인하세요." >&2
fi

asil_phase_exit
