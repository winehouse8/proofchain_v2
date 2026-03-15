# Clock Canvas Web — 실행 가이드

Clock Canvas는 디지털 IC 설계의 **클럭 분배 네트워크(Clock Distribution Network, CDN)** 를 시각적으로 설계하고 검증하는 웹 애플리케이션입니다. PLL, 분주기, 멀티플렉서, 클럭 게이팅 셀 등을 캔버스 위에 배치하고 연결하여 클럭 트리를 구성할 수 있습니다.

---

## 빠른 시작

### 1. 설치 및 의존성

```bash
# 프로젝트 디렉토리로 이동
cd /path/to/260220_proofchain

# npm 패키지 설치
npm install
```

### 2. 개발 서버 실행

```bash
# 백엔드 (Node.js Express) + 프론트엔드 (Vite) 동시 실행
npm run dev
```

**결과**:
- 백엔드: `http://localhost:3001`
- 프론트엔드: `http://localhost:5173`

브라우저에서 `http://localhost:5173` 열기 → Clock Canvas 시작

### 3. 빌드 (프로덕션)

```bash
# 타입스크립트 컴파일 + Vite 번들링
npm run build

# 백엔드 서버만 실행 (프로덕션용)
npm start
```

---

## 기본 사용법

### 프로젝트 생성 / 로드

1. **새 프로젝트**:
   - 상단 `New` 버튼 클릭
   - 프로젝트 이름 입력
   - 팔레트에서 컴포넌트 드래그 → 캔버스 위에 드롭

2. **기존 프로젝트 로드**:
   - 상단 `Load` 버튼 클릭
   - 프로젝트 목록에서 선택

### 컴포넌트 배치

왼쪽 팔레트에서 6가지 컴포넌트 타입을 캔버스 위에 드래그하여 배치:

| 컴포넌트 | 설명 | 용도 |
|---------|------|------|
| **PLL** | Phase-Locked Loop | 클럭 소스 (주파수 설정 가능) |
| **Divider** | 분주기 | 입력 주파수를 2, 4, 8, 16, 32, 64, 128 중 하나로 분주 |
| **Mux** | 멀티플렉서 | 여러 입력 중 하나 선택 |
| **ClockGate** | 클럭 게이팅 | 클럭 on/off 제어 |
| **IPBlock** | IP 블록 | 클럭 소비자 (전력 설정) |
| **ClockDomain** | 클럭 도메인 | 분석/조직 용도 |

### 연결 (와이어)

1. 컴포넌트의 **출력 포트**(원형)에서 드래그
2. 대상 컴포넌트의 **입력 포트**로 드롭
3. 자동으로 주파수가 계산되어 표시됨

**제약사항**:
- 입력 포트는 하나의 연결만 가능 (단일 드라이버)
- 순환 연결(사이클) 불가
- 출력→출력, 입력→입력 연결 불가

### 속성 편집

1. 캔버스에서 컴포넌트 클릭 → 오른쪽 **Properties** 패널
2. 타입별로 편집 가능한 속성:
   - **PLL**: Output Freq (MHz)
   - **Divider**: Ratio (드롭다운)
   - **Mux**: Select Index
   - **IPBlock**: Power (mW)
   - **ClockDomain**: Domain Name, Color

3. Enter 키 또는 필드 벗어남 → 자동 저장 + 주파수 재계산

### 삭제

- 캔버스에서 컴포넌트 또는 와이어 선택
- `Delete` 또는 `Backspace` 키 누름
- 자동으로 연결된 와이어도 함께 삭제

---

## 고급 기능

### CDC Check (Clock Domain Crossing)

상단 `CDC Check` 버튼:
- 다른 클럭 도메인 사이의 신호 전송 구간 감지
- CDC 위험 영역 하이라이트 표시

### Gating Analysis

상단 `Gating` 버튼:
- 게이팅된 vs 게이팅되지 않은 IP 블록 비교
- 전력 절감 추정치 계산

### Code Generation

상단 `Generate` 버튼:
- **RTL**: Verilog 클럭 분배 로직 미리보기
- **SDC**: Synopsys Design Constraints (타이밍 제약) 다운로드

### Import / Export

상단 `Import` / `Export` 버튼:
- **Export**: 현재 설계를 JSON 파일로 다운로드
- **Import**: JSON 파일 업로드하여 설계 로드

---

## 테스트 실행

### 단위 테스트

```bash
# Vitest로 모든 단위 테스트 실행 (1024개)
npm run test

# 특정 테스트 파일만 실행
npm run test -- src/client/store.test.ts

# 감시 모드 (파일 변경 시 자동 재실행)
npm run test -- --watch
```

### E2E 테스트

```bash
# Playwright로 모든 E2E 테스트 실행 (32개)
npm run test:e2e

# 특정 E2E 테스트만 실행
npm run test:e2e -- tests/e2e/CV/canvas-interactions.spec.ts

# UI 모드로 실행 (브라우저 상호작용 보기)
npm run test:e2e -- --ui
```

---

## 파일 구조

