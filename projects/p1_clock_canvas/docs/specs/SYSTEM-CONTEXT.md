# System Context: Clock Canvas Web

> Version: 1.0
> Date: 2026-02-23

## 1. 애플리케이션 유형

잇다반도체의 Clock Canvas EDA 도구를 모사한 웹 애플리케이션이다. SoC 클럭 트리를 노코드 GUI로 설계하고, RTL/SDC 코드를 자동 생성하는 기능을 웹에서 제공한다.

- **유형**: 풀스택 웹 애플리케이션 (SPA + REST API)
- **프론트엔드**: React 18 + TypeScript + React Flow (노드 기반 캔버스)
- **백엔드**: Node.js + Express + TypeScript
- **데이터베이스**: SQLite (better-sqlite3)
- **테스트**: Vitest (단위/통합) + Playwright (E2E)
- **대상 사용자**: SoC 클럭 아키텍처 설계자

## 2. UI 구성

```
┌──────────────────────────────────────────────────────┐
│  Toolbar  [Save] [Load] [Export] [Generate] [Zoom]   │
├────────┬─────────────────────────────┬───────────────┤
│        │                             │               │
│  Node  │                             │   Property    │
│ Palette│       Canvas Area           │    Panel      │
│        │   (React Flow 기반)          │               │
│ [PLL]  │   노드 배치 + 와이어 연결     │  선택된 노드의  │
│ [DIV]  │                             │  속성 편집      │
│ [MUX]  │                             │               │
│ [GATE] │                             │               │
│ [IP]   │                             │               │
│ [DOM]  │                             │               │
│        │                             │               │
├────────┴─────────────────────────────┴───────────────┤
│  Status Bar  [노드 수] [연결 수] [CDC 경고]            │
└──────────────────────────────────────────────────────┘
```

| 영역 | 설명 |
|------|------|
| **Toolbar** | 프로젝트 저장/로드, 코드 생성, 줌 컨트롤 |
| **Node Palette** | 6종 클럭 컴포넌트 타입 (왼쪽 사이드바) |
| **Canvas Area** | React Flow 기반 노드 그래프 편집 영역 |
| **Property Panel** | 선택된 노드의 속성 편집 (오른쪽 패널) |
| **Status Bar** | 설계 통계 및 경고 표시 |

## 3. 핵심 모델

### 3.1 컴포넌트 타입 (6종)

| 타입 | 포트 | 속성 | 설명 |
|------|------|------|------|
| **PLL** | out: 1 | input_freq (MHz), output_freq (MHz), name | 클럭 소스, 주파수 생성 |
| **Divider** | in: 1, out: 1 | ratio ({2, 4, 8, 16, 32, 64, 128}) | 주파수 분주 (input / ratio) |
| **Mux** | in: 2~4, out: 1, sel: 1 | select_index (정수) | 입력 중 하나를 선택하여 출력 |
| **Clock Gate** | in: 1, out: 1, en: 1 | name | 게이팅 셀, enable 신호로 클럭 ON/OFF |
| **IP Block** | in: 1 | name, power_mw (숫자) | 클럭 소비자 (리프 노드) |
| **Clock Domain** | in: 1, out: 다수 | domain_name, color | 도메인 경계 표시, 같은 주파수 영역 그룹핑 |

### 3.2 연결 규칙

- 그래프는 **DAG (Directed Acyclic Graph)** — 사이클 금지
- 출력 포트 → 입력 포트 방향만 허용
- 입력 포트는 **최대 1개** 연결
- 출력 포트는 **다수** 연결 허용 (fan-out)
- PLL은 소스 전용 (입력 포트 없음, 최상위)
- IP Block은 싱크 전용 (출력 포트 없음, 리프)

### 3.3 주파수 전파 규칙

```
PLL.output_freq
  → Divider: input_freq / ratio
  → Mux: selected input의 주파수
  → Clock Gate: input 주파수 그대로 통과
  → Clock Domain: source 주파수 그대로
  → IP Block: 연결된 주파수 표시
```

미연결 입력의 주파수는 `null` (미정)으로 표시한다.

## 4. 동작 모델

### 4.1 주파수 계산

토폴로지 정렬 기반으로 루트(PLL)에서 리프(IP Block)까지 순방향 전파한다. 노드 속성 변경이나 연결 변경 시 영향받는 하위 노드의 주파수를 재계산한다.

