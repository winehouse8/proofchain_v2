# /verify — 검증 실행

현재 영역의 검증을 실행합니다.

## 기능

### 커버리지 분석
```bash
# 테스트 실행 + 커버리지 수집
npm run test:coverage

# 커버리지 보고서 파싱 → ProofChain 엔진에 전달
node dist/bridge/cli-entry.js tier2 < coverage-event.json
```

### MISRA 분석
C/C++ 파일에 대해 MISRA C:2012 규칙 엔진을 실행합니다.
- 14개 내장 규칙 (goto, malloc, implicit_int 등)
- ASIL별 필터링: QM은 off, A+에서 활성화

### 추적성 검증
- REQ → TC → Test 연결 완전성 확인
- 고아 산출물(orphan) 탐지
- 추적성 갭(gap) 보고

### Staleness 검사
- 의존성 그래프 기반 BFS staleness 전파
- 인터페이스 변경 = 전이적 전파
- 구현 변경 = 직접 의존만

## 출력

검증 결과를 구조화된 보고서로 출력합니다:

```
=== 검증 보고서 ===
영역: XX (컴포넌트명)
ASIL: B

커버리지: stmt=82.3% branch=71.5% mcdc=63.0%
  [PASS] stmt >= 80% ✓
  [PASS] branch >= 70% ✓
  [PASS] mcdc >= 60% ✓

MISRA: 0건 위반
  [PASS] ✓

추적성: 0건 갭
  [PASS] REQ→TC 매핑 완전 ✓
  [PASS] TC→Test 매핑 완전 ✓

Staleness: 0건 stale
  [PASS] ✓
```
