# 전통 소프트웨어공학 vs. AI 보조 개발: 갭 분석 보고서

**ProofChain SafeDev 관점에서의 학술적 기법 조사 및 개선 기회 도출**

> **작성일**: 2026-02-21
> **대상 시스템**: ProofChain SafeDev (ISO 26262 기반 Claude Code 개발 강제 프레임워크)
> **분석 범위**: 소프트웨어공학, 요구사항공학, 안전공학, 형식 검증 등 5개 학문 분야 38개 기법
> **참고 자료**: 3건의 독립 연구 보고서 (기법 조사, AI SOTA 조사, 매핑 분석)

---

## 목차

1. [요약 (Executive Summary)](#1-요약)
2. [전통 소프트웨어공학 기법 분류 체계](#2-전통-소프트웨어공학-기법-분류-체계)
3. [ProofChain 구현 매핑 결과](#3-proofchain-구현-매핑-결과)
4. [현재 AI 보조 개발 도구의 한계](#4-현재-ai-보조-개발-도구의-한계)
5. [갭 분석: 전통 학문 vs. ProofChain](#5-갭-분석-전통-학문-vs-proofchain)
6. [ProofChain의 학술적 신규 기여 (8개 Novel Techniques)](#6-proofchain의-학술적-신규-기여)
7. [전통 학문에서 차용 가능한 아이디어 (12개 제안)](#7-전통-학문에서-차용-가능한-아이디어)
8. [우선순위 로드맵](#8-우선순위-로드맵)
9. [참고 문헌](#9-참고-문헌)

---

## 1. 요약

### 핵심 발견

ProofChain SafeDev는 **프로세스 강제(Process Enforcement)** 영역에서 전통 소프트웨어공학의 핵심 기법 6개를 완전히 구현하고, 8개의 학술적으로 선례가 없는 신규 기법을 도입했다. 그러나 **형식 검증(Formal Verification)**과 **고급 테스팅(Advanced Testing)** 영역에서는 8개 기법이 미구현 상태이며, 이는 전통 학문과의 가장 큰 갭을 형성한다.

| 구분 | 수량 | 비율 |
|------|------|------|
| 완전 구현 (FULL) | 6/20 | 30% |
| 부분 구현 (PARTIAL) | 6/20 | 30% |
| 미구현 (NONE) | 8/20 | 40% |
| 신규 기여 (NOVEL) | 8 | (추가) |

### 핵심 통찰

현재 AI 코딩 도구(Copilot, Cursor, Claude Code 등)는 안전 필수 차원 10개 중 7개에서 전통 SE 대비 심각한 갭(-5 이상)을 보인다. **프로세스 강제**와 **안전 표준 준수** 차원에서 갭이 가장 크다(-8). ProofChain은 이 갭을 메우는 최초의 시도이며, 특히 "Hook-as-Enforcer" 패러다임은 전통 품질보증 모델을 근본적으로 뒤집는다.

---

## 2. 전통 소프트웨어공학 기법 분류 체계

38개 기법을 5개 학문 분야로 분류한다.

### A. 요구사항공학 (Requirements Engineering)

| # | 기법 | 핵심 원리 | 핵심 저자/표준 | 형식화 수준 |
|---|------|----------|--------------|-----------|
| A.1 | **EARS** | 5가지 구문 패턴으로 자연어 요구사항 제약 | Mavin et al. (Rolls-Royce, 2009) | 낮음 |
| A.2 | **GORE (KAOS, i\*, GRL)** | 목표 분해, 장애물 분석, 전략적 의존성 모델링 | van Lamsweerde, Yu, ITU-T | 높음 |
| A.3 | **Use Cases / User Stories** | 시나리오 기반(UC) vs. 카드 기반(US) 요구사항 | Jacobson (1987), Beck/Cohn (1999) | 중간 |
| A.4 | **Formal Methods (Z, VDM, B, Alloy)** | 수학적 명세, 정제, 기계적 검증 | Abrial, Jones, Jackson | 매우 높음 |
| A.5 | **RTM (요구사항 추적 매트릭스)** | 양방향 추적: 요구사항↔설계↔코드↔테스트 | IEEE 830, DO-178C | 중간 |
| A.6 | **FMEA** | 바텀업 고장 모드 분석, RPN 산출 | IEC 60812 (MIL-P-1629, 1949) | 중간 |
| A.7 | **HAZOP** | 가이드워드 기반 체계적 이탈 분석 | ICI (1960s), IEC 61882 | 중간-높음 |
| A.8 | **FTA** | 탑다운 불리안 논리 고장 트리 | IEC 61025 (Bell Labs, 1962) | 중간-높음 |
| A.9 | **STPA** | 안전 = 제어 문제, 계층적 제어 구조 분석 | Nancy Leveson (MIT, 2012) | 중간 |
| A.10 | **MoSCoW / Kano** | 우선순위화 및 고객 만족도 분류 | Clegg (1994) / Kano (1984) | 낮음 |

### B. 검증 & 확인 (Verification & Validation)

| # | 기법 | 핵심 원리 | 핵심 저자/표준 | 형식화 수준 |
|---|------|----------|--------------|-----------|
| B.1 | **V-Model** | 좌측 분해↔우측 검증의 대칭 구조 | VDI 2206, ISO 26262 Part 6 | 높음 |
| B.2 | **Model-Based Testing** | 행위 모델로부터 테스트 자동 생성 | Utting & Legeard (2007) | 중간-높음 |
| B.3 | **MC/DC Coverage** | 각 조건이 독립적으로 결정에 영향 증명 | DO-178C Level A, Chilenski & Miller (1994) | 매우 높음 |
| B.4 | **Mutation Testing** | 구문 변이 주입으로 테스트 스위트 품질 평가 | DeMillo, Lipton, Sayward (1978) | 중간 |
| B.5 | **Abstract Interpretation** | 사운드 초근사로 런타임 에러 부재 증명 | Cousot & Cousot (POPL 1977) | 매우 높음 |
| B.6 | **Model Checking** | 시간 논리 속성의 전수 상태 공간 탐색 | Clarke, Emerson, Sifakis (Turing 2007) | 매우 높음 |
| B.7 | **Symbolic Execution** | 심볼릭 입력으로 경로 조건 수집 및 SMT 풀이 | King (CACM 1976) | 높음 |
| B.8 | **Property-Based Testing** | 보편 양화 속성 + 자동 축소(shrinking) | Claessen & Hughes (ICFP 2000) | 중간 |
| B.9 | **EP & BVA** | 동치 분할 + 경계값 분석 | Myers (1979) | 낮음 |
| B.10 | **Static Analysis (MISRA 등)** | 코딩 표준 강제 + 결함 패턴 탐지 | MISRA-C:2012, Polyspace, Astree | 중간-높음 |

### C. 안전공학 표준 & 프로세스

| # | 기법 | 핵심 원리 | 형식화 수준 |
|---|------|----------|-----------|
| C.1 | **ISO 26262** | 자동차 기능안전, ASIL A-D 분류, Part 6(SW)/8(지원) | 매우 높음 |
| C.2 | **DO-178C / DO-330** | 항공 소프트웨어 인증, 71개 목표(Level A), 도구 자격 | 매우 높음 |
| C.3 | **IEC 61508** | 모 표준, SIL 1-4, 정량적 실패 확률 목표 | 매우 높음 |
| C.4 | **ASPICE** | 자동차 프로세스 성숙도 평가 (CL 0-5) | 높음 |
| C.5 | **CMMI** | 능력 성숙도 모델 (Level 1-5) | 높음 |
| C.6 | **Functional Safety Lifecycle** | 16단계 요람-무덤 안전 관리 | 높음 |
| C.7 | **IEEE 828 CM** | 형상 식별, 제어, 상태 계정, 감사 | 중간 |
| C.8 | **Change Impact Analysis** | 추적성 IA + 종속성 IA, 파급 효과 평가 | 중간 |

### D. 아키텍처 & 설계 패턴

| # | 기법 | 핵심 원리 |
|---|------|----------|
| D.1 | **Design by Contract** | 사전조건/사후조건/불변조건 (Meyer, Eiffel) |
| D.2 | **Defensive Programming** | 입력 검증, 어서션, 실패 안전 기본값 |
| D.3 | **N-Version Programming** | N개 독립 팀의 다양성 기반 결함 허용 (Avizienis, 1977) |
| D.4 | **Watchdog / Heartbeat** | 주기적 리셋 + 하트비트 모니터링 |
| D.5 | **Safety Patterns** | Fail-safe, Fail-operational, Graceful degradation |
| D.6 | **Layered Architecture** | ARINC 653 시/공간 분할, 혼합 위험도 격리 |

### E. 프로세스 강제 & 품질 게이트

| # | 기법 | 핵심 원리 |
|---|------|----------|
| E.1 | **Stage-Gate** | 단계별 게이트 의사결정 (Cooper, 1980s) |
| E.2 | **PDCA** | Plan-Do-Check-Act 반복 개선 (Deming) |
| E.3 | **Six Sigma / DMAIC** | 통계적 품질 관리 (Motorola, 1986) |
| E.4 | **CI/CD Quality Gates** | 자동화 파이프라인 체크포인트 |
| E.5 | **Fagan / Gilb Inspection** | 6단계 형식 검토 (IBM, 1976) |
| E.6 | **Pair / Mob Programming** | 실시간 협업 개발 (Beck XP, 1999) |

---

## 3. ProofChain 구현 매핑 결과

### 3.1 완전 구현 (FULL) — 6개

| # | 기법 | ProofChain 구현 근거 |
|---|------|---------------------|
| 1 | **V-Model** | 9단계 TS 상태 머신 (`v-model/state-machine.ts`) + 5단계 셸 HITL 루프, 13개 전이, 회귀 지원 |
| 2 | **요구사항 추적 (RTM)** | 양방향 매트릭스 (`traceability/trace-matrix.ts`), 고아 탐지기, 갭 분석기, 버전화 REQ@vN |
| 3 | **EARS 요구사항 구문** | 6개 EARS 패턴, 교차 검증, 능동적 프로빙, System Context 동기화, 수정 모드 |
| 6 | **MC/DC Coverage** | ISO 26262 Part 6 Table 12 임계치, gcov/lcov/llvm-cov 파싱, ASIL별 강제 |
| 9 | **Change Impact Analysis** | 폭발 반경 계산기, 의존성 그래프 탐색, ASIL 가중 재검증 계획 |
| 10 | **Stage-Gate 품질 게이트** | 14개 자동 게이트(셸 #1-7 + TS #8-14), ASIL 적응적 강제, 부채 천장 |

**관찰**: 프로세스 지향 기법 7개 중 5개가 FULL (71%). ProofChain의 핵심 강점은 **프로세스 강제**에 있다.

### 3.2 부분 구현 (PARTIAL) — 6개

| # | 기법 | 구현된 부분 | 미구현 부분 |
|---|------|-----------|-----------|
| 5 | **MISRA Static Analysis** | ~15개 규칙, ASIL 필터링, 자기검증 러너 | MISRA-C:2012의 143개 중 ~15개만 구현, regex 기반(AST 아님) |
| 8 | **Configuration Management** | Git 태그 베이스라인, 콘텐츠 해싱, 감사 추적 | 형상 항목 식별 프로세스, 상태 계정, 형상 감사 없음 |
| 11 | **Fagan/Gilb Inspection** | 8차원 AI 리뷰, 이중 독립 리뷰, I0-I3 독립성 | AI 기반(인간 Fagan 아님), 역할(저자/조정자) 없음, 검사율 메트릭 없음 |
| 18 | **Pair Programming** | Human+AI 공동 작업, 이중 AI 리뷰 | Human+Human 아님, 드라이버/내비게이터 전환 없음 |
| 19 | **ASPICE / CMMI** | 훅 기반 프로세스 강제, SWE.1-6 훈련 | 평가 방법론, 성숙도 레벨, 조직 프로세스 없음 |
| 20 | **Tool Qualification** | 자기검증 러너, TPR/FPR/FNR, 95% 임계치 | 도구 운영 요구사항 문서, 자격 계획, TQL 지정 없음 |

**관찰**: PARTIAL 6개 중 MISRA(5)와 Tool Qualification(20)은 기존 아키텍처 내에서 FULL로 승격 가능. 규칙 추가와 문서화만으로 개선 가능하다.

### 3.3 미구현 (NONE) — 8개

| # | 기법 | 미구현 사유 | 클러스터 |
|---|------|-----------|---------|
| 4 | **Formal Verification (Z, VDM, B, Alloy)** | 정리 증명기, 형식 명세 언어 없음 | 형식 방법 |
| 7 | **FMEA/FTA/STPA** | 위험 식별, 고장 트리 없음 | 안전 분석 |
| 12 | **Design by Contract** | 사전/사후조건 어노테이션 없음 | 계약 시스템 |
| 13 | **Model-Based Testing** | 형식 행위 모델에서 테스트 자동 생성 없음 | 고급 테스팅 |
| 14 | **Mutation Testing** | 변이 연산자, 변이체 생성, 변이 점수 없음 | 고급 테스팅 |
| 15 | **Property-Based Testing** | 속성 생성기, 축소(shrinking) 없음 | 고급 테스팅 |
| 16 | **Abstract Interpretation** | 추상 도메인, 사운드 초근사 없음 | 형식 방법 |
| 17 | **Model Checking** | 시간 논리, 상태 공간 탐색 없음 | 형식 방법 |

**관찰**: 미구현 8개는 3개 클러스터로 분류된다:
1. **형식 방법 갭** (4, 16, 17) — 정리 증명기(Coq/Lean/Z3), 추상 해석 엔진(Astree/Polyspace) 필요
2. **고급 테스팅 갭** (13, 14, 15) — 모델 순회, 변이 연산자, 속성 생성기 필요
3. **안전 분석 갭** (7) — FMEA 워크시트, 고장 트리 구축, STPA 제어 구조 필요

---

## 4. 현재 AI 보조 개발 도구의 한계

### 4.1 주요 도구의 안전 기능 현황

| 도구 | 사용자/가치 | 프로세스 강제 | 추적성 | 안전 표준 인식 |
|------|-----------|------------|--------|-------------|
| GitHub Copilot | 20M+ 사용자 | 없음 | 없음 | 없음 |
| Cursor | $10B 기업가치 | 없음 | 없음 | 없음 |
| Claude Code | GitHub Agent HQ 통합 | 없음 | 없음 | 없음 |
| Amazon Q | AWS 네이티브 | 없음 | 없음 | 없음 |
| **ProofChain** | 918 테스트 | **14개 게이트** | **양방향** | **ISO 26262** |

### 4.2 실증 근거: AI 코딩의 품질 문제

**METR RCT (2025)** — 가장 엄밀한 실증 연구:
- 16명 숙련 오픈소스 개발자, 246개 실제 이슈, 무작위 배정
- **핵심 발견**: AI 도구 사용 시 **19% 느림** (자기 추정은 20% 빠르다고 답변)
- (arXiv:2507.09089)

**GitClear (2025)** — 211M LOC 분석 (2020-2024):
- 코드 클론 48% 상대 증가 (8.3% → 12.3%)
- 리팩터링 비중 급감 (24.1% → 9.5%)
- 2주 내 코드 변경(churn) 증가 (5.5% → 7.9%)

**Qodo (2025)**:
- AI 보조 코드의 보안 취약점 **3배 증가**
- 개발자의 3.8%만이 "낮은 환각 + 높은 배포 자신감" 동시 보고

### 4.3 근본적 단절 (Fundamental Disconnect)

```
전통 안전 필수 SE:  결정론적 추적성
  → 모든 코드 줄은 요구사항에 추적
  → 모든 요구사항은 안전 목표에 추적
  → 모든 변경은 영향 분석으로 검증

현재 AI 코딩 도구:  확률적 생성
  → 맥락 기반 통계적으로 가능한 코드 생성
  → 정확성, 완전성, 추적성 보장 없음
  → 어떤 파일이든, 언제든, 전제조건 없이
```

**이 단절을 종단간(end-to-end)으로 해소하는 도구나 연구는 현재 존재하지 않는다.**

### 4.4 정량적 갭 평가

| 차원 | 전통 SE | 현재 AI 도구 | 갭 | 심각도 |
|------|--------|------------|-----|--------|
| 요구사항 추적성 | 9/10 | 2/10 | **-7** | CRITICAL |
| 형식 검증 | 8/10 | 2/10 | **-6** | CRITICAL |
| 프로세스 강제 | 9/10 | 1/10 | **-8** | CRITICAL |
| 안전 표준 준수 | 9/10 | 1/10 | **-8** | CRITICAL |
| 코드 리뷰 엄격도 | 8/10 | 5/10 | -3 | MODERATE |
| 테스트 커버리지 & 변이 | 7/10 | 6/10 | -1 | LOW |
| 변경 관리 | 9/10 | 3/10 | **-6** | CRITICAL |
| 적대적 방어 | 6/10 | 1/10 | **-5** | MAJOR |
| 수명주기 관리 | 9/10 | 1/10 | **-8** | CRITICAL |
| 감사 추적 & 재현성 | 9/10 | 2/10 | **-7** | CRITICAL |

**유일하게 갭이 작은 차원**: 테스트 생성 및 변이 테스팅 (-1), Meta ACH와 MuTAP 연구 주도.

---

## 5. 갭 분석: 전통 학문 vs. ProofChain

### 5.1 종합 히트맵

```
                  ProofChain 구현 수준
                  ┌─────────────────────────────────────────────┐
                  │  FULL (6)  │ PARTIAL (6) │   NONE (8)       │
  프로세스 강제    │ ██████████ │ ████████    │                  │
  (E1,B1,C7,C8)  │ V-Model    │ ASPICE      │                  │
                  │ Stage-Gate │ CM(IEEE828) │                  │
                  │ CIA        │             │                  │
  ─────────────── │            │             │                  │
  요구사항공학     │ ██████████ │             │                  │
  (A1,A5)        │ EARS       │             │                  │
                  │ RTM        │             │                  │
  ─────────────── │            │             │                  │
  검증 기법       │ ██████████ │ ████████    │ ░░░░░░░░░░░░░░░ │
  (B3,B10,B2,    │ MC/DC      │ MISRA       │ MBT, Mutation,  │
   B4,B5,B8)     │            │             │ PBT, AbsInt,    │
                  │            │             │ ModelCheck      │
  ─────────────── │            │             │                  │
  형식 방법       │            │             │ ░░░░░░░░░░░░░░░ │
  (A4,B6,B7)     │            │             │ Z/VDM/B/Alloy,  │
                  │            │             │ Model Checking,  │
                  │            │             │ Symbolic Exec   │
  ─────────────── │            │             │                  │
  안전 분석       │            │             │ ░░░░░░░░░░░░░░░ │
  (A6,A7,A8,A9)  │            │             │ FMEA, HAZOP,    │
                  │            │             │ FTA, STPA       │
  ─────────────── │            │             │                  │
  설계 패턴       │            │ ████████    │ ░░░░░░░░░░░░░░░ │
  (D1,D5,E5,E6)  │            │ Fagan(AI)   │ DbC, NVP        │
                  │            │ Pair(H+AI)  │                  │
                  │            │ ToolQual    │                  │
                  └─────────────────────────────────────────────┘
```

### 5.2 프로세스 강제 영역 — ProofChain 우위

ProofChain의 프로세스 강제 기법 구현률:
- **프로세스 지향 7개 기법**: 5 FULL + 2 PARTIAL = **100% 최소 부분 구현**
- 전통 도구 대비 차이점: **실시간 사전 차단** vs. 사후 검토

| 전통 기법 | 전통적 실행 방식 | ProofChain 실행 방식 | 개선 효과 |
|----------|---------------|-------------------|---------|
| Stage-Gate | 관리자 게이트 리뷰 (주 단위) | PreToolUse 훅 (밀리초) | 시간: 주→ms |
| V-Model | 문서화 기반 추적 | 상태 머신 강제 (13 전이) | 우회 불가 |
| Impact Analysis | 수동 추적성 분석 | BFS 폭발 반경 자동 계산 | 완전성 보장 |
| Code Review | Fagan 6단계 회의 | AI 이중 독립 리뷰 | 24/7 가용 |

### 5.3 형식 방법 영역 — 가장 큰 갭

ProofChain은 형식 방법을 전혀 구현하지 않는다. 이는 설계 범위의 경계이지 결함은 아니다.

| 형식 방법 기법 | 필요 인프라 | 통합 난이도 | 잠재 가치 |
|-------------|-----------|-----------|---------|
| Z/VDM/B/Alloy | 형식 명세 언어 편집기 + 분석기 | 높음 | 요구사항 무결성 증명 |
| Abstract Interpretation | Astree/Polyspace/Frama-C 엔진 | 매우 높음 | 런타임 에러 부재 증명 |
| Model Checking | SPIN/TLA+/CBMC 통합 | 높음 | 동시성 속성 검증 |
| Symbolic Execution | KLEE/angr SMT 풀이기 | 높음 | 경로 기반 테스트 생성 |

**최근 연구 동향**: LLM + 형식 방법 통합이 활발히 연구 중
- Lean Copilot: 증명 단계 74.2% 자동화 (Song, Yang, Anandkumar, 2024)
- TLA+ LLM 증명 자동화: 119개 정리 벤치마크 (arXiv:2512.09758)
- Alloy 공식 생성: LLM이 자연어에서 Alloy 명세 생성 (arXiv:2502.15441)

### 5.4 고급 테스팅 영역 — 실질적 개선 기회

| 기법 | 현재 ProofChain | 차용 시 기대 효과 |
|------|----------------|----------------|
| Mutation Testing | 커버리지 측정만 | 테스트 스위트 품질의 정량적 평가, 생존 변이체가 테스트 개선 지시 |
| Property-Based Testing | BDD 형식 TC만 | 경계 케이스 자동 발견, 축소(shrinking)로 최소 반례 |
| Model-Based Testing | AI 대화 기반 TC | 모델로부터 체계적 전이/경로 커버리지 테스트 자동 생성 |

### 5.5 안전 분석 영역 — 보완적 관계

ProofChain은 **개발 프로세스 강제기**이지, **제품 안전 분석 도구**가 아니다. FMEA/FTA/STPA는 제품의 위험 분석에 사용되며, ProofChain은 그 위험 분석 결과를 바탕으로 도출된 안전 요구사항의 구현을 강제한다. 이 관계는 보완적이다.

```
STPA/FMEA/FTA → 안전 요구사항 도출 → ProofChain이 구현 강제
(제품 안전 분석)   (REQ-XXX)         (프로세스 보장)
```

---

## 6. ProofChain의 학술적 신규 기여

ProofChain이 도입한 8개 기법은 IEEE, ISO 26262, DO-178C, CMMI 문헌에 직접적 선례가 없다.

### N1: AI 강제 Phase 상태 머신 (Hook-as-Enforcer)

**개념**: PreToolUse 셸 훅이 모든 파일 작업을 인터셉트하여 현재 Phase가 허용하지 않으면 차단. 위반을 **사후 탐지**가 아닌 **사전 방지**한다.

**가장 가까운 전통 기법**: Stage-Gate 리뷰 (사후, 수동)
**신규성**: 실시간 방지 vs. 사후 탐지. 밀리초 강제 vs. 주 단위 리뷰 주기.

**학술적 의의**: 전통 품질보증 모델을 근본적으로 뒤집는다 — "탐지 후 수정(detect and correct)"에서 "방지 후 안내(prevent and guide)"로 전환.

### N2: ASIL 적응적 강제 연속체

**개념**: 동일한 위반이 ASIL 스펙트럼에 따라 다른 행동을 생성: QM/A 경고(exit 0), B+ 차단(exit 2), 자기보호는 항상 차단. 단일 설정 파라미터에서 3단계 강제 모델.

**가장 가까운 전통 기법**: ASPICE 프로세스 영역 등급 (레벨별 별도 프로세스)
**신규성**: 하나의 설정으로 연속적 행동 적응. 전통 접근법은 무결성 레벨마다 별도 프로세스 정의 필요.

### N3: 위반 시 자동 후향 Phase 회귀

**개념**: test 단계에서 소스 코드 수정 시 자동으로 code 단계로 회귀, 이벤트 로깅, 재진입 안내. 밀리초 단위 자동 실행.

**가장 가까운 전통 기법**: 변경 요청 → 영향 분석 → 재베이스라인 (수동, 며칠)
**신규성**: 밀리초 vs. 며칠. 감사 추적 자동화 vs. 위원회 기반.

### N4: 컨텍스트 포크를 통한 TC 격리

**개념**: test-gen-design 스킬이 `context: fork`를 사용하여 AI가 TC 설계 중 src/ 파일을 볼 수 없음. 도구 수준에서 독립성 강제 — 사회적 압력으로 우회 불가.

**가장 가까운 전통 기법**: 조직적 독립성 (ISO 26262 Part 8)
**신규성**: 도구 강제 vs. 조직도 기반 독립성. 위조 불가.

### N5: 적대적 방어 스위트 (A1-A9)

**개념**: 개발 프로세스 자체를 공격 표면으로 취급. 9개 공격 벡터에 대한 명시적 방어:
- A1: Phase 건너뛰기 → 전이 유효성 맵
- A2: 검증 태그 삭제 → `git tag -d` 패턴 차단
- A3: 훅 파일 변조 → `.claude/` 쓰기 보호
- A4: 빈 테스트 우회 → 커버리지 게이트 #9
- A5: TC=0 verified → 게이트 #1: 활성 TC 수
- A6: 어노테이션 우회 → 게이트 #2-3
- A7: TC 설계가 src/ 읽기 → `context: fork`
- A8: /reset 탈출 → ASIL B+ `AskUserQuestion` 요구
- A9: 의존성 노후화 → BFS staleness 전파

**학술적 의의**: 전통 문헌에서 개발 워크플로우 강제에 대한 적대적 공격을 모델링한 사례 없음. STRIDE는 제품 위협 모델링이지, 프로세스 위협 모델링이 아님.

### N6: 상보적 강조를 가진 이중 AI 리뷰

**개념**: 두 AI 리뷰어가 분할된 초점으로 리뷰 (A: 방어/에러/자원/코딩, B: 인터페이스/동시성/요구사항/복잡도). 합의/충돌/단독 발견으로 분류. 충돌 시 보수적 병합.

**가장 가까운 전통 기법**: 이중 독립 리뷰 (ISO 26262-8)
**신규성**: 구조화된 강조 분할 + 알고리즘적 충돌 해결.

### N7: ASIL 천장을 가진 검증 부채

**개념**: 검증 부채를 ASIL 의존적 천장으로 추적 (QM=무한, A=20, B=10, C=5, D=2). 천장 초과 시 게이트가 차단 모드로 자동 격상. 7일 이동 평균 추세 추적.

**가장 가까운 전통 기법**: 기술 부채 (SonarQube) + 안전 무결성 레벨 (IEC 61508)
**신규성**: 기술 부채와 안전 무결성을 단일 강제 메커니즘으로 융합.

### N8: 콘텐츠 해시 기반 노후화 전파

**개념**: 인터페이스 변경은 의존성 그래프를 통해 전이적으로 전파; 구현 변경은 1홉만 전파. 신선도 점수: `max(0.1, 1.0 - 0.2*interface_changes - 0.1*impl_changes - 0.1*asil_weight)`.

**가장 가까운 전통 기법**: IEEE 828 변경 기록
**신규성**: ASIL 가중치를 가진 정량적 신선도 채점 + 자동 전이적 무효화.

---

## 7. 전통 학문에서 차용 가능한 아이디어

기존 학문의 기법들 중 ProofChain에 통합하면 의미 있는 개선을 가져올 12개 아이디어를 도출한다.

### 아이디어 1: LLM 보조 Alloy 경량 형식 명세 (Formal Methods → EARS 확장)

**출처**: A.4 Formal Methods (Alloy, Jackson MIT 2006) + 최근 연구 (arXiv:2502.15441)
**현재 갭**: EARS 스펙은 자연어이므로 기계적 검증 불가
**제안**: `/ears-spec` 스킬 실행 후, LLM이 EARS 요구사항을 Alloy 관계 논리로 번역하고, Alloy Analyzer로 자동 일관성 검사. 모순/누락 자동 탐지.

```
워크플로우:
  EARS 자연어 요구사항
    → LLM이 Alloy 명세 번역
    → Alloy Analyzer 자동 분석
    → 모순/누락 발견 시 EARS 수정 권고
```

**구현 난이도**: 중간 (Alloy CLI 연동 + LLM 프롬프트 설계)
**기대 효과**: 요구사항 단계에서 논리적 모순 조기 발견

---

### 아이디어 2: Mutation Testing 게이트 (테스트 스위트 품질 강화)

**출처**: B.4 Mutation Testing (DeMillo 1978) + Meta ACH (FSE 2025)
**현재 갭**: 커버리지만 측정, 테스트 품질(결함 탐지력) 미측정
**제안**: Gate #9 (커버리지) 이후에 Gate #9.5 (변이 점수)를 추가. LLM이 변이체 생성, 테스트 스위트가 킬 여부 평가.

```
새 게이트:
  Gate #9.5: Mutation Score ≥ threshold
    QM: 없음
    A:  50%
    B:  60%
    C:  70%
    D:  80%
```

**구현 난이도**: 중간 (LLM 변이 생성 + Vitest 반복 실행)
**기대 효과**: "커버리지만 높고 의미 없는 테스트" 방지. Meta ACH는 73% 테스트 수용률 달성.

---

### 아이디어 3: Property-Based Testing TC 패턴

**출처**: B.8 Property-Based Testing (Claessen & Hughes, QuickCheck 2000)
**현재 갭**: TC가 BDD(given/when/then) 형식만 지원, 속성 기반 테스트 없음
**제안**: `/test-gen-design`에 PBT 패턴 추가. "이 함수는 모든 유효 입력에 대해 X 속성을 만족해야 한다" 형식의 TC 생성.

```
새 TC 유형:
  {
    "type": "property",
    "property": "∀ x ∈ ValidInput: f(x) > 0",
    "generator": "ValidInput = { n: int | 0 < n < 1000 }",
    "shrink_strategy": "binary_search"
  }
```

**구현 난이도**: 낮음 (TC 스키마 확장 + fast-check 통합 가이드)
**기대 효과**: 경계 케이스 자동 발견, 최소 반례 제공

---

### 아이디어 4: STPA 기반 프로세스 위협 모델 확장

**출처**: A.9 STPA (Nancy Leveson, MIT 2012)
**현재 갭**: A1-A9 적대적 방어는 있지만, 체계적 도출 방법론 없음
**제안**: ProofChain 자체를 계층적 제어 구조로 모델링하고, STPA 4단계를 적용하여 체계적으로 UCA(Unsafe Control Actions) 도출. 이를 통해 A10+를 체계적으로 발굴.

```
제어 구조:
  개발자 (인간 컨트롤러)
    ↓ 제어 행동: 파일 편집, 커밋, Phase 전환
  check-phase.sh (소프트웨어 컨트롤러)
    ↓ 제어 행동: 허용(exit 0), 차단(exit 2), 경고(stderr)
  AI Agent (제어 대상 프로세스)
    ↑ 피드백: 파일 변경 내역, 테스트 결과, 커버리지

STPA Step 3 예시 (UCA 도출):
  - "check-phase.sh가 Phase 전환을 허용하지 않을 때" → 개발 차단 (false positive)
  - "check-phase.sh가 잘못된 Phase 전환을 허용할 때" → 프로세스 우회 (공격 벡터)
  - "허용이 너무 늦을 때" → 5초 타임아웃 후 fail-open
```

**구현 난이도**: 낮음 (분석 방법론 + 문서화, 코드 변경 최소)
**기대 효과**: 적대적 방어의 체계적 완전성 보장

---

### 아이디어 5: Design by Contract를 MISRA 규칙에 통합

**출처**: D.1 Design by Contract (Meyer, Eiffel 1988)
**현재 갭**: MISRA 규칙은 구문 패턴만 검사, 의미적 계약 없음
**제안**: C/C++ 함수의 주석 기반 계약을 파싱하여 MISRA 규칙과 교차 검증.

```
/* @pre: buffer != NULL && size > 0 && size <= MAX_BUF */
/* @post: return >= 0 && return <= size */
int read_sensor(uint8_t* buffer, size_t size);
```

MISRA 규칙 확장:
- 새 규칙: `@pre`/`@post` 주석 존재 여부 검사 (ASIL B+)
- 기존 규칙 강화: null 포인터 규칙이 `@pre`와 일관성 검사

**구현 난이도**: 중간 (주석 파서 + 교차 검증 로직)
**기대 효과**: 인터페이스 명세 품질 향상, Frama-C ACSL과 호환 가능

---

### 아이디어 6: Model-Based Testing으로 Phase 전이 테스트 자동 생성

**출처**: B.2 Model-Based Testing (Utting & Legeard 2007)
**현재 갭**: Phase 상태 머신의 전이 테스트가 수동으로 작성됨
**제안**: V-Model 상태 머신의 전이 그래프에서 MBT 알고리즘으로 테스트 자동 생성.

```
모델: 9-phase × 13-transition FSM
알고리즘: 전이 커버리지 + 경로 커버리지 + 네거티브 경로
생성 결과:
  - 13개 유효 전이 각각에 대한 positive TC
  - 모든 무효 전이에 대한 negative TC (9×9-13 = 68개)
  - N-switch 경로 커버리지 TC
```

**구현 난이도**: 중간 (FSM 그래프 순회 알고리즘)
**기대 효과**: 상태 머신 테스트의 체계적 완전성

---

### 아이디어 7: Watchdog 타이머를 TS Bridge에 적용

**출처**: D.4 Watchdog Timers
**현재 갭**: TS 엔진 타임아웃은 5초(tier1)/30초(gate) 단일 타이머. 진행 중인지 hang인지 구분 불가.
**제안**: 윈도우드 워치독 패턴 적용 — TS 엔진이 중간 하트비트를 보내고, 셸이 진행 상태를 모니터링.

```
현재: check-phase.sh → node cli-entry.js → [5초 후 kill]
개선: check-phase.sh → node cli-entry.js
        ↑ 하트비트(1초마다) "phase: parsing, progress: 40%"
        ↑ 하트비트(1초마다) "phase: analyzing, progress: 70%"
        → [결과] 또는 [5초 하트비트 없음 → kill]
```

**구현 난이도**: 낮음 (stdout 하트비트 프로토콜)
**기대 효과**: hang vs. 정상 장시간 분석 구분, 디버깅 개선

---

### 아이디어 8: Fagan Inspection 메트릭을 AI 리뷰에 적용

**출처**: E.5 Fagan/Gilb Inspection (IBM 1976)
**현재 갭**: AI 리뷰에 검사율 메트릭 없음, 리뷰 효과성 추적 없음
**제안**: Gilb의 Optimum Checking Rate 개념을 AI 리뷰에 적응. 리뷰 당 LOC, 발견율, 리뷰 시간을 추적하여 AI 리뷰 품질 모니터링.

```
새 메트릭 (감사 로그에 기록):
  - review_loc: 리뷰한 코드 줄 수
  - review_findings: 발견한 문제 수
  - review_duration_ms: 리뷰 소요 시간
  - finding_density: findings / kLOC
  - false_positive_rate: 개발자가 거부한 발견 비율
```

**구현 난이도**: 낮음 (메트릭 수집 + 로깅)
**기대 효과**: AI 리뷰 품질의 정량적 추적 및 개선

---

### 아이디어 9: N-Version 개념을 AI 리뷰에 적용

**출처**: D.3 N-Version Programming (Avizienis 1977)
**현재 갭**: 이중 AI 리뷰가 2개 관점이지만, 동일 모델 사용 가능
**제안**: 서로 다른 LLM 모델(Claude, GPT, Gemini)로 리뷰를 수행하여 모델 다양성 확보. Knight & Leveson(1986)의 우려(상관 실패)는 서로 다른 학습 데이터를 가진 다른 모델을 사용하여 완화.

```
현재: Claude AI 리뷰어 A + Claude AI 리뷰어 B (강조 분할)
개선: Claude 리뷰어 + GPT 리뷰어 + Gemini 리뷰어 (모델 다양성)
      → 다수결 투표로 합의
      → 단일 모델만 발견한 문제는 "uncertain" 표시
```

**구현 난이도**: 중간 (다중 모델 API 호출 + 투표 로직)
**기대 효과**: 단일 모델의 맹점(blind spot) 보완

---

### 아이디어 10: PDCA 사이클을 HITL 루프에 명시적으로 매핑

**출처**: E.2 PDCA (Deming)
**현재 갭**: HITL 루프가 암묵적으로 PDCA를 따르지만 명시적 매핑 없음
**제안**: 각 HITL 사이클 완료 시 PDCA Check/Act 단계를 명시화. 이전 사이클 대비 개선 메트릭 자동 비교.

```
HITL 사이클 N 완료 시:
  [Check] 자동 비교:
    - 커버리지: cycle N-1 vs. cycle N
    - MISRA 위반: cycle N-1 vs. cycle N
    - 검증 부채: 추세 방향
    - 재진입 사유 패턴 분석
  [Act] 자동 권고:
    - "커버리지 개선 정체 → 테스트 전략 변경 권고"
    - "동일 MISRA 규칙 반복 위반 → 코딩 가이드 보강 권고"
```

**구현 난이도**: 낮음 (메트릭 비교 로직)
**기대 효과**: 연속적 프로세스 개선의 정량적 근거 제공

---

### 아이디어 11: FMEA를 TC 설계에 통합

**출처**: A.6 FMEA (IEC 60812)
**현재 갭**: TC 설계가 기능 시나리오 중심, 고장 모드 체계적 열거 없음
**제안**: `/test-gen-design` 스킬에 FMEA 유도 모드 추가. 각 함수의 고장 모드를 체계적으로 열거하고, 각 고장 모드에 대한 TC 자동 생성.

```
FMEA-유도 TC 생성:
  함수: read_sensor(channel, buffer, size)

  고장 모드 1: channel이 유효 범위 밖 → TC: channel = -1, MAX+1
  고장 모드 2: buffer가 NULL      → TC: buffer = NULL
  고장 모드 3: size가 0          → TC: size = 0
  고장 모드 4: 센서 타임아웃       → TC: mock sensor timeout
  고장 모드 5: 데이터 손상         → TC: CRC 불일치 시뮬레이션

  각 고장 모드에 대해:
    심각도(S) × 발생도(O) × 검출도(D) = RPN
    RPN > 임계치이면 TC 필수 생성
```

**구현 난이도**: 중간 (FMEA 템플릿 + LLM 유도 프롬프트)
**기대 효과**: 고장 모드 기반 체계적 TC 완전성

---

### 아이디어 12: Tool Qualification 문서 자동 생성 (DO-330 호환)

**출처**: C.2 DO-330 Tool Qualification
**현재 갭**: 자기검증 러너는 있지만, 형식 도구 자격 문서 없음
**제안**: 기존 self-test-runner의 결과를 DO-330 형식의 도구 자격 문서로 자동 변환.

```
자동 생성 문서:
  1. Tool Operational Requirements (TOR)
     - 입력: MISRA 규칙 명세
     - 출력: self-test-runner의 탐지 목표
  2. Tool Qualification Plan (TQP)
     - 방법: 알려진 위반 코퍼스 기반 검증
     - 환경: Node.js, Vitest
  3. Tool Qualification Report (TQR)
     - TPR: XX%, FPR: XX%, FNR: XX%
     - 결론: TCL-X (자동 분류)
  4. Tool Confidence Level 산출
     - TI (Tool Impact) × TD (Tool Error Detection) = TCL
```

**구현 난이도**: 낮음 (템플릿 + 기존 메트릭 포맷팅)
**기대 효과**: Tool Qualification PARTIAL → FULL 승격

---

## 8. 우선순위 로드맵

12개 아이디어를 구현 난이도와 기대 효과로 분류한다.

### 즉시 구현 가능 (Quick Wins) — 낮은 난이도, 높은 효과

| 우선순위 | 아이디어 | 난이도 | 효과 | PARTIAL→FULL 가능 |
|---------|---------|--------|------|-------------------|
| **1** | #12 Tool Qualification 문서 자동 생성 | 낮음 | 높음 | 예 (기법 #20) |
| **2** | #4 STPA 프로세스 위협 모델 확장 | 낮음 | 높음 | - |
| **3** | #8 Fagan 메트릭을 AI 리뷰에 적용 | 낮음 | 중간 | - |
| **4** | #10 PDCA 사이클 명시적 매핑 | 낮음 | 중간 | - |
| **5** | #7 Watchdog 타이머 TS Bridge | 낮음 | 중간 | - |

### 중기 구현 (Medium-Term) — 중간 난이도, 높은 효과

| 우선순위 | 아이디어 | 난이도 | 효과 | 의존성 |
|---------|---------|--------|------|--------|
| **6** | #2 Mutation Testing 게이트 | 중간 | 매우 높음 | LLM 변이 생성기 |
| **7** | #3 Property-Based Testing TC 패턴 | 낮음 | 높음 | TC 스키마 확장 |
| **8** | #5 Design by Contract MISRA 통합 | 중간 | 높음 | 주석 파서 |
| **9** | #11 FMEA 유도 TC 생성 | 중간 | 높음 | FMEA 템플릿 |
| **10** | #6 MBT Phase 전이 테스트 자동 생성 | 중간 | 중간 | FSM 그래프 |

### 장기 연구 (Long-Term Research) — 높은 난이도, 변혁적 효과

| 우선순위 | 아이디어 | 난이도 | 효과 | 필요 인프라 |
|---------|---------|--------|------|-----------|
| **11** | #1 LLM 보조 Alloy 경량 형식 명세 | 중간 | 변혁적 | Alloy CLI |
| **12** | #9 N-Version AI 리뷰 (다중 모델) | 중간 | 높음 | 다중 LLM API |

### 효과 매트릭스

```
효과 ↑
  높음 │  #12  #4          #2   #1
       │  #8   #10   #3   #5   #11
  중간 │  #7          #6   #9
       │
  낮음 │
       └──────────────────────────→ 난이도
          낮음      중간      높음
```

---

## 9. 참고 문헌

### 요구사항공학
- Mavin, A. et al. "Easy Approach to Requirements Syntax (EARS)." IEEE RE 2009.
- van Lamsweerde, A. "Goal-Oriented Requirements Engineering: A Guided Tour." IEEE RE 2001.
- Jacobson, I. "Use-Case 2.0." Ivar Jacobson International, 2011.
- Jackson, D. "Software Abstractions: Logic, Language, and Analysis." MIT Press, 2006.

### 검증 & 확인
- Cousot, P. & Cousot, R. "Abstract Interpretation: A Unified Lattice Model." POPL 1977.
- Clarke, E.M. et al. "Model Checking: Algorithmic Verification and Debugging." CACM 2009.
- King, J.C. "Symbolic Execution and Program Testing." CACM 1976.
- Claessen, K. & Hughes, J. "QuickCheck: A Lightweight Tool for Random Testing." ICFP 2000.
- DeMillo, R.A. et al. "Hints on Test Data Selection." IEEE Computer, 1978.
- Utting, M. & Legeard, B. "Practical Model-Based Testing." Morgan Kaufmann, 2007.
- Chilenski, J. & Miller, S. "Applicability of MC/DC to Software Testing." SE Journal, 1994.

### 안전공학 표준
- ISO 26262:2018. "Road Vehicles — Functional Safety."
- RTCA DO-178C. "Software Considerations in Airborne Systems." 2011.
- RTCA DO-330. "Software Tool Qualification Considerations." 2011.
- IEC 61508:2010. "Functional Safety of E/E/PE Safety-Related Systems."
- IEC 60812:2018. "Failure Modes and Effects Analysis."
- Leveson, N. "Engineering a Safer World." MIT Press, 2012.

### 프로세스 & 아키텍처
- Cooper, R.G. "Stage-Gate Systems." Business Horizons, 1990.
- Fagan, M.E. "Design and Code Inspections." IBM Systems Journal, 1976.
- Meyer, B. "Object-Oriented Software Construction." Prentice Hall, 1997.
- Avizienis, A. "The N-Version Approach." IEEE TSE, 1985.
- Knight, J. & Leveson, N. "An Experimental Evaluation of the Assumption of Independence." IEEE TSE, 1986.
- IEEE 828-2012. "Standard for Configuration Management."

### AI + 형식 방법 (최근 연구)
- Song, P. et al. "Lean Copilot: LLMs as Copilots for Theorem Proving." arXiv:2404.12534, 2024.
- "TLA+ Proof Automation with LLMs." arXiv:2512.09758, 2025.
- "LLMs Writing Alloy Formulas." arXiv:2502.15441, 2025.
- "AutoBug: LLM-Powered Symbolic Execution." ACM OOPSLA, 2025.

### AI 코딩 도구 품질 실증
- METR. "AI Impact on Developer Productivity." arXiv:2507.09089, 2025.
- GitClear. "AI Copilot Code Quality 2025." gitclear.com, 2025.
- Qodo. "State of AI Code Quality 2025." qodo.ai, 2025.
- Meta. "Mutation-Guided LLM-based Test Generation." FSE 2025. arXiv:2501.12862.

### AI 에이전트 안전
- "Policy-as-Prompt Framework." arXiv:2509.23994, 2025.
- "Systems Security Foundations for Agentic Computing." IACR ePrint 2025/2173.
- Bai, Y. et al. "Constitutional AI." Anthropic, 2022.

---

## 부록: 상세 연구 보고서

본 보고서의 기반이 된 3건의 상세 연구 보고서:

1. **기법 조사**: `.omc/scientist/reports/20260221_103502_se_techniques_comprehensive_survey.md` (1,917줄, 16,092단어)
   - 38개 기법의 학술적 상세 설명, 저자/연도, 강점/한계, 산업 채택 현황

2. **AI SOTA 조사**: `.omc/scientist/reports/20260221_103741_ai_safety_critical_development_survey.md` (428줄, 36개 참고문헌)
   - 현재 AI 코딩 도구 현황, LLM+형식 방법, 안전 표준, 가드레일 연구

3. **매핑 분석**: `.omc/scientist/reports/20260221_103910_proofchain_technique_mapping.md`
   - 20개 기법 대비 ProofChain 구현 매핑, 8개 Novel 기법 분석

---

*본 보고서는 소프트웨어공학, 요구사항공학, 안전공학, 형식 검증 분야의 학술 문헌과 국제 표준을 기반으로 작성되었습니다.*
*ProofChain SafeDev v1.0 기준, 918개 테스트, TypeScript strict 0 에러.*
