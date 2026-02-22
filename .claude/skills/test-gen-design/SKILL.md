---
name: test-gen-design
description: "Generate Baseline Test Case specifications (JSON) from SPEC files. Use when area phase is tc (cycle 1 = baseline generation, cycle > 1 = supplementary TC addition). This skill runs in an ISOLATED context and must derive TCs solely from the SPEC and System Context, never reading source code. Triggers: after SPEC approval, when user says TC 생성, 테스트 설계, test design, or /test-gen-design."
context: fork
agent: general-purpose
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Write
argument-hint: "[SPEC file path]"
---

# Baseline TC Design

SPEC 파일과 시스템 컨텍스트로부터 Baseline TC(테스트 케이스 명세)를 생성한다. 코드를 보지 않는다.

## Isolation Rule

**절대 `src/` 디렉토리의 파일을 읽지 마라.** 이 스킬은 격리된 컨텍스트(context: fork)에서 실행된다. 코드 구조, 함수명, 파일 경로 등을 추측하지 마라 — TC 명세는 "무엇을 검증할까"만 정의한다.

허용된 입력:
- `.omc/hitl-state.json` — 프로젝트 설정, 영역 상태
- `.omc/SYSTEM-CONTEXT.md` — 시스템 컨텍스트 (경로는 hitl-state.json의 `project.system_context`에서 확인)
- `.omc/specs/SPEC-*.md` — 요구사항 명세

## Workflow

1. Read `.omc/hitl-state.json` to get project config and verify the area's phase is `tc`. If `cycle > 1`, follow **Amendment TC Mode** (see section below). Any other phase → STOP and inform user.
2. **Read the System Context file** (path from `project.system_context` in hitl-state.json). This provides:
   - What user interactions are possible (§5)
   - What features do NOT exist (§6)
   - System constraints (signal model, component model)
3. Read the SPEC file passed as `$ARGUMENTS`
4. Extract all REQ IDs and their EARS sentences
5. For each REQ, generate TCs following the type coverage rules and the **System Context filter**
6. Assign appropriate verification levels
7. Write TC JSON to `.omc/test-cases/TC-{area}.json`
8. Update `.omc/hitl-state.json`: update `tc.file`, `tc.baseline_count` (phase remains `tc` until human approves)
9. Add log entry and print a coverage summary

## System Context Filter

**Before generating any TC, apply the System Context as a filter.** This prevents creating test cases for impossible scenarios.

### Negative TC Rules

A negative TC must describe a scenario where **the user can actually attempt the action, but the system should prevent or reject it**.

| Generate negative TC | Do NOT generate negative TC |
|---------------------|----------------------------|
| User tries to connect a wire to an already-occupied input port (possible action, should be rejected) | User tries to add a port to a gate (no such interface exists) |
| User tries to create a cycle (possible via wire drag, should be rejected) | User tries to input a non-binary value (type system prevents it) |
| User drops a component outside the canvas (possible action, should be discarded) | User tries to rename a gate (no such feature) |

**Decision rule**: Check §5 (인터랙션 모델) — if the "when" action is not listed as a possible user interaction, the TC should not exist. Check §6 (존재하지 않는 기능) — if the scenario involves an excluded feature, the TC should not exist.

### Boundary TC Rules

A boundary TC must test a **real boundary defined in the SPEC or System Context**.

| Generate boundary TC | Do NOT generate boundary TC |
|---------------------|----------------------------|
| Zoom at exactly 25% and 400% (defined limits) | Maximum component count (no limit defined) |
| Undo at exactly 100th history entry (defined limit) | Non-binary signal values (binary-only system) |

## TC Type Coverage

Every REQ must have at minimum:

| Type | Description | Required |
|------|-------------|----------|
| `positive` | Normal expected behavior | Always |
| `negative` | User attempts a forbidden but **possible** action | When a realistic forbidden scenario exists |
| `boundary` | Edge values of **defined** limits | When REQ or System Context defines numeric/size constraints |
| `error` | Error handling, recovery | When REQ specifies error behavior |

**Important change from previous version**: `negative` is not blindly required for every REQ. If no realistic negative scenario exists for a REQ (because the system design makes invalid actions impossible), a negative TC should not be forced. Document why in the summary.

## TC JSON Schema

Each TC object follows this structure. See [tc-schema.json](references/tc-schema.json) for the full JSON Schema.

```json
{
  "tc_id": "TC-{area}-{number}{letter}",
  "origin": "baseline",
  "req_id": "REQ-{area}-{number}",
  "type": "positive | negative | boundary | error",
  "level": "unit | component | api | e2e | visual",
  "title": "Short description of what is verified",
  "given": "Precondition in plain language",
  "when": "Action or trigger",
  "then": "Expected outcome"
}
```

## Verification Levels

Assign `level` based on what the TC verifies, not on implementation details:

| Level | Assign when TC verifies... |
|-------|---------------------------|
| `unit` | Pure logic, calculations, data transformations |
| `component` | UI element rendering, props, user interaction with a single component |
| `api` | HTTP request/response, endpoint behavior |
| `e2e` | Multi-step user flow across pages/components |
| `visual` | Rendered appearance, layout, visual correctness |

**System Context check**: If §6 states "no API endpoints (pure client app)", do not assign `api` level to any TC.

## TC ID Convention

- Format: `TC-{area}-{REQ number}{sequential letter}`
- Project code and area codes are in `.omc/hitl-state.json`
- Example: REQ-GP-001 → TC-GP-001a (positive), TC-GP-001b (negative), TC-GP-001c (boundary)

## Output

Write the TC array to `.omc/test-cases/TC-{area}.json`:

