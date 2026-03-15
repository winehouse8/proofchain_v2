# p1 — Clock Canvas Web

**잇다반도체 클락캔버스 모사 프로젝트**

디지털 IC 설계의 **클럭 분배 네트워크(Clock Distribution Network, CDN)** 를 시각적으로 설계하고 검증하는 웹 애플리케이션입니다. PLL, 분주기, 멀티플렉서, 클럭 게이팅 셀 등을 캔버스 위에 배치하고 연결하여 클럭 트리를 구성하고, Verilog/SDC 코드를 자동 생성합니다.

> 이 프로젝트는 **[ProofChain SafeDev v2.2](../../README.md)** 방법론으로 개발되었습니다.
> ISO 26262 HITL 5-Phase 워크플로우 (spec → tc → code → test → verified) 를 준수합니다.

---

## 주요 기능

### 캔버스 편집
팔레트(왼쪽 사이드바)에서 컴포넌트를 드래그해 캔버스에 놓으면 노드가 생성됩니다. 노드를 자유롭게 이동하고, 출력 포트에서 입력 포트로 드래그하면 클럭 신호 연결선(엣지)이 만들어집니다. 노드나 연결선을 클릭해 선택한 뒤 `Delete` / `Backspace` 키로 삭제할 수 있으며, `Shift+클릭`으로 여러 항목을 동시에 선택해 한 번에 삭제할 수 있습니다.

### 배치 가능한 컴포넌트 6종
| 컴포넌트 | 역할 |
|---------|------|
| **PLL** | 클럭 소스. 출력 주파수(MHz)를 직접 설정합니다. |
| **Divider** | 분주기. 입력 주파수를 /2 ~ /128 비율로 낮춥니다. |
| **Mux** | 멀티플렉서. 두 입력 중 하나를 선택해 출력합니다. |
| **ClockGate** | 클럭 게이팅 셀. 인에이블(EN) 신호로 클럭을 차단/통과시킵니다. |
| **IPBlock** | 클럭 소비 블록(최종 소비자). 수신 전력(mW)을 설정합니다. |
| **ClockDomain** | 클럭 도메인 경계 표시. 도메인 이름과 색상을 지정합니다. |

### 실시간 주파수 전파
노드를 연결하거나 PLL 주파수·분주 비율을 바꾸는 순간, 서버가 전체 클럭 트리를 위상 정렬하여 각 노드의 실제 주파수를 다시 계산합니다. 계산된 주파수는 각 노드 위에 kHz / MHz / GHz 단위로 즉시 표시됩니다.

### 속성 편집 (오른쪽 패널)
노드를 클릭하면 우측 패널에 해당 컴포넌트의 편집 가능한 속성이 표시됩니다. PLL의 출력 주파수, Divider의 분주비, Mux의 선택 인덱스, IPBlock의 소비 전력, ClockDomain의 도메인 이름과 색상 등을 여기서 수정합니다.

### 툴바 버튼 안내
| 버튼 | 동작 |
|------|------|
| **New** | 캔버스를 초기화하고 새 프로젝트를 시작합니다. |
| **Save** | 현재 프로젝트를 서버에 저장합니다. 처음 저장 시 프로젝트 이름을 입력하는 창이 뜹니다. |
| **Load** | 저장된 프로젝트 목록 다이얼로그를 열어 불러오거나 삭제할 수 있습니다. |
| **Export** | 현재 설계를 JSON 파일로 다운로드합니다. 노드 위치·타입·속성·연결 정보가 모두 포함됩니다. |
| **Import** | JSON 파일을 업로드해 설계를 불러옵니다. 사이클(루프) 감지 후 유효하지 않으면 거부됩니다. |
| **Generate** | 코드 생성 다이얼로그를 엽니다 (아래 설명 참고). |
| **CDC Check** | Clock Domain Crossing 위험 구간을 분석합니다. 문제가 있는 노드는 캔버스에서 주황색 테두리로 강조되고, 하단 상태 바에 경고 건수가 표시됩니다. |
| **Gating** | 각 IPBlock이 ClockGate에 의해 보호되는지 분석합니다. 게이팅된 비율과 추정 전력 절감(%)을 토스트 메시지로 표시합니다. |

