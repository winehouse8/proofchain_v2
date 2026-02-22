# ProofChain vs Logic Playground: 아키텍처 비교 분석 보고서

**작성일**: 2026-02-20
**목적**: ISO 26262 기반 AI 코딩 보조 도구의 두 가지 접근 방식을 비교하여, 각각의 장단점과 최적 사용 시나리오를 분석한다.

---

## 1. 요약 (Executive Summary)

| 차원 | ProofChain | Logic Playground |
|------|-----------|-----------------|
| **핵심 철학** | 라이브러리형 안전 프레임워크 | 프로세스 강제 가드레일 |
| **언어** | TypeScript (strict 모드) | Bash + jq |
| **상태 관리** | SQLite (WAL, ACID) | JSON 파일 (hitl-state.json) |
| **강제 방식** | 2단계 훅 (Tier 1 동기 + Tier 2 비동기) | 단일 강제자 (check-phase.sh, 948줄) |
| **상태 머신** | 9단계 V-Model (ISO 26262 원본) | 5단계 HITL (spec-tc-code-test-verified) |
| **테스트** | 721개 단위 테스트 (Vitest) | 테스트 없음 (셸 스크립트) |
| **의존성** | better-sqlite3 | jq, git (OS 내장) |
| **코드 규모** | ~24,600줄 (93개 TS 파일) | ~1,400줄 (6개 sh 파일) |
| **배포 형태** | npm 패키지 (Claude Code 플러그인) | 디렉토리 복사 (프레임워크 템플릿) |

**결론**: 두 프로젝트는 같은 문제를 정반대 방향에서 해결한다. Logic Playground는 **프로세스 강제**(무엇을 언제 할 수 있는가)에 집중하고, ProofChain은 **산출물 검증**(결과가 안전한가)에 집중한다. 이상적인 시스템은 두 접근법을 결합한 것이다.

---

## 2. 아키텍처 개요

### 2.1 ProofChain: "라이브러리형 검증 엔진"

```
┌─────────────────────────────────────────────────────┐
│                   Claude Code Plugin                  │
│  ┌─────────┐  ┌────────┐  ┌──────────┐  ┌────────┐ │
│  │ 8 Skills │  │ 6 Hooks│  │ HUD      │  │ Plugin │ │
│  │ /phase   │  │ Tier 1 │  │ Provider │  │ Entry  │ │
│  │ /verify  │  │ Tier 2 │  │          │  │        │ │
│  └────┬─────┘  └───┬────┘  └────┬─────┘  └───┬────┘ │
│       │            │            │             │      │
│  ┌────┴────────────┴────────────┴─────────────┴────┐ │
│  │              Core Engine Layer                    │ │
│  │  ┌──────────┐ ┌─────┐ ┌────────┐ ┌───────────┐ │ │
│  │  │ V-Model  │ │ CCP │ │ MISRA  │ │Traceability│ │ │
│  │  │ StateMch │ │Orch.│ │ Rules  │ │ Matrix    │ │ │
│  │  └────┬─────┘ └──┬──┘ └───┬────┘ └─────┬─────┘ │ │
│  │       │          │        │             │       │ │
│  │  ┌────┴──────────┴────────┴─────────────┴────┐  │ │
│  │  │         SQLite (WAL Mode, ACID)            │  │ │
│  │  │  Ledger │ Graph │ Audit │ Debt │ Trace    │  │ │
│  │  └────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**특징**:
- 팩토리 함수 기반 (클래스 없음), 인터페이스 주입
- 모든 상태 변경이 SQLite 트랜잭션 내에서 원자적 실행
- CCP 파이프라인: 변경 감지 → 분류 → 영향 범위 → staleness 전파 → 게이트 → 재검증 계획 → 감사
- 콘텐츠 해시(SHA-256) 기반 검증 상태 추적
- 의존성 그래프 BFS로 staleness 전파 (인터페이스 변경: 전이적, 구현 변경: 1-hop)

### 2.2 Logic Playground: "프로세스 강제 가드레일"

```
┌─────────────────────────────────────────────────────┐
│                   Claude Code Session                 │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ PreToolUse: check-phase.sh (단일 강제자, 948줄) │ │
│  │  ┌─────────┐  ┌───────────┐  ┌──────────────┐  │ │
│  │  │ Layer 1  │  │ Layer 3   │  │ Self-Protect │  │ │
│  │  │ Guard    │  │ Gate      │  │ .claude/     │  │ │
│  │  │ (모든 op)│  │ (verified)│  │ 수정 차단    │  │ │
│  │  └─────────┘  └───────────┘  └──────────────┘  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌──────────────────────┐  ┌────────────────────┐    │
│  │ PostToolUse (3개)     │  │ Skills (6개)       │    │
│  │ phase-commit.sh      │  │ /ears-spec         │    │
│  │ trace-change.sh      │  │ /test-gen-design   │    │
│  │ artifact-commit.sh   │  │ /test-gen-code     │    │
│  └──────────┬───────────┘  │ /traceability      │    │
│             │              │ /frontend-design   │    │
│  ┌──────────┴───────────┐  │ /reset             │    │
│  │ hitl-state.json      │  └────────────────────┘    │
│  │ (JSON 단일 파일)      │                            │
│  │ + change-log.jsonl   │                            │
│  │ + git tags/commits   │                            │
│  └──────────────────────┘                            │
└─────────────────────────────────────────────────────┘
```

**특징**:
- 단일 셸 스크립트(check-phase.sh)가 모든 강제를 담당
- 5단계 상태 머신 (spec → tc → code → test → verified)
- hitl-state.json이 유일한 상태 저장소
- git tag로 baseline 불변성 검증
- fork context로 테스트 케이스 설계 격리
- auto-backward: test 단계에서 src/ 편집 시 자동으로 code 단계로 회귀

---

## 3. 핵심 차이점 상세 분석

### 3.1 상태 관리: SQLite vs JSON 파일

#### ProofChain (SQLite)

```
장점:
  - ACID 트랜잭션으로 6단계 CCP 파이프라인이 원자적 실행
  - WAL 모드로 동시 읽기/쓰기 지원
  - Prepared Statement로 반복 쿼리 최적화
  - 8개 테이블, 9개 인덱스로 구조화된 쿼리 가능
  - 복잡한 조인 쿼리 (의존성 그래프, 추적성 매트릭스)

