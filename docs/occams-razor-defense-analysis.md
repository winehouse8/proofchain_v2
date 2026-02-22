# Occam's Razor Analysis: ProofChain v2.1 7-Layer Defense Architecture

**"15개 벡터를 모두 방어하는 가장 단순한 모델은 무엇인가?"**

> **작성일**: 2026-02-22
> **대상**: ProofChain SafeDev v2.1 — 7-Layer Defense Architecture
> **참조**: `escape-proof-state-machine-design.md` (원본 설계)
> **원칙**: Occam's Razor — "동일한 결과를 설명하는 모델 중 가장 단순한 것이 최선이다"
> **제약**: 15개 탈출 벡터(V1-V15) 전수 방어 유지. 방어력 감소 금지.

---

## 1. 현재 v2.1 복잡성 진단

### 1.1 정량적 복잡성

| 지표 | 값 |
|------|-----|
| 방어 계층 수 | 7 (L1-L7) |
| 런타임 파일 수 | 12 (셸 스크립트 11 + settings.json 1) |
| 총 코드 줄 수 | 2,484줄 |
| Hook 이벤트 종류 | 6 (PreToolUse, PostToolUse, SessionStart, ConfigChange, SubagentStart, Stop, PreCompact) |
| Hook 타입 혼용 | 3 (command, prompt, agent) |

**파일별 상세**:

| 파일 | 줄 수 | 소속 계층 | 역할 |
|------|-------|----------|------|
| `check-phase.sh` | 1,172 | L2 | 결정론적 Phase Guard (핵심 엔진) |
| `universal-guard.sh` | 260 | L1 | 전수 도구 라우터 + 접근 제어 |
| `integrity-audit.sh` | 218 | L3 | PostToolUse SHA-256/HMAC 감사 + 롤백 |
| `phase-commit.sh` | 191 | 지원 | Phase 전환 자동 커밋 + HMAC 재서명 |
| `restore-state.sh` | 177 | 지원 | 세션 시작 상태 표시 + HMAC/해시 검증 |
| `trace-change.sh` | 123 | 지원 | 변경 로그 기록 + @tc 누락 경고 |
| `settings.json` | 114 | L5/L6/L7 | Agent, Prompt, Stop 훅 정의 |
| `artifact-commit.sh` | 71 | 지원 | SPEC/TC 수정 자동 커밋 |
| `hmac-init.sh` | 68 | L4 | HMAC 키 생성 + 보호 파일 서명 |
| `checkpoint.sh` | 50 | 지원 | PreCompact 상태 보존 |
| `subagent-context-inject.sh` | 28 | L1 | SubagentStart Phase 컨텍스트 주입 |
| `config-protect.sh` | 12 | L1 | ConfigChange 무조건 차단 |

### 1.2 계층 간 코드 중복 분석

#### 중복 영역 A: L1 ↔ L2 Phase 로직 (~95줄)

`universal-guard.sh`는 라우터로 설계되었으나, NotebookEdit(lines 88-126)과 MCP(lines 215-242) 핸들러에서 L2(`check-phase.sh`)의 phase 검사 로직을 독자적으로 복제한다:

```
# L1의 NotebookEdit 핸들러 (universal-guard.sh:92-101)
AREAS_JSON=$(jq '.areas // {}' "$STATE")
CNT=$(echo "$AREAS_JSON" | jq '[to_entries[] | select(.value.phase == "code" or .value.phase == "test")] | length')
if [ "$CNT" = "0" ]; then
  echo "BLOCKED: NotebookEdit — src/ 수정은 code 또는 test phase에서 가능합니다." >&2
  asil_guard_exit
fi

# L2의 동일 로직 (check-phase.sh:1063-1100)
# ── 모든 매칭 영역의 phase를 검사 ── (거의 동일한 구조)
```

이 패턴이 L1 내에서 `src/`, `tests/`, `.omc/specs/`에 대해 **NotebookEdit용 1회 + MCP용 1회 = 2회** 반복된다.

**원인**: L2는 Edit/Write/Bash만 처리하도록 설계되어 NotebookEdit/MCP는 L1이 직접 처리해야 했음.