### 코드 자동 생성 (Generate)
설계가 완성된 상태에서 **Generate** 버튼을 클릭하면 코드 미리보기 다이얼로그가 열립니다.
- **RTL 탭**: PLL·Divider·Mux·ClockGate를 Verilog-2005 모듈로 표현한 `.v` 파일을 확인할 수 있습니다.
- **SDC 탭**: PLL 클럭 정의(`create_clock`), 분주 클럭(`create_generated_clock`), 비동기 클럭 그룹, CDC false path가 담긴 `.sdc` 타이밍 제약 파일을 확인할 수 있습니다.
- **Download ZIP** 버튼으로 두 파일이 묶인 ZIP 아카이브를 바로 다운로드할 수 있습니다.

### 상태 바 (하단)
화면 아래쪽에 현재 프로젝트의 노드 수, 연결선 수, CDC 경고 수, 연결 상태가 항상 표시됩니다.

### 제약 사항
- 프로젝트당 최대 **200개** 노드
- 분주비: /2, /4, /8, /16, /32, /64, /128 고정
- 실행 취소(Undo) / 다시 실행(Redo) 기능 없음

---

## 사전 요구사항

- **Node.js** >= 18.0.0 ([nodejs.org](https://nodejs.org))
- **npm** >= 8.0.0
- **Python** >= 3.x + **node-gyp** (better-sqlite3 네이티브 빌드용)
  ```bash
  npm install -g node-gyp
  ```
  > macOS: Xcode Command Line Tools 필요 (`xcode-select --install`)
  > Windows: `npm install -g windows-build-tools`
  > Linux: `sudo apt-get install python3 make g++`

---

## 빠른 시작

```bash
# 프로젝트 디렉토리로 이동
cd projects/p1_clock_canvas

# 의존성 설치 (루트에서 npm install 실행한 경우 생략 가능)
npm install

# 개발 서버 실행 (백엔드 + 프론트엔드 동시)
npm run dev
```

- 백엔드: `http://localhost:3001`
- 프론트엔드: `http://localhost:5173` ← 브라우저에서 열기

---

## 프로젝트 구조

```
projects/p1_clock_canvas/
├── src/
│   ├── client/                  # 프론트엔드 (React 19 + TypeScript + React Flow)
│   │   ├── App.tsx              # 메인 앱 컴포넌트
│   │   ├── store.ts             # 상태 관리 (Context + useReducer)
│   │   ├── api.ts               # REST 클라이언트
│   │   ├── types.ts             # 클라이언트 타입
│   │   └── components/
│   │       ├── Canvas.tsx       # React Flow 캔버스
│   │       ├── Palette.tsx      # 컴포넌트 팔레트
│   │       ├── PropertyPanel.tsx
│   │       ├── Toolbar.tsx
│   │       ├── StatusBar.tsx
│   │       └── nodes/           # 커스텀 React Flow 노드
│   └── server/                  # 백엔드 (Node.js + Express + SQLite)
│       ├── index.ts             # 서버 진입점 (포트 3001)
│       ├── db.ts                # SQLite 초기화 & 마이그레이션
│       ├── models/types.ts      # 공유 타입 (ClockNode, ClockEdge)
│       ├── routes/              # REST API 라우트
│       └── services/            # 비즈니스 로직
│           ├── clock-tree.ts    # 주파수 계산, 사이클 검증
│           ├── codegen.ts       # Verilog/SDC 생성
│           └── export-import.ts # JSON 직렬화
├── tests/
│   ├── unit/                    # 단위 테스트 (Vitest)
│   ├── component/               # 컴포넌트 테스트 (Vitest + @testing-library)
│   └── e2e/                     # E2E 테스트 (Playwright)
├── docs/
│   ├── specs/                   # 요구사항 명세 (SPEC, 복사본)
│   ├── test-cases/              # 테스트 케이스 명세 (TC, 복사본)
│   └── research/                # 조사 자료
├── package.json
├── tsconfig.json                # 클라이언트 TypeScript 설정
├── tsconfig.server.json         # 서버 TypeScript 설정
├── vite.config.ts               # Vite 번들러 설정
├── vitest.config.ts             # Vitest 단위 테스트 설정
└── playwright.config.ts         # Playwright E2E 테스트 설정
```

---

## 개발 문서

| 문서 | 경로 | 설명 |
|------|------|------|
| 시스템 컨텍스트 | [`docs/specs/SYSTEM-CONTEXT.md`](docs/specs/SYSTEM-CONTEXT.md) | 시스템 경계 및 외부 인터페이스 |
| Canvas SPEC | [`docs/specs/SPEC-CC-CV.md`](docs/specs/SPEC-CC-CV.md) | 캔버스 UI 요구사항 (27 REQs) |
| Clock Tree SPEC | [`docs/specs/SPEC-CC-CT.md`](docs/specs/SPEC-CC-CT.md) | 클럭 트리 계산 요구사항 (19 REQs) |
| Code Gen SPEC | [`docs/specs/SPEC-CC-CG.md`](docs/specs/SPEC-CC-CG.md) | 코드 생성 요구사항 (11 REQs) |
| Canvas TC | [`docs/test-cases/TC-CC-CV.json`](docs/test-cases/TC-CC-CV.json) | Canvas 베이스라인 TC (37개) |
| Clock Tree TC | [`docs/test-cases/TC-CC-CT.json`](docs/test-cases/TC-CC-CT.json) | Clock Tree 베이스라인 TC (37개) |
| Code Gen TC | [`docs/test-cases/TC-CC-CG.json`](docs/test-cases/TC-CC-CG.json) | Code Gen 베이스라인 TC (18개) |
| 연구 자료 | [`docs/research/itda-clock-canvas-research.md`](docs/research/itda-clock-canvas-research.md) | 잇다반도체 클락캔버스 조사 |

> 원본 SPEC/TC는 ProofChain HITL 추적성을 위해 [`.omc/specs/`](../../.omc/specs/) 및 [`.omc/test-cases/`](../../.omc/test-cases/)에도 유지됩니다.

---

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | 백엔드 + 프론트엔드 동시 실행 (개발) |
| `npm run dev:server` | 백엔드만 실행 (`http://localhost:3001`) |
| `npm run dev:client` | 프론트엔드만 실행 (`http://localhost:5173`) |
| `npm run build` | 서버 TS 컴파일 + Vite 번들링 (프로덕션) |
| `npm test` | 단위/컴포넌트 테스트 전체 실행 (Vitest) |
| `npm run test:coverage` | 커버리지 리포트 포함 테스트 |
| `npm run test:e2e` | E2E 테스트 실행 (Playwright) |

---

## 지원 컴포넌트

| 컴포넌트 | 설명 |
|---------|------|
| **PLL** | 클럭 소스 (주파수 설정) |
| **Divider** | 분주기 (비율: 2, 4, 8, 16, 32, 64, 128) |
| **Mux** | 멀티플렉서 (다중 입력 선택) |
| **ClockGate** | 클럭 게이팅 (on/off 제어) |
| **IPBlock** | 클럭 소비자 (전력 설정) |
| **ClockDomain** | 클럭 도메인 (분석/조직) |

---

## 고급 기능

- **CDC Check**: Clock Domain Crossing 위험 감지
- **Gating Analysis**: 전력 절감 추정
- **Code Generation**: Verilog RTL + SDC 타이밍 제약 자동 생성
- **Import/Export**: JSON 설계 파일 저장/불러오기

---

## HITL 개발 현황

| 영역 | Phase | Cycle |
|------|-------|-------|
| CV (Canvas Editor) | test | 1 |
| CT (Clock Tree Engine) | test | 1 |
| CG (Code Generation) | test | 1 |

현황 원본: [`.omc/hitl-state.json`](../../.omc/hitl-state.json)

---

**버전**: Clock Canvas Web v1.0
**ProofChain**: SafeDev v2.2 (ISO 26262 준수)