단점:
  - better-sqlite3 네이티브 의존성 (빌드 필요)
  - DB 파일이 git diff에 불투명 (바이너리)
  - 디버깅 시 sqlite3 CLI 필요
  - 스키마 마이그레이션 관리 필요
```

#### Logic Playground (JSON)

```
장점:
  - 사람이 직접 읽고 편집 가능
  - git diff로 모든 상태 변경 추적 가능
  - jq 하나면 파싱 완료 (외부 의존성 최소)
  - 디버깅이 매우 쉬움 (cat으로 확인)
  - 스키마 마이그레이션 불필요

단점:
  - 트랜잭션 불가: jq > tmp && mv tmp file 패턴은 원자적이지 않음
  - 동시 접근 시 경쟁 조건 가능 (race condition)
  - 대규모 프로젝트에서 단일 파일 비대화
  - 복잡한 쿼리 불가 (예: "ASIL D인 stale 산출물 중 가장 오래된 것")
  - O(n) 전체 탐색만 가능 (인덱스 없음)
```

**판정**: 소규모 프로젝트(area 5개 이하)에서는 JSON이 더 실용적이다. 대규모 프로젝트(수십 개 area, 수백 개 산출물)에서는 SQLite가 필수적이다.

### 3.2 강제 방식: 2단계 훅 vs 단일 강제자

#### ProofChain (Tier 1 + Tier 2)

```
Tier 1 (PreToolUse, 200ms): 4개 검사 (조건부 차단)
  - goto, malloc → strict 모드 + ASIL A 이상에서만 차단
  - @trace 태그 누락 → 경고 주석만 (차단하지 않음)
  - 과도한 파일 크기 → 경고 주석만 (차단하지 않음)
  - QM 또는 warn 모드에서는 모든 검사가 경고만 발생

Tier 2 (PostToolUse, 2s 소프트 예산 / 30s 하드 타임아웃):
  - 14개 MISRA 규칙 전체 분석 (C/C++ 파일만 대상)
  - 절대 차단하지 않음 (allow + 주석)
  - 복잡도 분석, 타입 안전성, 메모리 패턴
  - AI에게 경고를 제공하되 작업 흐름을 중단하지 않음
  - 참고: TypeScript/Python 등 비-C 언어에서는 MISRA 분석이 비활성화됨