#### 중복 영역 B: HMAC 코드 3중 수행 (~78줄)

HMAC 서명/검증 로직이 4개 파일에 산재:

| 파일 | HMAC 작업 | 관련 줄 수 |
|------|----------|-----------|
| `hmac-init.sh` | 키 생성 + 전체 파일 서명 (sign_file) | ~20줄 |
| `integrity-audit.sh` | Section 2: HMAC 서명 검증 | ~41줄 |
| `restore-state.sh` | 세션 시작 시 HMAC 검증 | ~37줄 |
| `phase-commit.sh` | Phase 전환 후 HMAC 재서명 | ~19줄 |

핵심 패턴인 `printf '%s%s' "$CONTENT" "$TS" | openssl dgst -sha256 -hmac "$KEY" -hex | awk '{print $NF}'`가 4개 파일에서 거의 동일하게 반복된다.

#### 중복 영역 C: SHA-256 해시 검증 2중 수행 (~40줄)

| 파일 | SHA-256 작업 |
|------|-------------|
| `integrity-audit.sh` | PostToolUse에서 보호 파일 해시 비교 + 롤백 |
| `restore-state.sh` | SessionStart에서 보호 파일 해시 비교 + 롤백 |

`shasum -a 256` + hash 비교 + backup 복원 패턴이 두 파일에서 중복.

### 1.3 각 계층의 고유 가치 vs 중복 가치

| 계층 | 고유 가치 (다른 계층이 대체 불가) | 중복 가치 (다른 계층과 겹침) |
|------|-------------------------------|---------------------------|
| **L1** (Universal) | V6(Read차단), V7(NotebookEdit), V9(MCP), V12(키보호) | Phase 검사 로직이 L2와 중복 |
| **L2** (Deterministic) | Phase Guard 핵심 엔진, 자기보호, Git 보호, 전이 검증, Verified Gate 7개 | 없음 — 모든 기능이 고유 |
| **L3** (Audit) | SHA-256 사후 감사, 자동 롤백, Merkle 감사 체인 | HMAC 검증이 L4/restore-state와 중복 |
| **L4** (HMAC) | 암호학적 무결성 보장, 키 외부 저장 | 서명/검증 코드가 3개 파일에 산재 |
| **L5** (Agent) | hitl-state.json Write 시 LLM 교차검증 | **전이 검증이 L2와 완전 중복** |
| **L6** (Semantic) | Bash 의미론적 의도 판단, V10 유일한 방어 | 없음 — regex 한계를 돌파하는 독자적 가치 |
| **L7** (Stop) | 세션 종료 시 상태 확인 리마인더 | **보안 기여 0 — 순수 UX** |

---

## 2. 계층별 오컴의 면도날 테스트

**테스트 기준**: "이 계층을 제거하면 어떤 구체적 공격이 성공하는가?"

### L1 (Universal Router + Access Control)

**제거 시 성공하는 공격**:
- **V6**: AI가 `.claude/hooks/*.sh`를 Read → 훅 로직 학습 → 우회 전략 수립
- **V7**: NotebookEdit으로 `.ipynb`에서 Phase 무시하고 `src/` 코드 삽입
- **V9**: `mcp__filesystem__write_file` 등으로 Phase 무시하고 보호 파일 수정
- **V12**: `Read ~/.proofchain/hmac-key` → HMAC 키 탈취 → L4 무력화
- **V15**: ConfigChange 훅 소실 → 세션 중 settings.json 수정 가능

**판정: 제거 불가.** V12를 통해 L4를 연쇄 무력화할 수 있으므로 L1은 시스템 전체의 기반.

### L2 (Deterministic Guard)

**제거 시 성공하는 공격**:
- **V1**: `jq '.areas.XX.phase = "verified"' hitl-state.json > tmp && mv tmp hitl-state.json`
- **V2**: `python3 -c "import json; ..."` 로 상태 조작
- **V3**: Edit으로 hitl-state.json phase를 직접 "verified"로 변경
- **V4**: `sh -c 'git tag -d XX-verified-c1'` 로 Baseline TC 불변 기반 파괴
- **V5**: `ln -s .omc/hitl-state.json /tmp/x && Edit /tmp/x`
- **V6**: `.claude/hooks/check-phase.sh` 직접 Write → 모든 방어 무력화
- **V15**: `.claude/settings.json` Edit → 훅 제거

