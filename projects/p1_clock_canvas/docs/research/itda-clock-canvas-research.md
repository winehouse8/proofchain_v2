# 잇다반도체(ITDA Semiconductor) 클락캔버스(Clock Canvas) 조사 보고서

> 작성일: 2026-02-23
> 목적: 클락캔버스를 모사한 웹 서비스 개발을 위한 사전 조사

---

## 1. 잇다반도체 회사 개요

| 항목 | 내용 |
|------|------|
| 회사명 | 잇다반도체 (ITDA Semiconductor) |
| 설립 | 2022년 9월 |
| 소재지 | 경기도 화성시 |
| 대표 | 전호연 (Hoyeon Jeon) |
| 임직원 | 17명 (2025년 12월 기준) |
| 보유 특허 | 21개 |
| 웹사이트 | https://itdasemi.com |

잇다반도체는 **EDA(Electronic Design Automation) 스타트업**이다. SoC 설계를 자동화하는 **노코드(No-code) GUI 기반 설계 플랫폼**을 개발한다. 반도체 설계 분야에서 노코드 접근법을 채택한 최초의 회사로 알려져 있다.

### 핵심 경영진

| 이름 | 직책 | 경력 |
|------|------|------|
| 전호연 | CEO | Samsung Exynos, Tesla FSD, Google AP 전력 아키텍처 설계 16년 |
| 김아찬 | CTO | Samsung Exynos, Google AP 클럭/전력 컨트롤러 설계 전문가 |
| 김인규 | CPO | 모바일 AP 통합 플랫폼 및 SoC 전체 칩 자동화 프레임워크 개발 |

### 투자 및 파트너십

- 블루포인트파트너스 시드 투자 (2023년)
- 딥테크 팁스(Deep-Tech TIPS) 선정 (2023년 11월, 최대 17억원)
- 삼성 파운드리 SAFE 에코시스템 VDP(Virtual Design Partner) 선정
- 하이퍼엑셀(HyperAccel) LPU 칩 개발에 Power/Clock Canvas 공급 계약 (2025년 4월)
- DAC 2025 논문 채택: "No-code Power and Clock System Design"

---

## 2. 클락캔버스(Clock Canvas) 상세 분석

### 2.1 제품 정의

Clock Canvas는 SoC의 **클럭 제어 시스템 전체를 코딩 없이 GUI로 설계**하는 EDA 도구다.

- 수십 개의 클럭 도메인을 가진 SoC의 클럭 시스템을 **1주일 이내** 설계
- GUI 설계 완료 후 **10분 이내에 RTL 자동 출력**
- Verilog 코드를 한 줄도 작성하지 않고 클럭 제어 시스템 설계 가능

### 2.2 핵심 기능

#### (1) 노코드 RTL 자동 생성

캔버스에 시스템을 그리면(Draw) 아래 출력물이 일괄 자동 생성된다:

| 출력물 | 설명 |
|--------|------|
| **RTL (Verilog)** | 합성 준비 완료 상태의 기능 코드 |
| **UPF** | Unified Power Format — 전력 의도 정의 |
| **SDC** | Synopsys Design Constraints — 시스템/도메인 레벨 타이밍 제약 |
| **Lint Waiver** | 린트 검사 예외 규칙 |
| **DFT 컨트롤러** | IEEE 1687 기반 테스트 구조 자동 삽입 |

#### (2) 클럭 게이팅(Clock Gating) 및 저전력 설계

- FSM(유한 상태 머신)을 통해 클럭 게이팅 정보가 시스템 전체에 전파
- **Ultra Fine Grain Clock Gating**: 단기 유휴 구간에도 동적 전력 완전 제거
- Power Canvas 연계 시 **20~50% 전력 절감**

#### (3) 다중 클럭 도메인 관리

- 수십 개의 클럭 도메인별 주파수 설정, 분주, 멀티플렉싱을 GUI로 관리
- 클럭 도메인 크로싱(CDC) 처리
- SDC 자동 생성으로 합성/타이밍 분석 도구와 연계

#### (4) PLL 및 공정 포팅

- PLL을 포함한 공정 의존 라이브러리를 GUI 내에서 모델링/설정
- 공정 노드 전환 시 PLL 등 하드 IP 재설정을 GUI로 처리

#### (5) DFT 자동 삽입

- IEEE 1687 표준 기반 DFT 삽입
- OCC(On-Chip Clock Controller) 삽입 포인트 자동 생성
- 스캔 체인, 접근 네트워크, 계층 구조를 GUI에서 정의

#### (6) 검증

- 소프트웨어 프레임워크와 하드웨어 모델의 교차 검증으로 **출력 정확도 100% 보장**

---

## 3. SoC Canvas 전체 제품군

| 제품명 | 역할 | 타겟 |
|--------|------|------|
| **Power Canvas** | 누설 전력(Leakage) 절감 | 전력 제어 시스템 설계, UPF 생성 |
| **Clock Canvas** | 동적 전력(Dynamic) 절감 | 클럭 제어 시스템 설계, RTL/SDC/UPF 생성 |
| **DFT Canvas** | 유연한 IO DFT 네트워크 | 스캔 체인, GPIO 테스트 모드 |
| **SoC Canvas** (개발 중) | 올인원 통합 | Power+Clock+DFT 통합 자동화 |

---

## 4. 경쟁 제품 비교