```

**장점**: Claude의 작업 속도를 거의 늦추지 않으면서도 안전 검사를 수행한다. 오탐(false positive)이 작업을 차단하지 않는다.

**단점**: Tier 1의 차단도 strict 모드 + ASIL A 이상에서만 작동하며, Tier 2는 항상 허용이므로 AI가 경고를 무시할 수 있다. QM 모드에서는 사실상 모든 검사가 soft enforcement에 불과하다.

#### Logic Playground (단일 강제자)

```
check-phase.sh (PreToolUse, 모든 Edit/Write/Bash):
  Layer 1 Guard: 모든 파일 쓰기에 대해 단계별 접근 제어
    - spec 단계 → .omc/specs/만 쓰기 가능
    - tc 단계 → .omc/test-cases/만 쓰기 가능
    - code 단계 → src/, tests/ 쓰기 가능
    - verified → 아무것도 쓰기 불가

  Layer 3 Gate: verified 전환 시 8개 순차 검사
    - @tc/@req 주석 완전성
    - Supplementary TC 스키마 검증
    - Baseline TC 불변성 (git tag 비교)
    - 재진입 로그 완전성
    - 단계 전환 유효성
```

**장점**: Hard enforcement. 위반 불가능. 파일 접근 자체를 차단하므로 "경고 무시" 시나리오가 없다.

**단점**: 모든 Edit/Write/Bash에서 실행되므로, 오탐 시 작업이 완전히 중단된다. 디버깅이 어렵다 (948줄 셸 스크립트).

**판정**: Logic Playground의 접근법이 **강제력** 면에서 우월하다. ProofChain의 접근법이 **사용성** 면에서 우월하다.

### 3.3 상태 머신: 9단계 V-Model vs 5단계 HITL

#### ProofChain (9단계)

```
requirements_spec → architecture_design → unit_design → implementation
  → unit_verification → integration_verify → safety_verify → verified → released
```

- ISO 26262 V-Model을 충실하게 모델링
- 각 단계별 게이트 조건이 다름 (예: implementation은 trace_tags + misra_clean + complexity_ok)
- 병렬 기능 트랙: 여러 feature가 서로 다른 단계에서 동시 진행
- 메타 상태: change_pending, reverify_required, debt_acknowledged

**장점**: ISO 26262 감사 시 1:1 매핑 가능. 단계가 세분화되어 있어 정확한 진행 상황 파악 가능.

**단점**: 9단계가 과도할 수 있음. architecture_design과 unit_design을 거치지 않는 소규모 변경에 부적합. AI 코딩 보조에서 "아키텍처 설계" 단계를 의미있게 강제하기 어려움.

#### Logic Playground (5단계)

```
spec → tc → code → test → verified
```

- SPEC을 단일 진실 원천(single source of truth)으로 취급
- TC(테스트 케이스 설계)와 test(테스트 코드)를 명확히 분리
- auto-backward: test 단계에서 src/ 수정 시 자동으로 code로 회귀
- Reentry: verified 이후 변경 시 cycle++ 증가, 전체 회귀 테스트 필수

**장점**: 5단계가 AI 코딩 워크플로우에 자연스럽게 매핑됨. TC 격리(fork context)가 실질적으로 검증 독립성을 보장함. auto-backward가 마찰 없이 상태 일관성을 유지함.

**단점**: ISO 26262의 아키텍처 설계, 안전 검증 등 중간 단계가 없음. 대규모 시스템에서 필요한 통합 검증 단계가 없음.

**판정**: Logic Playground의 5단계 모델이 **AI 코딩 워크플로우에 더 적합**하다. ProofChain의 9단계 모델이 **ISO 26262 준수 증명에 더 적합**하다.

### 3.4 테스트 케이스 격리

이것은 두 프로젝트의 가장 근본적인 차이점이다.

#### Logic Playground: TC 격리를 물리적으로 강제

```
/test-gen-design 스킬:
  - context: fork (별도의 Claude 대화 컨텍스트)
  - allowed-tools: Read, Glob, Grep, Write (Bash 없음)
  - src/ 읽기 금지 (스킬 명세에서 명시적으로 차단)

결과: 테스트 케이스가 SPEC에서만 파생됨.
      코드를 본 후 "통과하기 쉬운 테스트"를 작성하는 것이 불가능.
