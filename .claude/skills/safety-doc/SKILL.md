# /safety-doc — 안전 문서 생성

ISO 26262 준수를 위한 안전 관련 문서를 생성합니다.

## 문서 유형

### Safety Case Report
프로젝트의 안전 논거(safety argument)를 종합합니다:
- ASIL 분류 근거
- 요구사항 커버리지
- 검증 완전성
- 잔여 리스크

### Verification Summary
검증 활동의 요약 보고서:
- 테스트 커버리지 (statement, branch, MC/DC)
- MISRA 준수 현황
- 추적성 매트릭스 완전성
- 검증 부채 현황

### Phase Mapping Justification
HITL 5-Phase → V-Model 9-Phase 매핑의 정당화 문서:
- 각 매핑의 ISO 26262 근거
- 암묵적으로 처리되는 단계 설명
- 감사 대응 참고 자료

## 사용법

```
/safety-doc case      — Safety Case Report 생성
/safety-doc verify    — Verification Summary 생성
/safety-doc mapping   — Phase Mapping Justification 생성
/safety-doc all       — 전체 문서 생성
```

## 출력 위치

생성된 문서는 `docs/safety/` 디렉토리에 저장됩니다.
