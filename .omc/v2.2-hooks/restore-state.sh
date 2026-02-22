#!/bin/bash
# ProofChain v2.2 — SessionStart: State Restore + Security Rules Injection
# Displays HITL status, ASIL badge, and injects security rules into context
# v2.2: Uses proofchain-hmac-lib.sh for HMAC/hash verification

set -euo pipefail
trap 'exit 0' ERR  # SessionStart should not block session

CWD=$(pwd)
STATE="$CWD/.omc/hitl-state.json"

# ── Source HMAC library ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/proofchain-hmac-lib.sh"
proofchain_hmac_vars
proofchain_protected_files "$CWD"

# ── 브랜치 확인 — main에서 개발 방지 ──
BRANCH=$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  PROJECT_CODE=""
  if [ -f "$STATE" ]; then
    PROJECT_CODE=$(jq -r '.project.code // ""' "$STATE" 2>/dev/null) || PROJECT_CODE=""
  fi
  if [ -z "$PROJECT_CODE" ]; then
    echo ""
    echo "⚠ 현재 main 브랜치입니다. 프로젝트 개발은 별도 브랜치에서 진행하세요."
    echo "  → git checkout -b project/<name>"
    echo ""
  fi
fi

# ── ASIL 뱃지 표시 ──
PC_CONFIG="$CWD/.proofchain/config.json"
ASIL_LEVEL="QM"
if [ -f "$PC_CONFIG" ]; then
  ASIL_LEVEL=$(jq -r '.asil_level // "QM"' "$PC_CONFIG" 2>/dev/null) || ASIL_LEVEL="QM"
fi

echo ""
echo "════════════════════════════════════════════"
echo "[ASIL-${ASIL_LEVEL}] ProofChain SafeDev v2.2"
echo "════════════════════════════════════════════"

# ── v2.2: 4+1 Layer Defense Status ──
echo "Defense Layers: L1(Router) L2(Deterministic) L3(Integrity) L4(Semantic) +1(Automation)"

# ── HMAC 무결성 검증 (via shared library) ──
if [ -f "$HMAC_KEY_FILE" ]; then
  HMAC_ISSUES=0

  HMAC_CHECK_FILES=(
    ".omc/hitl-state.json"
    ".proofchain/config.json"
  )

  for f in "${HMAC_CHECK_FILES[@]}"; do
    FULL="$CWD/$f"
    [ -f "$FULL" ] || continue

    if ! proofchain_verify_hmac "$f" "$CWD"; then
      HMAC_ISSUES=$((HMAC_ISSUES + 1))
      echo "⚠ HMAC MISMATCH: $f — 파일이 서명 경로 외부에서 수정되었을 수 있습니다."
    fi
  done

  if [ "$HMAC_ISSUES" -eq 0 ]; then
    echo "HMAC Integrity: ✓ All signatures valid"
  else
    echo "HMAC Integrity: ✗ ${HMAC_ISSUES} file(s) with signature mismatch"
  fi
else
  echo "HMAC Integrity: (not initialized — restart session to initialize)"
fi

# ── SHA-256 해시 무결성 검증 (via shared library) ──
if [ -d "$INTEGRITY_DIR" ]; then
  HASH_ISSUES=0

  for f in "${PROOFCHAIN_CRITICAL_PROTECTED[@]}"; do
    [ -f "$f" ] || continue

    if ! proofchain_verify_hash "$f"; then
      HASH_ISSUES=$((HASH_ISSUES + 1))
      BASENAME=$(basename "$f")
      echo "⚠ HASH MISMATCH: $f — 훅 파일이 변조되었을 수 있습니다."

      # Auto-restore from backup
      if proofchain_rollback_file "$f"; then
        echo "  → 백업에서 자동 복원되었습니다."
      fi
    fi
  done

  if [ "$HASH_ISSUES" -eq 0 ]; then
    echo "Hook Integrity: ✓ All hashes valid"
  fi
fi

echo ""

# ── HITL 상태 없으면 여기서 종료 ──
[ ! -f "$STATE" ] && exit 0

# ── 각 영역의 상태를 요약 ──
echo "=== HITL 현황 ==="
jq -r '
  .areas | to_entries[] |
  "\(.key) (\(.value.name_ko // .value.name // .key)): \(.value.phase) [cycle \(.value.cycle // 1)]"
' "$STATE" 2>/dev/null

# cycle > 1인 활성 영역 (reentry 진행 중)
REENTRY=$(jq -r '
  .areas | to_entries[]
  | select(.value.phase != "verified" and (.value.cycle // 1) > 1)
  | "\(.key): \(.value.phase) [cycle \(.value.cycle)] — \(.value.cycle_reason // "N/A")"
' "$STATE" 2>/dev/null)

if [ -n "$REENTRY" ]; then
  echo ""
  echo "=== Reentry 진행 중 ==="
  echo "$REENTRY"
fi

# cycle 1 활성 영역 (초기 개발 진행 중)
INITIAL=$(jq -r '
  .areas | to_entries[]
  | select(.value.phase != "verified" and (.value.cycle // 1) == 1)
  | "\(.key): \(.value.phase)"
' "$STATE" 2>/dev/null)

if [ -n "$INITIAL" ]; then
  echo ""
  echo "=== 초기 개발 진행 중 ==="
  echo "$INITIAL"
fi

# ── v2.2: Security Rules Injection (stderr로 컨텍스트 주입) ──
cat >&2 <<'SECURITY_RULES'

[ProofChain v2.2 Security Rules — 이 규칙은 모든 도구 호출에 적용됩니다]

1. 상태 파일(.omc/hitl-state.json)은 /phase 스킬로만 수정 가능
2. .claude/ 디렉토리의 모든 파일은 수정 불가 (훅, 설정, 스킬)
3. .proofchain/ 설정은 세션 외부에서만 변경 가능
4. ~/.proofchain/ 키 저장소는 읽기/쓰기 모두 차단
5. 파괴적 git 명령 (tag -d, reset --hard, push --force) 차단
6. Phase별 허용 파일: spec→specs/, tc/code/test→tc/, code/test→src/tests/
7. verified 전이에는 추적성 전수 검사 통과 필요
8. 모든 도구 호출은 감사 로그에 기록됨

SECURITY_RULES

exit 0