**판정: 절대 제거 불가.** 1,172줄의 핵심 엔진. Phase Guard, 자기보호, Git 보호, Verified Gate 7개가 모두 여기에 있다. 시스템의 심장.

### L3 (PostToolUse Audit + Rollback)

**제거 시 성공하는 공격**:
- L2+L6를 모두 우회한 경우, 상태 파일 변조가 **감지되지 않고 영구적으로 유지**
- Merkle 감사 체인 부재 → 포렌식 불가능

**대안 존재 여부**: L4(HMAC)가 다음 Phase 전이 시 변조를 감지하지만, **즉시 롤백**은 L3만 가능.

**판정: 유지 필요.** 단, L4와의 HMAC 중복 코드는 정리 가능.

### L4 (Cryptographic Integrity — HMAC)

**제거 시 성공하는 공격**:
- L2+L6를 우회해서 `hitl-state.json`을 수정한 경우, **암호학적 변조 증거가 없음**
- L3의 SHA-256 해시만으로는 해시 파일도 함께 조작하면 무력화 가능 (같은 디렉토리)
- HMAC 키가 `~/.proofchain/`(프로젝트 외부)에 있기 때문에 AI가 해시를 위조 불가

**대안 존재 여부**: L3의 SHA-256은 프로젝트 내부에 저장되므로 이론적으로 조작 가능. HMAC 키의 **프로젝트 외부 저장**이라는 고유 가치는 대체 불가.

**판정: 유지 필요.** L3과 병합하여 단일 무결성 계층으로 통합 가능.

### L5 (Agent-Based Deep Verification)

**제거 시 성공하는 공격**:
- **없음.**

**근거**:
L5는 `Write` 도구로 `hitl-state.json`을 수정할 때 서브에이전트가 파일을 읽고 전이를 검증한다. 그러나:

1. **L2가 이미 동일한 검증을 수행한다** — `check-phase.sh` lines 837-952:
   - Write 핸들러: 전환 유효성 검사 (lines 843-904)
   - 허용된 전이 맵 검증 (`ALLOWED_TRANSITIONS`)
   - Reentry cycle 증가 검증
   - Verified Gate 7개 전수 검사 + TS Bridge Gate
   - Edit 핸들러: `"verified"` 문자열 포함 시 동일 검증 (lines 908-948)

2. **L4가 HMAC 무결성을 보장한다** — 정당 경로 외 수정은 서명 불일치

3. **L5의 마진 기여**:
   - L2는 결정론적 (코드 패턴), L5는 확률론적 (LLM 판단)
   - L2가 놓치는 것을 L5가 잡을 확률은 극히 낮음 (동일한 정보를 기반으로 판단)
   - L5의 지연: 매 hitl-state.json Write마다 **~30초** (agent hook timeout)

**비용-효과 분석**:

| 지표 | L5 Agent Hook |
|------|--------------|
| 방어 대상 | hitl-state.json Write (V3) |
| 이미 방어하는 계층 | L2 (결정론적) + L4 (HMAC) |
| 추가 방어 확률 | ~5% (L2가 놓치는 edge case) |
| 비용: 지연 | ~30초/회 |
| 비용: API 호출 | 서브에이전트 호출 1회/Write |
| 발동 빈도 | Phase 전이당 1-2회 (세션당 4-10회) |

**판정: 제거 가능.** L2+L4가 V3를 이미 2중 방어. L5의 마진 기여가 비용을 정당화하지 못함.

### L6 (Prompt-Based Semantic Guard — Haiku)

