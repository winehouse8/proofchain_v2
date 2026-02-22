# ProofChain SafeDev v2.2

**ISO 26262 기반 4+1 Layer Defense Architecture for Claude Code**

ProofChain은 자동차 기능안전 표준 ISO 26262에서 영감을 받아, AI 코딩 에이전트(Claude Code)가 **SPEC → TC → Code → Test → Verified** 5단계 개발 루프를 벗어날 수 없도록 **기계적으로 강제**하는 프레임워크입니다.

v2.2는 v2.1의 7계층 방어를 **오컴의 면도날(Occam's Razor)** 관점에서 재분석하여, 15개 탈출 벡터 방어를 유지하면서 **4+1 계층으로 단순화**했습니다. 불필요한 복잡성(L5 에이전트 30초 지연, L7 보안 기여 없음)을 제거하고, HMAC 코드 3중 중복을 공유 라이브러리로 통합했습니다.

---

## v2.1 → v2.2 핵심 변경 요약

| 항목 | v2.1 | v2.2 |
|------|------|------|
| 방어 계층 | 7-Layer (L1~L7) | **4+1 Layer** (L1~L4 + Automation) |
| 훅 파일 | 12개, 2,576줄 | **11개, 2,518줄** |
| LLM 훅 | prompt(L6) + agent(L5) + prompt(L7) | **prompt(L4)만** |
| HMAC 코드 | 3곳 중복 (hmac-init, integrity-audit, restore-state) | **공유 라이브러리 1곳** |
| L1 Phase 로직 | L2와 ~95줄 중복 | **L2에 `exec` 위임** |
| Write 지연 | L5 agent: ~30초 | **0초** (제거) |
| 세션 종료 | L7 prompt 경고 | **CLAUDE.md 지시** (훅 불필요) |
| SessionStart | hmac-init.sh + restore-state.sh | **integrity-audit.sh init** + restore-state.sh |
| PostToolUse 매처 | `Edit\|Write\|Bash\|NotebookEdit` | `Edit\|Write\|Bash\|NotebookEdit\|mcp__.*` |

---

## 4+1 Layer Defense Architecture

v2.1의 7계층에서 **보안 기여가 없거나 다른 계층이 이미 방어하는 것**을 제거하고, 중복 코드를 통합했습니다.

```
Session Start
│
│  L3  Unified Integrity ── HMAC 키 생성 + 서명 (integrity-audit.sh init)
│  +1  상태 복원 + 보안 규칙 주입 (restore-state.sh)
│
▼
Tool Call
│
│  L1  Universal Router ── .* 매처, 도구별 라우팅 + 자기보호 (command)
│  L2  Deterministic Guard ── Phase별 파일 접근 제어 (command, 1184줄)
│  L4  Semantic Guard ── Haiku가 Bash 의도 분석 (prompt)
│
▼
Tool Execution
│
▼
Post Execution
│
│  L3  Unified Integrity ── SHA-256 해시 + HMAC 검증 + 자동 롤백 (command)
│  +1  Phase Commit ── 전환 감지 + HMAC 재서명 (command)
│  +1  Change Tracking ── 감사 로그 기록 (command)
│  +1  Artifact Commit ── SPEC/TC 자동 커밋 (command)
│
▼
Config Change Attempt
│
│  ██  ConfigChange 무조건 차단 (command)
│
▼
Context Compaction
│
│  +1  Checkpoint ── 상태 스냅샷 보존 (command)
```

### 계층 요약

| Layer | 파일 | 훅 타입 | 방어 대상 | 실패 모드 |
|-------|------|---------|----------|----------|
| **L1** | `universal-guard.sh` | command (`.*`) | 모든 도구: 자기보호 + L2 위임 라우터 | fail-closed |
| **L2** | `check-phase.sh` | command (via L1) | Phase별 파일 쓰기, 파괴적 git, 인코딩 우회, NotebookEdit/MCP phase 체크 | fail-closed |
| **L3** | `integrity-audit.sh` | command (Start+Post) | SHA-256 + HMAC-SHA256 검증 + 자동 롤백 + Merkle 감사 체인 | fail-open |
| **L4** | settings.json prompt | prompt (Bash) | 간접 공격 의미론적 탐지 (Haiku) | fail-open |
| **+1** | 7개 자동화 훅 | command | 커밋, 감사, 체크포인트, 서브에이전트 컨텍스트 등 | fail-open |

**원칙**: PreToolUse 훅(L1, L2)은 `set -euo pipefail; trap 'exit 2' ERR`로 **fail-closed** (크래시 = 차단). PostToolUse/SessionStart 훅은 **fail-open** (크래시 = 허용, 탐지만).

### v2.2에서 제거된 것과 그 이유

| 제거 항목 | v2.1 역할 | 제거 근거 |
|----------|----------|----------|
| **L5** (agent hook) | Write 도구 사용 시 서브에이전트가 hitl-state.json 검증 | L1이 hitl-state.json Write를 무조건 차단 (exit 2), L2가 Phase별 접근 제어 → L5의 검증 대상이 이미 도달 불가 |
| **L7** (prompt, Stop) | 세션 종료 시 미완료 작업 경고 | 보안 기여 0% (Stop 이벤트는 이미 세션 끝). CLAUDE.md 지시로 동일 UX 달성 |
| **hmac-init.sh** | SessionStart에서 HMAC 키 생성 + 서명 | `integrity-audit.sh init` 모드로 흡수 (코드 3중 중복 제거) |

---

## HMAC 공유 라이브러리 (`proofchain-hmac-lib.sh`)

v2.2의 핵심 개선. 기존에 3개 파일에 분산되었던 HMAC 코드를 **단일 라이브러리**로 추출했습니다.

```bash
# 사용하는 파일들이 이 라이브러리를 source함
source "$SCRIPT_DIR/proofchain-hmac-lib.sh"
proofchain_hmac_vars        # 경로 변수 초기화
proofchain_protected_files "$CWD"  # 보호 대상 파일 목록 (단일 진실원천)
```

| 함수 | 역할 | 호출자 |
|------|------|--------|
| `proofchain_hmac_vars()` | `HMAC_KEY_FILE`, `INTEGRITY_DIR` 등 경로 설정 | 모든 소비자 |
| `proofchain_protected_files()` | 보호 대상 파일 목록 (ALL + CRITICAL) | 모든 소비자 |
| `proofchain_sign_file()` | HMAC + SHA-256 + 백업 생성 | integrity-audit.sh (init) |
| `proofchain_verify_hmac()` | HMAC 서명 검증 | integrity-audit.sh (post), restore-state.sh |
| `proofchain_verify_hash()` | SHA-256 해시 검증 | integrity-audit.sh (post), restore-state.sh |
| `proofchain_rollback_file()` | 백업에서 복원 | integrity-audit.sh (post), restore-state.sh |
| `proofchain_resign_file()` | 합법적 수정 후 재서명 | phase-commit.sh |

**설계 규칙**: 라이브러리이므로 `return`만 사용 (절대 `exit` 사용 금지).

---

## L1 Phase 중복 제거 (Universal Guard → check-phase.sh 위임)

v2.1에서 L1(universal-guard.sh)은 L2(check-phase.sh)의 Phase 로직을 ~95줄 복제하고 있었습니다. v2.2는 이 중복을 **`exec` 위임** 패턴으로 제거했습니다.

```
v2.1: L1에서 Phase 체크 직접 수행 (260줄)
v2.2: L1에서 자기보호 → exec L2 위임 (167줄)
```

### 도구별 라우팅 동작

| 도구 | L1 동작 | L2 관여 |
|------|---------|---------|
| Edit/Write/Bash | `exec check-phase.sh` (즉시 위임) | Phase 체크 전체 |
| NotebookEdit | 자기보호 → `exec check-phase.sh` (managed paths만) | Phase 체크 |
| MCP (`mcp__*`) | 자기보호 → `exec check-phase.sh` (managed paths만) | Phase 체크 |
| Read | 훅 소스 읽기 차단 + 키 읽기 차단 | 불필요 |
| Task | 통과 (서브에이전트 훅 상속) | 불필요 |
| Glob/Grep/etc | 즉시 통과 | 불필요 |

**[IR-1] 불변 규칙**: 자기보호 체크(`.claude/`, `.proofchain/`, `hitl-state.json`)는 **항상 `exec` 위임 전에** 수행됩니다. L2가 장애를 겪더라도 자기보호는 L1에서 보장됩니다.

---

## Unified Integrity Layer (L3)

v2.1의 L3(integrity-audit.sh) + L4(hmac-init.sh)를 **단일 파일, 2개 모드**로 통합했습니다.

```
integrity-audit.sh init  ← SessionStart: 키 생성 + 서명 (stdin 읽기 없음)
integrity-audit.sh post  ← PostToolUse: 검증 + 롤백 + 감사 (stdin JSON 읽기)
```

**[IR-2]**: `MODE="${1:-post}"`는 반드시 `INPUT=$(cat)` **이전에** 분기합니다. init 모드에서 stdin을 읽으면 SessionStart가 hang합니다.

### Post 모드 처리 흐름

```
Tool Execution 완료
│
├── Section 1: SHA-256 해시 검증 (보호 파일 8개)
│   └── 불일치 시 → 백업에서 자동 롤백 + 감사 기록
│
├── Section 2: HMAC 서명 검증 (hitl-state.json, config.json)
│   └── 불일치 시 → 경고 + 감사 기록
│
├── Section 3: Merkle Tree 감사 로그
│   └── 이전 entry_hash → 현재 entry 해시 → 체인 연결
│
└── Section 4: 로그 로테이션 (10MB 초과 시)
```

---

## 15 Escape Vectors + Defense Mapping

15개 탈출 벡터가 v2.2에서도 모두 방어됩니다. 구조 변경이 있는 벡터는 **굵게** 표시합니다.

| ID | 탈출 벡터 | v2.2 방어 계층 |
|----|----------|---------------|
| V1 | `Bash → jq → hitl-state.json` 직접 조작 | L2 (패턴 차단) + L4 (의미론적) + L3 (롤백) |
| V2 | 다단계 스크립트 (`python3 -c`, `sh -c`) | L2 (인터프리터 감지) + L4 (의미론적) |
| **V3** | **Edit 도구 불완전 전이 검증** | **L1 (경로 차단) + L2 (Phase 체크)** — L5 제거, L2가 결정론적으로 방어 |
| V4 | 간접 Git (`sh -c 'git tag -d'`) | L2 (중첩 명령 파싱) + L4 (의미론적) |
| V5 | 심볼릭 링크 경로 우회 | L1 (readlink 해석) + L2 (ln -s 차단) + L3 (해시 검증) |
| V6 | 훅 스크립트 파일 직접 수정 | L1 (`.claude/` 무조건 차단) + L3 (롤백) + L3 (HMAC) |
| **V7** | **settings.json 수정으로 훅 비활성화** | **ConfigChange 무조건 차단 + L1 (IR-1 자기보호)** + L3 |
| V8 | Read로 훅 소스 읽고 우회 전략 수립 | L1 (`.claude/hooks/` Read 차단) |
| **V9** | **서브에이전트에서 우회 시도** | **훅 상속 (Claude Code 보장) + SubagentStart 컨텍스트 주입 + L1 IR-1** |
| V10 | `.proofchain/config.json` ASIL 다운그레이드 | L1 (경로 차단) + L3 (롤백) + L3 (HMAC) |
| V11 | HMAC 키 탈취 (`~/.proofchain/`) | L1 (홈 경로 차단) — 키는 프로젝트 외부 |
| V12 | 인코딩 우회 (base64, hex, unicode) | L2 (디코딩 패턴 감지) + L4 (의미론적) |
| V13 | 백그라운드 프로세스 (`nohup`, `&`) | L2 (백그라운드 패턴 차단) |
| V14 | NotebookEdit으로 코드 실행 | L1 (자기보호) + L2 (Phase 강제, v2.2 위임) |
| V15 | MCP 도구로 보호 경로 접근 | L1 (자기보호) + L2 (Phase 강제, v2.2 위임) |

**V3 안전성 증명**: L5(agent)가 제거되었지만, L1이 hitl-state.json Write를 `exit 2`로 차단하고, L2가 Phase별 파일 접근을 결정론적으로 강제합니다. agent hook의 LLM 판단보다 **셸의 결정론적 차단이 더 신뢰성이 높습니다**.

---

## 실제 탈출 시도와 차단 과정

Claude Code가 실제 동작 중 상태머신을 탈출하려는 모든 경로가 어떻게 차단되는지, 구체적인 시나리오로 설명합니다.

### Claude Code 훅 시스템 기본 동작

Claude Code의 훅은 **도구 호출(Tool Use)** 단위로 동작합니다. Claude가 어떤 도구를 호출하면, 실제 실행 전에 `PreToolUse` 훅이 실행되고, 실행 후에 `PostToolUse` 훅이 실행됩니다.

```
Claude가 도구 호출 결정
│
├── PreToolUse 훅 실행 ← exit 2 반환 시 도구 실행 자체가 차단됨
│   ├── L1: universal-guard.sh (모든 도구)
│   ├── L2: check-phase.sh (L1에서 위임)
│   └── L4: Haiku prompt (Bash만)
│
├── 도구 실행 (훅이 허용한 경우만)
│
└── PostToolUse 훅 실행 ← 차단 불가, 감시/복구만
    ├── L3: integrity-audit.sh (변조 탐지 + 자동 복원)
    ├── phase-commit.sh (전환 커밋)
    ├── trace-change.sh (감사 로그)
    └── artifact-commit.sh (SPEC/TC 커밋)
```

핵심: **PreToolUse에서 `exit 2`를 반환하면 Claude의 도구 호출이 실행되지 않습니다.** 이것이 상태머신 강제의 기본 메커니즘입니다.

### 시나리오 1: `spec` Phase에서 코드 파일 수정 시도

**상황**: 현재 `spec` Phase인데, Claude가 `src/main.ts`를 Edit하려 함

```
Claude: Edit(file_path="src/main.ts", ...)
│
├── L1 universal-guard.sh
│   Tool=Edit → exec check-phase.sh (즉시 L2 위임)
│
├── L2 check-phase.sh
│   현재 Phase: spec
│   파일: src/main.ts → src/ 디렉토리
│   spec Phase에서 src/ 쓰기 허용? → NO
│   ❌ exit 2 "BLOCKED: spec 단계에서 src/ 수정 불가. code 단계로 전환 후 수정하세요."
│
└── 결과: Edit 도구 실행 안 됨. 파일 변경 없음.
```

### 시나리오 2: Bash로 hitl-state.json 직접 조작 시도 (V1)

**상황**: Claude가 `jq`로 Phase를 직접 `verified`로 바꾸려 함

```
Claude: Bash(command="jq '.areas.CP.phase = \"verified\"' .omc/hitl-state.json > tmp && mv tmp .omc/hitl-state.json")
│
├── L1 universal-guard.sh
│   Tool=Bash → exec check-phase.sh
│
├── L2 check-phase.sh
│   명령에서 "hitl-state.json" 패턴 감지
│   ❌ exit 2 "BLOCKED: hitl-state.json은 Bash에서 수정할 수 없습니다."
│
├── L4 Haiku prompt (Bash 매처)
│   "이 명령이 .omc/hitl-state.json을 수정하려는 의도가 있는가?"
│   ❌ {"ok": false, "reason": "hitl-state.json 직접 수정 시도"}
│
└── 결과: L2에서 이미 차단. L4는 L2가 실패해도 2차 방어.
```

### 시나리오 3: 다단계 우회 — `python3 -c`로 파일 수정 (V2)

**상황**: 직접 `jq` 대신 Python 인터프리터로 우회 시도

```
Claude: Bash(command="python3 -c \"import json; d=json.load(open('.omc/hitl-state.json')); d['areas']['CP']['phase']='verified'; json.dump(d, open('.omc/hitl-state.json','w'))\"")
│
├── L2 check-phase.sh
│   인터프리터 감지: "python3 -c" 패턴
│   인라인 코드에서 "hitl-state.json" 발견
│   ❌ exit 2 "BLOCKED: 인터프리터를 통한 보호 파일 수정 시도 감지"
│
├── L4 Haiku prompt
│   Python 코드 내용 분석 → hitl-state.json 수정 의도 감지
│   ❌ {"ok": false}
│
└── 결과: 차단. python3, ruby, perl, node -e 모두 동일하게 감지.
```

### 시나리오 4: 훅 파일 자체를 수정하여 가드 비활성화 (V6)

**상황**: Claude가 check-phase.sh를 수정해서 모든 검사를 `exit 0`으로 바꾸려 함

```
Claude: Edit(file_path=".claude/hooks/check-phase.sh", old_string="exit 2", new_string="exit 0")
│
├── L1 universal-guard.sh
│   Tool=Edit, file_path=".claude/hooks/check-phase.sh"
│   경로 매칭: */.claude/* → 보호 경로
│   ❌ exit 2 "BLOCKED: .claude/ directory is protected."
│
└── 결과: 훅 파일은 절대 수정 불가. 모든 ASIL, 모든 Phase에서 항상 차단.
```

만약 어떤 이유로 L1을 통과했더라도:

```
PostToolUse → L3 integrity-audit.sh
│
├── SHA-256 해시 검증: check-phase.sh.sha256 불일치 감지
├── 자동 롤백: ~/.proofchain/integrity/check-phase.sh.backup에서 복원
├── 감사 로그: integrity-violations.jsonl에 기록
│
└── 결과: 파일이 원본으로 자동 복원됨 (다층 방어)
```

### 시나리오 5: settings.json 수정으로 훅 등록 해제 (V7)

**상황**: settings.json에서 PreToolUse 훅을 빈 배열로 바꾸려 함

```
Claude: Edit(file_path=".claude/settings.json", ...)
│
├── L1 universal-guard.sh
│   경로: .claude/settings.json → 보호 경로
│   ❌ exit 2 "BLOCKED: .claude/ directory is protected."
│
└── 결과: 차단. 훅 등록을 해제할 수 없음.
```

별도로, Claude Code 자체의 `ConfigChange` 이벤트도 차단합니다:

```
설정 변경 시도 → ConfigChange 이벤트
│
├── config-protect.sh
│   ❌ exit 2 (무조건, 조건 없음, 12줄)
│
└── 결과: 어떤 경로로든 설정 변경 불가.
```

### 시나리오 6: 심볼릭 링크로 보호 경로 우회 (V5)

**상황**: 심볼릭 링크를 만들어 간접적으로 보호 파일에 접근

```
Claude: Bash(command="ln -s .omc/hitl-state.json /tmp/state.json")
│
├── L2 check-phase.sh
│   "ln -s" 패턴 감지 + 대상에 보호 경로 포함
│   ❌ exit 2 "BLOCKED: 심볼릭 링크를 통한 보호 경로 접근"
│
└── 이미 링크가 존재하는 경우:

Claude: Edit(file_path="/tmp/state.json", ...)
│
├── L1 universal-guard.sh
│   readlink -f "/tmp/state.json" → ".omc/hitl-state.json" (실제 경로 해석)
│   ❌ exit 2 "BLOCKED: hitl-state.json은 /phase 스킬로만 수정 가능합니다."
│
└── 결과: 심볼릭 링크 생성도, 심볼릭 링크를 통한 접근도 모두 차단.
```

### 시나리오 7: Read로 훅 소스를 읽고 우회 전략 수립 (V8)

**상황**: Claude가 훅 로직을 읽어서 빈틈을 찾으려 함

```
Claude: Read(file_path=".claude/hooks/check-phase.sh")
│
├── L1 universal-guard.sh
│   Tool=Read, 경로: .claude/hooks/*.sh
│   ❌ exit 2 "BLOCKED: Hook 소스 파일은 읽기가 차단됩니다."
│         "AI가 훅 우회 전략을 수립하는 것을 방지합니다."
│
└── 결과: 훅 소스를 읽을 수 없으므로, 우회 전략 수립 자체가 불가능.
```

### 시나리오 8: `verified` 상태에서 소스 코드 수정 시도

**상황**: 이미 검증 완료된 영역의 코드를 수정하려 함

```
Claude: Edit(file_path="src/component.ts", ...)
│
├── L1 → L2 check-phase.sh
│   현재 Phase: verified
│   파일: src/ → verified에서 쓰기 금지
│   ❌ exit 2 "BLOCKED: verified 상태에서 src/ 수정 불가. reentry를 시작하세요."
│
└── 결과: verified 상태의 코드는 reentry(cycle++) 없이 절대 수정 불가.
    사람이 /phase 스킬로 reentry를 승인해야만 수정 가능.
```

### 시나리오 9: 서브에이전트에서 우회 시도 (V9)

**상황**: Claude가 Task 도구로 서브에이전트를 생성해서, 서브에이전트에서 우회

```
Claude: Task(prompt="hitl-state.json의 phase를 verified로 변경해줘")
│
├── Claude Code 보장: 서브에이전트는 부모의 모든 훅을 상속
│
├── 서브에이전트: Edit(file_path=".omc/hitl-state.json", ...)
│   ├── L1: .omc/hitl-state.json → 보호 경로
│   ├── ❌ exit 2 "BLOCKED: hitl-state.json은 /phase 스킬로만 수정 가능합니다."
│
├── SubagentStart 훅: 서브에이전트 컨텍스트에 보안 규칙 주입
│   "당신은 ProofChain 보안 규칙의 적용을 받습니다..."
│
└── 결과: 서브에이전트도 동일한 훅 체계 적용. 탈출 불가.
```

### 시나리오 10: 인코딩 우회 — base64로 명령 숨기기 (V12)

**상황**: base64로 인코딩된 명령을 실행하여 패턴 감지 회피

```
Claude: Bash(command="echo 'anEgLi5vbWMvaGl0bC1zdGF0ZS5qc29u...' | base64 -d | bash")
│
├── L2 check-phase.sh
│   "base64 -d" + "| bash" 패턴 감지 (인코딩 우회 시도)
│   ❌ exit 2 "BLOCKED: 인코딩된 명령 실행 시도"
│
├── L4 Haiku prompt
│   base64 디코딩 → bash 파이프라인 → 의심스러운 패턴
│   ❌ {"ok": false, "reason": "인코딩된 명령을 통한 잠재적 보호 파일 수정"}
│
└── 결과: base64, hex, xxd, unicode 이스케이프 모두 차단.
```

### 시나리오 11: 파괴적 git 명령으로 verified 태그 삭제 (V4)

**상황**: `git tag -d`로 verified 마일스톤 태그를 삭제하여 이력 조작

```
Claude: Bash(command="git tag -d CP-verified-c1")
│
├── L2 check-phase.sh
│   "git tag -d" 패턴 → 파괴적 git 명령
│   ❌ exit 2 "BLOCKED: 파괴적 git 명령은 차단됩니다."
│
└── 간접 시도: Bash(command="sh -c 'git tag -d CP-verified-c1'")
│
├── L2 check-phase.sh
│   "sh -c" 내부 파싱 → "git tag -d" 발견
│   ❌ exit 2

└── 결과: 직접/간접 모두 차단. git reset --hard, push --force도 동일.
```

### 시나리오 12: MCP 도구로 보호 경로 접근 (V15)

**상황**: 외부 MCP 도구(파일 시스템 MCP 등)로 보호 파일 수정 시도

```
Claude: mcp__filesystem__write(path=".omc/hitl-state.json", content="...")
│
├── L1 universal-guard.sh
│   Tool=mcp__* → MCP 라우팅
│   path 추출 → ".omc/hitl-state.json"
│   [IR-1] 자기보호: hitl-state.json 매칭
│   ❌ exit 2 "BLOCKED: MCP 도구 — hitl-state.json은 /phase 스킬로만 수정 가능합니다."
│
└── 결과: MCP 도구도 동일한 L1 자기보호 적용. 도구 이름에 관계없이 경로 기반 차단.
```

### 시나리오 13: HMAC 키 탈취 시도 (V11)

**상황**: HMAC 키를 읽어서 서명을 위조하려 함

```
Claude: Read(file_path="~/.proofchain/hmac-key")
│
├── L1 universal-guard.sh
│   Tool=Read, 경로: ~/.proofchain/*
│   ❌ exit 2 "BLOCKED: ProofChain 키 저장소는 읽기가 차단됩니다."
│         "HMAC 서명 키는 AI가 접근할 수 없습니다."
│
└── Bash로 시도: Bash(command="cat ~/.proofchain/hmac-key")
│
├── L2 check-phase.sh
│   "~/.proofchain" 또는 "$HOME/.proofchain" 경로 감지
│   ❌ exit 2

└── 결과: 키를 읽을 수 없으므로, HMAC 서명 위조 불가능.
```

### 방어 계층별 역할 정리

```
                탈출 시도
                   │
                   ▼
        ┌──────────────────────┐
   L1   │  Universal Router    │  모든 도구 인터셉션
        │  • 보호 경로 차단     │  .claude/, .proofchain/, hitl-state.json
        │  • 훅 소스 읽기 차단  │  → exit 2 (fail-closed)
        │  • L2로 exec 위임     │
        └──────────┬───────────┘
                   │ (Edit/Write/Bash/NotebookEdit/MCP)
                   ▼
        ┌──────────────────────┐
   L2   │  Deterministic Guard │  Phase별 파일 접근 제어
        │  • Phase↔파일 매핑    │  spec→specs/, code→src/ 등
        │  • 파괴적 git 차단    │  tag -d, reset --hard, push --force
        │  • 인코딩 우회 감지   │  base64, hex, unicode
        │  • 인터프리터 감지    │  python3 -c, sh -c, ...
        └──────────┬───────────┘
                   │ (Bash만)
                   ▼
        ┌──────────────────────┐
   L4   │  Semantic Guard      │  Haiku가 명령 의도 분석
        │  • 간접 공격 감지     │  L2의 패턴을 벗어나는 창의적 시도
        │  • 자연어 수준 판단   │  → fail-open (보조 방어)
        └──────────┬───────────┘
                   │
                   ▼
              도구 실행됨
                   │
                   ▼
        ┌──────────────────────┐
   L3   │  Unified Integrity   │  사후 검증
        │  • SHA-256 해시 비교  │  변조 시 자동 롤백
        │  • HMAC 서명 검증     │  서명 경로 외 수정 감지
        │  • Merkle 감사 체인   │  모든 도구 호출 기록
        └──────────────────────┘
```

### 정말 모든 케이스를 막았는가?

**결론: 현재 알려진 15개 벡터는 모두 방어됩니다.** 단, 다음을 이해해야 합니다:

1. **절대적 보안은 없습니다.** ProofChain은 Claude Code의 훅 시스템이 정상 동작함을 전제합니다. Claude Code 자체의 버그로 훅이 우회되면 방어가 무력화됩니다.

2. **fail-closed 설계가 핵심입니다.** L1/L2는 `trap 'exit 2' ERR` — 훅 스크립트가 크래시해도 "차단"이 기본값입니다. "허용하려면 명시적으로 `exit 0`을 실행해야" 합니다.

3. **다층 방어(Defense in Depth)**: 모든 벡터는 2개 이상의 독립 계층으로 방어됩니다. L2가 뚫려도 L4(의미론적) + L3(사후 롤백)이 백업합니다.

4. **결정론적 > 확률적**: v2.2에서 L5(agent, LLM 판단)를 제거한 이유입니다. 셸의 패턴 매칭(`exit 2`)이 LLM의 확률적 판단보다 **항상 더 신뢰할 수 있습니다**.

---

## 5-Phase HITL Development Loop

```
spec ──→ tc ──→ code ──→ test ──→ verified
  ↑       ↑      ↑        ↑          │
  │       │      │        │          │ reentry (cycle++)
  │       └──────┴────────┘          │
  │              backward            │
  └──────────────────────────────────┘
```

| Phase | 설명 | 허용 파일 | 스킬 |
|-------|------|----------|------|
| `spec` | 요구사항 명세 (EARS 패턴) | `.omc/specs/` | `/ears-spec` |
| `tc` | 테스트 케이스 설계 (src/ 격리) | `.omc/test-cases/` | `/test-gen-design` |
| `code` | 코딩 구현 | `src/`, `tests/` | - |
| `test` | 테스트 실행 + 검증 | `tests/` | `/test-gen-code` |
| `verified` | 완료 (수정 시 reentry) | 읽기 전용 | - |

**상태 진실원천**: `.omc/hitl-state.json` (셸 훅이 쓰고, TS 엔진이 읽음)

### 전이 규칙

| 유형 | 조건 | cycle 변화 |
|------|------|-----------|
| Forward | 현재 단계 완료 + 사람 승인 | 유지 |
| Backward | 사람이 문제 발견 (같은 cycle) | 유지 |
| Reentry | verified 후 재진입 | cycle++ |

---

## Hook Files

### v2.2 Hook System (11 files + 1 library, 2,518줄)

| 파일 | 줄수 | 역할 | 이벤트 |
|------|-----|------|-------|
| `universal-guard.sh` | 167 | L1: 도구 라우터 + 자기보호 + L2 위임 | PreToolUse (`.*`) |
| `check-phase.sh` | 1,184 | L2: Phase별 파일 접근, 파괴적 git, 인코딩 우회 | PreToolUse (via L1) |
| `integrity-audit.sh` | 204 | L3: 통합 무결성 (init: 키+서명, post: 검증+롤백+Merkle) | SessionStart + PostToolUse |
| `proofchain-hmac-lib.sh` | 150 | 공유 라이브러리: HMAC/SHA-256 함수 + 보호 파일 목록 | (sourced) |
| `config-protect.sh` | 12 | ConfigChange 무조건 차단 | ConfigChange |
| `subagent-context-inject.sh` | 28 | 서브에이전트에 Phase 컨텍스트 주입 | SubagentStart |
| `restore-state.sh` | 154 | 세션 시작: ASIL 배지, 무결성 검증, HITL 상태, 보안 규칙 주입 | SessionStart |
| `phase-commit.sh` | 181 | Phase 전환 커밋 + git tag + HMAC 재서명 | PostToolUse |
| `trace-change.sh` | 123 | 파일 변경 감사 로그 (`change-log.jsonl`) | PostToolUse |
| `artifact-commit.sh` | 71 | SPEC/TC 수정 시 자동 git commit | PostToolUse |
| `checkpoint.sh` | 50 | 컨텍스트 압축 전 상태 스냅샷 | PreCompact |
| `settings.json` | 94 | 4+1 Layer 훅 배선 설정 | - |

### LLM 훅 (settings.json 내 정의)

| 훅 타입 | 매처 | 모델 | 역할 |
|---------|------|------|------|
| prompt | Bash | Haiku | L4: Bash 명령 의미론적 보안 분석 |

v2.1 대비 **제거**: agent(Write) L5, prompt(Stop) L7

---

## Cryptographic Integrity (L3)

```
~/.proofchain/
├── hmac-key              # HMAC-SHA256 키 (openssl rand -hex 32)
├── integrity/
│   ├── hitl-state.json.sig       # {"hmac":"...", "timestamp":"...", "file":"..."}
│   ├── hitl-state.json.sha256    # SHA-256 해시 스냅샷
│   ├── hitl-state.json.backup    # 롤백용 백업
│   ├── check-phase.sh.sig
│   ├── check-phase.sh.sha256
│   ├── check-phase.sh.backup
│   └── ... (8개 보호 파일 각각)
└── audit/
    └── tool-audit.jsonl          # Merkle tree 감사 체인
```

**보호 대상 파일** (8개, `proofchain-hmac-lib.sh`에서 단일 관리):

| # | 파일 | 보호 이유 |
|---|------|----------|
| 1 | `.omc/hitl-state.json` | Phase 진실원천 |
| 2 | `.proofchain/config.json` | ASIL 설정 |
| 3 | `.claude/hooks/check-phase.sh` | L2 핵심 가드 |
| 4 | `.claude/hooks/universal-guard.sh` | L1 라우터 |
| 5 | `.claude/hooks/integrity-audit.sh` | L3 통합 무결성 |
| 6 | `.claude/hooks/proofchain-hmac-lib.sh` | HMAC 공유 라이브러리 (v2.2 신규) |
| 7 | `.claude/hooks/config-protect.sh` | ConfigChange 차단 |
| 8 | `.claude/settings.json` | 훅 배선 |

**흐름**: SessionStart에서 init 모드 서명 → PostToolUse에서 post 모드 검증 → 불일치 시 백업에서 자동 복원 → 합법적 전환 시 phase-commit.sh가 재서명

---

## ASIL-Adaptive UX

ISO 26262 Part 6 Table 12에 따른 등급별 동작 차이:

| 기능 | QM | A | B | C | D |
|-----|----|----|----|----|-----|
| Phase Guard | warn | warn | **block** | **block** | **block** |
| MISRA Tier 1 | off | warn | warn | **block** | **block** |
| TC Isolation (fork) | optional | recommended | **required** | **required** | **required** |
| Coverage Gate (stmt/br/mcdc) | 60/50/- | 70/60/50 | 80/70/60 | 90/85/80 | 95/95/90 |
| Verified Gate Checks | 4 | 8 | 10 | 12 | 14 |

**예외**: `.claude/` 자기보호, ConfigChange 차단, 파괴적 git 차단, HMAC 무결성은 **모든 ASIL에서 항상 강제**됩니다.

---

## 14 Unified Gate Checks

`test → verified` 전환 시 실행:

| # | Gate | Source | ASIL Min |
|---|------|--------|----------|
| 1 | Active TC > 0 | Shell | QM |
| 2 | @tc annotation coverage | Shell | QM |
| 3 | @req annotation coverage | Shell | QM |
| 4 | Transition validity (13 allowed) | Shell | QM |
| 5 | Supplementary TC schema | Shell | A |
| 6 | Baseline TC immutability (git tag) | Shell | A |
| 7 | Reentry log completeness | Shell | A |
| 8 | MISRA violations = 0 | TS | A |
| 9 | Coverage thresholds met | TS | B |
| 10 | Stale artifacts = 0 | TS | B |
| 11 | Traceability gaps = 0 | TS | C |
| 12 | Independent review complete | TS | C |
| 13 | Verification debt = 0 | TS | D |
| 14 | Dual review consensus | TS | D |

---

## Project Structure

```
.claude/
├── hooks/                              # v2.2 4+1 Layer 훅 (11 files + 1 lib, 2518 lines)
│   ├── universal-guard.sh              # L1: 도구 라우터 + 자기보호 (167줄)
│   ├── check-phase.sh                  # L2: 결정론적 명령 가드 (1184줄)
│   ├── integrity-audit.sh              # L3: 통합 무결성 — init+post (204줄)
│   ├── proofchain-hmac-lib.sh          # 공유 라이브러리: HMAC/SHA-256 (150줄, NEW)
│   ├── config-protect.sh               # ConfigChange 차단
│   ├── subagent-context-inject.sh      # SubagentStart 컨텍스트
│   ├── restore-state.sh               # SessionStart 상태 복원
│   ├── phase-commit.sh                 # PostToolUse 전환 커밋
│   ├── trace-change.sh                 # PostToolUse 감사 로그
│   ├── artifact-commit.sh              # PostToolUse SPEC/TC 커밋
│   └── checkpoint.sh                   # PreCompact 스냅샷
├── skills/                             # 11개 스킬 SKILL.md
└── settings.json                       # 4+1 Layer 훅 배선 (94줄)

.omc/
├── HITL.md                             # HITL 프로세스 상세 정의
├── hitl-state.json                     # Phase 진실원천 (상태 머신)
├── change-log.jsonl                    # 파일 변경 감사 로그
├── specs/                              # EARS 요구사항 명세
├── test-cases/                         # TC JSON 파일
├── traceability/                       # 추적성 매트릭스
├── v1-backup/                          # v1 훅 백업
├── v2-hooks/                           # v2.1 스테이징 (설치 원본)
├── v2.1-backup/                        # v2.1 훅 백업 (v2.2 설치 시 생성)
└── v2.2-hooks/                         # v2.2 스테이징 (설치 원본, NEW)

~/.proofchain/                          # 프로젝트 외부 (AI 접근 불가)
├── hmac-key                            # HMAC-SHA256 키
├── integrity/                          # 서명 + 해시 + 백업
└── audit/                              # Merkle tree 감사 로그

src/                                    # TS 분석 엔진 (20개 모듈)
├── bridge/                             # Shell ↔ TS 브릿지
├── core/                               # 타입, 설정, DB
├── ledger/                             # 검증 원장 + staleness
├── graph/                              # 의존성 그래프
├── ccp/                                # Change Cycle Protocol
├── rules/                              # MISRA 규칙 엔진
├── v-model/                            # V-Model 상태 머신
├── coverage/                           # 커버리지 게이트
├── traceability/                       # 추적성 분석
├── verification/                       # 검증 워크플로우
├── agents/                             # 안전 리뷰 에이전트
├── tool-qual/                          # 도구 자격 인증
└── ...                                 # init, integration, hooks, etc.

docs/                                   # 설계 문서
├── escape-proof-state-machine-design.md         # v2.1 설계 (1971줄)
├── occams-razor-defense-analysis.md             # v2.2 오컴의 면도날 분석 (NEW)
├── adversarial-analysis-traceability-state-machine.md
├── gap-analysis-traditional-se-vs-ai-assisted.md
└── architecture-comparison-report.md
```

---

## Dual State Architecture

| 저장소 | 데이터 | 쓰기 주체 | 읽기 주체 |
|-------|-------|----------|----------|
| `hitl-state.json` | Phase, cycle, area | 셸 훅 (jq) | TS 엔진 (read-only) |
| `proofchain.db` | Ledger, graph, audit, debt | TS 엔진 (SQLite) | TS 엔진 |
| `change-log.jsonl` | 파일 변경 기록 | `trace-change.sh` | 양쪽 |
| `~/.proofchain/integrity/` | HMAC 서명, SHA-256 해시, 백업 | `integrity-audit.sh`, `phase-commit.sh` | `integrity-audit.sh`, `restore-state.sh` |
| Git tags | verified 마일스톤 | `phase-commit.sh` | `check-phase.sh` |

---

## Immutable Rules

1. **Baseline TC 불변**: `origin: "baseline"`의 given/when/then은 최초 verified 이후 수정 불가
2. **TC 격리**: `/test-gen-design`은 `context: fork`에서 실행, `src/` 읽기 불가
3. **추적성 필수**: 모든 TC는 REQ ID에 연결, 테스트 코드에 `@tc`/`@req` 어노테이션
4. **Verified 잠금**: `verified` 상태에서 src/, .omc/specs/, .omc/test-cases/, tests/ 수정 불가
5. **자기 보호**: `.claude/` 디렉토리 + `~/.proofchain/` 수정 항상 차단 (모든 ASIL)
6. **ConfigChange 차단**: 세션 중 settings.json 수정 불가
7. **파괴적 git 차단**: `git tag -d`, `reset --hard`, `push --force` 항상 차단

### 불변 설계 규칙 (Invariant Rules)

v2.2 리팩토링에서 도출된 아키텍처 불변 규칙:

| ID | 규칙 | 적용 |
|----|------|------|
| **IR-1** | 자기보호는 항상 `exec` 위임 전에 수행 | universal-guard.sh: NotebookEdit/MCP 섹션 |
| **IR-2** | `MODE` 분기는 반드시 `INPUT=$(cat)` 전에 수행 | integrity-audit.sh: line 16 |
| **IR-3** | L2 gate 조건은 L1 라우터의 도구 범위와 일치해야 함 | check-phase.sh: line 794-798 |
| **IR-4** | 합법적 수정 후에는 반드시 HMAC 재서명 수행 | phase-commit.sh: proofchain_resign_file() |

---

## Installation

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | >= 18.0.0 | TS engine |
| jq | >= 1.6 | Shell hook JSON parsing |
| openssl | - | HMAC-SHA256 서명 |
| git | >= 2.30 | 버전 관리, 태그, 감사 |

### Setup

```bash
git clone <repository-url>
cd proofchain
npm install
npm run build
```

### v2.2 Hook Installation

```bash
# 터미널에서 실행 (Claude Code 세션 밖에서!)
# 훅이 .claude/ 디렉토리 쓰기를 차단하므로, Claude Code 내부에서는 설치 불가
bash .omc/v2.2-hooks/install-v2.2.sh
```

설치 과정:
1. v2.1 백업 → `.omc/v2.1-backup/`
2. 11개 훅 + 1 라이브러리 + settings.json 복사
3. `hmac-init.sh` 제거 (integrity-audit.sh에 흡수)
4. 파일 권한 설정
5. HMAC 키 생성 (최초 1회) + 8개 보호 파일 서명

### Rollback to v2.1

```bash
cp .omc/v2.1-backup/hooks-*/*.sh .claude/hooks/
cp .omc/v2.1-backup/settings-*.json .claude/settings.json
cp .omc/v2-hooks/hmac-init.sh .claude/hooks/  # v2.2에서 삭제된 파일 복원
```

---

## Skills (11개)

| 스킬 | 용도 | 컨텍스트 |
|------|------|---------|
| `/ears-spec` | SPEC 작성 (EARS 패턴) | main |
| `/test-gen-design` | Baseline TC 생성 (src/ 격리) | **fork** |
| `/test-gen-code` | 테스트 코드 생성 + 실행 | main |
| `/traceability` | 추적성 매트릭스 (REQ ↔ TC ↔ Test) | main |
| `/phase` | Phase 전환 + gate check | main |
| `/verify` | 검증 실행 (coverage + MISRA + traceability) | main |
| `/trace` | 추적 태그 관리 (@tc, @req) | main |
| `/impact` | 변경 영향 분석 | main |
| `/safety-doc` | 안전 문서 생성 (ISO 26262) | main |
| `/tool-qual` | 도구 자격 인증 (Part 8 §11) | main |
| `/reset` | 프로세스 초기화 (ASIL B+: 인간 확인 필수) | main |

---

## ISO 26262 Alignment

| ISO 26262 Section | Implementation |
|-------------------|---------------|
| Part 6 §9.3 (Traceability) | @tc/@req 어노테이션, 추적성 매트릭스, 고아 탐지 |
| Part 6 §9.4.6 (Regression) | src/ 수정 시 자동 backward, cycle > 1 전체 회귀 |
| Part 6 Table 12 (Coverage) | ASIL별 stmt/branch/MC\|DC 임계값 |
| Part 8 §7.4.3 (Config mgmt) | Baseline TC 불변성, git tag 비교 |
| Part 8 §8.4.1 (Change request) | Reentry 로그 (type, reason, affected_reqs) |
| Part 8 §8.7 (Phase skip) | skip_reason + skipped_phases 필수 기록 |
| Part 8 §11 (Tool qual) | 자체 테스트 코퍼스 + 정확도 보고 + TCL 분류 |

---

## Design Documents

| 문서 | 내용 |
|------|------|
| [`occams-razor-defense-analysis.md`](docs/occams-razor-defense-analysis.md) | **v2.2 오컴의 면도날 분석** — 7계층→4+1 단순화 근거 (NEW) |
| [`escape-proof-state-machine-design.md`](docs/escape-proof-state-machine-design.md) | v2.1 7-Layer 설계, 15개 벡터 분석 (1971줄) |
| [`adversarial-analysis-traceability-state-machine.md`](docs/adversarial-analysis-traceability-state-machine.md) | v1 적대적 분석 (V1-V6, T1-T5) |
| [`gap-analysis-traditional-se-vs-ai-assisted.md`](docs/gap-analysis-traditional-se-vs-ai-assisted.md) | 전통 SE 38기법 + AI 고유 8기법 갭 분석 |
| [`architecture-comparison-report.md`](docs/architecture-comparison-report.md) | 아키텍처 대안 비교 |

---

## Version History

| 버전 | 핵심 변경 |
|------|----------|
| **v1** | 단일 셸 훅 (`check-phase.sh`), 6개 벡터 방어, D등급 (70-84%) |
| **v2.1** | 7-Layer Defense, 12개 파일 2576줄, 15/15 벡터, command+prompt+agent, A-등급 (99%+) |
| **v2.2** | **4+1 Layer Defense**, 11개 파일 2518줄, 15/15 벡터, HMAC 공유 라이브러리, L5/L7 제거, Phase 중복 제거 |

### v2.1 → v2.2 정량적 비교

| 지표 | v2.1 | v2.2 | 변화 |
|------|------|------|------|
| 방어 계층 | 7 | 4+1 | -2 (L5, L7 제거) |
| 셸 훅 파일 | 11 | 11 | ±0 (hmac-init 삭제, hmac-lib 추가) |
| 총 줄수 | 2,576 | 2,518 | -58줄 (-2.3%) |
| LLM 호출/도구 | 최대 3회 (L4+L5+L6) | 최대 1회 (L4) | **-67%** |
| Write 지연 | ~30초 (L5 agent) | 0초 | **-30초** |
| HMAC 코드 중복 | 3곳 (~78줄) | 1곳 (공유 라이브러리) | **-52줄** |
| L1 Phase 중복 | ~95줄 | 0줄 (exec 위임) | **-95줄** |
| 탈출 벡터 방어 | 15/15 | 15/15 | 유지 |
| 보호 파일 | 7개 | 8개 | +1 (proofchain-hmac-lib.sh) |

---

## Tech Stack

- **Language**: TypeScript (strict mode, `noUncheckedIndexedAccess`)
- **DB**: SQLite (better-sqlite3, WAL mode, ACID)
- **Test**: Vitest (20 files)
- **Shell**: Bash (11 hook scripts + 1 library, 2,518 lines total)
- **Crypto**: OpenSSL (HMAC-SHA256, SHA-256)
- **Pattern**: Factory functions, interface-based design
- **Module**: ESM (`.js` extension imports)

---

## License

MIT
