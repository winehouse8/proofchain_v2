# ProofChain v2 — Unified SafeDev 개발 프로세스

이 프로젝트는 **ISO 26262 준수 HITL (Human-in-the-Loop) 개발 루프**를 따른다.
SPEC이 단일 진실 원천이며, 코드와 테스트는 SPEC으로부터 독립적으로 파생된다.

**아키텍처**: 셸 훅(Layer 0 Guard) + TS 엔진(Layer 1/2 분석) 단일 강제자 모델.
**상태 관리**: `hitl-state.json` = Phase 진실원천, `proofchain.db` = 검증 데이터.
**상세 프로세스 정의**: `.omc/HITL.md`

---

## 세션 시작 시 반드시 할 것

**`.omc/hitl-state.json`을 읽고, 현재 상태를 사람에게 요약 보고하라.**

```
=== HITL 현황 ===
CP (컴포넌트)  : verified [cycle 1] → 완료. 변경 시 reentry 필요.
CV (캔버스)    : code [cycle 1]     → 다음: 코딩 계속
WR (와이어링)  : test [cycle 2]     → 다음: 테스트 반복 (회귀 포함)
```

이 보고를 먼저 하고, 사람이 어떤 영역/단계를 진행할지 선택하도록 안내한다.

---

## 5-Phase 상태 머신

```
spec ──→ tc ──→ code ──→ test ──→ verified
  ↑       ↑      ↑        ↑          │
  │       │      │        │          │ reentry (cycle++)
  │       └──────┴────────┘          │
  │              backward            │
  └──────────────────────────────────┘
```

| 전환 | 조건 | cycle 변화 |
|------|------|-----------|
| **Forward** | 현재 단계 완료 + 사람 승인 | 유지 |
| **Backward** | 사람이 문제 발견 (같은 cycle 내) | 유지 |
| **Reentry** | `verified`에서 재진입 | cycle++ |

---

## Phase 안내

| Phase | 사람에게 안내할 내용 |
|-------|---------------------|
| `spec` | "SPEC을 작성합니다. `/ears-spec`을 사용하세요." |
| `tc` | "Baseline TC를 생성합니다. `/test-gen-design`을 실행하세요." |
| `code` | "코딩을 계속합니다. 완료되면 `/test-gen-code`로 테스트를 시작합니다." |
| `test` | "테스트 실행 중입니다. 전부 통과하면 최종 검증으로 넘어갑니다." |
| `verified` | "이 영역은 완료되었습니다. 변경이 필요하면 reentry를 시작하세요." |

---

## Reentry 시나리오

`verified` 후 변경이 필요할 때:

| 시나리오 | 진입 phase | 건너뛴 phase | 사용 스킬 |
|---------|-----------|-------------|----------|
| **A. SPEC 변경 필요** (새 기능, SPEC 오류) | `spec` | 없음 | `/ears-spec` → `/test-gen-design` → `/test-gen-code` |
| **B. 코드 버그** (SPEC 정확) | `tc` | `spec` | `/test-gen-design` → `/test-gen-code` |
| **C. 테스트 코드 오류** | `code` | `spec`, `tc` | `/test-gen-code` |

Reentry 시 log 필수 필드: `type`, `reason`, `affected_reqs`. 건너뛰기 시 `skipped_phases`, `skip_reason` 추가.

---

## 불변 규칙

