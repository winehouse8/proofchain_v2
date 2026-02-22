---
name: test-gen-code
description: "Generate executable test code from TC JSON specifications and source code, then run tests with iterative fix loop. Use when an area's phase is code or test in .omc/hitl-state.json and source code exists in src/. When cycle > 1, operates in amendment mode with full regression testing. Triggers: when user says 테스트 코드 생성, test code, 테스트 실행, run tests, or /test-gen-code. Input: area code (e.g., CP, CV, WR, SE, ED)."
---

# Test Code Generation + Execution

TC JSON 명세(given/when/then) + 소스코드 → 실행 가능한 테스트 코드 생성 → 실행 → 실패 시 반복.

## Principles

- **TC는 "무엇을", 코드는 "어떻게"**: TC의 given/when/then을 충실히 번역하되, 구체적인 import/셀렉터/API는 소스코드를 분석하여 결정
- **Baseline TC 내용 불변**: Baseline TC(`origin: "baseline"`)의 내용(given/when/then)은 절대 수정하지 않음. `status: "obsolete"` TC는 테스트 실행에서 제외
- **추적성**: 모든 테스트 함수에 TC ID와 REQ ID를 주석으로 포함
- **최소 수정**: 실패 시 원인에 맞는 최소한의 수정만 수행

## Workflow

### Phase 0: State Verification

1. Read `.omc/hitl-state.json`
2. Find the area from `$ARGUMENTS` (e.g., `CP`)
3. Verify phase is `code` or `test`. If `cycle > 1`, follow **Amendment Test Mode** (see section below). Any other phase → STOP and inform the user.
4. Read `project.paths` for test output directories
5. Read `project.frameworks` for framework info

### Phase 1: Context Loading

1. Read the TC JSON file (`areas[area].tc.file`)
2. Read the SPEC file (`areas[area].spec.file`)
3. Read System Context (`project.system_context`)
4. Analyze `src/` to build an understanding of:
   - Module structure (files, exports, class/function names)
   - For UI components: `data-testid` attributes, component props
   - For logic modules: function signatures, types

### Phase 2: Test Code Generation

Group TCs by `level` and generate test files per group:

| Level | Framework | Output Path | Runner |
|-------|-----------|-------------|--------|
| `unit` | Vitest | `tests/unit/{area}/` | `NO_COLOR=1 npx vitest run` |
| `component` | Vitest + Testing Library | `tests/component/{area}/` | `NO_COLOR=1 npx vitest run` |
| `e2e` | Playwright | `tests/e2e/{area}/` | `npx playwright test` |
| `visual` | Playwright screenshot | `tests/visual/{area}/` | `npx playwright test` |

**Generation rules:**

For each TC, write test code following this structure:

```typescript
// @tc {tc_id}
// @req {req_id}
// @origin {origin}
describe('{SPEC area}: {REQ title} [{req_id}]', () => {
  it('{tc title}', () => {
    // GIVEN: {tc.given}
    // ... setup code derived from src/ analysis

    // WHEN: {tc.when}
    // ... action code

    // THEN: {tc.then}
    // ... assertion code
  });
});
```

**Level-specific notes:**

- **unit**: Import modules directly. No browser, no DOM. Use `describe.each` / `it.each` for truth-table style TCs.
- **component**: Use `@testing-library/react` + `userEvent`. Query by role/label first, `data-testid` as fallback.
- **e2e**: Use Playwright `test`/`expect`. For canvas interactions (drag-and-drop, port connections), use coordinate-based `page.mouse` actions derived from element `boundingBox()`. Create shared fixture helpers for repeated operations (place gate, connect wire, toggle input).
- **visual**: Use `toHaveScreenshot()` with `{ animations: 'disabled', maxDiffPixelRatio: 0.01 }`.

**CRITICAL — `NO_COLOR=1`**: Always prefix Vitest commands with `NO_COLOR=1` to prevent ANSI color parsing crashes in Claude Code.

### Phase 3: Test Execution + Fix Loop

Execute tests level by level. Unit/component first, then E2E/visual:

```
FOR EACH level in [unit, component, e2e, visual]:
  IF no TCs at this level: SKIP

  RUN tests
  WHILE failures exist AND retries < 5 per TC:
    FOR EACH failing test:
      1. Classify failure (see references/failure-classification.md)
      2. IF SPEC_ISSUE: STOP, report to user
      3. IF CODE_BUG: fix src/, increment retry for linked TC
      4. IF TEST_BUG: fix tests/, increment retry for linked TC
    RUN tests again (target only failing files for efficiency)

  IF any TC reached 5 retries: STOP, report to user
```

**Efficiency:**
- First run: full suite for the level (`NO_COLOR=1 npx vitest run tests/unit/{area}/`)
- Subsequent runs: target only failing files
- Use `--reporter=verbose` for failing runs, `--reporter=dot` for passing verification

### Phase 4: Supplementary TCs

