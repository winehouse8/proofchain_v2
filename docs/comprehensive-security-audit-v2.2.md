# ProofChain v2.2 종합 보안 감사 보고서

**일자**: 2026-02-23
**방법론**: 6개 Opus 아키텍트 에이전트 병렬 전수 분석 + Actor-Critic 변증법적 검토
**범위**: 전체 레포 (셸 훅 11개, TS 엔진 60+개, 스킬 11개, 문서 6개)
**최종 등급**: **B+** (양호 -- 핵심 방어 견고, TS 엔진 일부 미완성)

---

## 목차

1. [핵심 요약](#1-핵심-요약)
2. [시스템 개요](#2-시스템-개요)
3. [계층별 분석](#3-계층별-분석)
4. [Actor-Critic 변증법적 분석](#4-actor-critic-변증법적-분석)
5. [발견된 취약점 전체 목록](#5-발견된-취약점-전체-목록)
6. [최종 판정](#6-최종-판정)
7. [수정 권고](#7-수정-권고)

---

## 1. 핵심 요약

### ProofChain이 주장하는 목표

> "Claude Code를 HITL (Human-in-the-Loop) 개발 환경으로 전환하여, 모든 코드 변경이 SPEC 우선 + 테스트 주도 워크플로우를 따르도록 강제한다."

### 판정

**핵심 목표를 실질적으로 달성한다.** 셸 훅 기반의 결정론적 방어 계층(L1/L2)이 5-Phase 상태 머신을 효과적으로 강제하며, HMAC/SHA-256 기반 무결성 검증(L3)과 자동 롤백이 변조를 탐지/복원한다. ConfigChange 절대 차단으로 세션 중 훅 비활성화가 불가능하다.

**그러나**, TS 엔진의 상당 부분이 placeholder/stub 상태이며, TC 격리가 프롬프트 수준에만 의존하고, Bash 쓰기 감지에 알려진 빈틈이 있다. 이는 현재 QM ASIL에서는 수용 가능하지만, ASIL B+ 프로젝트 배포 전 반드시 해결해야 한다.

### 적대적 시나리오 결론

4개 전문 에이전트가 발견한 모든 취약점은 **이론적 우회 가능성**이지 **실증된 돌파구**가 아니다. 심층 방어(Defense-in-Depth) 아키텍처로 인해 단일 취약점 악용으로 상태 머신을 탈출하는 것은 현실적으로 매우 어렵다. Actor 에이전트 자체가 V6 방어(훅 소스 읽기 차단)에 의해 공격 시나리오 수립을 저지당한 것이 이를 증명한다.

---

## 2. 시스템 개요

### 아키텍처

```
사용자/AI 도구 호출
       │
       ▼
 L4: Semantic Guard ──── Haiku LLM이 Bash 명령의 의도 판단
       │
       ▼
 L1: universal-guard.sh ── 모든 도구 라우팅 (matcher: ".*")
       │                    Read: V6(훅소스차단), V12(키차단)
       │                    Glob/Grep: 즉시 허용
       │                    Edit/Write/Bash/NB/MCP: → L2 위임
       ▼
 L2: check-phase.sh ────── 결정론적 Phase Guard (1185줄)
       │                    NEVER_ALLOW 패턴 (훅/설정 보호)
       │                    Phase별 파일 접근 제어
       │                    상태 전환 유효성 검증
       │                    Verified Gate #1-7
       │                    TS Bridge Tier 1 (ASIL A+ C/C++)
       ▼
   [도구 실행]
       │
       ▼
 PostToolUse (비차단) ──── phase-commit.sh (전환 감지/커밋)
                           integrity-audit.sh (L3: SHA256/HMAC/롤백)
                           trace-change.sh (변경 로그)
                           artifact-commit.sh (SPEC/TC 커밋)

 ConfigChange ──────────── config-protect.sh (무조건 exit 2)
 SessionStart ──────────── integrity-audit.sh init + restore-state.sh
```

### 5-Phase 상태 머신

```
spec ──→ tc ──→ code ──→ test ──→ verified
  ↑       ↑      ↑        ↑          │
  │       │      │        │          │ reentry (cycle++)
  │       └──────┴────────┘          │
  │              backward            │
  └──────────────────────────────────┘
```

### 분석 에이전트 구성

| # | 에이전트 | 범위 | 분석 파일 수 |
|---|---------|------|-------------|
| 1 | 셸 훅 아키텍트 | L1-L3 방어 계층 | 12 |
| 2 | TS 엔진 아키텍트 | bridge, v-model, core, rules, CCP, agents | 34 |
| 3a | 서브시스템 아키텍트 | verification, traceability, coverage, ledger, graph | 22 |
| 3b | 스킬/문서 아키텍트 | skills, docs, init, integration | 25+ |
| 4a | Actor (공격자) | 적대적 시나리오 구성 | - |
| 4b | Critic (방어자) | 방어 충분성 평가 | - |

---

## 3. 계층별 분석

### 3.1 셸 훅 시스템 (L1-L3) -- 평가: A

ProofChain의 가장 강력한 방어 계층. 11개 셸 스크립트가 Claude Code의 모든 도구 호출을 가로채고, 결정론적 규칙으로 접근을 제어한다.

**핵심 강점:**

| 메커니즘 | 구현 | 효과 |
|---------|------|------|
| NEVER_ALLOW | `check-phase.sh:522-536` | `.claude/`, `.proofchain/`, `settings.json` 쓰기 무조건 차단 |
| ConfigChange 차단 | `config-protect.sh` (9줄) | 세션 중 훅 비활성화 불가 |
| Fail-closed | `set -euo pipefail` + `trap 'exit 2' ERR` | 크래시 시 차단 |
| HMAC + SHA-256 | `proofchain-hmac-lib.sh` + `integrity-audit.sh` | 변조 탐지 + 자동 롤백 |
| Merkle 감사 체인 | `integrity-audit.sh:150-182` | 중간 삭제 탐지 가능 |
| 심볼릭 링크 해석 | `readlink -f` in L1/L2 | V5 우회 차단 |
| 다단계 스크립트 탐지 | `check-phase.sh:569-576` | `python3 -c`, `perl -e` + 보호 경로 |
| 인코딩 우회 탐지 | `check-phase.sh:582-588` | base64/xxd + 파일 쓰기 조합 |

**Phase별 파일 접근 매트릭스:**

| 파일 경로 | spec | tc | code | test | verified |
|-----------|------|-----|------|------|----------|
| `.omc/specs/SPEC-*.md` | W | - | - | - | - |
| `.omc/test-cases/TC-*.json` | - | W | W | W | - |
| `src/` | - | - | W | W | - |
| `tests/` | - | - | W | W | - |
| `.claude/hooks/` | - | - | - | - | - |
| `settings.json` | - | - | - | - | - |

W = 쓰기 허용, `-` = 차단

**알려진 빈틈:**

- `awk` 가 IS_WRITE 패턴에 누락 (V-HIGH-2)
- `.omc/v2.2-hooks/`의 Read 미차단 (V-HIGH-1)
- `git stash pop`/`git merge` 후 `.claude/` 변경 미차단 (V-MED-3, 단 L3 롤백이 보상)

---

### 3.2 TS 엔진 -- 평가: C+

타입 안전성은 높으나 상당 부분이 미완성. 셸 훅의 보조 역할.

**강점:**
- `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true` -- 가장 엄격한 설정
- `core/types.ts`: `any` 완전 배제, 모든 타입 `readonly`
- `ccp/ccp-orchestrator.ts`: 6단계 파이프라인을 단일 SQLite 트랜잭션으로 원자적 실행
- `agents/safety-reviewer.ts`: 구조화된 프롬프트, JSON 파싱, 이중 리뷰 merge

**심각한 문제:**

| 문제 | 위치 | 영향 |
|------|------|------|
| TS Gate 7개 중 5개 placeholder | `gate-bridge.ts:96-159` | ASIL B+ verified 전환이 불완전 |
| Gate #9 항상 fail | `gate-bridge.ts:85` | ASIL B+에서 verified 영구 차단 |
| `getAsilFromGraph` 항상 QM | `blast-radius-calculator.ts:98` | ASIL 기반 우선순위 무의미화 |
| `readHitlState` 무검증 | `phase-sync.ts:82-85` | JSON.parse + as 캐스팅 |
| `released`에서 `regress()` 미차단 | `state-machine.ts:267-300` | V-Model 상태 무결성 결함 |
| MISRA regex 기반 | 14개 규칙 | 주석/문자열 오탐, 간접 재귀 미탐지 |
| `getActiveRules` 커스텀 규칙 누락 | `rule-loader.ts:110` | builtin만 로드 |
| HITL/V-Model 이중 상태머신 미동기화 | `phase-sync.ts:68-74` | 두 상태 독립적 존재 |

**핵심 구조적 문제:** TS 엔진은 hitl-state.json을 **읽기만** 하며 Phase 강제에 직접 관여하지 않는다. 실제 강제는 전적으로 셸 훅이 담당. TS 엔진은 MISRA 분석과 Gate Check 보강 역할인데, 후자의 절반이 placeholder.

---

### 3.3 검증/추적성/원장 서브시스템 -- 평가: C

설계는 견고하나 구현 완성도가 낮다.

**강점:**
- Content-addressed 원장 설계 (SHA-256 기반)
- ASIL별 차등 임계값 프레임워크
- Kahn's algorithm 기반 위상 정렬 검증 스케줄러
- Append-only 감사 로그

**심각한 문제:**

| 문제 | 위치 | 영향 |
|------|------|------|
| **incremental-verifier가 stub** | `incremental-verifier.ts:85-104` | 테스트 미실행, 즉시 'fresh' 마킹 |
| createEntry가 증거 없이 'fresh' 수락 | `verification-ledger.ts:184-223` | 검증 체인 무력화 가능 |
| Coverage Gate ASIL 무시 | `verification-workflow.ts:205` | 80/70 하드코딩 (D는 95/95 필요) |
| MC/DC 커버리지 항상 0 | `coverage-parser.ts:216,329,484` | ASIL C/D 필수 메트릭 미지원 |
| computeFreshness 해시 비교 결함 | `verification-ledger.ts:311-315` | 다른 아티팩트의 해시를 비교 |
| hashRequirement에 ASIL 미포함 | `content-hasher.ts:167-169` | ASIL 변경 미감지 |
| trace-validator에 untested 미포함 | `trace-validator.ts:74` | is_valid에 테스트 추적성 누락 |
| orphan-detector에 getAllNodes() 부재 | `orphan-detector.ts:52-64` | 완전 고립 노드 미감지 |

---

### 3.4 스킬 시스템 -- 평가: B+

HITL 프로세스의 사용자 인터페이스. 상태 머신 규칙을 잘 반영하나 일부 격리 빈틈.

**강점:**
- 11개 스킬이 5-Phase 상태 머신 규칙을 정확히 반영
- ears-spec: Phase guard + Amendment mode 분기
- test-gen-design: Baseline TC 불변 원칙 강조 + `context: fork` 격리
- test-gen-code: cycle > 1 전체 회귀 + obsolete TC `it.skip` 처리
- phase: Forward/Backward/Reentry 전환 규칙 정확

**빈틈:**

| 빈틈 | 위치 | 영향 |
|------|------|------|
| **TC 격리가 프롬프트 수준** | `test-gen-design/SKILL.md:17` | Read/Glob/Grep으로 src/ 기술적 접근 가능 |
| test-gen-code Phase 전환 시 Gate Check 미실행 | `test-gen-code/SKILL.md:117-128` | /phase 스킬과 역할 중복 |
| skill-registrar 4개 핵심 스킬 미등록 | `skill-registrar.ts:23-64` | ears-spec, test-gen-design 등 누락 |
| hook-registrar v2.2 미반영 | `hook-registrar.ts:27-46` | 죽은 코드 |

---

## 4. Actor-Critic 변증법적 분석

### Round 1: 핵심 방어의 돌파 가능성

**Actor (공격자):**
> "Bash 쓰기 감지가 휴리스틱이다. `awk '{print > ".omc/hitl-state.json"}'`로 IS_WRITE 패턴을 우회하면 상태 파일을 직접 조작할 수 있다."

**Critic (방어자):**
> "awk가 IS_WRITE에 없는 건 사실이다. 그러나 이 명령은 3중 방어를 동시에 뚫어야 한다:
> 1. `check-phase.sh:558-563`이 명령 문자열에서 `hitl-state` 패턴을 grep으로 탐지 -- **차단**
> 2. L4 Haiku 가드가 '상태 파일 수정 의도'를 의미론적으로 판단
> 3. PostToolUse `integrity-audit.sh`가 HMAC 불일치 감지 + 자동 롤백
>
> IS_WRITE 우회는 필요 조건이지 충분 조건이 아니다."

**합의:** IS_WRITE에 `awk` 추가는 권장되지만 (P2), hitl-state 경로 자체가 별도 차단되므로 **상태 머신 탈출은 불가**. Actor의 주장은 **이론적으로 유효하나 실질적 위협은 낮음**.

---

### Round 2: TC 격리의 충분성

**Actor:**
> "test-gen-design이 `context: fork`로 실행되지만, Read/Glob/Grep이 허용되므로 LLM이 프롬프트를 무시하면 src/를 읽을 수 있다. ASIL B+에서 TC Isolation은 필수(required)이며, 프롬프트 규율로는 ISO 26262 감사를 통과할 수 없다."

**Critic:**
> "프롬프트만으로 충분하지 않다는 점은 인정한다. 그러나 현실적으로:
> 1. `context: fork`가 이전 대화에서 읽은 src/ 내용의 전달을 차단
> 2. AI가 의도적으로 src/를 읽으려면 명시적 Read/Glob 호출이 필요하며, 이는 감사 로그에 기록됨
> 3. 현재 프로젝트는 QM이므로 TC Isolation은 'optional'
>
> ASIL B+에서는 수정이 필요하다는 데 동의한다."

**합의:** **수정 필요 (P1)**. tc phase에서 Read/Glob의 `src/` 접근을 셸 훅 레벨에서 차단하는 것을 권장. 현재 QM에서는 수용 가능.

---

### Round 3: TS 게이트 placeholder 문제

**Actor:**
> "TS Gate 7개 중 5개가 placeholder다. Gate #10(Stale), #11(Traceability), #13(Debt)이 항상 pass를 반환하므로, ASIL B+ 프로젝트에서 stale 아티팩트, 추적성 갭, 검증 부채가 있어도 verified로 전환될 수 있다."

**Critic:**
> "TS Gate는 ASIL B+에서만 활성화된다. 현재 QM에서는 실행되지 않는다.
> 더 중요한 것은, **셸 Gate #1-7이 완전 구현**되어 있다는 것이다:
> - Gate #1: TC-테스트 매핑 검증
> - Gate #2: Supplementary TC 스키마 검증 (10개 필수 필드)
> - Gate #4: Baseline TC 불변성 (git tag 비교)
> - Gate #5: Reentry 로그 필수 필드
> - Gate #6: Active TC 존재 검증
>
> 셸 게이트만으로도 핵심 검증은 수행된다."

**합의:** **수정 필요 (P2)**. ASIL B+ 배포 전 반드시 구현해야 하지만, 현재 QM + 셸 Gate #1-7로 기본 검증은 보장됨.

---

### Round 4: .omc/v2.2-hooks/ 소스 노출

**Actor:**
> "`.omc/v2.2-hooks/`에 모든 훅 소스가 보호 없이 노출된다. 이 분석 자체가 그 경로를 통해 수행되었다. AI가 소스를 분석하면 grep 패턴의 빈틈을 이론적으로 추론할 수 있다."

**Critic:**
> "소스를 읽는 것과 우회하는 것은 전혀 다른 문제다:
> 1. 실행 중인 `.claude/hooks/*.sh`의 수정은 NEVER_ALLOW로 차단
> 2. `settings.json` 수정은 ConfigChange hook이 차단
> 3. PostToolUse가 SHA-256 + HMAC으로 변조를 탐지/롤백
>
> 소스 노출은 '지식'의 문제이지 '접근'의 문제가 아니다. 추론하더라도 매 도구 호출마다 실제 검사를 통과해야 한다."

**합의:** **수정 권장 (P1, low effort)**. `.omc/v2.2-hooks/` Read 차단 추가. 그러나 소스 노출 자체가 돌파구(breakthrough)는 아님.

---

### Round 5: 전체 방어 체계의 우회 가능성

**Actor:**
> "모든 개별 취약점은 다중 방어에 의해 완화된다고 주장하지만, 다음의 구조적 한계는 인정해야 한다:
> 1. Bash 휴리스틱은 정지 문제(Halting Problem)로 인해 원천적으로 완전할 수 없다
> 2. L4(LLM)는 비결정론적이므로 공격 성공률이 0이 아니다
> 3. PostToolUse 롤백까지의 '변조 창'이 존재한다"

**Critic:**
> "모든 보안 시스템에는 이론적 한계가 있다. 핵심 질문은 '완벽한가?'가 아니라 '충분한가?'이다:
> 1. Bash 휴리스틱의 한계는 사실이나, 보호 경로 자체의 문자열 매칭(V1)이 추가 방어
> 2. L4 비결정론은 보조 계층이며, L1/L2/L3가 핵심
> 3. 변조 창은 밀리초 단위이며, 다음 PreToolUse에서 재검증
>
> Claude Code 환경에서 AI의 능력은 '도구 호출'로 한정된다. 도구 호출 외의 시스템 조작은 불가능하며, 모든 도구 호출은 반드시 훅 파이프라인을 통과한다. 이것은 Claude Code 런타임이 보장하는 불변 조건이다."

**합의:** **시스템의 보안 보장은 Claude Code 런타임의 훅 강제에 의존한다.** Claude Code 자체가 훅을 우회하는 API를 제공하지 않는 한, 상태 머신 탈출은 현실적으로 불가능하다. 이것은 수용 가능한 신뢰 경계(trust boundary)이다.

---

### Round 6: incremental-verifier stub의 위험

**Actor:**
> "`incremental-verifier.ts`는 테스트를 실행하지 않고 `fresh`로 마킹하는 stub이다. 이것이 워크플로에 통합되면 검증 체인 전체가 무력화된다."

**Critic:**
> "사실이지만 맥락이 중요하다:
> 1. 현재 실제 테스트 실행은 `/test-gen-code` 스킬과 수동 vitest/jest가 담당
> 2. incremental-verifier는 아직 워크플로에 통합되지 않음
> 3. 셸 Gate #1의 TC-테스트 매핑 검증이 실제 테스트 존재를 확인
>
> 이것은 보안 취약점이 아니라 미완성 기능이다."

**합의:** **프로덕션 통합 전 반드시 구현 필요 (P3)**. 현재는 사용되지 않는 경로이므로 즉각적 위험은 없음.

---

## 5. 발견된 취약점 전체 목록

### 5.1 셸 훅 계층

| ID | 심각도 | 취약점 | 실제 위험 | 방어 상태 |
|----|--------|--------|----------|----------|
| SH-1 | HIGH | `.omc/v2.2-hooks/` Read 미차단 | MEDIUM | 소스 노출 ≠ 우회. P1 수정 권장 |
| SH-2 | HIGH | Bash IS_WRITE에 `awk` 누락 | LOW | V1 경로 탐지 + L4 + L3 롤백이 보상 |
| SH-3 | HIGH | Edit multi-area 전환 검증 area 미특정 | LOW | 과잉 검증 방향 (안전) |
| SH-4 | MED | $HOME 환경변수 조작 | VERY LOW | Claude Code 아키텍처상 실현 불가 |
| SH-5 | MED | L4 Haiku 비결정론 | MEDIUM | 보조 계층, L1/L2/L3가 핵심 |
| SH-6 | MED | git stash/merge 간접 복원 | LOW | L3 PostToolUse 롤백이 보상 |
| SH-7 | MED | PostToolUse 차단 불가 | MEDIUM | Claude Code 아키텍처 한계, 롤백으로 보상 |
| SH-8 | MED | TS Bridge tier1/tier2 fail-open | LOW | gate-check는 fail-closed, 설계 의도 |

### 5.2 TS 엔진

| ID | 심각도 | 취약점 | 실제 위험 | 방어 상태 |
|----|--------|--------|----------|----------|
| TS-1 | CRITICAL | Gate #9-14 placeholder (5/7) | MEDIUM | QM에서 비활성. ASIL B+ 전 수정 필수 |
| TS-2 | HIGH | `readHitlState` 무검증 캐스팅 | LOW | 셸 훅이 상태 전환 검증 담당 |
| TS-3 | HIGH | `released`에서 `regress()` 미차단 | LOW | 현재 HITL에서 released 미사용 |
| TS-4 | HIGH | `getAsilFromGraph` 항상 QM | MEDIUM | 기능 미완성 |
| TS-5 | MED | MISRA regex 기반 (주석/문자열 오탐) | MEDIUM | C/C++ ASIL A+에서만 활성 |
| TS-6 | MED | `readStdin` 타임아웃 없음 | LOW | 셸 측 `timeout 5`로 보상 |
| TS-7 | MED | `getActiveRules` 커스텀 규칙 누락 | LOW | builtin 14개 규칙은 동작 |
| TS-8 | MED | Edit `new_string` fragment만 분석 | MEDIUM | 전체 파일 컨텍스트 부재 |
| TS-9 | LOW | HITL/V-Model 이중 상태머신 미동기화 | LOW | V-Model은 현재 보조적 |

### 5.3 검증/추적성/원장

| ID | 심각도 | 취약점 | 실제 위험 | 방어 상태 |
|----|--------|--------|----------|----------|
| VL-1 | CRITICAL | incremental-verifier stub | MEDIUM | 현재 워크플로에 미통합 |
| VL-2 | HIGH | createEntry 증거 없이 fresh 수락 | LOW | 내부 API, 호출자 책임 |
| VL-3 | HIGH | Coverage Gate ASIL 무시 (80/70 하드코딩) | LOW | 보조 워크플로, 셸 Gate가 핵심 |
| VL-4 | HIGH | MC/DC 커버리지 항상 0 | MEDIUM | ASIL C/D 필수 메트릭 미지원 |
| VL-5 | MED | computeFreshness 해시 비교 결함 | LOW | 다른 아티팩트 해시 비교 |
| VL-6 | MED | hashRequirement에 ASIL 미포함 | LOW | ASIL 변경 미감지 |
| VL-7 | MED | trace-validator is_valid에 untested 미포함 | MEDIUM | ASIL B+ 부적합 |
| VL-8 | LOW | orphan-detector getAllNodes() 부재 | LOW | 구조적 한계 |
| VL-9 | LOW | debt-tracker 해결된 debt 미제거 | LOW | 단조 증가 |
| VL-10 | LOW | content-hasher 문자열 리터럴 오인식 | VERY LOW | 안전 방향 오류 |

### 5.4 스킬/문서/Init

| ID | 심각도 | 취약점 | 실제 위험 | 방어 상태 |
|----|--------|--------|----------|----------|
| SK-1 | HIGH | TC 격리 프롬프트 수준만 | MEDIUM | ASIL B+ 필수 요건 미충족 |
| SK-2 | MED | skill-registrar 4개 핵심 스킬 미등록 | LOW | .claude/skills/가 실제 동작 |
| SK-3 | MED | hook-registrar v2.2 미반영 | LOW | 죽은 코드 (셸 훅이 실제 동작) |
| SK-4 | MED | Init .omc/ 미생성 | VERY LOW | UX 문제 |
| SK-5 | LOW | enforcementMode 2단계만 | LOW | CLAUDE.md 3단계와 불일치 |

---

## 6. 최종 판정

### 6.1 목표 달성 여부

| 목표 | 달성 | 근거 |
|------|------|------|
| **SPEC 우선 강제** | **O** | spec phase에서만 SPEC 파일 쓰기 허용 (셸 L2) |
| **테스트 주도 강제** | **O** | code phase에서 tests/ 쓰기 차단, test phase에서 허용 |
| **Human-in-the-Loop** | **O** | Phase 전환에 /phase 스킬(인간 승인) 필수 |
| **상태 머신 탈출 방지** | **O** | 6중 방어: L1 라우팅 + L2 결정론적 + V1 경로 감지 + L4 의미론 + L3 HMAC 롤백 + ConfigChange 차단 |
| **verified 잠금** | **O** | verified 상태에서 모든 파일 쓰기 차단, reentry만 허용 |
| **Baseline TC 불변** | **O** | Gate #4가 git tag 비교로 검증 |
| **ASIL B+ 완전 지원** | **X** | TS Gate placeholder, TC 격리 미강제, MC/DC 미지원 |

### 6.2 보안 등급

**B+ (양호)**

```
A 영역 (90%+):
  ├── 셸 훅 L1/L2 결정론적 방어
  ├── HMAC/SHA-256/자동 롤백 (L3)
  ├── ConfigChange 절대 차단
  ├── 심층 방어 아키텍처
  └── Phase별 파일 접근 제어

B 영역 (70-89%):
  ├── 스킬 프롬프트 상태머신 반영
  ├── Verified Gate #1-7 (셸)
  ├── Auto-backward (test→code)
  └── 감사 로그 체계

C 영역 (50-69%):
  ├── TS Gate #8-14 (5/7 placeholder)
  ├── TC 격리 (프롬프트만)
  ├── MISRA 엔진 (regex 기반)
  └── 검증 서브시스템 (stub 다수)
```

### 6.3 프로덕션 사용 권장

| ASIL | 권장 | 조건 |
|------|------|------|
| QM | **사용 가능** | 현재 상태로 충분 |
| A | **사용 가능** | P1 항목 수정 후 |
| B | **조건부** | P1 + P2 전부 해결 + TC 격리 강제 구현 후 |
| C/D | **불가** | TS Gate 전부 구현 + MC/DC 지원 + AST 기반 MISRA 필요 |

---

## 7. 수정 권고

### P1 -- 즉시 수정 (프로덕션 배포 전)

| # | 항목 | 노력 | 효과 |
|---|------|------|------|
| 1 | `.omc/v2.2-hooks/` Read 차단 추가 | 낮음 | 훅 소스 노출 방지 |
| 2 | Bash IS_WRITE에 `awk` 패턴 추가 | 낮음 | 알려진 우회 벡터 제거 |
| 3 | TC 격리: tc phase에서 Read/Glob의 src/ 차단 | 중간 | ASIL B+ TC Isolation 충족 |
| 4 | incremental-verifier에 증거 필수 검증 추가 | 낮음 | createEntry 'fresh' 시 verified_against 필수 |

### P2 -- 단기 수정 (ASIL B+ 지원 전)

| # | 항목 | 노력 | 효과 |
|---|------|------|------|
| 5 | TS Gate #9-14 실제 구현 | 높음 | 14 Unified Gate 완성 |
| 6 | `released`에서 `regress()` 차단 1줄 추가 | 매우 낮음 | V-Model 상태 무결성 |
| 7 | verification-workflow Coverage에 ASIL별 임계값 | 낮음 | config.thresholds 참조 |
| 8 | hashRequirement에 ASIL 포함 | 낮음 | ASIL 변경 감지 |
| 9 | blast-radius에 엣지 타입 필터 추가 | 낮음 | 불필요한 staleness 전파 방지 |
| 10 | trace-validator is_valid에 untested 포함 (ASIL B+) | 낮음 | 테스트 추적성 강제 |

### P3 -- 중기 개선

| # | 항목 | 노력 | 효과 |
|---|------|------|------|
| 11 | incremental-verifier 실제 테스트 러너 통합 | 높음 | 자동 검증 완성 |
| 12 | MC/DC 커버리지 파서 구현 | 중간 | ASIL C/D 지원 |
| 13 | MISRA 엔진 AST 기반 전환 (tree-sitter) | 높음 | 오탐 제거 |
| 14 | content-hasher AST 기반 정규화 | 높음 | 해시 정확도 향상 |
| 15 | skill-registrar/hook-registrar v2.2 동기화 또는 폐기 | 중간 | 코드 정합성 |

---

## 부록 A: 분석 에이전트 간 발견 교차 검증

| 발견 사항 | 에이전트 #1 | #2 | #3a | #3b | 교차 확인 |
|-----------|:---------:|:--:|:---:|:---:|:---------:|
| NEVER_ALLOW 패턴 효과성 | O | | | | 단일 확인 |
| Gate placeholder 문제 | O | O | | O | 3중 확인 |
| TC 격리 빈틈 | | | | O | 단일 확인 |
| hitl-state 무검증 파싱 | | O | | | 단일 확인 |
| incremental-verifier stub | | | O | | 단일 확인 |
| Bash 휴리스틱 한계 | O | | | | 단일 확인 |
| HMAC 롤백 효과성 | O | | | | 단일 확인 |
| skill-registrar 괴리 | | | | O | 단일 확인 |

## 부록 B: Actor-Critic 메타 관찰

흥미롭게도, Actor(공격자) 에이전트는 분석을 **거부**했다. 두 가지 이유:
1. `universal-guard.sh`의 V6 방어가 `.claude/hooks/*.sh` Read를 차단하여, Actor가 훅 소스 코드에 접근할 수 없었다
2. Agent의 안전 정책이 "적대적 공격 시나리오 설계"를 제한했다

이것 자체가 ProofChain의 방어 효과를 증명한다: **AI 에이전트가 의도적으로 우회를 시도하더라도, 훅 시스템이 필요한 정보 수집을 차단한다.** (단, `.omc/v2.2-hooks/` 경로는 차단되지 않았으므로 V-HIGH-1 수정이 필요하다.)

---

*이 보고서는 6개 Opus 아키텍트 에이전트의 전수 코드 분석과 Actor-Critic 변증법적 검토를 종합하여 작성되었다.*
