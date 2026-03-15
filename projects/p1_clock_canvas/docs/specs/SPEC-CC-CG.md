# SPEC-CC-CG: Code Generation (코드 생성)

> Version: 1.1
> Date: 2026-02-23
> Status: Draft

## 1. Overview

클럭 트리 설계로부터 합성 가능한 Verilog RTL과 SDC(Synopsys Design Constraints) 파일을 자동 생성한다. 설계 데이터의 JSON 내보내기/가져오기도 담당한다. 클락캔버스의 핵심 가치인 "노코드 → RTL" 변환을 구현한다.

## 2. Requirements

### REQ-CG-001: Verilog RTL 생성
**Pattern**: Event-Driven
**EARS**: When the API receives a POST /api/projects/{projectId}/generate/rtl request, the Code Generation module shall generate synthesizable Verilog code that includes: (a) a top-level module declaration with clock input ports for each PLL, (b) clock divider instances using always blocks with counters, (c) clock mux instances using assign statements with ternary operators (each Mux's sel port becomes a module input port), (d) clock gating instances using AND gates with enable signals (each Clock Gate's en port becomes a module input port), (e) clock domain boundary comments for each Clock Domain, and (f) output assignments for each IP Block's clock input.
**Rationale**: 클락캔버스의 핵심 기능인 RTL 자동 생성을 구현한다. Clock Domain은 물리적 회로가 아니지만 코드 가독성을 위해 경계 주석으로 포함한다.
**Verification**: api — 3-PLL, 2-Divider, 1-Mux, 2-Gate, 1-Clock Domain 설계 → 생성된 Verilog에 module 선언, divider always 블록, mux assign, gate AND, domain 주석 확인

### REQ-CG-002: SDC 제약 생성
**Pattern**: Event-Driven
**EARS**: When the API receives a POST /api/projects/{projectId}/generate/sdc request, the Code Generation module shall generate SDC constraints that include: (a) create_clock commands for each PLL with the configured frequency, (b) create_generated_clock commands for each Divider and Mux output, (c) set_clock_groups commands for Clock Domains with different frequencies, and (d) set_false_path commands for identified CDC crossings.
**Rationale**: RTL과 함께 타이밍 제약을 생성해야 합성/타이밍 분석이 가능하다.
**Verification**: api — 2-PLL(100MHz, 200MHz) + CDC 있는 설계 → create_clock 2개, set_false_path 포함 확인

### REQ-CG-003: 불완전 설계 경고
**Pattern**: Unwanted
**EARS**: If the user requests code generation when the design contains unconnected input ports (excluding PLL which has no input), nodes without required properties (PLL without output_freq, Divider without ratio, Mux without select_index), or Mux with select_index out of range of connected inputs, the Code Generation module shall return HTTP 422 with a list of incomplete items specifying the node ID, node type, and reason for incompleteness, and shall not generate any code.
**Rationale**: 불완전한 설계로부터 잘못된 코드가 생성되는 것을 방지한다.
**Verification**: api — 미연결 Divider 있는 설계 → 422 + 불완전 항목 목록 확인; Mux select_index 범위 밖 → 422 확인; 완전한 설계 → 정상 생성 확인

### REQ-CG-004: 코드 미리보기
**Pattern**: Event-Driven
**EARS**: When the API receives a GET /api/projects/{projectId}/generate/preview request, the Code Generation module shall internally invoke the RTL generation logic (REQ-CG-001) and SDC generation logic (REQ-CG-002) and return both as strings in the response body without saving to files, allowing the frontend to display them in a preview panel.
**Rationale**: 사용자가 최종 생성 전에 코드를 검토할 수 있어야 한다. Preview와 Download는 내부적으로 CG-001/CG-002의 생성 로직을 공유하며, POST 엔드포인트(CG-001, CG-002)는 독립 호출이 아닌 내부 모듈 함수로 구현된다.
**Verification**: api — preview 요청 → rtl, sdc 필드 포함 응답 확인

### REQ-CG-005: 코드 파일 다운로드
**Pattern**: Event-Driven
**EARS**: When the API receives a GET /api/projects/{projectId}/generate/download request, the Code Generation module shall generate RTL and SDC files and return them as a ZIP archive with Content-Type application/zip, containing {project_name}.v and {project_name}.sdc files.
**Rationale**: 생성된 코드를 파일로 다운로드하여 EDA 도구에서 사용할 수 있어야 한다.
**Verification**: api — 다운로드 요청 → ZIP 파일 내 .v, .sdc 파일 존재 확인

