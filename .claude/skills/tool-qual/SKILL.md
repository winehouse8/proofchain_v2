# /tool-qual — 도구 자격 인증

ISO 26262 Part 8 Clause 11에 따른 도구 자격 인증을 실행합니다.

## 기능

ProofChain의 MISRA 규칙 엔진을 알려진 위반 코퍼스(known-violations corpus)에 대해 실행하고 정확도 메트릭을 계산합니다.

### 정확도 메트릭
- **True Positive Rate (TPR)**: 예상 위반 중 탐지된 비율
- **False Positive Rate (FPR)**: 깨끗한 줄에서 잘못 탐지된 비율
- **False Negative Rate (FNR)**: 놓친 위반 비율
- **Overall Accuracy**: (TP + TN) / (TP + TN + FP + FN)

### 합격 기준
- 전체 정확도 ≥ 95%

## 사용법

```
/tool-qual run         — 전체 자격 인증 실행
/tool-qual report      — 최근 결과 보고서 출력
/tool-qual corpus      — 코퍼스 목록 출력
```

## 출력

```
=== 도구 자격 인증 결과 ===
코퍼스: 21개 샘플
예상 위반: 42건
탐지 위반: 41건

TPR:  0.976 (41/42)
FPR:  0.000 (0/120)
FNR:  0.024 (1/42)
정확도: 0.994

결과: PASS (≥ 0.95)

ISO 26262 Part 8 Clause 11 도구 자격 요구사항 충족.
```
