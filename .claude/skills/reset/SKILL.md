# /reset — 프로세스 상태 초기화

프로젝트의 HITL 상태를 초기화합니다.

## ASIL 게이트 (A8 방어)

**ASIL B 이상에서는 반드시 사람의 확인을 받아야 합니다.**

초기화 전:
1. 현재 ASIL 레벨을 `.proofchain/config.json`에서 확인
2. ASIL B 이상이면 `AskUserQuestion`으로 사람에게 확인:
   - "프로세스 상태를 초기화하면 모든 진행 상황이 초기화됩니다."
   - "이 작업은 되돌릴 수 없습니다. 정말 초기화하시겠습니까?"
   - 선택지: "예, 초기화합니다" / "아니오, 취소합니다"
3. ASIL QM/A에서는 경고 출력 후 바로 초기화

## 초기화 대상

- `.omc/hitl-state.json` → 빈 상태 템플릿으로 교체
- `.omc/change-log.jsonl` → 삭제
- `.omc/.phase-snapshot.json` → 삭제
- git tag 중 `*-verified-*` 패턴 → **삭제하지 않음** (감사 추적 보존)

## 초기화 절차

```bash
# 1. ASIL 확인
ASIL=$(jq -r '.asil_level // "QM"' .proofchain/config.json 2>/dev/null || echo "QM")

# 2. ASIL B+ 인간 확인 (AskUserQuestion 사용)
# ... (스킬 실행 시 자동 처리)

# 3. 상태 초기화
cat > .omc/hitl-state.json << 'EOF'
{
  "project": { "code": "", "frameworks": {}, "paths": {} },
  "areas": {},
  "log": []
}
EOF

# 4. 보조 파일 삭제
rm -f .omc/change-log.jsonl
rm -f .omc/.phase-snapshot.json

# 5. 결과 보고
echo "프로세스 상태가 초기화되었습니다."
echo "git tag는 보존됩니다 (감사 추적)."
echo "새 프로젝트를 시작하려면 hitl-state.json에 영역을 추가하세요."
```

## 보존 항목

- `.proofchain/config.json` — ASIL 설정 유지
- `proofchain.db` — 검증 데이터 유지
- git tags — 감사 추적 보존
- `.omc/specs/`, `.omc/test-cases/` — 산출물 보존 (git에 이미 커밋됨)
- `.claude/` — 훅/스킬 설정 보존

## ISO 26262 근거

ISO 26262 Part 8 §7.4.3: 형상 관리 대상 항목의 변경은 영향 분석과 승인이 필요합니다.
ASIL B 이상에서 인간 확인을 필수로 함으로써, 실수로 인한 상태 초기화를 방지합니다.