```

#### ProofChain: TC 격리 메커니즘 없음

```
검증 워크플로우가 커버리지 게이트와 MISRA 검사를 수행하지만,
테스트가 SPEC에서 파생되었는지 코드에서 파생되었는지 구분하지 않음.
```

**판정**: Logic Playground의 TC 격리가 **검증 품질 면에서 결정적 우위**다. 이것은 ProofChain에 가장 시급하게 추가해야 할 기능이다.

### 3.5 자기 보호 (Self-Protection)

#### Logic Playground

```
방어 항목:
  1. .claude/ 디렉토리 쓰기 차단 (Edit, Write, Bash 모두)
  2. git tag -d 차단 (검증 태그 삭제 방지)
  3. git checkout .claude/ 차단 (훅 복원 방지)
  4. git reset --hard 차단 (상태 파괴 방지)
  5. git push --force 차단 (원격 감사 추적 파괴 방지)

방어 상태: 7개 적대적 시나리오 중 4개 방어됨 (4/7)
미방어: 빈 테스트(A4), 스킬 미사용(A6), TC 설계 중 src/ 읽기(A7)
주의: /reset 스킬이 모든 상태를 초기화하므로 적대적 탈출구가 될 수 있음
```

#### ProofChain

```
방어 항목:
  1. Tier 1 훅이 치명적 코드 패턴 차단 (goto, malloc)
  2. 검증 부채 상한선 초과 시 릴리스 차단
  3. V-Model verified → released 전환 시 zero debt 필수

방어되지 않는 항목:
  1. 훅 파일 자체의 수정을 차단하지 않음
  2. git 히스토리 조작을 차단하지 않음
  3. hitl-state.json 등 상태 파일 직접 편집 가능
  4. 스킬 미사용 시나리오 미처리
```

**판정**: Logic Playground이 **자기 보호 면에서 현저히 우월**하다. ProofChain은 "무엇이 안전한 코드인가"를 검사하지만, "AI가 프레임워크 자체를 우회하는 것"을 막지 않는다.

### 3.6 감사 추적 (Audit Trail)

#### ProofChain

```
- 설계상 INSERT-only SQLite audit_events 테이블
- 모든 상태 전환에 before/after 스냅샷
- 타임스탬프, 이벤트 유형, 에이전트 ID, JSON 상세 정보
- 쿼리 가능: "지난 1시간 동안 ASIL D 산출물의 상태 변경 이력"
- 설계 관례상 INSERT-only (DB 수준 트리거로 강제되지는 않음)
```

#### Logic Playground

```
- hitl-state.json의 log 배열에 전환 기록 추가
- git commit 이력 (artifact-commit.sh, phase-commit.sh)
- change-log.jsonl에 파일 변경 기록
- git tag로 verified 마일스톤 보존

한계:
  - log 배열은 jq로 직접 편집 가능 (불변이 아님)
  - change-log.jsonl도 직접 편집 가능
  - git 히스토리만이 진정한 불변 기록