| 항목 | **Clock Canvas** | **Synopsys** | **Cadence** | **Siemens EDA** |
|------|-----------------|-------------|-------------|-----------------|
| 접근 방식 | 노코드 GUI | 스크립트(Tcl/SDC) | UPF/CPF 텍스트 | HLS + 합성 |
| 클럭 설계 | GUI에서 직접 | CTS는 IC Compiler II (물리 설계) | Conformal Low Power (검증) | 합성 수준 최적화 |
| 출력물 | RTL, UPF, SDC, Lint, DFT | 게이트 레벨 넷리스트 | UPF 검증 리포트 | RTL/게이트 레벨 |
| DFT 삽입 | IEEE 1687 자동 | 별도 툴(TetraMAX) | 별도 툴(Modus) | 제한적 |
| 진입 장벽 | 매우 낮음 | 높음 | 높음 | 중간 |
| 설계 기간 | ~1주일 | 수개월 | 수개월 | 수주 |
| 타겟 | 중소 팹리스/스타트업 | 대형 설계 팀 | 대형 설계 팀 | 대형 설계 팀 |

**핵심 차별점**: 기존 도구는 설계자가 UPF/SDC/Tcl 스크립트를 직접 작성해야 하고, CTS는 물리 설계 단계에서 처리한다. Clock Canvas는 **RTL 설계 초기 단계에서 클럭 아키텍처 전체를 GUI로 정의**하고 모든 출력물을 일괄 생성한다. 기존 EDA 흐름의 **상류(upstream)에 위치하는 설계 자동화 계층**이다.

---

## 5. 웹 서비스 모사를 위한 핵심 도메인 모델

Clock Canvas를 웹 서비스로 모사할 때 필요한 핵심 개념:

### 5.1 클럭 트리 (Clock Tree)

```
PLL (Source)
 ├── /2 분주기 (Divider)
 │    ├── CLK_DOMAIN_A (200MHz)
 │    │    ├── Gate: IP_BLOCK_1
 │    │    └── Gate: IP_BLOCK_2
 │    └── CLK_DOMAIN_B (100MHz)
 │         └── Gate: IP_BLOCK_3
 └── /4 분주기
      └── CLK_DOMAIN_C (50MHz)
           └── Gate: IP_BLOCK_4
```

### 5.2 핵심 엔티티

| 엔티티 | 설명 | 속성 |
|--------|------|------|
| **PLL** | 클럭 소스, 주파수 생성기 | input_freq, output_freq, lock_time |
| **Divider** | 분주기, 주파수를 나눔 | ratio (1/2, 1/4, ...) |
| **Mux** | 멀티플렉서, 클럭 소스 선택 | inputs[], select_signal |
| **Clock Domain** | 같은 주파수로 동작하는 영역 | frequency, phase, domain_name |
| **Clock Gate** | 게이팅 셀, 전력 절감 | enable_signal, ip_block |
| **IP Block** | 클럭을 소비하는 하드웨어 블록 | name, domain, power_state |
| **CDC (Clock Domain Crossing)** | 도메인 간 신호 전달 | src_domain, dst_domain, sync_type |

### 5.3 사용자 워크플로우

```
1. PLL 소스 배치 (주파수 설정)
2. 분주기/멀티플렉서 연결 (클럭 트리 구성)
3. 클럭 도메인 정의 (이름, 주파수)
4. IP 블록 배치 및 도메인 할당
5. 클럭 게이팅 조건 설정 (FSM 상태별)
6. CDC 경로 검증
7. 출력 생성 (RTL, SDC, UPF)
```

### 5.4 웹 서비스 구현 시 주요 기능

| 기능 | 프론트엔드 | 백엔드 |
|------|-----------|--------|
| **캔버스 편집기** | 드래그&드롭 노드 배치, 와이어 연결 | 그래프 데이터 저장/조회 |
| **클럭 트리 시각화** | 트리/다이어그램 렌더링 | 토폴로지 계산, 주파수 전파 |
| **주파수 계산** | 실시간 주파수 표시 | PLL→Divider→Domain 주파수 체인 계산 |
| **게이팅 분석** | 전력 절감률 시각화 | 게이팅 범위 계산, FSM 시뮬레이션 |
| **CDC 검증** | 위반 경로 하이라이트 | 도메인 크로싱 경로 탐색, 동기화 규칙 검증 |
| **코드 생성** | 생성된 RTL/SDC 미리보기 | 템플릿 기반 Verilog/SDC 코드 생성 |
| **프로젝트 관리** | 프로젝트 목록, 버전 관리 | CRUD, 히스토리 |

---

## 6. 참고 출처

- [Clock Canvas - ITDA Semiconductor](https://itdasemi.com/clock-canvas/)
- [ITDA Semiconductor 공식 홈페이지](https://itdasemi.com/)
- [EDA Startups At DAC 2025 - Semiconductor Engineering](https://semiengineering.com/eda-startups-at-dac-2025/)
- [잇다반도체 비전 - 더일렉](https://www.thelec.kr/news/articleView.html?idxno=31169)
- [전호연 대표 인터뷰 - 전자신문](https://www.etnews.com/20240808000201)
- [잇다반도체 딥테크 팁스 선정 - 스타트업N](https://www.startupn.kr/news/articleView.html?idxno=42588)
- [잇다반도체 기업정보 - THE VC](https://thevc.kr/itdasemiconductor)
- [DAC 2025 논문 채택 - ITDA Semiconductor](https://itdasemi.com/2025/04/01/our-paper-accepted-at-dac-2025/)
- [HyperAccel 제품 공급 - ITDA Semiconductor](https://itdasemi.com/2025/04/04/1586/)