During the fix loop, if you discover untested edge cases:

1. Add to the TC JSON file with `"origin": "supplementary"` and `"added_reason": "..."`
2. Link to an existing `req_id`
3. Generate and run the additional test
4. **Never modify or delete baseline TCs**

### Phase 5: State Update

After all tests pass (or after escalation):

1. Update `.omc/hitl-state.json`:
   - Set `areas[area].phase` to `test`
   - Set `areas[area].code.status` to `implemented` (if it was null)
   - Set `areas[area].test.status` to `passing` or `blocked`
   - Record retry counts in `areas[area].test.retries`
2. Add log entry
3. Print summary:

```
=== Test Execution Summary ===
Area: CP (컴포넌트)
TC Coverage: 10/10 baseline, 2 supplementary added
Results: 12 passed, 0 failed
Retries: TC-CP-003a (2), TC-CP-005a (1)
Files generated:
  tests/unit/CP/gate-logic.test.ts
  tests/unit/CP/port-config.test.ts
```

## Failure Classification

See [failure-classification.md](references/failure-classification.md) for the full decision tree and error pattern reference.

## Quality Checklist

Before marking an area complete:

- [ ] Every baseline TC has a corresponding test function
- [ ] Every test function has `@tc` and `@req` traceability comments
- [ ] No baseline TC was modified
- [ ] All tests pass (`exit code 0`)
- [ ] Supplementary TCs (if any) have `origin: "supplementary"` and `added_reason`
- [ ] `hitl-state.json` is updated with results

---

## Amendment Test Mode (cycle > 1)

`code` 또는 `test` phase이면서 `cycle > 1`일 때 진입한다. 코드 수정 + 테스트 생성/실행을 회귀 포함 루프로 수행한다.

### Entry

1. `.omc/hitl-state.json`에서 해당 영역의 reentry 정보 확인:
   - `cycle_entry`, `cycle_reason` 확인
   - `log`에서 최근 reentry 항목의 `type`, `reason`, `affected_reqs` 읽기
2. TC JSON 로드 — `baseline_tcs` + `supplementary_tcs` 모두 포함
   - `status: "obsolete"` baseline TC를 식별하여 실행 대상에서 제외
3. 기존 테스트 코드 확인 (`tests/` 하위)

### Context Loading

- Reentry 로그에서 `affected_reqs` 확인
- 변경된 REQ에 연결된 TC 식별 (baseline + supplementary 모두)
- 기존 테스트 코드 중 해당 TC를 커버하는 파일 식별

### Full Regression Test (필수)

**HITL.md §5.3에 따라 cycle > 1에서는 전체 회귀 테스트를 실행한다.**

변경된 TC만 테스트하는 것이 아니라, **해당 영역의 전체 테스트 스위트**를 실행한다:
1. **active** baseline TC 테스트 → 회귀 없음 확인
2. 새 supplementary TC 테스트 → 새 동작 검증
3. 기존 supplementary TC 테스트 → 기존 보완 테스트 유지
4. `status: "obsolete"` baseline TC → **실행에서 제외** (테스트 코드가 있으면 skip 처리)

실행 순서:
1. obsolete baseline TC의 기존 테스트 코드에 `it.skip` 적용 (주석으로 obsolete 사유 기록)
2. 새 supplementary TC에 대한 테스트 코드 생성 (없으면)
3. **전체 테스트 스위트 실행** (해당 영역 전체, obsolete 제외)
4. 실패 시 fix loop (정규 모드와 동일)

### State Transitions

| 현재 phase | 테스트 결과 | 전환 |
|-----------|-----------|------|
| `code` | 전체 통과 | → `test` (forward) |
| `code` | 실패 있음 | → `code` 유지 (fix loop) |
| `test` | 사람 승인 | → `verified` (forward) |

### Amendment-Specific Summary

```
=== Amendment Test Summary [cycle {N}] ===
Area: {area} ({name})
Reentry: {type} — {reason}
Affected REQs: {affected_reqs}

Regression Results:
  Baseline TCs:      {B_active} passed, {M} failed ({B_obsolete} obsolete, skipped)
  Supplementary TCs: {P} passed, {Q} failed (new: {R})
  Total executed:    {all} passed, {failures} failed
  Obsolete skipped:  {B_obsolete} (내용 보존, 실행 제외)

{전체 통과 시}
→ Phase 전환: code → test
→ 사람의 최종 검증을 기다립니다.

{실패 시}
→ Fix loop 계속. {details}
```

### State Update

테스트 전체 통과 후:
- `phase`: `code` → `test`
- `test.status`: `"passing"`
- Log entry: `{ "from": "code", "to": "test", "actor": "agent", "note": "All tests passing including regression [cycle N]" }`

사람 최종 승인 후:
- `phase`: `test` → `verified`
- Log entry: `{ "from": "test", "to": "verified", "actor": "human" }`