1. **Baseline TC 불변**: `origin: "baseline"`의 given/when/then은 최초 `verified` 이후 절대 수정/삭제 금지. SPEC 변경 시 `status: "obsolete"` 마킹 + 대체 supplementary TC 생성.
2. **Cycle 1 backward 시 baseline TC 재생성 허용**: 아직 verified 전이므로 통째로 재생성 가능.
3. **TC 격리**: `/test-gen-design`은 절대 `src/`를 읽지 않는다. (fork context 필수, ASIL B+)
4. **추적성**: 모든 TC는 REQ ID에 연결. 테스트 코드에 `@tc`, `@req` 어노테이션 필수.
5. **5회 실패 에스컬레이션**: 같은 TC 5회 실패 시 사람에게 보고.
6. **verified 잠금**: `verified` 상태에서는 src/, .omc/specs/, .omc/test-cases/, tests/ 수정 불가. reentry 필수.
7. **skip_reason 필수**: 단계 건너뛰기 시 정당화 기록 (ISO 26262 Part 8 §8.7).
8. **전체 회귀**: cycle > 1에서 전체 회귀 테스트 필수 (ISO 26262 Part 6 §9.4.6).
9. **Auto-backward TC 연결 필수**: test phase에서 src/ 수정으로 auto-backward 발생 시, 수정 근거가 되는 TC ID와 REQ ID를 hitl-state.json log에 기록 필수. 기록 없이 test→verified 전환 불가 (Gate #15).

---

## ProofChain v2 TS 엔진 통합

### ASIL 적응형 동작

| ASIL | 셸 Guard | MISRA Tier 1 | 커버리지 Gate | TC Isolation |
|------|---------|-------------|-------------|-------------|
| QM | exit 0 + warn | off | 60/50/0 | optional |
| A | exit 0 + warn | warn (주석) | 70/60/50 | recommended |
| B | exit 2 block | warn (주석) | 80/70/60 | **required** |
| C | exit 2 block | block (exit 2) | 90/85/80 | **required** |
| D | exit 2 block | block (exit 2) | 95/95/90 | **required** |

### TS 브릿지 호출 구조

```
PreToolUse: check-phase.sh (단일 강제자)
  Phase 1: 셸 가드 (파일 접근 제어, 자기 보호, 파괴적 git 차단)
  Phase 2: TS 브릿지 (ASIL A+ && C/C++ 파일만)
    → node dist/bridge/cli-entry.js tier1 < stdin
    → MISRA 치명적 패턴 차단 (goto, malloc)
  Phase 3: TC 추적성 (test phase + src/ 수정 시)
    → node dist/bridge/cli-entry.js tier1-trace < stdin
    → @tc/@req 태그 강제 (QM=info, A=warn, B+=block)

PostToolUse: (비차단)
  trace-change.sh → change-log.jsonl 기록
  artifact-commit.sh → SPEC/TC 자동 커밋
  phase-commit.sh → phase 전환 커밋 + git tag
```

### 상태 저장소 분리

| 저장소 | 데이터 | 쓰기 주체 |
|-------|-------|----------|
| `hitl-state.json` | phase, cycle, area | 셸 훅, 스킬 (jq) |
| `proofchain.db` | ledger, graph, audit, debt, trace | TS 엔진 (SQLite) |
| `change-log.jsonl` | 파일 변경 기록 | trace-change.sh |
| git tags | verified 마일스톤 | phase-commit.sh |

---

## 스킬

| 스킬 | 용도 | 컨텍스트 |
|------|------|----------|
| `/ears-spec` | SPEC 작성 co-pilot (EARS 패턴) | 메인 |
| `/test-gen-design` | Baseline TC 생성 (src/ 격리) | fork |
| `/test-gen-code` | 테스트 코드 생성 + 실행 + fix loop | 메인 |
| `/traceability` | 추적성 매트릭스 생성 (REQ↔TC↔Test) | 메인 |
| `/phase` | Phase 전환 + gate check | 메인 |
| `/verify` | 검증 실행 (coverage + MISRA + traceability) | 메인 |
| `/trace` | 추적 태그 관리 | 메인 |
| `/impact` | 변경 영향 분석 | 메인 |
| `/safety-doc` | 안전 문서 생성 | 메인 |
| `/tool-qual` | 도구 자격 인증 (ISO 26262 Part 8 §11) | 메인 |
| `/reset` | 프로세스 초기화 (ASIL B+에서 인간 확인 필수) | 메인 |

---

## 훅 — 3-Layer + TS Bridge 강제 시스템

```
Layer 3 [Gate]   ← check-phase.sh verified_gate() + ts_bridge_gate_check()
                    셸 Gate #1-7 + TS Gate #8-15 (ASIL별 필터링)
                    → 미충족 시 차단 (exit 2)

Layer 2 [Guide]  ← trace-change.sh (PostToolUse)
                    change-log.jsonl 기록 + @tc/@req 누락 경고
                    → 차단 없음, 안내만

Layer 1 [Guard]  ← check-phase.sh (PreToolUse) + ts_bridge_tier1()
                    phase별 파일 접근 차단 + MISRA Tier 1 + auto_backward
                    → 위반 시 차단 또는 자동 상태 전환

        [Auto]   ← artifact-commit.sh: SPEC/TC 수정 → 개별 git commit
                 ← phase-commit.sh: phase 전환 → git commit + verified tag
```

---

## 세션 종료 시 확인 사항

세션을 종료하기 전에 반드시 확인:
1. hitl-state.json에서 현재 Phase 확인
2. 요청된 Phase 전이가 완료되었는지 확인
3. 커밋되지 않은 변경사항이 현재 Phase에서 허용되는지 확인

---

## Phase 전환 시 반드시

1. `hitl-state.json`의 해당 영역 `phase` 값 변경
2. 관련 하위 상태 갱신 (`spec.status`, `tc.status` 등)
3. Reentry 시: `cycle++`, `cycle_entry`, `cycle_reason` 갱신
4. `log` 배열에 기록 추가

---

## 핵심 파일

```
.claude/
├── hooks/
│   ├── check-phase.sh          Layer 1 Guard + Layer 3 Gate + TS Bridge
│   ├── trace-change.sh         Layer 2 Guide
│   ├── artifact-commit.sh      SPEC/TC 개별 커밋
│   ├── phase-commit.sh         전환 커밋 + tag
│   ├── restore-state.sh        세션 시작 보고
│   └── checkpoint.sh           압축 전 상태 보존
├── skills/                     11개 스킬
└── settings.json               Hook 등록

.omc/
├── HITL.md                     HITL 프로세스 정의 (상세 참조)
├── hitl-state.json             상태 추적 (Phase 진실원천)
├── change-log.jsonl            파일 변경 감사 로그
├── specs/SPEC-*.md             요구사항 명세
├── test-cases/TC-*.json        테스트 케이스 명세
└── traceability/               추적성 매트릭스

.proofchain/
└── config.json                 ASIL 레벨, 임계값, 게이트 설정

src/
├── bridge/                     셸↔TS 브릿지
│   ├── cli-entry.ts            CLI 엔트리 (stdin→parse→dispatch)
│   ├── phase-sync.ts           HITL→V-Model 매핑 (read-only)
│   └── gate-bridge.ts          TS Gate #8-15 구현
├── core/                       타입, 설정, DB
├── hooks/                      Tier 1/2 TS 훅 핸들러
├── rules/                      MISRA 규칙 엔진
├── ccp/                        변경 사이클 프로토콜
├── graph/                      의존성 그래프
├── ledger/                     검증 원장
├── v-model/                    V-Model 상태 머신
└── ...                         (coverage, traceability, verification, ...)
```