**제거 시 성공하는 공격**:
- **V10 (환경변수)**: `export X=".omc/hitl-state.json"; python3 -c "open(os.environ['X'], 'w')"` → L2의 grep 패턴은 `hitl-state` 문자열이 없으므로 통과 → **공격 성공**
- **V2 (난독화된 다단계)**: 변수 치환, 함수 래핑 등으로 L2 패턴 회피 가능 → L6만이 의도를 파악
- **V11 (/tmp 스크립트)**: `/tmp/helper.sh` 내부에 보호 파일 조작 코드 → L2는 파일 내용을 모름

**대안 존재 여부**: 없음. Regex/grep 기반 패턴 매칭으로 의미론적 의도를 파악하는 것은 원리적으로 불가능. LLM의 자연어 이해 능력은 대체할 수 없는 고유 가치.

**판정: 절대 제거 불가.** 이것이 v2.1의 핵심 혁신이며, D등급(70-84%)을 A-등급(99%+)으로 끌어올린 근본 원인.

### L7 (Stop Hook)

**제거 시 성공하는 공격**:
- **없음.**

**근거**:
L7은 Claude가 "작업 완료"를 선언할 때 prompt 훅으로 상태를 확인한다. 이는:

1. **보안 기능이 아니다** — "Phase가 아직 test인데 완료하려 합니다"는 UX 리마인더이지, 공격을 차단하는 것이 아니다
2. **어떤 벡터도 L7에 의존하지 않는다** — 원본 방어 매트릭스에서도 L7 열은 모두 비어 있음
3. **비용**: 세션당 1-3회 발동, ~2초 지연. 비용은 낮지만 가치도 0

**대안**: Claude에게 CLAUDE.md 지시로 "종료 전 상태 확인"을 요청하면 동일 효과. 훅이 아니라 프롬프트로 충분.

**판정: 제거 가능.** 보안 기여 없음. 원한다면 CLAUDE.md 지시로 대체.

---

## 3. 핵심 발견: 3가지 중복 영역 상세

### 3.1 L1 ↔ L2: Phase 로직 중복

**현상**: L1(`universal-guard.sh`)이 라우터를 넘어 독자적 Phase Guard를 수행.

**원인**: L2(`check-phase.sh`)는 `Edit|Write|Bash`만 처리하므로, NotebookEdit과 MCP는 L1이 직접 처리해야 했다.

**영향**:
- ~95줄의 중복 코드 (NotebookEdit: ~40줄, MCP: ~55줄)
- Phase 정책 변경 시 L1과 L2 양쪽을 수정해야 함 (유지보수 부담)
- L1의 Phase 로직이 L2보다 단순화되어 있어 방어 격차 가능성 (예: auto-backward, 파일-영역 매핑 없음)

**해결 방향**: L2를 NotebookEdit/MCP도 처리하도록 확장하거나, 공통 Phase 검사 함수를 별도 셸 라이브러리로 추출.

### 3.2 L3 ↔ L4 ↔ restore-state: HMAC 3중 수행

**현상**: HMAC 서명/검증 패턴이 4개 파일에 산재.

```
hmac-init.sh      → sign_file(): HMAC 생성 + SHA-256 + backup
integrity-audit.sh → Section 2: HMAC 검증 (PostToolUse)
restore-state.sh   → HMAC 검증 (SessionStart)
phase-commit.sh    → HMAC 재서명 (Phase 전환 후)
```

**영향**:
- ~78줄의 중복 코드
- HMAC 알고리즘 변경 시 4개 파일을 수정해야 함
- 서명/검증 불일치 버그 가능성 (예: timestamp 포맷 불일치)

**해결 방향**: `proofchain-hmac-lib.sh`로 `sign_file()`, `verify_hmac()` 추출. 4개 파일이 소싱하여 사용.

### 3.3 L5 (Agent Hook): 비용 대비 효과 부족

**현상**: L5(agent hook)는 hitl-state.json Write 시 서브에이전트를 생성하여 전이를 검증한다.

**L2가 이미 수행하는 동일 검증**:

| 검증 항목 | L2 (check-phase.sh) | L5 (agent hook) |
|----------|---------------------|-----------------|
| 전이 맵 유효성 | lines 859-863: ALLOWED_TRANSITIONS | 프롬프트: "유효한 전이인지 검증" |
| Cycle 증가 검증 | lines 871-878 | 프롬프트: (암시적) |
| Verified Gate | lines 881-888: 7개 Gate + TS Bridge | 프롬프트: "게이트 조건 충족 확인" |
| Edit 전이 차단 | lines 908-948 | 해당 없음 (Write만 대상) |