```json
{
  "spec_id": "SPEC-{code}-GP",
  "generated_at": "2026-02-16T...",
  "baseline_tcs": [ ...TC objects... ]
}
```

After writing, print:

```
=== Baseline TC Summary ===
SPEC: SPEC-{code}-GP
Total TCs: 24
  positive: 8, negative: 5, boundary: 3, error: 2
Levels: unit=10, component=6, e2e=5, visual=3
REQs covered: 8/8 (100%)

System Context filter applied:
  - Skipped N impossible negative scenarios
  - Skipped M boundary TCs for undefined limits
  - No api-level TCs (pure client app)
```

## Quality Checklist

Before finalizing, verify:

- [ ] Every REQ has at least 1 positive TC
- [ ] Negative TCs only test **realistic** forbidden actions (check §5 interaction model)
- [ ] No TC tests a feature listed in §6 (scope exclusions)
- [ ] All tc_id values are unique
- [ ] All req_id values match IDs in the SPEC
- [ ] No TC references code files, function names, or implementation details
- [ ] `origin` is always `"baseline"` (never `"supplementary"`)
- [ ] Level assignment is based on verification target, not implementation guess
- [ ] No `api` level TCs if System Context says pure client app

---

## Amendment TC Mode (cycle > 1)

`tc` phase이면서 `cycle > 1`일 때 진입한다. 기존 TC JSON을 로드하고, 변경된 REQ에 대해 supplementary TC를 추가한다.

### Isolation Rule

**정규 모드와 동일**: `src/` 디렉토리의 파일을 절대 읽지 않는다. SPEC + System Context만 참조.

### Entry

1. `.omc/hitl-state.json`에서 해당 영역의 reentry 정보 확인:
   - `cycle_entry`, `cycle_reason` 확인
   - `log`에서 최근 reentry 항목의 `type`, `reason`, `affected_reqs` 읽기
2. 기존 TC JSON 파일 로드 (`areas[area].tc.file`)
3. 수정된 SPEC 파일 로드 (`areas[area].spec.file`)
4. System Context 로드

### Workflow

1. **Baseline 내용 보존**: 기존 `baseline_tcs` 배열의 **내용(given/when/then)은 절대 수정/삭제하지 않는다**
2. **Baseline TC 유효성 검사**: 변경된 REQ의 기존 baseline TC가 여전히 유효한지 확인:
   - REQ가 수정되어 기존 baseline TC의 기대 결과가 더 이상 맞지 않을 수 있음
   - **유효하지 않은 baseline TC → obsolete 마킹**:
     ```json
     {
       "status": "obsolete",
       "obsoleted_at": "2026-02-17T15:00:00",
       "obsoleted_by": "TC-ZM-006e",
       "obsolete_reason": "REQ-ZM-006 변경: 줌 리셋 100% → fit-to-content"
     }
     ```
   - `given/when/then`은 수정하지 않음 (감사 추적 보존)
   - obsolete 마킹과 동시에 **대체 supplementary TC를 반드시 생성** (커버리지 공백 방지)
3. **Supplementary TC 추가**: `affected_reqs`에 해당하는 REQ에 대해 새 TC를 생성:
   - `origin`: `"supplementary"` (절대 `"baseline"` 아님)
   - `added_reason`: `"cycle {N}: {reason}"`
   - TC ID는 기존 TC 뒤에 이어서 할당 (e.g., 기존 TC-GP-001a~c가 있으면 TC-GP-001d부터)
   - obsolete된 baseline TC를 대체하는 경우, `added_reason`에 "supersedes TC-XX-NNNx" 포함
4. **전체 REQ 커버리지**: 변경된 REQ뿐 아니라 전체 REQ에 대해 커버리지 누락이 없는지 확인
   - obsolete된 baseline TC의 커버리지가 supplementary TC로 대체되었는지 반드시 검증

### Output

기존 TC JSON 파일에 `supplementary_tcs` 배열을 추가/갱신:

```json
{
  "spec_id": "SPEC-{code}-GP",
  "generated_at": "...",
  "baseline_tcs": [ ...기존 불변... ],
  "supplementary_tcs": [ ...새로 추가된 TC... ]
}
```

### Summary Output

```
=== Amendment TC Summary [cycle {N}] ===
SPEC: SPEC-{code}-GP (amended)
Reentry: {type} — {reason}
Affected REQs: {affected_reqs}
Baseline TCs: {B_active} active, {B_obsolete} obsolete (내용 보존)
New Supplementary TCs: {M} added ({S} superseding obsolete baselines)
Total executable TCs: {B_active + M + 기존supplementary}

Obsoleted Baselines:
  TC-ZM-006a → superseded by TC-ZM-006e (REQ-ZM-006 변경)

System Context filter applied:
  - ...
```

### State Transition

- `phase`는 `tc`를 유지한다 (사람 승인 후 `code`로 forward 전환)
- `tc.supplementary_count` 갱신
- Log entry: `{ "from": "tc", "to": "tc", "actor": "agent", "note": "Supplementary TCs generated for cycle N" }`
- **사람이 TC를 승인하면**: `phase` → `code`, log에 `actor: "human"` 기록

### Baseline TC 불변 원칙 재강조

- Baseline TC(`origin: "baseline"`)의 **내용(given/when/then)은 어떤 경우에도 수정/삭제하지 않는다**
- SPEC 변경으로 baseline TC가 무효화될 때: `status: "obsolete"` 마킹 (내용은 그대로)
- obsolete 마킹 시 반드시 `obsoleted_by`에 대체 supplementary TC를 지정
- 변경된 동작은 supplementary TC로 커버한다
- 이는 검증 기준의 이력 추적을 보장하기 위함이다 (ISO 26262 감사 추적)
