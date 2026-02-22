#!/bin/bash
# HITL Checkpoint — PreCompact Hook
# 컨텍스트 압축 직전에 현재 작업 상태 요약 저장
# 5-Phase Model: spec, tc, code, test, verified

CWD=$(pwd)
STATE="$CWD/.omc/hitl-state.json"

[ ! -f "$STATE" ] && exit 0

# 활성 영역이 있는지 확인
ACTIVE_AREA=$(jq -r '
  .areas | to_entries[]
  | select(.value.phase != "verified" and .value.phase != null)
  | .key' "$STATE" 2>/dev/null | head -1)

[ -z "$ACTIVE_AREA" ] && exit 0

PHASE=$(jq -r --arg a "$ACTIVE_AREA" '.areas[$a].phase' "$STATE")
AREA_NAME=$(jq -r --arg a "$ACTIVE_AREA" '.areas[$a].name_ko // .areas[$a].name // $a' "$STATE")
CYCLE=$(jq -r --arg a "$ACTIVE_AREA" '.areas[$a].cycle // 1' "$STATE")

echo "=== HITL CHECKPOINT ==="
echo "활성 영역: $ACTIVE_AREA ($AREA_NAME)"
echo "현재 Phase: $PHASE [cycle $CYCLE]"

# cycle > 1이면 reentry 정보 표시
if [ "$CYCLE" -gt 1 ]; then
  ENTRY=$(jq -r --arg a "$ACTIVE_AREA" '.areas[$a].cycle_entry // "N/A"' "$STATE")
  REASON=$(jq -r --arg a "$ACTIVE_AREA" '.areas[$a].cycle_reason // "N/A"' "$STATE")
  echo "Reentry: $ENTRY — $REASON"
fi

# phase별 다음 행동 안내
case "$PHASE" in
  spec)  echo "다음: SPEC 확정 → 사람 승인 → tc" ;;
  tc)    echo "다음: TC 리뷰 → 사람 승인 → code" ;;
  code)  echo "다음: 테스트 (/test-gen-code) → test" ;;
  test)  echo "다음: 사람 최종 검증 → verified" ;;
esac

# 전체 영역 현황도 함께 출력
echo ""
echo "=== 전체 영역 현황 ==="
jq -r '
  .areas | to_entries[] |
  "\(.key) (\(.value.name_ko // .value.name // .key)): \(.value.phase) [cycle \(.value.cycle // 1)]"
' "$STATE" 2>/dev/null

exit 0