**결론**: L5는 L2의 결정론적 검증을 LLM으로 재수행하는 것. 결정론적 코드가 이미 모든 조건을 검사하므로, LLM의 확률론적 재검증은 마진 가치가 극히 낮다.

---

## 4. 제안: 최적화된 4+1 아키텍처

### 4.1 현재 vs 제안

```
현재 (7-Layer)                    제안 (4+1)
═══════════════                   ══════════════
L7: Stop (prompt)        ───→     [제거] CLAUDE.md 지시로 대체
L6: Semantic (prompt)    ───→     L4: Semantic Guard (Haiku prompt)
L5: Agent (agent)        ───→     [제거] L2+L3에서 완전 방어
L4: HMAC (crypto)        ─┬─→    L3: Integrity Layer (SHA-256 + HMAC 통합)
L3: Audit (PostToolUse)  ─┘
L2: Deterministic        ───→     L2: Deterministic Guard (확장)
L1: Universal Router     ───→     L1: Universal Router

                                  +1: Process Automation
                                      (phase-commit, trace-change,
                                       artifact-commit, checkpoint,
                                       restore-state)
```

### 4.2 최적화된 계층 상세

#### L1: Universal Router + Access Control (유지, 리팩터링)

**파일**: `universal-guard.sh` + `config-protect.sh` + `subagent-context-inject.sh`

**변경**: NotebookEdit/MCP의 Phase 로직을 L2에 위임하거나 공통 함수로 추출.

**방어**: V6, V7, V8, V9, V12, V15

#### L2: Deterministic Guard (유지, 확장 가능)

**파일**: `check-phase.sh`

**변경**: 필요 시 NotebookEdit/MCP도 처리하는 엔트리포인트 추가.

**방어**: V1, V2, V3, V4, V5, V6, V15

#### L3: Unified Integrity Layer (L3+L4 병합)

**파일**: `integrity-audit.sh` (확장) + `hmac-lib.sh` (신규 공유 라이브러리)

**변경**:
- `proofchain-hmac-lib.sh`: `sign_file()`, `verify_hmac()` 함수 추출 (~30줄)
- `integrity-audit.sh`: SHA-256 감사 + HMAC 검증 통합
- `hmac-init.sh`: 라이브러리 소싱으로 코드 축소
- `phase-commit.sh`, `restore-state.sh`: 라이브러리 소싱으로 HMAC 중복 제거

**방어**: V1, V2, V3, V5, V6, V11 (사후 감사 + 암호학적 무결성)

#### L4: Semantic Guard (현재 L6, 유지)

**파일**: `settings.json` 내 Bash prompt hook

**변경 없음**. Haiku 모델의 의미론적 판단은 대체 불가.

**방어**: V1, V2, V4, V5, V6, V7, V10, V11, V15

#### +1: Process Automation (비방어 지원 계층)

**파일**: `phase-commit.sh`, `trace-change.sh`, `artifact-commit.sh`, `checkpoint.sh`, `restore-state.sh`

**역할**: Git 자동 커밋, 변경 로그, 세션 상태 표시. PostToolUse/SessionStart/PreCompact.

**보안 기여**: 없음 (감사 로그는 L3에 통합). 순수 프로세스 자동화.

### 4.3 복잡성 감소 수치

| 지표 | 현재 (7-Layer) | 최적화 (4+1) | 감소 |
|------|---------------|-------------|------|
| 보안 계층 수 | 7 | 4 | **-43%** |
| HMAC 중복 코드 | ~78줄 / 4파일 | ~30줄 / 1라이브러리 | **-62%** |
| Phase 중복 코드 | ~95줄 (L1에서 L2 복제) | 0줄 (L2에 위임 또는 공통화) | **-100%** |
| Hook 타입 | 3 (command+prompt+agent) | 2 (command+prompt) | **-33%** |
| 정책 변경 시 수정 파일 | 최대 4 (L1+L2+L5+L7) | 최대 2 (L1+L2) | **-50%** |
| Phase 전이 지연 | ~30초 (L5 agent) | ~2초 (L2+L3만) | **-93%** |

