# HITL 개발 루프

## 1. 원칙

**SPEC이 단일 진실 원천이다.** 코드와 테스트는 SPEC으로부터 독립적으로 파생된다.

단, "독립적"은 "불변"을 의미하지 않는다. TC는 두 계층으로 나뉜다:

| 계층 | 생성 시점 | 독립성 | 변경 가능 | 목적 |
|------|-----------|--------|-----------|------|
| **Baseline TC** | SPEC 확정 직후 | 코드를 보지 않고 생성 (격리) | 내용 불변 (obsolete 마킹 가능) | SPEC 커버리지 증명 |
| **Supplementary TC** | 코딩/테스트 반복 중 | 코드를 보고 추가 가능 | 자유 | 커버리지 강화 |

Baseline은 "SPEC 대비 이만큼은 반드시 검증한다"는 계약이다. Supplementary는 "더 발견했으니 더 검증한다"는 보강이다. 코드를 보고 테스트를 쉽게 만드는 것은 위반이고, 코드를 보고 테스트를 추가하는 것은 강화다.

---

## 2. 전체 루프

```
1. SPEC 작성          [사람 + AI co-pilot]        ← /ears-spec
   산출물: .omc/specs/SPEC-{code}-*.md
   사람 확정                                       ← 개입 #1
       │
       ├──────────────────┐
       ↓                  ↓
2a. Baseline TC 생성    2b. 코딩                   ← 병렬 실행
    [AI, 격리 컨텍스트]      [AI, 메인 컨텍스트]
    SPEC만 참조              SPEC 참조
    ← /test-gen-design
       │                  │
       ↓                  │
3. TC 리뷰                │
   사람 승인                │                       ← 개입 #2
       │                  │
       ↓                  ↓
4. 테스트 코드 생성 + 실행 + 반복                   ← /test-gen-code
   [AI, 메인 컨텍스트]
   Baseline TC + 코드 → 테스트 생성 → 실행
       │
       ├─ 실패 → AI 수정 → 재실행 (최대 5회)
       ├─ 반복 중 TC 추가 발견 → Supplementary TC 추가
       └─ SPEC 문제 → 사람 보고, 중단               ← 개입 #3 (조건부)
       │
       ↓
5. 최종 검증
   사람 확인                                        ← 개입 #4
   커버리지 리포트 + 추적성 매트릭스 + 수동 확인
       │
       ↓
   verified ──→ 문제 발견 시 reentry (cycle++)
```

---

## 3. 상태 전환 규칙

```
spec     → forward: tc
tc       → forward: code,     backward: spec
code     → forward: test,     backward: spec, tc
test     → forward: verified, backward: spec, tc, code
verified → reentry: spec, tc, code
```

---

## 4. 사람 개입 요약

| # | 시점 | 하는 일 | 소요 |
|---|------|---------|------|
| 1 | SPEC 확정 | 의도 확인, 누락 점검 | 15~30분/영역 |
| 2 | TC 리뷰 | 커버리지 판단, 승인 | 10~20분/영역 |
| 3 | SPEC 문제 (조건부) | SPEC 수정 또는 예외 승인 | 상황별 |
| 4 | 최종 검증 | 리포트 확인, 수동 UX 확인 | 10~15분/영역 |

사람은 코드를 작성하지 않는다. 사람은 판단한다.

---

## 5. Reentry (Cycle > 1)

### 5.1 전이도

```
verified ─── A ──→ spec ──→ tc ──→ code ──→ test ──→ verified
    │                                                    ↑
    ├─── B ──────────→ tc ──→ code ──→ test ─────────────┤
    │                                                    │
    └─── C ──────────────────→ code ──→ test ────────────┘

A = SPEC 변경 필요 (새 기능, SPEC 오류)
B = 코드 버그 (SPEC 정확)
C = 테스트 코드 오류

모든 경로에서 cycle++ (1→2, 2→3, ...)
```

### 5.2 Reentry 로그 필수 필드

```json
{
  "timestamp": "ISO 8601",
  "area": "XX",
  "from": "verified",
  "to": "spec | tc | code",
  "actor": "human",
  "type": "spec_change | code_bug | test_bug",
  "reason": "변경 사유",
  "affected_reqs": ["REQ-XX-NNN"],
  "skipped_phases": ["spec", "tc"],
  "skip_reason": "건너뛴 단계의 정당화 (건너뛴 경우 필수)"
}
```

### 5.3 Cycle > 1 불변 원칙

- 모든 reentry에서 **전체 회귀 테스트 필수** (active baseline + supplementary 모두) — ISO 26262 Part 6 §9.4.6
- 단계 건너뛰기 시 **skip_reason 필수** — ISO 26262 Part 8 §8.7
- Baseline TC의 **내용(given/when/then)은 동결** — supplementary TC만 추가
- SPEC 변경으로 baseline TC가 무효화될 때: `status: "obsolete"` 마킹 + 대체 supplementary TC 생성
- obsolete TC는 테스트 실행에서 제외되지만, JSON에서 삭제하지 않음 (감사 추적 보존)

### 5.4 Cycle 1 Backward 시 Baseline TC 재생성

Cycle 1에서 backward 전환이 발생하면, 아직 최초 `verified`를 거치지 않은 상태이므로 baseline TC가 감사 추적 대상이 아니다.

**규칙**:
- Cycle 1에서 backward로 `tc` phase에 재진입하면, `/test-gen-design`이 baseline TC를 **통째로 재생성**할 수 있다
- 이는 "수정/삭제"가 아니라 "아직 확정되지 않은 초안의 재작성"으로 간주한다
- **`baseline_tc_immutable` 원칙은 최초 `verified` 이후부터 적용된다** (cycle 2+)

**근거**: ISO 26262 Part 8 §7.4.1의 형상 관리 요건은 "확정된 산출물"에 적용된다. cycle 1에서 verified 전의 TC는 아직 확정 전 초안이므로, 재생성이 형상 관리 위반이 아니다.
