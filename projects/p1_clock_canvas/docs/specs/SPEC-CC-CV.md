# SPEC-CC-CV: Canvas Editor (캔버스 편집기)

> Version: 1.1
> Date: 2026-02-23
> Status: Draft

## 1. Overview

SoC 클럭 트리를 시각적으로 설계하는 캔버스 편집기다. 사용자는 6종의 클럭 컴포넌트를 드래그 앤 드롭으로 배치하고, 와이어로 연결하며, 속성을 편집한다. React Flow 기반 노드 그래프 편집기로 구현한다.

## 2. Requirements

### REQ-CV-001: 노드 팔레트 표시
**Pattern**: Ubiquitous
**EARS**: The Canvas Editor shall display a node palette in the left sidebar containing the following component types: PLL, Divider, Mux, Clock Gate, IP Block, and Clock Domain.
**Rationale**: 사용자가 사용 가능한 컴포넌트 타입을 한눈에 파악하고 선택할 수 있어야 한다.
**Verification**: unit — 팔레트 렌더링 시 6개 타입이 모두 표시되는지 확인

### REQ-CV-002: 노드 드래그 앤 드롭 배치
**Pattern**: Event-Driven
**EARS**: When the user drags a component from the palette and drops it onto the canvas area, the Canvas Editor shall create a new instance of that component at the drop position with default properties.
**Rationale**: 노코드 설계의 핵심 인터랙션이다. 클락캔버스의 "Draw" 패러다임을 구현한다.
**Verification**: e2e — 각 타입별 드래그 앤 드롭 후 노드 생성 확인

### REQ-CV-003: 캔버스 밖 드롭 무시
**Pattern**: Unwanted
**EARS**: If the user drops a component outside the canvas area, the Canvas Editor shall discard the drop action without creating any node.
**Rationale**: 실수로 캔버스 밖에 놓았을 때 의도하지 않은 노드가 생성되면 안 된다.
**Verification**: e2e — 팔레트/속성패널/툴바 위에 드롭 시 노드 미생성 확인

### REQ-CV-004: 노드 선택
**Pattern**: Event-Driven
**EARS**: When the user clicks on a node on the canvas, the Canvas Editor shall visually highlight the node with a selection border and display its properties in the property panel.
**Rationale**: 선택된 노드를 시각적으로 구분하고, 속성 편집 대상을 결정한다.
**Verification**: component — 노드 클릭 시 선택 상태 + Property Panel 갱신 확인

### REQ-CV-005: 다중 선택
**Pattern**: Event-Driven
**EARS**: When the user holds the Shift key and clicks on additional nodes, the Canvas Editor shall add those nodes to the current selection without deselecting previously selected nodes.
**Rationale**: 여러 노드를 동시에 이동하거나 삭제할 수 있어야 한다.
**Verification**: component — Shift+클릭으로 2개 이상 노드 선택 확인

### REQ-CV-006: 빈 영역 클릭 시 선택 해제
**Pattern**: Event-Driven
**EARS**: When the user clicks on an empty area of the canvas without holding Shift, the Canvas Editor shall deselect all currently selected nodes and clear the property panel.
**Rationale**: 선택 상태를 쉽게 초기화할 수 있어야 한다.
**Verification**: component — 빈 영역 클릭 후 선택 해제 + Property Panel 비움 확인

### REQ-CV-007: 노드 삭제
**Pattern**: Event-Driven
**EARS**: When the user presses the Delete key while one or more nodes are selected, the Canvas Editor shall remove the selected nodes and all wires connected to them from the canvas, and send a delete request to the backend API.
**Rationale**: 설계에서 불필요한 컴포넌트를 제거할 수 있어야 한다.
**Verification**: e2e — 노드 삭제 후 캔버스 + 백엔드 동기화 확인

### REQ-CV-008: 노드 이동
**Pattern**: Event-Driven
**EARS**: When the user drags a selected node to a new position on the canvas, the Canvas Editor shall move the node to the new position and update all connected wires to follow the node's ports.
**Rationale**: 레이아웃을 자유롭게 조정할 수 있어야 한다.
**Verification**: component — 노드 드래그 후 위치 변경 + 와이어 경로 갱신 확인

