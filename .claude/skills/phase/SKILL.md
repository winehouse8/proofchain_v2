# /phase — Phase 전환 및 Gate Check

HITL 5-Phase 상태 머신의 phase 전환을 관리합니다.

## 명령어

### `/phase status`
현재 모든 영역의 phase 상태를 보고합니다.

```bash
jq -r '.areas | to_entries[] | "\(.key) (\(.value.name // .key)): \(.value.phase) [cycle \(.value.cycle // 1)]"' .omc/hitl-state.json
```

### `/phase forward <area>`
현재 phase에서 다음 phase로 전환합니다.
- Forward 전환은 사람의 승인이 필요합니다.
- `test → verified` 전환 시 Gate Check를 실행합니다.

### `/phase backward <area> <target_phase>`
같은 cycle 내에서 이전 phase로 되돌립니다.
- cycle은 변경되지 않습니다.

### `/phase reentry <area> <target_phase>`
`verified` 상태에서 재진입합니다.
- cycle이 증가합니다.
- log에 type, reason, affected_reqs 필수 기록.
- 건너뛰는 phase가 있으면 skipped_phases, skip_reason 필수.

### `/phase gate-check <area>`
verified 전환을 위한 Gate Check를 실행합니다.
- Shell Gate #1-#7 (jq, grep, git)
- TS Gate #8-#14 (ASIL별 활성화):
  ```bash
  printf '{"area":"<area>"}' | node dist/bridge/cli-entry.js gate-check
  ```

## 허용된 전환

```
Forward:  spec→tc, tc→code, code→test, test→verified
Backward: tc→spec, code→{spec,tc}, test→{spec,tc,code}
Reentry:  verified→{spec,tc,code} (cycle++ 필수)
```

## Gate Check 목록 (ASIL별)

| # | 검사 | ASIL 최소 |
|---|-----|----------|
| 1 | Active TC 존재 | QM |
| 2 | @tc 주석 커버리지 | QM |
| 3 | @req 주석 커버리지 | QM |
| 4 | 전환 유효성 | QM |
| 5 | Supplementary TC 스키마 | A |
| 6 | Baseline TC 불변성 | A |
| 7 | Reentry 로그 완전성 | A |
| 8 | MISRA 위반 0건 | A |
| 9 | 커버리지 임계값 | B |
| 10 | stale 산출물 0건 | B |
| 11 | 추적성 갭 0건 | C |
| 12 | 독립 검토 완료 | C |
| 13 | 검증 부채 = 0 | D |
| 14 | 이중 검토 합의 | D |
