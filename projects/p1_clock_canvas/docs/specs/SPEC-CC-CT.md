# SPEC-CC-CT: Clock Tree Engine (클럭 트리 엔진)

> Version: 1.1
> Date: 2026-02-23
> Status: Draft

## 1. Overview

SoC 클럭 트리의 데이터 모델과 계산 로직을 담당하는 백엔드 엔진이다. 클럭 컴포넌트 그래프(DAG)를 관리하고, 주파수 전파, 사이클 감지, CDC 분석, 게이팅 분석을 수행한다. REST API로 프론트엔드에 서비스를 제공한다.

## 2. Requirements

### REQ-CT-001: 클럭 트리 그래프 모델
**Pattern**: Ubiquitous
**EARS**: The Clock Tree Engine shall maintain a directed acyclic graph (DAG) where nodes represent clock components (PLL, Divider, Mux, Clock Gate, IP Block, Clock Domain) and edges represent clock signal connections between output and input ports.
**Rationale**: 클럭 트리의 토폴로지를 정확하게 표현하는 데이터 구조가 필요하다.
**Verification**: unit — 노드/엣지 추가/삭제 후 그래프 무결성 확인

### REQ-CT-002: 노드 생성 API
**Pattern**: Event-Driven
**EARS**: When the API receives a POST /api/projects/{projectId}/nodes request with a valid component type and properties, the Clock Tree Engine shall create the node in the graph, assign a unique node ID, and return the created node data with HTTP 201.
**Rationale**: 프론트엔드에서 노드를 생성할 수 있는 API가 필요하다.
**Verification**: api — 각 컴포넌트 타입별 POST 요청 → 201 + node ID 반환 확인

### REQ-CT-003: 유효하지 않은 노드 생성 거부
**Pattern**: Unwanted
**EARS**: If the API receives a node creation request with an unknown component type or missing required properties, the Clock Tree Engine shall reject the request and return HTTP 400 with an error message specifying the validation failure.
**Rationale**: 잘못된 데이터가 그래프에 저장되는 것을 방지한다.
**Verification**: api — 잘못된 타입/누락 속성 → 400 에러 확인

### REQ-CT-004: 연결 생성 및 유효성 검증
**Pattern**: Event-Driven
**EARS**: When the API receives a POST /api/projects/{projectId}/connections request with source node/port and target node/port, the Clock Tree Engine shall validate that (a) both nodes exist, (b) the source is an output port and the target is an input port, (c) the target input port has no existing connection, (d) the connection would not create a cycle, (e) the source node type has an output port (PLL, Divider, Mux, Clock Gate, Clock Domain have output ports; IP Block does not), and (f) the target node type has an input port (Divider, Mux, Clock Gate, IP Block, Clock Domain have input ports; PLL does not), then create the edge and return HTTP 201 with the connection data.
**Rationale**: DAG 제약, 포트 타입 규칙, 컴포넌트별 포트 유무를 서버에서 강제한다. PLL은 소스 전용(입력 포트 없음), IP Block은 싱크 전용(출력 포트 없음)이다.
**Verification**: api — 유효한 연결 → 201; IP Block 출력 포트 연결 시도 → 400; PLL 입력 포트 연결 시도 → 400; 각 위반 조건별 → 400 에러 확인

### REQ-CT-005: 사이클 감지
**Pattern**: Unwanted
**EARS**: If a proposed connection would create a cycle in the clock tree graph (including self-loops), the Clock Tree Engine shall reject the connection and return HTTP 400 with an error message that includes the detected cycle path.
**Rationale**: 클럭 트리는 DAG여야 한다. 사이클은 물리적으로 불가능한 클럭 루프를 의미한다.
**Verification**: unit — DFS 기반 사이클 감지: 자기 루프, 2-노드 사이클, 3+ 노드 사이클 테스트

### REQ-CT-006: 입력 포트 단일 연결 제약
**Pattern**: Unwanted
**EARS**: If a proposed connection targets an input port that already has an existing connection, the Clock Tree Engine shall reject the connection and return HTTP 400 with an error indicating the port is already occupied.
**Rationale**: 하나의 입력 포트에 두 클럭 소스가 연결되면 물리적 충돌이 발생한다.
**Verification**: api — 이미 연결된 입력 포트에 재연결 시도 → 400 확인

### REQ-CT-007: 주파수 전파
**Pattern**: Event-Driven
**EARS**: When a node's frequency-affecting property changes (PLL output_freq, Divider ratio, Mux select_index) or a connection is created or deleted, the Clock Tree Engine shall recalculate frequencies for all downstream nodes using topological sort order and the following propagation rules: PLL outputs output_freq; Divider outputs input_freq / ratio; Mux outputs the frequency of the selected input (if select_index is within the range of connected inputs, otherwise null); Clock Gate and Clock Domain pass through the input frequency; IP Block receives the input frequency as its operating frequency.
**Rationale**: 주파수 전파는 클럭 트리 설계의 핵심이며, 모든 변경에 대해 일관성을 유지해야 한다. Mux의 select_index가 범위 밖인 경우 안전하게 null로 처리한다.
**Verification**: unit — PLL(400MHz) → Divider(/4) → IP Block 체인에서 IP Block = 100MHz 확인; Divider ratio 변경 시 하류 재계산 확인; Mux select_index 범위 밖 → 출력 null 확인

