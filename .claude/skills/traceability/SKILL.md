---
name: traceability
description: "Generate a bidirectional traceability matrix (REQ ↔ TC ↔ Test Code) for one or all areas. Use when user says 추적성, traceability, 매트릭스, /traceability. Scans SPECs, TC JSONs, and test files to produce coverage and gap analysis. No phase transition — informational output only."
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Write, Edit
argument-hint: "[area code or 'all']"
---

# Traceability Matrix Generator

REQ ↔ TC ↔ Test Code 양방향 추적성 매트릭스를 자동 생성한다.

## Purpose

- SPEC 요구사항이 TC로 커버되는지 확인
- TC가 실행 가능한 테스트 코드로 구현되었는지 확인
- 커버리지 갭을 식별하여 사람에게 보고

## Input

`$ARGUMENTS`로 area code를 받는다:
- 특정 영역: `CP`, `WR`, `SE` 등
- 전체: `all`

## Workflow

### 1. State Loading

1. Read `.omc/hitl-state.json`
2. `$ARGUMENTS`가 `all`이면 모든 영역을, 아니면 지정된 영역만 처리
3. 각 영역에서 SPEC 파일, TC JSON 파일, 테스트 디렉토리 경로 확인

### 2. Data Collection

각 영역에 대해:

#### 2a. SPEC에서 REQ 추출
- `.omc/specs/SPEC-{project}-{area}.md`를 읽는다
- `REQ-{area}-{NNN}` 패턴으로 모든 REQ ID를 추출
- 각 REQ의 제목과 EARS 패턴을 기록

#### 2b. TC JSON에서 TC 추출
- `.omc/test-cases/TC-{area}.json`을 읽는다
- `baseline_tcs`와 `supplementary_tcs`(있으면)에서 모든 TC를 추출
- 각 TC의 `tc_id`, `req_id`, `origin`, `type`, `level` 기록

#### 2c. Test Code에서 추적성 주석 스캔
- `tests/` 하위에서 해당 영역의 테스트 파일을 찾는다
- 각 테스트 파일에서 `@tc` 및 `@req` 주석을 스캔:
  ```
  // @tc TC-GP-001a
  // @req REQ-GP-001
  ```
- 테스트 함수명과 파일 경로를 기록

### 3. Matrix Generation

3개 매트릭스를 생성한다:

#### Matrix 1: REQ → TC Coverage

| REQ ID | REQ Title | Positive | Negative | Boundary | Error | TC Count |
|--------|-----------|----------|----------|----------|-------|----------|
| REQ-GP-001 | 게이트 추가 | TC-GP-001a | TC-GP-001b | TC-GP-001c | — | 3 |
| REQ-GP-002 | ... | ... | ... | ... | ... | ... |

**커버리지 지표**: `{covered REQs}/{total REQs}` (100% = 모든 REQ에 최소 1개 positive TC)

#### Matrix 2: TC → Test Code Mapping

| TC ID | Origin | Level | Test File | Test Function | Status |
|-------|--------|-------|-----------|---------------|--------|
| TC-GP-001a | baseline | unit | tests/unit/CP/gate.test.ts | "adds gate on drop" | Implemented |
| TC-GP-001b | baseline | component | — | — | **Missing** |

**구현 지표**: `{implemented TCs}/{total TCs}`

#### Matrix 3: Gap Analysis

누락된 항목을 식별:

```
=== Gap Analysis ===

REQs without any TC:
  (none)  ← 또는 목록

TCs without test code:
  TC-GP-001b (negative, component) — test code missing
  TC-GP-003a (positive, e2e) — test code missing

Orphaned test code (no matching TC):
  tests/unit/CP/legacy.test.ts — @tc annotation not found

Recommendations:
  - 2 TCs need test code implementation
  - 1 test file has no traceability annotation
```

### 4. Output

`.omc/traceability/TRACE-{project}-{area}.md` (또는 `TRACE-{project}-ALL.md`)에 저장:

```markdown
# Traceability Matrix: {Area Name}

> Generated: YYYY-MM-DD HH:MM
> SPEC: SPEC-{project}-{area}
> TC: TC-{area}.json

## 1. REQ → TC Coverage
{Matrix 1}

## 2. TC → Test Code Mapping
{Matrix 2}

## 3. Gap Analysis
{Matrix 3}

## 4. Summary
- Total REQs: N
- Total TCs: M (baseline: B, supplementary: S)
- Test Code Coverage: P/M (XX%)
- Gaps: G items require attention
```

### 5. Console Summary

```
=== Traceability Report ===
Area: GP (게이트 팔레트)
REQ Coverage: 8/8 (100%)
TC→Code Coverage: 22/24 (91.7%)
Gaps: 2 TCs missing test code
Output: .omc/traceability/TRACE-{code}-GP.md
```

## Phase Transition

**없음**. 이 스킬은 정보성 산출물만 생성한다. phase를 변경하지 않는다.

단, `hitl-state.json`의 `log`에 실행 기록을 남긴다:
```json
{ "timestamp": "...", "area": "GP", "from": null, "to": null, "actor": "agent", "note": "Traceability matrix generated" }
```

## Quality Checklist

- [ ] 모든 REQ ID가 SPEC 파일에 실제 존재하는지 확인
- [ ] 모든 TC ID가 TC JSON에 실제 존재하는지 확인
- [ ] Orphaned 테스트 코드 (TC와 연결 안 된 테스트) 식별
- [ ] Gap이 있으면 명확하게 표시
- [ ] `all` 모드에서 영역 간 크로스 참조 누락 없는지 확인