### 4.2 CDC (Clock Domain Crossing)

서로 다른 Clock Domain에 속한 노드 간 직접 연결이 있으면 CDC crossing으로 감지한다. CDC 경로는 경고로 표시하며 (차단하지 않음), 사용자가 동기화 방식을 결정한다.

### 4.3 게이팅 분석

Clock Gate가 있는 경로의 IP Block은 "gated"로 분류한다. 전체 IP Block 중 gated 비율로 예상 전력 절감률을 추정한다.

## 5. 사용자 인터랙션 모델

| # | 인터랙션 | 방법 | 비고 |
|---|---------|------|------|
| 1 | 노드 추가 | 팔레트에서 캔버스로 드래그 앤 드롭 | 6종 타입 |
| 2 | 노드 선택 | 캔버스에서 노드 클릭 | Shift+클릭으로 다중 선택 |
| 3 | 노드 이동 | 선택된 노드 드래그 | 와이어도 따라 이동 |
| 4 | 노드 삭제 | 선택 후 Delete 키 | 연결된 와이어도 삭제 |
| 5 | 와이어 연결 | 출력 포트 → 입력 포트 드래그 | 드래그 중 프리뷰 표시 |
| 6 | 와이어 삭제 | 와이어 선택 후 Delete 키 | |
| 7 | 속성 편집 | Property Panel에서 값 변경 | 주파수/비율/이름 등 |
| 8 | 캔버스 줌 | 마우스 휠 | 25%~400% 범위 |
| 9 | 캔버스 팬 | 빈 영역 드래그 | |
| 10 | 프로젝트 저장 | Toolbar [Save] 클릭 | 이름 입력 다이얼로그 |
| 11 | 프로젝트 로드 | Toolbar [Load] 클릭 | 프로젝트 목록에서 선택 |
| 12 | 코드 생성 | Toolbar [Generate] 클릭 | RTL + SDC 일괄 생성 |
| 13 | 코드 미리보기 | Generate 전 Preview | 문법 강조 코드 뷰어 |
| 14 | 설계 내보내기 | Toolbar [Export] | JSON 다운로드 |
| 15 | 설계 가져오기 | Toolbar [Import] | JSON 업로드 |
| 16 | CDC 분석 요청 | Toolbar [CDC Check] | 결과를 캔버스에 오버레이 |
| 17 | 게이팅 분석 요청 | Toolbar [Gating Analysis] | 요약 대화상자 표시 |

## 6. 존재하지 않는 기능 (Scope Exclusions)

| # | 제외 기능 | 이유 |
|---|---------|------|
| 1 | 실제 PLL 아날로그 시뮬레이션 | 웹에서 불필요, 주파수 값만 전파 |
| 2 | DFT Canvas 기능 | 범위 축소 (Clock Canvas만 모사) |
| 3 | Power Canvas 기능 | 범위 축소 (Clock Canvas만 모사) |
| 4 | UPF 생성 | RTL + SDC만 생성 |
| 5 | 다중 사용자 동시 편집 | 단일 사용자 환경 |
| 6 | 사용자 인증/권한 관리 | 테스트 목적, 인증 불필요 |
| 7 | 물리 설계(CTS, P&R) 연동 | EDA 백엔드 통합 범위 밖 |
| 8 | Undo/Redo | 초기 버전 범위 밖 (향후 확장 가능) |
| 9 | 실시간 타이밍 분석 | STA 도구 연동 불필요 |
| 10 | 멀티탭/멀티윈도우 | 단일 캔버스 뷰 |

## 7. TC 설계 시 유의사항

- 프론트엔드 테스트: React Flow 노드/엣지 조작은 DOM 이벤트 시뮬레이션 필요
- 백엔드 테스트: REST API 단위 테스트 + SQLite in-memory DB 사용
- 주파수 계산: 부동소수점 비교 시 오차 허용 (epsilon = 0.001MHz)
- CDC 감지: 그래프 알고리즘 테스트는 고정 fixture 그래프 사용
- 코드 생성: 생성된 Verilog/SDC의 문법 정합성은 문자열 패턴 매칭으로 검증
- IP Block의 power_mw는 게이팅 분석용 추정치이며 정밀 시뮬레이션 아님