### REQ-CT-008: 미연결 입력의 주파수 처리
**Pattern**: State-Driven
**EARS**: While a node's input port has no connection, the Clock Tree Engine shall set that node's computed frequency to null and propagate null to all downstream nodes.
**Rationale**: 미연결 상태는 "주파수 미정"을 의미하며, 잘못된 값을 전파하면 안 된다.
**Verification**: unit — 미연결 Divider의 출력 주파수 = null 확인; 하류 IP Block도 null 확인

### REQ-CT-009: 노드 삭제 시 연결 정리
**Pattern**: Event-Driven
**EARS**: When the API receives a DELETE /api/projects/{projectId}/nodes/{nodeId} request, the Clock Tree Engine shall remove the node and all edges connected to it, recalculate frequencies for all affected downstream nodes, and return HTTP 204.
**Rationale**: 노드 삭제 시 고아 엣지가 남으면 안 되고, 하류 주파수가 재계산되어야 한다.
**Verification**: api — 중간 노드(Divider) 삭제 → 204 + 하류 IP Block 주파수 = null 확인

### REQ-CT-010: CDC 경로 감지
**Pattern**: Event-Driven
**EARS**: When the API receives a GET /api/projects/{projectId}/analysis/cdc request, the Clock Tree Engine shall identify all edges where the source node and target node belong to different Clock Domains (a node belongs to Clock Domain D if it is reachable from D's output ports via the graph), and return a list of CDC crossings with source domain, target domain, source node, and target node information.
**Rationale**: CDC는 SoC 설계에서 주요 검증 대상이며, 설계자가 조기에 파악해야 한다.
**Verification**: api — 2개 도메인 간 연결 있는 설계 → CDC 목록 반환 확인; CDC 없는 설계 → 빈 목록 확인

### REQ-CT-011: 게이팅 분석
**Pattern**: Event-Driven
**EARS**: When the API receives a GET /api/projects/{projectId}/analysis/gating request, the Clock Tree Engine shall calculate the number of IP Blocks that are downstream of at least one Clock Gate (gated) vs those that are not (ungated), and return a summary including gated count, ungated count, total count, and estimated power reduction percentage (gated_count / total_count * 100).
**Rationale**: 클럭 게이팅 적용 범위를 정량적으로 파악하여 저전력 설계를 지원한다.
**Verification**: api — 4개 IP Block 중 3개 gated → gated=3, ungated=1, reduction=75% 확인

### REQ-CT-012: 프로젝트 생성
**Pattern**: Event-Driven
**EARS**: When the API receives a POST /api/projects request with a project name, the Clock Tree Engine shall create a new project record in the database with an empty graph, assign a unique project ID, and return HTTP 201 with the project ID and metadata (name, created_at, updated_at).
**Rationale**: 새로운 설계 프로젝트를 생성하여 작업을 시작할 수 있어야 한다.
**Verification**: api — POST /api/projects → 201 + project ID 반환 확인; 이름 누락 → 400 확인

### REQ-CT-013: 프로젝트 저장
**Pattern**: Event-Driven
**EARS**: When the API receives a PUT /api/projects/{projectId} request, the Clock Tree Engine shall save the current graph state (all nodes with properties and positions, all edges) to the database with an updated timestamp, and return HTTP 200 with the updated project metadata.
**Rationale**: 설계 작업을 영속적으로 저장하여 나중에 다시 불러올 수 있어야 한다.
**Verification**: api — 저장 후 DB 조회 → 노드/엣지 수 일치 + updated_at 갱신 확인

### REQ-CT-014: 프로젝트 로드
**Pattern**: Event-Driven
**EARS**: When the API receives a GET /api/projects/{projectId} request, the Clock Tree Engine shall load the saved graph from the database and return the complete project data including all nodes (with properties and positions) and all edges.
**Rationale**: 저장된 설계를 복원하여 작업을 이어갈 수 있어야 한다.
**Verification**: api — 저장 → 로드 → 노드/엣지/속성 동일성 확인 (round-trip)

### REQ-CT-015: 프로젝트 목록 조회
**Pattern**: Event-Driven
**EARS**: When the API receives a GET /api/projects request, the Clock Tree Engine shall return a list of all saved projects with their id, name, created_at timestamp, updated_at timestamp, and node count.
**Rationale**: 사용자가 저장된 프로젝트 중 하나를 선택하여 로드할 수 있어야 한다.
**Verification**: api — 2개 프로젝트 저장 후 목록 조회 → 2개 반환 + 메타데이터 확인

### REQ-CT-016: 노드 속성 업데이트
**Pattern**: Event-Driven
**EARS**: When the API receives a PATCH /api/projects/{projectId}/nodes/{nodeId} request with updated properties, the Clock Tree Engine shall validate the property values against the component type's constraints, update the node, trigger frequency recalculation if the changed property affects frequency, and return HTTP 200 with the updated node data.
**Rationale**: 속성 변경 시 유효성 검증과 주파수 재계산이 원자적으로 수행되어야 한다.
**Verification**: api — Divider ratio 8→16 변경 → 하류 주파수 반감 확인; 범위 밖 ratio → 400 확인

### REQ-CT-017: 연결 삭제 API
**Pattern**: Event-Driven
**EARS**: When the API receives a DELETE /api/projects/{projectId}/connections/{connectionId} request, the Clock Tree Engine shall remove the specified edge from the graph, recalculate frequencies for all affected downstream nodes, and return HTTP 204.
**Rationale**: 프론트엔드에서 와이어를 삭제할 때 백엔드 동기화가 필요하다 (REQ-CV-012 참조).
**Verification**: api — 연결 삭제 → 204 + 하류 노드 주파수 = null 확인; 존재하지 않는 연결 ID → 404 확인

### REQ-CT-018: 노드 수 제한 강제
**Pattern**: Unwanted
**EARS**: If a node creation request would cause the total node count in a project to exceed 200, the Clock Tree Engine shall reject the request and return HTTP 400 with an error message indicating the maximum node limit has been reached.
**Rationale**: 성능 저하를 방지하기 위해 프로젝트당 최대 노드 수를 서버에서 강제한다.
**Verification**: api — 200개 노드가 있는 프로젝트에 추가 노드 생성 → 400 + 에러 메시지 확인

### REQ-CT-019: 프로젝트 삭제
**Pattern**: Event-Driven
**EARS**: When the API receives a DELETE /api/projects/{projectId} request, the Clock Tree Engine shall remove the project and all associated nodes and edges from the database, and return HTTP 200 with a confirmation.
**Rationale**: 불필요한 프로젝트를 정리하여 관리할 수 있어야 한다. 이 API는 백엔드 전용이며 프론트엔드 UI에서는 직접 노출하지 않는다.
**Verification**: api — 프로젝트 삭제 후 GET → 404 확인; 프로젝트 목록에서 제거 확인

## 3. Constraints

1. 데이터베이스: SQLite (better-sqlite3), 동기 API 사용.
2. API 응답 형식: JSON, Content-Type: application/json.
3. PLL output_freq: 양수 실수 (MHz), 최대 10000MHz.
4. Divider ratio: {2, 4, 8, 16, 32, 64, 128} 중 하나.
5. Mux select_index: 0 이상 정수. 연결된 입력 수 이상인 경우 출력 주파수는 null.
6. 주파수 계산 정밀도: 소수점 3자리 (0.001MHz).
7. 사이클 감지: DFS 기반, O(V+E) 시간 복잡도.
8. 단일 프로젝트 최대 노드 수: 200개.
9. 포트 식별: 각 노드의 포트는 `{nodeId}:{portName}` 형식으로 식별한다. 포트 이름은 컴포넌트 타입별로 고정: PLL(out), Divider(in, out), Mux(in_0, in_1, ..., in_n, sel, out), Clock Gate(in, out, en), IP Block(in), Clock Domain(in, out_0, out_1, ..., out_n).
10. Clock Gate enable(en) 포트: 코드 생성 시 게이트 제어 신호로 사용되며 RTL에서 모듈 입력 포트로 생성된다. 클럭 트리 엔진에서는 주파수 전파에 영향을 주지 않는다.
11. Mux select(sel) 포트: 코드 생성 시 Mux 선택 신호로 사용되며 RTL에서 모듈 입력 포트로 생성된다. 클럭 트리 엔진에서는 sel 포트 연결이 주파수 전파에 영향을 주지 않으며, select_index 속성 값으로 선택이 결정된다.
12. 노드 위치(x, y)는 노드의 속성으로 취급한다. 캔버스에서 노드 드래그 완료 시 PATCH /nodes/{nodeId} API로 즉시 동기화한다.
13. CDC 도메인 소속 판정: 노드 N이 Clock Domain D의 출력 포트로부터 그래프 경로상 도달 가능하면 N은 D에 소속된다. 어떤 Clock Domain에도 도달 가능하지 않은 노드는 도메인 미소속으로 취급하며 CDC 분석에서 제외한다.

## 4. Dependencies

없음 (독립 모듈).

## 5. Open Questions

없음.