### REQ-CV-009: 와이어 연결 생성
**Pattern**: Event-Driven
**EARS**: When the user drags from an output port of one node to an input port of another node, the Canvas Editor shall create a wire connecting the two ports and send a connection request to the backend API.
**Rationale**: 클럭 신호 경로를 정의하는 핵심 인터랙션이다.
**Verification**: e2e — 출력→입력 드래그 후 와이어 생성 + API 호출 확인

### REQ-CV-010: 와이어 연결 프리뷰
**Pattern**: State-Driven
**EARS**: While the user is dragging from an output port, the Canvas Editor shall display a preview wire following the cursor and visually highlight all compatible input ports that can accept the connection.
**Rationale**: 사용자가 유효한 연결 대상을 즉시 파악할 수 있어야 한다.
**Verification**: component — 드래그 중 프리뷰 와이어 + 호환 포트 하이라이트 확인

### REQ-CV-011: 유효하지 않은 연결 거부
**Pattern**: Unwanted
**EARS**: If the user attempts to create a wire between two output ports, between two input ports, to an input port that already has a connection, or in a direction that would create a cycle, the Canvas Editor shall reject the connection, display a brief error toast message, and remove the preview wire.
**Rationale**: 클럭 트리의 DAG 제약과 포트 타입 규칙을 UI 레벨에서 즉시 피드백한다.
**Verification**: e2e — 각 무효 케이스별 거부 + 에러 메시지 확인

### REQ-CV-012: 와이어 삭제
**Pattern**: Event-Driven
**EARS**: When the user clicks on a wire to select it and presses the Delete key, the Canvas Editor shall remove the wire from the canvas and send a disconnection request to the backend API.
**Rationale**: 잘못된 연결을 수정할 수 있어야 한다.
**Verification**: e2e — 와이어 삭제 후 캔버스 + 백엔드 동기화 확인

### REQ-CV-013: Property Panel 표시
**Pattern**: State-Driven
**EARS**: While exactly one node is selected, the Canvas Editor shall display the node's editable properties in the property panel, including the common field (name) and type-specific fields: PLL (output_freq, input_freq as read-only display), Divider (ratio), Mux (select_index), Clock Gate (no additional fields), IP Block (power_mw), and Clock Domain (domain_name, color).
**Rationale**: 각 컴포넌트의 속성을 직관적으로 편집할 수 있어야 한다. name은 모든 노드의 공통 필드이며, PLL의 input_freq는 외부 레퍼런스 클럭 값으로 읽기 전용으로 표시한다.
**Verification**: component — 각 타입별 노드 선택 시 name 필드 + 타입별 속성 필드 표시 확인 (6개 타입 모두)

### REQ-CV-014: 속성 편집 및 반영
**Pattern**: Event-Driven
**EARS**: When the user modifies a property value in the property panel and the input loses focus or the user presses Enter, the Canvas Editor shall validate the value, send an update request to the backend API, and upon success update the node's visual label on the canvas.
**Rationale**: 속성 변경이 즉시 설계에 반영되어 사용자가 결과를 확인할 수 있어야 한다.
**Verification**: e2e — PLL output_freq 변경 → 노드 라벨 갱신 + 하류 주파수 재계산 확인

### REQ-CV-015: 주파수 라벨 표시
**Pattern**: State-Driven
**EARS**: While a node carries a clock signal with a computed frequency, the Canvas Editor shall display the frequency value (in MHz) as a label below the node.
**Rationale**: 설계자가 각 지점의 주파수를 캔버스에서 바로 확인할 수 있어야 한다.
**Verification**: component — PLL(400MHz) → Divider(/2) 연결 후 Divider에 "200 MHz" 표시 확인

### REQ-CV-016: 캔버스 줌
**Pattern**: Event-Driven
**EARS**: When the user scrolls the mouse wheel over the canvas, the Canvas Editor shall zoom in (scroll up) or out (scroll down) centered on the cursor position, clamping the zoom level between 25% and 400%.
**Rationale**: 큰 설계를 확대/축소하여 볼 수 있어야 한다.
**Verification**: component — 줌 인/아웃 후 줌 레벨 범위 확인 (25% 미만, 400% 초과 불가)