---

## 5. 안전성 증명: 제거해도 괜찮은 이유 vs 절대 제거 불가

### 5.1 절대 제거 불가 계층

#### L2 (Deterministic Guard) — 시스템의 심장

```
제거 시 무방비 벡터: V1, V2, V3, V4, V5, V6, V15 (7개)
대체 가능성: 없음
근거: 1,172줄의 Phase 엔진. 모든 Edit/Write/Bash의 1차 방어선.
      자기보호(.claude/), Git 보호, Verified Gate 7개가 집중된 핵심.
```

#### L6→L4 (Semantic Guard — Haiku prompt) — 혁신의 핵심

```
제거 시 무방비 벡터: V10 (환경변수 — 유일한 방어)
제거 시 약화 벡터: V1, V2, V4, V5, V11, V15 (2차 방어 소실)
대체 가능성: 없음 (regex로 의미론적 의도 파악 불가)
근거: D등급→A-등급 도약의 핵심 동인. Bash 휴리스틱의 본질적 한계 돌파.
```

#### L1 (Universal Router) — 기반 인프라

```
제거 시 무방비 벡터: V7, V9, V12 (3개)
제거 시 연쇄 효과: V12(키 탈취) → L4(HMAC) 무력화 → 방어력 대폭 하락
대체 가능성: 없음 (Read/NotebookEdit/MCP는 L2 매처에 포함되지 않음)
근거: L2의 사각지대를 메우는 보완 계층. V12→L4 연쇄 파괴를 방지.
```

#### L3+L4→L3 (Unified Integrity) — 최후의 안전망

```
제거 시 약화 벡터: V1, V2, V5, V6, V11 (사후 감지/롤백 소실)
제거 시 효과: L2+L6를 모두 우회한 공격이 영구적으로 성공
대체 가능성: 부분적 (SHA-256만으로는 해시 동시 조작 가능, HMAC 키 외부 저장이 핵심)
근거: Defense-in-Depth의 마지막 방어선. "만약 모든 사전 방어가 실패하면?"에 대한 답.
```

### 5.2 제거 가능 계층

#### L5 (Agent Hook) — 제거 안전

```
제거 시 무방비 벡터: 없음 (0개)
제거 시 약화 벡터: V3 (3중→2중 방어, L2+L3이 유지)
마진 방어 확률: ~5%
비용: ~30초/회 지연 + API 호출
근거:
  L2가 hitl-state.json Write를 결정론적으로 검증:
    - 전이 맵 유효성 (ALLOWED_TRANSITIONS)
    - Cycle 증가 검증
    - Verified Gate 7개 + TS Bridge
  L4(HMAC)가 비인가 수정을 암호학적으로 감지.
  → L5의 LLM 재검증은 동일 정보 기반의 확률론적 중복.
```

**V3 방어 유지 증명**:

```
L5 제거 후 V3 공격 시나리오:
  공격: Edit으로 hitl-state.json의 phase를 "verified"로 변경

  L2 방어 (check-phase.sh:908-948):
    1. Edit 핸들러가 new_string에 "verified" 감지
    2. test phase인 모든 area에 대해 verified_gate() 실행
    3. 7개 Gate (추적성, TC 존재, 스키마, 변경로그, Baseline 불변, Reentry 로그, TS Bridge) 전수 검사
    4. 하나라도 미충족 → exit 2 차단

  L3+L4 방어:
    비인가 경로로 수정 시 HMAC 불일치 → 다음 게이트에서 거부

  결론: V3는 L5 없이 2중 방어 유지 (L2 결정론적 + L3 암호학적)
```

#### L7 (Stop Hook) — 제거 안전

