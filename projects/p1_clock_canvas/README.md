# p1 — Clock Canvas Web

**잇다반도체 클락캔버스 모사 프로젝트**

디지털 IC 설계의 **클럭 분배 네트워크(Clock Distribution Network, CDN)** 를 시각적으로 설계하고 검증하는 웹 애플리케이션입니다. PLL, 분주기, 멀티플렉서, 클럭 게이팅 셀 등을 캔버스 위에 배치하고 연결하여 클럭 트리를 구성하고, Verilog/SDC 코드를 자동 생성합니다.

> 이 프로젝트는 **[ProofChain SafeDev v2.2](../../README.md)** 방법론으로 개발되었습니다.
> ISO 26262 HITL 5-Phase 워크플로우 (spec → tc → code → test → verified) 를 준수합니다.

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