### REQ-CV-017: 캔버스 팬
**Pattern**: Event-Driven
**EARS**: When the user presses and drags on an empty area of the canvas (without Shift), the Canvas Editor shall pan the canvas viewport in the direction of the drag.
**Rationale**: 캔버스 영역이 뷰포트보다 클 때 스크롤할 수 있어야 한다.
**Verification**: component — 빈 영역 드래그 후 뷰포트 이동 확인

### REQ-CV-018: 상태 표시줄
**Pattern**: Ubiquitous
**EARS**: The Canvas Editor shall display a status bar at the bottom of the screen showing the current node count, connection count, and CDC warning count.
**Rationale**: 설계자가 현재 설계의 규모와 잠재적 문제를 즉시 파악할 수 있어야 한다.
**Verification**: component — 노드/연결 추가·삭제 시 상태 표시줄 카운트 실시간 갱신 확인

### REQ-CV-019: 프로젝트 저장
**Pattern**: Event-Driven
**EARS**: When the user clicks the Save button in the toolbar, the Canvas Editor shall send the current canvas state (all nodes with positions and properties, all connections) to the backend save API and display a success or failure notification.
**Rationale**: 설계 작업을 영속적으로 저장할 수 있어야 한다.
**Verification**: e2e — Save 클릭 후 API 호출 + 성공 알림 확인

### REQ-CV-020: 프로젝트 로드
**Pattern**: Event-Driven
**EARS**: When the user clicks the Load button in the toolbar, the Canvas Editor shall fetch the project list from the backend API, display a project selection dialog, and upon selection load the project data onto the canvas replacing the current state.
**Rationale**: 저장된 설계를 다시 불러와 작업을 이어갈 수 있어야 한다.
**Verification**: e2e — Load 클릭 → 프로젝트 선택 → 캔버스 갱신 확인

### REQ-CV-021: 설계 내보내기
**Pattern**: Event-Driven
**EARS**: When the user clicks the Export button in the toolbar, the Canvas Editor shall request the design JSON from the backend export API and trigger a file download in the browser.
**Rationale**: 설계 데이터를 JSON으로 백업하거나 외부 도구에 전달할 수 있어야 한다.
**Verification**: e2e — Export 클릭 → JSON 파일 다운로드 확인

### REQ-CV-022: 설계 가져오기
**Pattern**: Event-Driven
**EARS**: When the user clicks the Import button in the toolbar and selects a JSON file, the Canvas Editor shall upload the file to the backend import API, and upon success load the imported project onto the canvas.
**Rationale**: 이전에 내보낸 설계나 외부 생성 설계를 불러올 수 있어야 한다.
**Verification**: e2e — Import 클릭 → JSON 파일 선택 → 캔버스에 설계 표시 확인

### REQ-CV-023: 코드 생성 요청
**Pattern**: Event-Driven
**EARS**: When the user clicks the Generate button in the toolbar, the Canvas Editor shall first request a code preview from the backend API, display the generated Verilog and SDC code in a preview dialog with syntax highlighting, and provide a Download button to download the files as a ZIP archive.
**Rationale**: 설계로부터 RTL/SDC 코드를 생성하고 검토한 후 다운로드하는 워크플로를 지원한다.
**Verification**: e2e — Generate 클릭 → 미리보기 표시 → Download 클릭 → ZIP 다운로드 확인

### REQ-CV-024: CDC 분석 요청
**Pattern**: Event-Driven
**EARS**: When the user clicks the CDC Check button in the toolbar, the Canvas Editor shall request CDC analysis from the backend API and display the results as highlighted crossings on the canvas with a summary panel listing source domain, target domain, and affected nodes.
**Rationale**: CDC 경로를 시각적으로 확인하여 설계 검증을 지원한다.
**Verification**: e2e — CDC Check 클릭 → 크로싱 하이라이트 + 요약 패널 표시 확인

