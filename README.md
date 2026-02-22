# ProofChain

ISO 26262 기반 안전 등급 개발 강제자 (Claude Code용).
ProofChain은 Claude Code를 **HITL (Human-in-the-Loop) 개발 환경**으로 전환하여, 모든 코드 변경이 SPEC 우선 + 테스트 주도 워크플로우를 따르도록 강제한다.

## 핵심 개념: 5-Phase 상태 머신

모든 컴포넌트 영역은 다섯 단계를 순서대로 진행한다:

```
spec ──→ tc ──→ code ──→ test ──→ verified
  │       │      │        │          │
  │       │      │        │          │ reentry (cycle++)
  │       └──────┴────────┘          │
  │          ← backward              │
  └──────────────────────────────────┘
```

| Phase | 설명 | 주요 스킬 | 쓰기 가능 파일 |
|-------|------|-----------|---------------|
| **spec** | EARS 패턴으로 요구사항 작성 | `/ears-spec` | `.omc/specs/` |
| **tc** | SPEC 기반 TC 생성 (src/ 격리) | `/test-gen-design` | `.omc/test-cases/` |
| **code** | 구현 코딩 | — | `src/` |
| **test** | 테스트 코드 생성, 실행, 수정 반복 | `/test-gen-code` | `tests/`, `src/` |
| **verified** | 모든 게이트 통과 — 영역 잠금 | `/verify` | 없음 (잠금) |

**Phase 전환에는 사람의 승인이 필요하다.** 강제자는 현재 Phase에 맞지 않는 파일 수정을 차단한다 (예: `spec` 단계에서 `src/` 편집 불가).

### 세 가지 전환 유형

상태 머신에는 **forward**, **backward**, **reentry** 세 가지 전환이 있다.

#### Forward (정방향)

현재 단계를 완료하고 사람이 승인하면 다음 단계로 진행한다. `/phase` 스킬로 전환.

```
spec → tc → code → test → verified
```

#### Backward (역방향, 같은 cycle 내)

아직 `verified`에 도달하지 않은 상태에서 이전 단계의 문제를 발견하면, 같은 cycle 내에서 되돌아간다. cycle 카운터는 변하지 않는다.

```
test ──backward──→ tc     TC 부족 발견, 보충 필요
test ──backward──→ code   구현 수정 필요
code ──backward──→ spec   SPEC 오류 발견
```

**Cycle 1 backward는 자유롭다** — 아직 한 번도 verified되지 않았으므로 베이스라인 TC도 통째로 재생성할 수 있다.

#### Reentry (재진입, verified 이후)

`verified` 완료 후 변경이 필요하면 reentry로 재진입한다. **cycle 카운터가 증가**하고, cycle > 1에서는 **전체 회귀 테스트**가 필수다.

진입 지점은 변경 범위에 따라 달라진다:

| 시나리오 | 예시 | 진입 Phase | 건너뜀 |
|---------|------|-----------|--------|
| **SPEC 변경** | 새 기능 추가, 요구사항 오류 | `spec` | 없음 (전체 사이클) |
| **TC 보충/코드 수정** | TC 부족, 코드 버그 (SPEC 정확) | `tc` | `spec` |
| **테스트 코드만 수정** | 테스트 구현 오류 | `code` | `spec`, `tc` |

**Reentry 후 베이스라인 TC 불변 원칙**: 최초 verified 이후 `origin: "baseline"` TC의 given/when/then은 수정/삭제할 수 없다. TC를 보충할 때는 `origin: "supplementary"`로 새 TC를 추가한다. 기존 TC가 SPEC 변경으로 무효화되면 `status: "obsolete"`로 마킹하고 대체 TC를 생성한다.

### 상태 전환 예시

**예시 1: 첫 개발 (정상 흐름)**
```
spec [cycle 1] → tc → code → test → verified    # 완료!
```

**예시 2: 코딩 중 SPEC 오류 발견 (backward)**
```
spec [cycle 1] → tc → code → (SPEC 오류 발견!)
                               ↓ backward
                      spec → tc → code → test → verified
```

**예시 3: verified 후 TC 부족 발견 (reentry)**
```
[cycle 1] spec → tc → code → test → verified
                                        ↓ reentry (cycle 2)
[cycle 2]        tc → code → test → verified
                 ↑ supplementary TC 추가
                 (baseline TC는 그대로 유지)
```

**예시 4: verified 후 새 기능 추가 (reentry, 전체)**
```
[cycle 1] spec → tc → code → test → verified
                                        ↓ reentry (cycle 2)
[cycle 2] spec → tc → code → test → verified
          ↑ SPEC 확장
```

## 사전 요구사항

- **Node.js** >= 18.0.0
- **Claude Code** (Anthropic CLI)
- **macOS / Linux** (셸 훅에 bash 필요)

## 설치

```bash
# 1. 클론 및 의존성 설치
git clone <repo-url> && cd proofchain
npm install

# 2. TypeScript 엔진 빌드
npm run build

# 3. 훅 설치 (터미널에서 직접 실행, Claude Code 내에서 실행 금지)
bash .omc/v2.2-hooks/install-v2.2.sh
```

설치 후 새 Claude Code 세션을 시작하면 방어 계층 초기화 메시지가 출력된다.

## 사용법

### 세션 시작

모든 세션은 자동 **HITL 현황 보고**로 시작된다:

```
=== HITL 현황 ===
CP (컴포넌트)  : verified [cycle 1] → 완료. 변경 시 reentry 필요.
CV (캔버스)    : code [cycle 1]     → 다음: 코딩 계속
WR (와이어링)  : test [cycle 2]     → 다음: 테스트 반복 (회귀 포함)
```

작업할 영역과 단계를 선택한다.

### 일반 워크플로우

**1. 요구사항 정의**
```
/ears-spec
```
EARS (Easy Approach to Requirements Syntax) 패턴으로 구조화된 요구사항을 작성한다. 각 요구사항에 고유 REQ ID가 부여된다.

**2. 테스트 케이스 생성**
```
/test-gen-design
```
SPEC에서 베이스라인 TC를 생성한다. **격리된 컨텍스트**에서 실행되어 `src/`를 볼 수 없으므로, 테스트가 순수하게 요구사항에서만 도출된다.

**3. 코딩 단계로 전환**
```
/phase
```
해당 영역을 `code` Phase로 전환한다. 이제 `src/`에 쓰기가 가능하다.

**4. 구현**

코드를 작성한다. 강제자가 이 단계에서 테스트 파일과 SPEC 수정을 차단한다.

**5. 테스트 코드 생성 및 실행**
```
/test-gen-code
```
TC 명세에서 실행 가능한 테스트 코드를 생성하고, 실행 후 실패하면 수정 루프에 진입한다.

**6. 검증 및 잠금**
```
/verify
```
모든 게이트 검사를 실행한다 (커버리지 임계값, 추적성, MISRA 규칙 등). 통과하면 영역이 `verified`로 전환되고 잠긴다.

### 검증 완료 후 수정 (Reentry)

`verified` 영역에 변경이 필요하면 reentry를 시작한다. 상태 머신의 세 가지 전환 유형과 시나리오별 진입 지점은 위의 [핵심 개념](#핵심-개념-5-phase-상태-머신) 섹션을 참고한다.

## 스킬 레퍼런스

| 스킬 | 용도 |
|------|------|
| `/ears-spec` | SPEC 작성 co-pilot (EARS 패턴) |
| `/test-gen-design` | 베이스라인 TC 생성 (소스 코드 격리) |
| `/test-gen-code` | 테스트 코드 생성 + 실행 + 수정 루프 |
| `/phase` | Phase 전환 + 게이트 검사 |
| `/verify` | 검증 실행 (커버리지 + MISRA + 추적성) |
| `/traceability` | 추적성 매트릭스 (REQ <-> TC <-> Test) |
| `/trace` | 추적 태그 관리 (@tc, @req 어노테이션) |
| `/impact` | 변경 영향 분석 |
| `/safety-doc` | 안전 문서 생성 |
| `/tool-qual` | 도구 자격 인증 (ISO 26262 Part 8 §11) |
| `/reset` | 프로세스 초기화 (ASIL B+에서 사람 확인 필수) |

## 방어 아키텍처

ProofChain은 계층형 훅 시스템으로 프로세스 무결성을 강제한다:

| 계층 | 역할 | 메커니즘 |
|------|------|---------|
| L1 | 라우터 + 접근 제어 | 셸 훅 — 도구 호출 라우팅, Phase 위반 파일 접근 차단 |
| L2 | 결정론적 Phase 가드 | 셸 훅 — 상태 머신 규칙 강제 |
| L3 | 무결성 | SHA-256 + HMAC — 훅 및 설정 변조 탐지 |
| L4 | 의미론적 가드 | AI 기반 엣지 케이스 분석 |
| +1 | 자동화 | SPEC/TC 자동 커밋, Phase 전환 커밋, git 태그 |

## ASIL 레벨

ProofChain은 설정된 ASIL 레벨에 따라 엄격도를 조절한다 (`.proofchain/` 디렉토리, 설치 시 생성):

| ASIL | Phase 가드 | 커버리지 게이트 | TC 격리 |
|------|-----------|---------------|---------|
| QM | 경고만 | 60/50/0% | 선택 |
| A | 경고만 | 70/60/50% | 권장 |
| B | 차단 | 80/70/60% | **필수** |
| C | 차단 | 90/85/80% | **필수** |
| D | 차단 | 95/95/90% | **필수** |

## 프로젝트 구조

```
src/                    TypeScript 엔진 (core, rules, bridge, ledger, ...)
.claude/hooks/          설치된 셸 훅 (11개 파일)
.claude/skills/         슬래시 커맨드 스킬
.proofchain/            ASIL 설정 및 게이트 임계값 (설치 시 생성)
.omc/hitl-state.json    Phase 상태 (단일 진실 원천)
.omc/HITL.md            HITL 프로세스 정의
docs/                   설계 문서 및 아키텍처
```

## 문서

| 문서 | 설명 |
|------|------|
| [아키텍처](docs/ARCHITECTURE.md) | v2.2 전체 아키텍처 레퍼런스 |
| [HITL 프로세스](.omc/HITL.md) | Phase 규칙 및 상태 머신 상세 |
| [적대적 분석](docs/adversarial-analysis-traceability-state-machine.md) | 보안 위협 분석 |
| [아키텍처 비교](docs/architecture-comparison-report.md) | 전통적 접근법과의 비교 |
| [탈출 방지 설계](docs/escape-proof-state-machine-design.md) | 상태 머신 보안 증명 |
| [갭 분석](docs/gap-analysis-traditional-se-vs-ai-assisted.md) | 전통 SE vs AI 보조 개발 |
| [오컴의 면도날 방어](docs/occams-razor-defense-analysis.md) | 최소 방어 계층 분석 |

## 라이선스

MIT
