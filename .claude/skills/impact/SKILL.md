# /impact — 변경 영향 분석

파일 또는 함수 변경의 영향 범위(blast radius)를 분석합니다.

## 기능

ProofChain의 의존성 그래프와 CCP(변경 사이클 프로토콜)를 활용하여:
1. 변경된 산출물 식별
2. 인터페이스 변경 여부 판단
3. BFS로 영향 받는 산출물 탐색
4. staleness 전파 시뮬레이션
5. 필요한 재검증 유형 결정

## 사용법

```
/impact <file_path>        — 파일 변경의 영향 분석
/impact <file>:<function>  — 함수 변경의 영향 분석
/impact --simulate         — 변경 전 시뮬레이션 (dry run)
```

## 출력

```
=== 변경 영향 분석 ===
변경: src/core/config.ts:loadConfig
변경 유형: interface_change (함수 시그니처 변경)

영향 받는 산출물: 8개
  거리 1: src/hooks/pre-tool-use.ts (unit 재검증)
  거리 1: src/hooks/post-tool-use.ts (unit 재검증)
  거리 1: src/bridge/cli-entry.ts (unit 재검증)
  거리 2: src/integration/... (integration 재검증)
  ...

재검증 필요:
  - unit: 5건
  - integration: 2건
  - safety: 1건 (ASIL C+)

예상 staleness 전파: 8건 → verification_debt += 8
```

## ISO 26262 근거

ISO 26262 Part 8 §8.4: 변경 요청에 대한 영향 분석은 안전 관련 소프트웨어의 변경 관리에 필수적입니다.