```
src/
├── server/                      # 백엔드 (Node.js + Express)
│   ├── index.ts                 # 서버 진입점
│   ├── db.ts                    # SQLite 데이터베이스
│   ├── models/types.ts          # 타입 정의 (ClockNode, ClockEdge 등)
│   ├── routes/                  # REST API 라우트
│   │   ├── projects.ts          # 프로젝트 CRUD
│   │   ├── nodes.ts             # 노드 CRUD
│   │   ├── connections.ts       # 연결(와이어) CRUD
│   │   ├── analysis.ts          # CDC & Gating 분석
│   │   └── codegen.ts           # Verilog/SDC 생성
│   └── services/                # 비즈니스 로직
│       ├── clock-tree.ts        # 주파수 계산, 사이클 검증
│       ├── validation.ts        # 입력 검증
│       └── export-import.ts     # JSON 직렬화
│
├── client/                      # 프론트엔드 (React + TypeScript)
│   ├── App.tsx                  # 메인 앱 컴포넌트
│   ├── store.ts                 # 상태 관리 (Context + useReducer)
│   ├── types.ts                 # 클라이언트 타입
│   ├── api.ts                   # REST 클라이언트
│   ├── components/
│   │   ├── Canvas.tsx           # React Flow 캔버스
│   │   ├── Palette.tsx          # 컴포넌트 팔레트
│   │   ├── PropertyPanel.tsx    # 속성 편집 패널
│   │   ├── Toolbar.tsx          # 상단 도구모음
│   │   ├── StatusBar.tsx        # 하단 상태 바
│   │   └── nodes/               # 커스텀 React Flow 노드
│   └── styles.css               # 스타일시트
│
tests/
├── unit/                        # 단위 테스트
│   └── CV/
├── component/                   # 컴포넌트 테스트
│   └── CV/
└── e2e/                         # E2E 테스트 (Playwright)
    └── CV/
        ├── canvas-interactions.spec.ts
        ├── toolbar-features.spec.ts
        └── adversarial-stress.spec.ts
```

---

## 데이터 저장소

### SQLite 데이터베이스

프로젝트 데이터는 SQLite에 저장됩니다:

```bash
# 개발 환경
clock-canvas.db          # 메인 DB

# 테스트 환경
.test-e2e.db           # E2E 테스트용 DB
```

### 스키마

**projects 테이블**: 프로젝트 메타데이터 (id, name, created_at, updated_at)
**nodes 테이블**: 컴포넌트 (id, project_id, type, properties, position_x/y, computed_freq)
**edges 테이블**: 연결 (id, project_id, source, target)

---

## API 엔드포인트 (참고)

| 메서드 | 엔드포인트 | 설명 |
|--------|----------|------|
| POST | `/api/projects` | 프로젝트 생성 |
| GET | `/api/projects` | 프로젝트 목록 |
| GET | `/api/projects/:id` | 프로젝트 로드 |
| PUT | `/api/projects/:id` | 프로젝트 이름 변경 |
| DELETE | `/api/projects/:id` | 프로젝트 삭제 |
| POST | `/api/projects/:projectId/nodes` | 노드 생성 |
| PATCH | `/api/projects/:projectId/nodes/:nodeId` | 노드 편집 |
| DELETE | `/api/projects/:projectId/nodes/:nodeId` | 노드 삭제 |
| POST | `/api/projects/:projectId/connections` | 연결 생성 |
| DELETE | `/api/projects/:projectId/connections/:edgeId` | 연결 삭제 |
| GET | `/api/projects/:projectId/analysis/cdc` | CDC 분석 |
| GET | `/api/projects/:projectId/analysis/gating` | Gating 분석 |
| POST | `/api/projects/:projectId/generate/preview` | 코드 미리보기 |
| POST | `/api/projects/:projectId/generate/download` | 코드 다운로드 |

---

## 제약사항 & 한계

| 항목 | 제한값 |
|------|--------|
| 프로젝트당 최대 노드 | 200개 |
| PLL 최대 주파수 | 10,000 MHz |
| Divider 지원 비율 | 2, 4, 8, 16, 32, 64, 128 |
| 주파수 소수점 | 3자리 |

---

## 트러블슈팅

### 포트 충돌
```bash
# 포트 3001 또는 5173이 이미 사용 중인 경우
lsof -i :3001
lsof -i :5173
kill -9 <PID>
```

### 데이터베이스 초기화
```bash
# 기존 데이터베이스 삭제 후 재생성
rm clock-canvas.db*
npm run dev
```

### 노드 모듈 재설치
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## 더 알아보기

- **백엔드 아키텍처**: `src/server/README.md` (있는 경우)
- **프론트엔드 컴포넌트**: `src/client/README.md` (있는 경우)
- **사양 및 요구사항**: `.omc/specs/SPEC-CC-CV.md`
- **테스트 케이스**: `.omc/test-cases/TC-CC-CV.json`

---

**버전**: Clock Canvas Web v1.0
**프레임워크**: ProofChain SafeDev v2.2 (ISO 26262 준수)
**마지막 업데이트**: 2026-03-04