### REQ-CV-025: 게이팅 분석 요청
**Pattern**: Event-Driven
**EARS**: When the user clicks the Gating Analysis button in the toolbar, the Canvas Editor shall request gating analysis from the backend API and display a summary dialog showing gated IP count, ungated IP count, total IP count, and estimated power reduction percentage.
**Rationale**: 클럭 게이팅 적용 범위를 정량적으로 파악할 수 있어야 한다.
**Verification**: e2e — Gating Analysis 클릭 → 요약 다이얼로그 표시 확인

### REQ-CV-026: 백엔드 API 오류 처리
**Pattern**: Unwanted
**EARS**: If any backend API request fails (network error, HTTP 4xx, or HTTP 5xx), the Canvas Editor shall display a toast notification with the error message, revert any optimistic UI updates for that operation, and not corrupt the local canvas state.
**Rationale**: 네트워크 오류나 서버 오류 시 사용자에게 명확한 피드백을 제공하고 UI 일관성을 유지해야 한다.
**Verification**: e2e — 네트워크 차단 상태에서 노드 생성 시도 → 에러 토스트 + 캔버스 원상 복구 확인

### REQ-CV-027: 새 프로젝트 생성
**Pattern**: Event-Driven
**EARS**: When the user clicks the Save button in the toolbar and no project is currently loaded (new canvas), the Canvas Editor shall prompt for a project name, send a POST /api/projects request to create a new project, then save the current canvas state to the newly created project.
**Rationale**: 사용자가 새 설계를 시작하고 처음 저장할 때 프로젝트가 생성되어야 한다.
**Verification**: e2e — 새 캔버스에서 Save 클릭 → 이름 입력 다이얼로그 → 프로젝트 생성 + 저장 확인

### REQ-CV-028: 캔버스 초기화 (New)
**Pattern**: Event-Driven
**EARS**: When the user clicks the "New" button, the Canvas Editor shall clear all nodes and edges from the canvas, reset the current project state to "unsaved", and display an empty canvas ready for a new design.
**Rationale**: 사용자가 현재 작업을 초기화하고 새 설계를 처음부터 시작할 수 있어야 한다.
**Verification**: e2e — New 버튼 클릭 후 캔버스가 완전히 비워지고 프로젝트 상태가 "unsaved"로 리셋됨 확인

### REQ-CV-029: 프로젝트 목록에서 삭제
**Pattern**: Event-Driven
**EARS**: When the user clicks the Delete button for a project in the Load dialog, the Canvas Editor shall display a confirmation prompt, and if confirmed, shall delete the project via the backend API and remove it from the project list display.
**Rationale**: 사용자가 불필요한 프로젝트를 삭제하여 프로젝트 목록을 관리할 수 있어야 한다.
**Verification**: e2e — Load 다이얼로그에서 Delete 클릭 → 확인 프롬프트 표시 → 확인 시 API 삭제 요청 + 목록에서 제거 확인

## 3. Constraints

1. React Flow 라이브러리의 노드/엣지 API를 사용한다.
2. 캔버스 최대 노드 수: 200개 (성능 제약).
3. 줌 범위: 25%~400%.
4. 프론트엔드는 백엔드 API와 REST로 통신하며, 낙관적 업데이트(optimistic update)를 사용한다.
5. 모든 노드/와이어 상태 변경은 백엔드에 동기화한다 (프론트엔드는 뷰 레이어, 백엔드가 진실원천).
6. 속성 편집 시 유효성 검증: PLL output_freq > 0 and ≤ 10000 (MHz), Divider ratio ∈ {2, 4, 8, 16, 32, 64, 128}.
7. Mux의 sel 포트와 Clock Gate의 en 포트는 캔버스에서 연결 가능한 포트 핸들로 렌더링한다 (property-only가 아님). sel 포트에는 select 신호 와이어를, en 포트에는 enable 신호 와이어를 연결할 수 있다.

## 4. Dependencies

- **CT (Clock Tree Engine)**: 노드 CRUD, 연결, 주파수 계산 API 제공
- **React Flow**: 캔버스 렌더링 라이브러리

## 5. Open Questions

없음.
