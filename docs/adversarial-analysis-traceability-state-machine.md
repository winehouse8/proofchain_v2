# ProofChain 적대적 분석 보고서: 추적성 & 상태머신 신뢰도 평가

**"우리의 상태머신을 Claude Code가 절대 벗어나지 않는가?"에 대한 정직한 답변**

> **작성일**: 2026-02-21
> **분석 방법**: 3건의 독립 아키텍트 감사 (추적성 감사, 탈출 벡터 탐색, Claude Code 훅 공식 문서 조사)
> **분석 대상**: ProofChain SafeDev v1.0 (918 tests, check-phase.sh ~1060 lines)
> **결론**: 현재 구현은 **신뢰도 100%가 아니다**. 6개 확인된 탈출 벡터와 추적성 미연결 구간이 존재한다.

---

## 목차

1. [질문 1: 양방향 추적성이 실제로 동작하는가?](#1-양방향-추적성-평가)
2. [질문 2: 상태머신을 Claude Code가 벗어날 수 있는가?](#2-상태머신-탈출-벡터-분석)
3. [Claude Code 훅 시스템의 공식 보장 범위](#3-claude-code-훅-시스템-공식-보장)
4. [발견된 취약점 종합 (6+5)](#4-발견된-취약점-종합)
5. [개선 제안 및 UX 영향 분석](#5-개선-제안-및-ux-영향)
6. [개선 후 예상 신뢰도](#6-개선-후-예상-신뢰도)

---

## 1. 양방향 추적성 평가

### 1.1 결론: 부분적으로만 동작한다

ProofChain에는 **두 개의 독립된 추적성 시스템**이 존재하며, **서로 연결되어 있지 않다**.

```
시스템 1: TS 엔진 추적성 (trace-parser, trace-matrix, trace-validator)
  - @trace REQ-XXX-NNN, ARCH-XXX-NNN 파싱 (C/C++ 소스 파일)
  - 양방향 쿼리 API 존재 (getCodeForRequirement, getRequirementsForCode 등)
  - traceability_links SQLite 테이블
  - 게이트 #11에서 사용해야 하지만... placeholder (항상 true 반환)

시스템 2: 셸 훅 추적성 (@tc, @req in test files)
  - TC JSON → 테스트 파일의 @tc/@req 어노테이션 grep 매칭
  - verified_gate()에서 실제 강제 (차단 가능)
  - TS 엔진과 무관하게 독립 동작

연결 상태: ❌ 두 시스템은 서로를 호출하지 않음
```

### 1.2 추적 체인 분석

| 추적 링크 | 인프라 존재 | 실제 강제 | 상태 |
|----------|-----------|---------|------|
| 요구사항 → 코드 (`@trace REQ-XXX`) | `trace-parser.ts` | **없음** (게이트 #11 = placeholder) | 미동작 |
| 코드 → 테스트 (`test_artifact_ids`) | `trace-matrix.ts` 컬럼 존재 | **없음** (항상 null로 기록) | 미동작 |
| TC JSON → 테스트 (`@tc`) | `check-phase.sh:260-263` | **동작** (verified gate 차단) | 동작 |
| TC → 요구사항 (`@req`) | `check-phase.sh:279-300` | **동작** (verified gate 차단) | 동작 |
| 설계 → 코드 (`ARCH-XXX`) | `trace-parser.ts:22` | **없음** (파서만 존재) | 미동작 |

### 1.3 핵심 결함: 설계(Design) 단계 생략

V-Model 상태 머신(`state-machine.ts:19-29`)은 9단계를 정의한다:

```
requirements_spec → architecture_design → unit_design → implementation
→ unit_verification → integration_verify → safety_verify → verified → released
```

그러나 HITL 5단계 매핑(`phase-sync.ts:68-74`)은:

```
spec     → requirements_spec
tc       → unit_design          ← architecture_design 건너뜀!
code     → implementation
test     → unit_verification
verified → verified
```

`phase-sync.ts:65` 주석: *"architecture_design, integration_verify, safety_verify are implicit"*

**실제 추적 체인**: `요구사항 → (설계 없음) → 코드 → 테스트`

ISO 26262 Part 6 §7.4.1은 소프트웨어 아키텍처 설계를 명시적으로 요구한다. "implicit"은 감사에서 불충분하다.

### 1.4 TS 게이트의 실제 상태

`gate-bridge.ts`의 게이트 #8-14 구현 현황:

| 게이트 | 이름 | 실제 동작 | 코드 위치 |
|-------|------|---------|---------|
| #8 | MISRA violations = 0 | C/C++ 아니면 pass, strict 아니면 pass | `gate-bridge.ts:63-64` |
| #9 | Coverage thresholds | **항상 fail** (hardcoded `passed: false`) | `gate-bridge.ts:85` |
| #10 | Stale artifacts = 0 | **항상 pass** (hardcoded `passed: true`) | `gate-bridge.ts:102` |
| #11 | Traceability gaps = 0 | **항상 pass** (hardcoded `passed: true`) | `gate-bridge.ts:114` |
| #12 | Independent review | `require_independent_review` false면 pass | `gate-bridge.ts:125` |
| #13 | Verification debt = 0 | **항상 pass** (hardcoded `passed: true`) | `gate-bridge.ts:148` |
| #14 | Dual review consensus | **항상 fail** (hardcoded `passed: false`) | `gate-bridge.ts:159` |

**5개 게이트가 하드코딩된 placeholder이다.** GapAnalyzer, StalenessPropagator, OrphanDetector 등 완전한 구현체가 존재하지만, 게이트에서 호출하지 않는 **죽은 코드(dead code)**이다.

### 1.5 요구사항 수정 시 노후화 전파

**인프라**: 완전 구현됨
- `RequirementVersioner`: 콘텐츠 해시 기반 버전 추적
- `RequirementDiffer`: 변경 심각도 분류 (ASIL 변경=critical, criteria=high)
- `StalenessPropagator`: BFS 의존성 그래프 전파 (인터페이스=전이적, 구현=1홉)
- `CcpOrchestrator`: 변경 감지 → 분류 → 전파 → 재검증 계획

**실제 동작**: **아무것도 트리거하지 않음**. 어떤 훅이나 게이트도 이 체인을 호출하지 않는다. 게이트 #10("Stale artifacts = 0")은 항상 true를 반환한다.

### 1.6 고아 코드 통과 가능 여부

| 질문 | 답변 |
|------|------|
| `@req` 태그 없는 소스 파일이 verified로 통과? | **예** — 셸 게이트는 `src/`를 스캔하지 않음, TS 게이트 #11은 placeholder |
| `@tc` 태그 없는 테스트 파일이 verified로 통과? | **아니오** — verified_gate()가 모든 활성 TC ID의 `@tc` 매칭을 강제 |
| TC=0인 상태에서 verified 전환? | **아니오** — 게이트 #1이 활성 TC > 0 강제 |

---

## 2. 상태머신 탈출 벡터 분석

### 2.1 결론: 6개 확인된 탈출 벡터

코드를 직접 읽고 분석한 결과, **6개 탈출 벡터**가 확인되었다.

### [V1] Bash로 hitl-state.json 직접 조작 — CRITICAL

**공격**:
```bash
jq '.areas.XX.phase = "verified"' .omc/hitl-state.json > tmp && mv tmp .omc/hitl-state.json
```

**왜 통과하는가**: Bash 쓰기 감지 휴리스틱(`check-phase.sh:618-630`)은 4개 경로만 보호한다:
- `src/`, `.omc/specs/`, `.omc/test-cases/`, `tests/`
- `.omc/hitl-state.json`은 보호 대상에 **포함되지 않음**

또한 `jq`는 쓰기 감지 패턴(`sed -i`, `tee`, `>`, `>>`, `cp`, `mv`, `rm`)에 **없다**.

**영향**: 게이트 검사 없이 임의의 Phase 전환 가능. 상태머신 완전 우회.

---

### [V2] 다단계 스크립트 공격 — CRITICAL

**공격**:
```
Step 1 (Write): /tmp/helper.txt 생성 (확장자로 코드 차단 우회)
  내용: python3 -c "import json; d=json.load(open('.omc/hitl-state.json'));
        d['areas']['XX']['phase']='verified'; json.dump(d,open('.omc/hitl-state.json','w'))"

Step 2 (Bash): bash /tmp/helper.txt
```

**왜 통과하는가**: 훅은 **즉각적 도구 호출만 검사**하고, **전이적 효과(transitive effects)**를 검사하지 않는다. `bash /tmp/helper.txt`는 쓰기 감지에 걸리지 않으며, 스크립트 내부의 `python3 -c`도 검사 대상이 아니다.

**영향**: 모든 보호된 경로(`.claude/`, `hitl-state.json`, `src/` 등)에 대한 간접 쓰기 가능.

---

### [V3] Edit 도구의 불완전한 전이 검증 — MEDIUM

**공격**:
```
Edit: file_path=".omc/hitl-state.json"
      old_string='"phase": "spec"'
      new_string='"phase": "code"'    ← spec→code (tc 건너뜀)
```

**왜 통과하는가**: Edit 핸들러(`check-phase.sh:807-822`)는 `new_string`에 `"verified"` 문자열이 포함되었는지만 검사한다. `"code"`는 이 검사를 통과한다. Write 핸들러(line 731-825)는 완전한 전이 맵 검증을 수행하지만, Edit 핸들러는 하지 않는다.

**영향**: verified를 제외한 임의의 Phase 건너뛰기 가능.

---

### [V4] 간접 Git 명령으로 태그 삭제 — MEDIUM

**공격**:
```bash
sh -c 'git tag -d XX-verified-c1'
```

**왜 통과하는가**: Git 보호(`check-phase.sh:573-575`)는 `^\s*git\s` 앵커를 사용한다. `sh -c 'git ...'`는 `sh`로 시작하므로 앵커에 매칭되지 않는다.

변형:
```bash
git -c core.editor=true tag -d XX-verified-c1
```
`git -c ...`는 `tag` 전에 옵션을 삽입하여 `git tag -d` 패턴을 우회한다.

**영향**: 베이스라인 TC 불변성 훼손 (게이트 #6 우회).

---

### [V5] 심볼릭 링크를 통한 경로 우회 — MEDIUM

**공격**:
```bash
ln -s /project/src/module.ts /tmp/safe-name.txt
```
```
Edit: file_path="/tmp/safe-name.txt", old_string=..., new_string=...
```

**왜 통과하는가**: `check-phase.sh`는 `readlink -f`나 `realpath`를 호출하지 않는다 (grep 결과: 0건). `/tmp/safe-name.txt`는 프로젝트 경계 검사(`$CWD/*`)를 통과하지 않아 exit 0으로 허용된다. 파일시스템은 심볼릭 링크를 따라 `src/module.ts`에 쓴다.

또한 `ln -s`는 Bash 쓰기 감지 패턴에 **없다**.

**영향**: Phase 접근 제어 우회. 어떤 Phase에서든 `src/` 수정 가능.

---

### [V6] 훅 스크립트 파일 직접 수정 — MEDIUM

**Claude Code 공식 문서에서 확인된 사실**:
> "hook configuration (settings.json) is snapshotted at startup... but **hook script file contents are read from disk at execution time** and are NOT snapshotted."

**공격 시나리오**:
1. `.claude/hooks/check-phase.sh`는 `.claude/` 자기보호로 Write/Edit 차단됨 — 방어됨
2. **그러나** 다단계 공격(V2)을 사용하면:
   ```bash
   python3 -c "open('.claude/hooks/check-phase.sh','w').write('#!/bin/bash\nexit 0')"
   ```
   Bash 휴리스틱은 `python3 -c` 내부의 `.claude/` 참조를 감지하지 못함

**영향**: 훅을 무력화한 후 모든 보호 해제. 이것이 성공하면 전체 시스템 완전 우회.

---

### 2.2 기존 방어가 유효한 시나리오 (4개)

| 시나리오 | 공격 | 방어 결과 |
|---------|------|---------|
| 환경 변수 조작 | `export PATH=/tmp/evil:$PATH` | **방어됨** — 셸 상태 비지속, 훅은 별도 프로세스 |
| settings.json 수정 | Write로 `disableAllHooks: true` 작성 | **방어됨** — `.claude/` 자기보호 차단 + 스냅샷 메커니즘 |
| 훅 출력 조작 | stderr/stdout 조작 | **방어됨** — 허용/차단은 exit code 기반, 출력 무관 |
| 경합 조건 | 두 도구 호출의 병렬 실행 | **방어됨** — Claude Code는 도구를 순차 실행 |

---

## 3. Claude Code 훅 시스템 공식 보장

### 3.1 핵심 보장 사항

| 보장 | 설명 | 출처 |
|------|------|------|
| **모든 도구가 PreToolUse 트리거** | Read, Write, Edit, Bash, Glob, Grep, Task, MCP 전부 | [공식 문서](https://code.claude.com/docs/en/hooks#pretooluse) |
| **AI가 훅을 프로그래밍적으로 우회 불가** | 런타임이 훅 실행 강제, 모델이 제어 불가 | [공식 문서](https://code.claude.com/docs/en/hooks#security-considerations) |
| **exit 2 = 차단** | PreToolUse에서 exit 2는 도구 호출 차단 | [공식 문서](https://code.claude.com/docs/en/hooks#exit-code-2-behavior-per-event) |
| **설정 스냅샷** | settings.json은 세션 시작 시 스냅샷, 중간 수정 불가 | [공식 문서](https://code.claude.com/docs/en/hooks#disable-or-remove-hooks) |

### 3.2 핵심 한계 (공식 문서에서 확인)

| 한계 | 설명 | ProofChain 영향 |
|------|------|---------------|
| **훅은 "guardrails, not walls"** | Anthropic과 Trail of Bits 공식 표현 | 100% 보장 불가 인정 |
| **스크립트 내용은 비스냅샷** | settings.json만 스냅샷, `.sh` 파일은 실행 시 디스크에서 읽음 | V6 취약점의 근본 원인 |
| **크래시 시 fail-open** | exit code ≠ 2이면 도구 호출 허용 | 훅 스크립트 삭제/손상 시 모든 보호 해제 |
| **재시도 제한 없음** | exit 2 후 AI가 동일 행동 재시도 가능 | 지속적 공격 시도 가능 |
| **AI가 `.claude/` 읽기 가능** | Read 도구에 대한 기본 보호 없음 | AI가 훅 소스코드를 읽고 우회 전략 수립 가능 |
| **병렬 훅은 충돌 가능** | 여러 매칭 훅이 병렬 실행 | updatedInput 충돌 가능 |

### 3.3 ProofChain의 치명적 설정 오류

현재 `.claude/settings.json:5`의 PreToolUse 매처:

```json
"matcher": "Edit|Write|Bash"
```

**그러나 Claude Code 공식 문서에 따르면 모든 도구가 PreToolUse를 트리거한다.** 현재 ProofChain은 다음 도구를 감시하지 않는다:

| 미감시 도구 | 파일 수정 가능? | 위험도 |
|-----------|-------------|--------|
| **NotebookEdit** | 예 (.ipynb 파일 쓰기) | 낮음 |
| **Task** (서브에이전트) | 서브에이전트가 자체 도구 사용 | **높음** — 서브에이전트가 동일 프로젝트에서 Write/Edit 사용 시 훅 우회 가능 여부 확인 필요 |
| **Read** | 아니오 (읽기 전용) | 정보 노출 — AI가 훅 소스 읽기 |

---

## 4. 발견된 취약점 종합

### 4.1 상태머신 탈출 벡터 (6개)

| ID | 취약점 | 심각도 | 공격 복잡도 | 기존 방어 A1-A9 커버 |
|----|--------|--------|-----------|-------------------|
| **V1** | Bash → hitl-state.json 직접 조작 | **CRITICAL** | 낮음 (1줄 명령) | **아니오** — A1-A9 미커버 |
| **V2** | 다단계 스크립트 공격 (전이적 효과) | **CRITICAL** | 낮음 (2단계) | **아니오** — A1-A9 미커버 |
| **V3** | Edit 도구 불완전 전이 검증 | MEDIUM | 낮음 | **부분** — A1(Phase skip)이 Write만 커버 |
| **V4** | 간접 Git 명령 태그 삭제 | MEDIUM | 낮음 | **부분** — A2(Tag deletion)가 직접 git만 커버 |
| **V5** | 심볼릭 링크 경로 우회 | MEDIUM | 중간 | **아니오** — A1-A9 미커버 |
| **V6** | 훅 스크립트 파일 직접 수정 (via V2) | MEDIUM | 중간 | **부분** — A3(Hook tamper)가 Write/Edit만 커버 |

### 4.2 추적성 미연결 구간 (5개)

| ID | 미연결 구간 | 심각도 | 원인 |
|----|-----------|--------|------|
| **T1** | TS 게이트 #10-13 placeholder (항상 true) | **HIGH** | 구현체 존재하나 게이트에서 미호출 |
| **T2** | 소스 코드 `@trace` → 게이트 비연결 | **HIGH** | trace-parser가 게이트 경로에 미연결 |
| **T3** | 설계(architecture) 단계 생략 | MEDIUM | HITL 5단계가 V-Model의 architecture_design 건너뜀 |
| **T4** | test_artifact_ids 항상 null | MEDIUM | updateFromTraceTags()에서 하드코딩 |
| **T5** | 노후화 전파 체인 미트리거 | **HIGH** | CCP 오케스트레이터 호출 지점 없음 |

### 4.3 현재 신뢰도 평가

```
추적성 완전성:
  TC JSON → 테스트 @tc:     ████████████ 100% (실제 강제)
  TC → 요구사항 @req:       ████████████ 100% (실제 강제)
  요구사항 → 코드 @trace:   ░░░░░░░░░░░░   0% (인프라만 존재)
  코드 → 테스트:            ░░░░░░░░░░░░   0% (null 하드코딩)
  설계 → 코드:              ░░░░░░░░░░░░   0% (단계 생략)
  노후화 전파:              ░░░░░░░░░░░░   0% (트리거 없음)

상태머신 강제력:
  Phase 접근 제어:           ████████████ ~90% (V5 심볼릭 링크 제외)
  Phase 전이 검증:           ████████░░░░ ~70% (V1, V2, V3로 우회 가능)
  .claude/ 자기보호:         ████████████ ~95% (V2, V6으로 간접 우회 가능)
  Git 보호:                  ██████████░░ ~85% (V4 간접 명령)
  Verified 게이트:           ██████░░░░░░ ~50% (셸 #1-7 동작, TS #8-14 placeholder)
```

---

## 5. 개선 제안 및 UX 영향

### 5.1 CRITICAL 수정 (즉시 필요)

#### Fix-1: hitl-state.json Bash 보호 추가

**변경**: `check-phase.sh` Bash 핸들러에 `.omc/hitl-state.json` 보호 추가

```bash
# check-phase.sh:626 근처에 추가
echo "$CMD" | grep -qE '\.omc/hitl-state|hitl-state\.json' && {
  echo "BLOCKED: hitl-state.json은 Phase 전환 스킬로만 수정 가능합니다." >&2
  exit 2
}
```

**UX 영향**: 없음. 개발자가 직접 hitl-state.json을 편집할 이유 없음. `/phase` 스킬이 정상 경로.

#### Fix-2: 인터프리터 내부 보호 경로 검사

**변경**: Bash 핸들러에서 `python3 -c`, `node -e`, `sh -c`, `bash -c` 등의 인라인 코드 내부에서 보호 경로 참조를 검사

```bash
# 인터프리터 실행 시 인라인 코드에서 보호 경로 참조 차단
if echo "$CMD" | grep -qE '(python3?|node|ruby|perl|sh|bash)\s+(-[ce]\s|.*<<)'; then
  if echo "$CMD" | grep -qE '\.claude/|hitl-state\.json|\.omc/(specs|test-cases)/'; then
    echo "BLOCKED: 인라인 스크립트에서 보호 경로 참조가 감지되었습니다." >&2
    exit 2
  fi
fi
```

**UX 영향**: 최소. 정상 개발 워크플로우에서 인라인 스크립트로 `.claude/`나 `hitl-state.json`을 참조할 일 없음.

**한계**: 변수 치환(`$VAR`에 경로 저장) 등 고급 우회는 여전히 가능. 이는 근본적 한계.

#### Fix-3: Edit 도구 전이 검증 완전화

**변경**: Edit 핸들러에서 `"verified"` 검사만이 아닌 전체 전이 맵 검증

```bash
# check-phase.sh:807 근처 교체
# 현재: new_string에 "verified" 포함 여부만 검사
# 개선: 결과 상태 파싱 후 전이 맵 검증
if echo "$T_NEW" | grep -qE '"phase"\s*:\s*"'; then
  NEW_PHASE=$(echo "$T_NEW" | grep -oP '"phase"\s*:\s*"\K[^"]+')
  # ... 전이 맵 검증 로직 (Write 핸들러와 동일)
fi
```

**UX 영향**: 없음. Edit으로 hitl-state.json을 수정하는 정상 경로 없음.

### 5.2 MEDIUM 수정 (단기)

#### Fix-4: 심볼릭 링크 해석

```bash
# check-phase.sh:707 이후 추가
FILE_PATH=$(readlink -f "$FILE_PATH" 2>/dev/null || realpath "$FILE_PATH" 2>/dev/null || echo "$FILE_PATH")
```

**UX 영향**: 없음. 정상 개발에서 심볼릭 링크를 통한 src/ 수정 불필요.

#### Fix-5: 간접 Git 명령 검사

```bash
# check-phase.sh:573 근처에 추가
# sh -c 'git ...', bash -c 'git ...' 내부의 git 명령도 검사
if echo "$CMD" | grep -qE "(sh|bash)\s+(-c\s+['\"].*git\s+(tag\s+(-d|--delete)|reset\s+--hard|push\s+(-f|--force)))"; then
  echo "BLOCKED: 간접 git 명령으로 보호된 작업이 감지되었습니다." >&2
  exit 2
fi
```

**UX 영향**: 최소. 정상 워크플로우에서 `sh -c 'git tag -d ...'` 사용 불필요.

#### Fix-6: `ln -s` 쓰기 감지 추가

```bash
# check-phase.sh:623의 쓰기 감지 패턴에 ln 추가
echo "$CMD" | grep -qE '^\s*(ln\s+(-[sf]+\s+)*)'  && IS_WRITE=true
```

**UX 영향**: 최소. 심볼릭 링크 생성 시 Phase 검사 추가됨.

### 5.3 추적성 연결 (중기)

#### Fix-7: TS 게이트 #11을 실제 GapAnalyzer에 연결

**변경**: `gate-bridge.ts:110-118`의 placeholder를 실제 `createGapAnalyzer().analyze()` 호출로 교체

**UX 영향**: **주의 필요**. 이전에 `@trace` 태그 없이 통과했던 코드가 이제 차단됨. 마이그레이션 기간 필요.

제안: ASIL별 점진적 활성화
- Phase 1: QM/A에서 경고만 (warn)
- Phase 2: B+에서 차단 (block)
- Phase 3: 전체에서 차단

#### Fix-8: `src/` 파일의 `@trace` 스캔을 셸 게이트에 추가

```bash
# verified_gate()에 추가: src/에서 @trace 어노테이션 검사
SRC_FILES=$(find "$CWD/src" -name "*.c" -o -name "*.h" -o -name "*.cpp" 2>/dev/null)
UNTRACED=0
for f in $SRC_FILES; do
  if ! grep -q '@trace\s\+REQ-' "$f"; then
    UNTRACED=$((UNTRACED + 1))
    echo "WARNING: $f has no @trace annotation" >&2
  fi
done
if [ "$UNTRACED" -gt 0 ] && [ "$ASIL_LEVEL" != "QM" ]; then
  echo "BLOCKED: $UNTRACED source files without @trace tags (ASIL $ASIL_LEVEL)" >&2
  exit 2
fi
```

**UX 영향**: ASIL A+에서만 강제. QM은 경고만.

#### Fix-9: 노후화 전파 트리거 연결

**변경**: `trace-change.sh` PostToolUse 훅에서 `.omc/specs/*.md` 수정 감지 시 CCP 오케스트레이터 호출

**UX 영향**: 요구사항 수정 시 관련 코드/테스트가 자동으로 "stale" 표시. 개발자에게 재검증 필요 영역 안내. **긍정적 UX** — 무엇을 다시 테스트해야 하는지 자동으로 알려줌.

### 5.4 UX 원칙: 안전과 편의의 균형

```
보안 강화의 UX 영향 스펙트럼:

  Zero UX Impact     Minimal UX Impact     Moderate UX Impact
  ├─── Fix-1 ────────── Fix-2 ───────────── Fix-7 ─────────────┤
  │    Fix-3          Fix-4                Fix-8               │
  │    Fix-6          Fix-5                Fix-9               │
  │                                                            │
  │    (내부 로직만    (정상 워크플로우에    (새 태그 요구,      │
  │     변경)          영향 최소)           마이그레이션 필요)   │
```

**핵심 설계 원칙**:
1. **정상 경로(happy path)에 마찰 추가 금지** — Fix-1~6은 정상 개발에 0 영향
2. **ASIL별 점진적 활성화** — 새 규칙은 QM에서 warn, B+에서 block
3. **차단 시 명확한 안내** — 모든 BLOCKED 메시지에 정상 경로 안내 포함
4. **스킬이 정상 경로** — `/phase`로 전이, `/trace`로 태그 관리

---

## 6. 개선 후 예상 신뢰도

### 6.1 Fix-1~6 적용 후 (CRITICAL + MEDIUM)

```
상태머신 강제력 (개선 후):
  Phase 접근 제어:           ████████████ ~98% (심볼릭 링크 해석 추가)
  Phase 전이 검증:           ████████████ ~95% (Edit 검증 + Bash 보호)
  .claude/ 자기보호:         ████████████ ~98% (인터프리터 검사 추가)
  Git 보호:                  ████████████ ~95% (간접 명령 검사)
  Verified 게이트:           ██████░░░░░░ ~50% (TS 게이트 여전히 placeholder)
```

### 6.2 Fix-7~9 추가 적용 후 (추적성 연결)

```
추적성 완전성 (개선 후):
  TC JSON → 테스트 @tc:     ████████████ 100%
  TC → 요구사항 @req:       ████████████ 100%
  요구사항 → 코드 @trace:   ████████████ 100% (게이트 #11 연결)
  코드 → 테스트:            ████████░░░░  70% (자동화 부분 개선)
  설계 → 코드:              ░░░░░░░░░░░░   0% (장기 과제: 6번째 Phase 추가)
  노후화 전파:              ████████████ 100% (CCP 트리거 연결)
```

### 6.3 남은 근본적 한계

Fix-1~9를 모두 적용해도 **100% 신뢰도에 도달할 수 없는** 근본적 이유:

| 한계 | 이유 | 완화 방법 |
|------|------|---------|
| **Bash 휴리스틱의 본질적 불완전성** | 문자열 패턴 매칭으로 임의 셸 명령의 의도를 완전히 파악 불가 | 허용 목록(allowlist) 방식 전환 시 UX 극도로 악화 |
| **AI가 훅 소스 읽기 가능** | Read 도구에 기본 보호 없음, AI가 우회 전략 수립 가능 | Read 훅 추가로 `.claude/` 읽기 차단 가능하나, 디버깅 UX 악화 |
| **훅 크래시 시 fail-open** | Claude Code 공식 설계: exit ≠ 2이면 허용 | 훅 내부에서 `set -e` + `trap` 사용, 크래시 시 exit 2 반환 |
| **설계 단계 부재** | V-Model의 architecture_design이 HITL에 미매핑 | 6번째 Phase 추가 (큰 구조 변경) |

### 6.4 최종 신뢰도 등급

| 등급 | 의미 | ProofChain 현재 | Fix-1~6 후 | Fix-1~9 후 |
|------|------|---------------|-----------|-----------|
| A | 100% — 수학적 증명으로 우회 불가 | - | - | - |
| B | 95-99% — 알려진 탈출 벡터 0, 이론적 우회만 가능 | - | - | **해당** |
| C | 85-94% — 대부분 방어, 일부 알려진 우회 존재 | - | **해당** | - |
| D | 70-84% — 핵심 방어 동작, 유의미한 갭 존재 | **해당** | - | - |
| E | < 70% — 기본 보호만 | - | - | - |

**현재: D등급 → Fix-1~6: C등급 → Fix-1~9: B등급**

A등급(수학적 증명)은 셸 훅 아키텍처에서는 도달 불가. 이는 형식 검증(Coq/Lean 기반 증명)이나 하드웨어 격리(SELinux mandatory access control)를 필요로 한다.

---

## 부록: Claude Code 훅 시스템 핵심 참조

### 공식 문서 출처

| 문서 | URL |
|------|-----|
| Hooks Reference | https://code.claude.com/docs/en/hooks |
| Hooks Guide | https://code.claude.com/docs/en/hooks-guide |
| Security Considerations | https://code.claude.com/docs/en/hooks#security-considerations |

### 주요 GitHub 이슈

| 이슈 | 내용 |
|------|------|
| [#21533](https://github.com/anthropics/claude-code/issues/21533) | 훅 순차 실행 미지원 (병렬만 가능) |
| [#8961](https://github.com/anthropics/claude-code/issues/8961) | deny 규칙 무시 사례 보고 |
| [#14937](https://github.com/anthropics/claude-code/issues/14937) | SessionStart 훅 이중 실행 |
| [#14524](https://github.com/anthropics/claude-code/issues/14524) | 동시 훅의 파일 충돌 |

### Anthropic/Trail of Bits 공식 입장

> **"Hooks are guardrails, not walls."**
> — Claude Code 공식 보안 문서

이 표현은 훅 시스템이 합리적인 보호를 제공하지만, 결정론적(deterministic) 보안 보장은 아님을 명시한다. ProofChain의 목표는 이 guardrails를 가능한 한 높고 촘촘하게 만드는 것이다.

---

*본 보고서는 실제 코드 읽기, Claude Code 공식 문서 조사, 적대적 시나리오 분석을 기반으로 작성되었습니다.*
*발견된 모든 취약점은 재현 가능한 공격 경로와 함께 문서화되었습니다.*