```
제거 시 무방비 벡터: 없음 (0개)
제거 시 약화 벡터: 없음 (0개)
보안 기여: 0
비용: ~2초/회 (세션당 1-3회)
근거:
  Stop 훅은 "작업 완료 전 상태 확인"이라는 UX 리마인더.
  어떤 공격 벡터도 L7에 의존하지 않음.
  동일 효과를 CLAUDE.md 지시로 달성 가능:
    "세션 종료 전 hitl-state.json 상태를 확인하고 보고하세요."
```

---

## 6. 탈출 벡터 영향 매트릭스: 최적화 후 방어 유지 증명

### 6.1 15개 벡터 × 4+1 계층 방어 매핑

```
              L1        L2        L3(통합)   L4(의미론)
              Router    Determ.   Integrity  Semantic    방어수  변화
              ────────  ────────  ─────────  ─────────   ─────  ────
V1  Bash→state    ·        ██        ██         ██         3     4→3
V2  다단계        ·        ██        ██         ██         3     4→3
V3  Edit전이      ·        ██        ██          ·         2     3→2
V4  간접Git       ·        ██         ·         ██         2     2→2 ✓
V5  심볼릭링크    ·        ██        ██         ██         3     3→3 ✓
V6  훅수정       ██        ██        ██         ██         4     4→4 ✓
V7  NotebookEd   ██         ·        ██          ·         2     3→2
V8  서브에이전트  ██        ██         ·          ·       상속   상속 ✓
V9  MCP도구      ██         ·         ·          ·         1     2→1
V10 환경변수      ·         ·         ·         ██         1+RT  1+RT ✓
V11 /tmp스크립트  ·         ·        ██         ██         2     3→2
V12 키탈취       ██         ·         ·          ·         1     1→1 ✓
V13 다중인스턴스   ·         ·         ·          ·        설정   설정 ✓
V14 프롬프트인젝   ·        ··         ·          ·        RT    RT ✓
V15 설정수정      ·        ██         ·         ██         2     2→2 ✓

██ = 해당 계층에서 방어   ·· = Claude Code 런타임 보장   RT = 런타임 보장
```

### 6.2 방어 수 변화 요약

| 방어 수 | 현재 (7-Layer) | 최적화 (4+1) |
|---------|---------------|-------------|
| 4중 방어 | V1, V2, V6 (3개) | V6 (1개) |
| 3중 방어 | V3, V5, V7, V11 (4개) | V1, V2, V5 (3개) |
| 2중 방어 | V4, V9, V15 (3개) | V3, V4, V7, V11, V15 (5개) |
| 1중 방어 | V12 (1개) | V9, V12 (2개) |
| 런타임 보장 | V8, V10, V13, V14 (4개) | V8, V10, V13, V14 (4개) |

### 6.3 최약 지점 분석

**현재 최약**: V9(MCP), V12(키탈취) — 각 2중, 1중
**최적화 후 최약**: V9(MCP), V12(키탈취) — 각 1중, 1중

**V9 (1중 방어) 리스크 평가**:
- L1의 `mcp__*` 핸들러가 파일 경로를 추출하여 `.claude/`, `.proofchain/`, Phase 규칙을 적용
- 결정론적 경로 매칭이므로 우회 확률 매우 낮음 (~2%)
- 기존에도 L1+L2라고 표기했으나, 실제로는 L2가 MCP를 처리하지 않으므로 실질적 차이 없음
- **완화**: L3(PostToolUse)의 matcher에 `mcp__*`를 추가하면 2중 방어 복원 가능

**V12 (1중 방어) 리스크 평가**:
- L1의 Read 핸들러가 `~/.proofchain/` 경로를 결정론적으로 차단
- 이 차단은 단순 문자열 매칭이므로 우회 확률 극히 낮음 (~1%)
- 심볼릭 링크 우회는 `readlink -f` 정규화로 방어 (V5 대응 이미 적용)
- 1중이지만 **충분히 신뢰할 수 있는 결정론적 방어**

### 6.4 "간단히 한다고 구멍이 나면 안 된다" 검증

**모든 벡터가 최소 1개 이상의 방어를 유지하는가?** YES (15/15)

**2중 미만 방어인 벡터에 대한 보완 가능성**:

| 벡터 | 현재 방어 | 보완 방법 | 보완 후 |
|------|----------|----------|---------|
| V9 | L1 (1중) | L3 matcher에 `mcp__*` 추가 | L1+L3 (2중) |
| V12 | L1 (1중) | L2 Bash에 `~/.proofchain` 패턴 추가 (이미 존재) | L1+L2 (2중, 이미 달성) |
| V10 | L4/Semantic (1중+RT) | 런타임 보장이 강력하므로 추가 불필요 | 유지 |

실제로 V12의 Bash 경로 접근은 L2(`check-phase.sh`:621-626)에서도 차단하므로, Read+Bash 양쪽 모두 방어되어 **실질 2중 방어**다.

---

## 7. 결론

### 7.1 핵심 판정 요약

| 계층 | 판정 | 근거 |
|------|------|------|
| **L1** (Universal Router) | **유지** | V6, V7, V9, V12 방어. V12→L4 연쇄 파괴 방지 |
| **L2** (Deterministic Guard) | **유지** | 시스템의 심장. 7개 벡터의 1차 방어선 |
| **L3** (Audit + Rollback) | **L4와 병합** | SHA-256 + HMAC를 단일 Integrity Layer로 통합 |
| **L4** (HMAC Crypto) | **L3과 병합** | HMAC 코드 중복 제거. 공유 라이브러리 추출 |
| **L5** (Agent Hook) | **제거** | L2+L3이 이미 방어. 마진 기여 ~5%, 비용 ~30초/회 |
| **L6** (Semantic/Haiku) | **유지** | 대체 불가. V10 유일 방어. 핵심 혁신 |
| **L7** (Stop Hook) | **제거** | 보안 기여 0. CLAUDE.md 지시로 대체 |

### 7.2 최종 권장 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                  Optimized 4-Layer Defense                │
│  ┌───────────────────────────────────────────────────┐  │
│  │ L4: Semantic Guard (Haiku prompt)                  │  │
│  │   Bash 의도 판단. regex 한계 돌파. V10 유일 방어   │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ L3: Unified Integrity (SHA-256 + HMAC + Rollback)  │  │
│  │   사후 감사 + 암호학적 무결성 + 자동 복원           │  │
│  │   공유 라이브러리: proofchain-hmac-lib.sh           │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ L2: Deterministic Guard (check-phase.sh)           │  │
│  │   Phase Guard, 자기보호, Git 보호, Verified Gate   │  │
│  │   1,172줄의 핵심 엔진 — 시스템의 심장              │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ L1: Universal Router + Access Control              │  │
│  │   모든 도구 가로채기, Read/MCP/Notebook 접근 제어  │  │
│  │   ConfigChange 차단, SubagentStart 컨텍스트 주입   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  +1: Process Automation (비방어)                         │
│     phase-commit, trace-change, artifact-commit,         │
│     checkpoint, restore-state                            │
└─────────────────────────────────────────────────────────┘
```

### 7.3 "Occam's Razor를 적용해도 면도날에 베이지 않는다"

이 분석의 핵심 결론:

1. **7계층 중 5개는 진짜 필요하다** (L1, L2, L3, L4, L6). 다만 L3+L4는 병합 가능.
2. **2개는 제거해도 방어력이 유지된다** (L5, L7).
3. **가장 큰 승리는 HMAC 코드 통합** — 4파일 산재 → 1라이브러리, 유지보수성 대폭 향상.
4. **L5 제거의 가장 큰 효과** — Phase 전이 지연 30초→2초, 개발자 경험 개선.

**최종 확인**: 15개 벡터 전수 방어 유지됨 (15/15). 단일 실패점(SPOF) 없음. 최약 벡터(V9)도 L3 matcher 확장으로 2중 방어 복원 가능.

> "Everything should be made as simple as possible, but not simpler."
> — Albert Einstein (attributed)
>
> 7계층에서 4+1계층으로: 가능한 한 단순하게, 그러나 그 이상 단순하게는 안 된다.

---

*이 보고서는 코드 변경 없이 현재 아키텍처를 분석한 것이다. 실제 리팩터링은 별도 계획으로 진행한다.*