```

**판정**: ProofChain이 **감사 추적의 완전성과 쿼리 가능성** 면에서 우월하다. Logic Playground은 git 히스토리에 의존하는데, 이는 감사 목적으로는 충분하지만 실시간 쿼리에는 부적합하다.

### 3.7 확장성 (Scalability)

| 차원 | ProofChain | Logic Playground |
|-----|-----------|-----------------|
| 산출물 수 | SQLite 인덱스로 수천 개 지원 | JSON 파일 크기 증가로 성능 저하 |
| 병렬 기능 트랙 | V-Model 병렬 트랙 매니저 | 영역(area) 독립 상태 머신 |
| 의존성 그래프 | BFS + 전이적 전파 | 없음 (영역 간 의존성 미추적) |
| 규칙 확장 | RuleProvider 인터페이스 (플러그인 가능) | 셸 스크립트 수정 필요 |
| ASIL 수준 확장 | 설정 파일에서 임계값 조정 | 해당 없음 (ASIL 개념 없음) |

**판정**: ProofChain이 **대규모 프로젝트 확장성** 면에서 우월하다. Logic Playground은 단일 프로젝트, 단일 팀 규모에 최적화되어 있다.

---

## 4. ProofChain 장점 (Logic Playground 대비)

### 4.1 ASIL 등급 시스템
ProofChain은 ISO 26262의 ASIL(Automotive Safety Integrity Level) 체계를 완전히 구현한다. QM부터 D까지 5개 등급에 따라 커버리지 임계값, 복잡도 상한, 검증 부채 한도, 독립 검토 요구사항이 모두 달라진다. Logic Playground에는 등급 개념이 없다.

### 4.2 의존성 그래프 기반 staleness 전파
코드 A가 바뀌면, A에 의존하는 B, B에 의존하는 C까지 자동으로 "만료(stale)" 처리된다. 인터페이스 변경은 전이적으로 전파되고, 구현 변경은 1-hop만 전파된다. Logic Playground에는 이 메커니즘이 없어, 개발자가 수동으로 영향 범위를 판단해야 한다.

### 4.3 MISRA 코딩 규칙 자동 검사
14개 MISRA C:2012 규칙을 자동으로 검사하여 안전하지 않은 코드 패턴(goto, malloc, 포인터 산술, 재귀 등)을 탐지한다. 단, **C/C++ 파일(.c, .cpp, .h, .hpp)에만 적용**되며 TypeScript/Python 등 다른 언어에서는 비활성화된다. Logic Playground은 코드 품질 검사를 수행하지 않는다.

### 4.4 도구 자격 인증 (Tool Qualification)
ISO 26262 Part 8 Clause 11에 따른 자체 정확도 측정 체계를 갖추고 있다. 21개 알려진 위반 코퍼스로 95% 이상 탐지율을 검증한다.

### 4.5 721개 단위 테스트
프레임워크 자체가 721개 테스트로 검증되어 있다. Logic Playground의 셸 스크립트는 테스트가 없으므로, 프레임워크 자체의 정확성을 증명할 방법이 없다.

### 4.6 정형적 검증 보고서 생성
SRS, SAS, 검증 보고서, 추적성 매트릭스, 단위 설계 명세서 등 5종의 ISO 26262 문서를 자동 생성한다.

### 4.7 HUD 대시보드
실시간 안전 상태를 한 눈에 볼 수 있는 대시보드를 제공한다.

---

## 5. Logic Playground 장점 (ProofChain 대비)

### 5.1 물리적 프로세스 강제 (Hard Enforcement)
check-phase.sh가 모든 Edit/Write/Bash를 가로채서, 현재 단계에서 허용되지 않는 파일 접근을 **물리적으로 차단**한다. ProofChain의 Tier 2 훅은 "항상 허용 + 경고 주석"이므로 AI가 무시할 수 있지만, Logic Playground에서는 불가능하다.

### 5.2 TC 격리 (Test Case Isolation)
`/test-gen-design` 스킬이 fork context에서 실행되어 소스 코드를 볼 수 없다. 이것은 ISO 26262가 요구하는 "검증 독립성"을 물리적으로 구현한 것이다. ProofChain에는 이에 해당하는 메커니즘이 없다.

### 5.3 자기 보호 (Self-Protection)
`.claude/` 디렉토리 쓰기 차단, 파괴적 git 명령 차단이 구현되어 있다. AI가 프레임워크 자체를 우회하거나 변조하는 시나리오를 방어한다.

### 5.4 Baseline TC 불변성
첫 번째 verified 이후 Baseline TC의 given/when/then이 영구적으로 동결된다. git tag 비교로 검증하므로, TC를 변조하면 다음 verified 전환이 차단된다.

### 5.5 Reentry 프로토콜
verified 이후 변경이 필요하면 cycle++가 증가하고, 건너뛴 단계에 대한 skip_reason이 필수이며, 전체 회귀 테스트가 강제된다. 이것은 ISO 26262 Part 8 Section 8.7의 "단계 생략 정당화"를 직접 구현한 것이다.

### 5.6 Auto-Backward
test 단계에서 src/ 파일을 편집하면 자동으로 code 단계로 회귀한다. 개발자의 자연스러운 워크플로우를 방해하지 않으면서도 상태 일관성을 유지한다. ProofChain의 V-Model에는 이런 자동 회귀가 없다.

### 5.7 제로 의존성
jq와 git만 있으면 동작한다. npm install이 필요 없고, 네이티브 컴파일이 필요 없다. 어떤 환경에서든 즉시 사용 가능하다.

### 5.8 투명성
hitl-state.json은 사람이 직접 읽을 수 있고, git diff로 모든 변경을 추적할 수 있다. SQLite DB는 바이너리 파일이라 직접 읽기 어렵다.

### 5.9 자동 Git 이력
모든 SPEC/TC 편집이 자동 커밋되고, 모든 단계 전환이 자동 커밋+태그된다. 개발자가 수동으로 git 명령을 실행할 필요가 없다.

---

## 6. 정량적 비교

### 6.1 ISO 26262 준수 매핑

| ISO 26262 요구사항 | 조항 | ProofChain | Logic Playground |
|-------------------|------|-----------|-----------------|
| 양방향 추적성 (REQ↔Test) | Part 6 §9.3 | 추적성 매트릭스 + 갭 분석기 | @tc/@req 주석 강제 (Gate Check 1-2) |
| 검증 독립성 | Part 6 §9.4.3 | 미구현 | TC fork context 격리 |
| 회귀 테스트 | Part 6 §9.4.6 | 증분 재검증 스케줄러 | cycle > 1 시 전체 회귀 강제 |
| 요구사항당 테스트 | Part 6 §10.4.1 | 고아 탐지기 | Gate Check 1 (@tc 존재 확인) |
| 구성 항목 식별 | Part 8 §7.4.1 | 관리 경로 정의 | 관리 경로 정의 + 차단 |
| Baseline 수립 | Part 8 §7.4.3 | V-Model released 상태 | git tag (area-verified-cN) |
| Baseline 불변성 | Part 8 §7.4.3 | 미구현 | Gate Check 4 (git tag 비교) |
| 검증 후 변경 제어 | Part 8 §7.4.4 | 검증 부채 추적 | verified lock (완전 차단) |
| 구성 상태 기록 | Part 8 §7.4.5 | INSERT-only 감사 로그 | 자동 git commit |
| 변경 요청 식별 | Part 8 §8.4.1 | CCP 변경 분류기 | Gate Check 5 (reentry log) |
| 단계 생략 정당화 | Part 8 §8.7 | 미구현 | Gate Check 5 (skip_reason) |
| 도구 자격 인증 | Part 8 §11 | 자체 테스트 + TCL 보고서 | 미구현 |
| ASIL 등급별 차별 | Part 6 전체 | 5단계 ASIL 시스템 | 미구현 |
| 코딩 규칙 검사 | Part 6 §9.5 | 14개 MISRA 규칙 | 미구현 |
| 안전 검토 에이전트 | Part 6 §9.4.5 | ASIL별 독립/이중 검토 | 인간 검토에 의존 |

**ProofChain 고유 강점**: 9개 항목 (ASIL, MISRA, 도구 자격, 안전 검토 등)
**Logic Playground 고유 강점**: 5개 항목 (TC 격리, Baseline 불변성, 자기 보호, 단계 생략 정당화, 물리적 차단)
**공통**: 4개 항목

### 6.2 적대적 시나리오 방어 비교

| 시나리오 | ProofChain | Logic Playground |
|---------|-----------|-----------------|
| 단계 건너뛰기 (spec → code) | V-Model 게이트로 차단 | 전환 유효성 맵으로 차단 |
| 검증 태그 삭제 | 미방어 | git tag -d 차단 |
| 훅 파일 복원/변조 | 미방어 | .claude/ 쓰기 차단 |
| 빈 테스트로 통과 | 커버리지 게이트로 부분 방어 | 미방어 (A4) |
| 검증 없이 릴리스 | 검증 부채 상한으로 차단 | verified lock으로 차단 |
| TC 설계 시 src/ 읽기 | 미방어 | 미방어 (A7, fork context로 부분 방어) |
| 프레임워크 우회 시도 | 미방어 | 부분 방어 (4/7) |
| 요구사항 변경 후 재검증 미실시 | staleness 전파로 자동 감지 | Gate Check에서 감지 가능 |
| 의존성 변경 영향 누락 | BFS 전파로 자동 감지 | 미방어 (의존성 그래프 없음) |

---

## 7. 어떤 아키텍처가 더 좋은가?

### 7.1 단순 답변

**용도에 따라 다르다.**

- **"프로세스 강제가 목표"** → Logic Playground이 우월
- **"산출물 검증이 목표"** → ProofChain이 우월
- **"ISO 26262 인증 준비"** → 둘 다 필요

### 7.2 상세 분석

#### Logic Playground이 더 나은 경우

1. **소규모 팀이 처음으로 안전-중요 개발을 시작할 때**: 설치가 간단하고, 상태가 투명하고, 프로세스가 명확하다. "이 5단계를 따르면 된다"는 메시지가 직관적이다.

2. **AI가 프로세스를 우회하는 것을 최우선으로 막아야 할 때**: check-phase.sh의 hard enforcement가 유일한 선택이다. ProofChain의 "허용 + 경고" 방식은 충분하지 않을 수 있다.

3. **테스트 품질이 핵심 관심사일 때**: TC 격리(fork context)는 "코드를 보지 않고 테스트를 설계한다"는 근본 원칙을 물리적으로 강제한다. 이것은 ProofChain에 없는 고유한 강점이다.

#### ProofChain이 더 나은 경우

1. **대규모 프로젝트 (수십 개 모듈, 수백 개 산출물)**: SQLite 인덱스, 의존성 그래프 BFS, 병렬 V-Model 트랙이 필수적이다.

2. **ASIL 등급별 차별화가 필요할 때**: 안전-중요도가 다른 모듈이 혼재하는 프로젝트에서, 각 모듈에 다른 수준의 엄격함을 적용할 수 있다.

3. **변경 영향 분석이 중요할 때**: 의존성 그래프 기반 staleness 전파는 "이 인터페이스를 바꾸면 어디까지 영향을 받는가?"를 자동으로 계산한다.

4. **감사(audit)와 보고(reporting)가 주요 요구사항일 때**: SQLite 기반 쿼리 가능한 감사 로그, 5종 ISO 문서 자동 생성, 도구 자격 인증 보고서.

### 7.3 이상적인 아키텍처: 두 접근법의 결합

| 계층 | 출처 | 기능 |
|-----|-----|------|
| **프로세스 강제 (Layer 1)** | Logic Playground | check-phase.sh 스타일의 hard enforcement, 단계별 파일 접근 제어, .claude/ 자기 보호, 파괴적 git 차단 |
| **TC 격리 (Layer 2)** | Logic Playground | fork context 기반 TC 설계 격리, baseline TC 불변성, reentry 프로토콜 |
| **산출물 검증 (Layer 3)** | ProofChain | SQLite 기반 검증 원장, 콘텐츠 해시, staleness 전파, CCP 파이프라인 |
| **코드 품질 (Layer 4)** | ProofChain | MISRA 규칙 엔진, 복잡도 분석, 커버리지 게이트 |
| **ASIL 차별화 (Layer 5)** | ProofChain | 등급별 임계값, 독립 검토, 검증 부채 상한 |
| **감사/보고 (Layer 6)** | 양쪽 결합 | SQLite 감사 로그(ProofChain) + git 자동 커밋(Logic Playground) |

---

## 8. 권고사항

### 8.1 ProofChain에 추가해야 할 Logic Playground 기능

| 우선순위 | 기능 | 이유 |
|---------|------|------|
| **P0 (필수)** | TC 격리 메커니즘 | ISO 26262 검증 독립성의 핵심. fork context 또는 별도 에이전트로 TC 설계 격리 |
| **P0 (필수)** | .claude/ 자기 보호 | 프레임워크 무결성의 기본. Tier 1 훅에서 .claude/ 쓰기 차단 |
| **P1 (높음)** | 파괴적 git 명령 차단 | git tag -d, git reset --hard, git push --force 차단 |
| **P1 (높음)** | Baseline TC 불변성 | 첫 verified 이후 TC 변경 시 경고/차단 |
| **P1 (높음)** | 단계별 파일 접근 제어 | V-Model 단계에 따른 파일 쓰기 제한 (hard enforcement) |
| **P2 (중간)** | Reentry 프로토콜 | verified 이후 변경 시 skip_reason 필수, 전체 회귀 강제 |
| **P2 (중간)** | Auto-backward | test 단계에서 src/ 수정 시 자동 회귀 |
| **P3 (낮음)** | 자동 git 커밋 | 산출물 변경 시 자동 커밋, 단계 전환 시 자동 태그 |

### 8.2 Logic Playground에 추가해야 할 ProofChain 기능

| 우선순위 | 기능 | 이유 |
|---------|------|------|
| **P0 (필수)** | ASIL 등급 시스템 | 안전-중요도에 따른 차별화된 엄격함 |
| **P0 (필수)** | 의존성 그래프 + staleness 전파 | 변경 영향 분석 자동화 |
| **P1 (높음)** | 코딩 규칙 자동 검사 | MISRA 또는 동등한 규칙 엔진 |
| **P1 (높음)** | 커버리지 게이트 | ASIL별 커버리지 임계값 강제 |
| **P1 (높음)** | 프레임워크 자체 테스트 | check-phase.sh에 대한 단위 테스트 |
| **P2 (중간)** | 정형적 보고서 생성 | ISO 26262 문서 자동 생성 |
| **P2 (중간)** | 도구 자격 인증 | Part 8 Clause 11 준수 |
| **P3 (낮음)** | HUD 대시보드 | 실시간 안전 상태 표시 |

---

## 9. 종합 평가

### 9.1 성숙도 비교

| 평가 항목 | ProofChain | Logic Playground |
|----------|-----------|-----------------|
| 코드 품질 | A (721 테스트, strict TS) | C (테스트 없음, 셸 스크립트) |
| ISO 26262 커버리지 | B+ (9/14 요구사항) | B (7/14 요구사항, 다른 7개) |
| 강제력 | C+ (Tier 2가 soft) | A (hard enforcement) |
| 확장성 | A (SQLite, 인덱스) | C (JSON 파일) |
| 사용성 | B (설치 복잡) | A (복사만 하면 됨) |
| 투명성 | B (SQLite 불투명) | A (JSON + git) |
| 적대적 방어 | C (미방어 항목 다수) | B (4/7 방어) |
| TC 격리 | F (미구현) | A (fork context) |

### 9.2 한 문장 요약

> **ProofChain은 "안전한 코드를 쓰는 것"을 돕고, Logic Playground은 "안전한 프로세스를 따르는 것"을 강제한다. 두 가지 모두 ISO 26262가 요구하는 것이다.**

---

## 부록 A: 기술 사양 비교

| 사양 | ProofChain | Logic Playground |
|-----|-----------|-----------------|
| 언어 | TypeScript 5.7 (strict) | Bash 5.x + jq |
| 런타임 | Node.js >= 18 | POSIX shell |
| 상태 저장 | SQLite (WAL, better-sqlite3, 8 테이블) | JSON 파일 |
| 감사 저장 | SQLite audit_events (설계상 INSERT-only) | git history + log 배열 |
| 테스트 | 721 (Vitest 3.0) | 0 |
| 소스 크기 | ~24,600줄 / 93 파일 | ~1,400줄 / 6 파일 |
| 스킬 수 | 8 | 6 |
| 훅 수 | 6 (3 Pre + 3 Post) | 6 (1 Pre + 3 Post + 1 Session + 1 Compact) |
| 외부 의존성 | better-sqlite3 | jq, git |
| 배포 방식 | npm 패키지 | 디렉토리 복사 |
| ASIL 지원 | QM, A, B, C, D | 없음 |
| MISRA 규칙 | 14개 | 0개 |
| V-Model 단계 | 9 | 5 |
| 병렬 트랙 | 지원 (병렬 트랙 매니저) | 지원 (area 독립) |

## 부록 B: 파일 크기 비교

### ProofChain 주요 파일
```
src/core/types.ts                    524줄  (중앙 타입 시스템)
src/ccp/ccp-orchestrator.ts          ~300줄 (CCP 파이프라인)
src/ledger/verification-ledger.ts     356줄  (검증 원장)
src/v-model/state-machine.ts          329줄  (V-Model 상태 머신)
src/hooks/pre-tool-use.ts            ~200줄  (Tier 1 훅)
src/hooks/post-tool-use.ts           ~150줄  (Tier 2 훅)
```

### Logic Playground 주요 파일
```
.claude/hooks/check-phase.sh          948줄  (단일 강제자)
.claude/hooks/phase-commit.sh         186줄  (자동 커밋)
.claude/hooks/trace-change.sh         123줄  (변경 추적)
.claude/hooks/artifact-commit.sh       71줄  (산출물 커밋)
CLAUDE.md                           9,007B  (AI 행동 규칙)
.omc/HITL.md                        5,473B  (프로세스 정의)
```

---

*본 보고서는 두 프로젝트의 소스 코드, README, 아키텍처 문서를 기반으로 작성되었습니다.*