### REQ-CG-006: 설계 JSON 내보내기
**Pattern**: Event-Driven
**EARS**: When the API receives a GET /api/projects/{projectId}/export request, the Code Generation module shall serialize the complete design data (nodes with types, properties, and positions; edges with source and target ports) into a JSON document with a documented schema version, and return it as a downloadable file.
**Rationale**: 설계 데이터를 백업하거나 다른 도구로 전달할 수 있어야 한다.
**Verification**: api — 내보내기 → JSON 스키마 유효성 + 전체 노드/엣지 포함 확인

### REQ-CG-007: 설계 JSON 가져오기
**Pattern**: Event-Driven
**EARS**: When the API receives a POST /api/projects/import request with a JSON design file, the Code Generation module shall validate the schema version and structure, create a new project with the imported data, and return HTTP 201 with the new project ID.
**Rationale**: 이전에 내보낸 설계나 외부 생성 설계를 불러올 수 있어야 한다.
**Verification**: api — 유효한 JSON 가져오기 → 201 + 프로젝트 생성 확인; 잘못된 스키마 → 400 확인

### REQ-CG-008: 잘못된 스키마 가져오기 거부
**Pattern**: Unwanted
**EARS**: If the imported JSON file has an unsupported schema version, missing required fields, or invalid data types, the Code Generation module shall reject the import and return HTTP 400 with a list of validation errors.
**Rationale**: 손상되거나 호환되지 않는 데이터가 시스템에 유입되는 것을 방지한다.
**Verification**: api — 스키마 버전 불일치, 필드 누락, 타입 오류 각각에 대해 400 + 에러 목록 확인

### REQ-CG-009: Verilog 문법 정합성
**Pattern**: Ubiquitous
**EARS**: The Code Generation module shall produce Verilog code that follows IEEE 1364-2005 syntax, including proper module/endmodule blocks, valid signal declarations (wire, reg), and semicolon-terminated statements.
**Rationale**: 생성된 코드가 합성 도구에서 파싱 가능해야 한다.
**Verification**: unit — 생성된 Verilog를 정규식으로 문법 패턴 매칭 (module ... endmodule, wire/reg 선언, 세미콜론)

### REQ-CG-010: SDC 문법 정합성
**Pattern**: Ubiquitous
**EARS**: The Code Generation module shall produce SDC code that follows Synopsys Design Constraints format, with valid create_clock, create_generated_clock, set_clock_groups, and set_false_path commands using correct argument syntax.
**Rationale**: 생성된 SDC가 타이밍 분석 도구에서 사용 가능해야 한다.
**Verification**: unit — 생성된 SDC 각 명령어의 인수 형식 정규식 확인

### REQ-CG-011: 빈 설계 코드 생성 거부
**Pattern**: Unwanted
**EARS**: If the user requests code generation (RTL, SDC, preview, or download) for a project that contains zero nodes, the Code Generation module shall reject the request and return HTTP 422 with an error message indicating that the design is empty.
**Rationale**: 빈 설계로부터 의미 없는 코드가 생성되는 것을 방지한다.
**Verification**: api — 노드 0개 프로젝트에 RTL 생성 요청 → 422 + 에러 메시지 확인

### REQ-CG-012: 사이클 포함 설계 가져오기 거부
**Pattern**: Unwanted
**EARS**: When the user imports a JSON design file that contains a cyclic clock path (i.e., a directed cycle among node connections), the Code Generation module shall reject the import with HTTP 400, return an error message identifying the cycle, and leave the database unchanged (no partial data committed).
**Rationale**: 사이클이 포함된 클럭 경로는 합성 불가능한 설계이므로, 손상된 데이터가 DB에 커밋되기 전에 가져오기 단계에서 차단해야 한다.
**Verification**: api — 노드 A→B→C→A 사이클이 포함된 JSON 가져오기 → 400 + 사이클 식별 에러 메시지 확인; DB에 신규 프로젝트 미생성 확인

## 3. Constraints

1. Verilog 표준: IEEE 1364-2005 (Verilog-2005).
2. SDC 문법: Synopsys Design Constraints (Tcl 기반 명령어 형식).
3. JSON 내보내기 스키마 버전: "1.0".
4. ZIP 생성: archiver 라이브러리 사용 (Node.js 내장 zlib는 ZIP 형식을 지원하지 않음).
5. 생성된 코드에 주석으로 생성 시각과 프로젝트 이름을 포함한다.
6. REQ-CG-001과 REQ-CG-002는 코드 생성 로직을 정의하며, 이 로직은 미리보기(CG-004) 및 다운로드(CG-005) 엔드포인트가 내부적으로 호출한다. 별도의 POST 엔드포인트로 외부에 노출하지 않는다.

## 4. Dependencies

- **CT (Clock Tree Engine)**: 그래프 데이터, 주파수 계산 결과, CDC 분석 결과 제공

## 5. Open Questions

없음.
