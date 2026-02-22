# /trace — 추적 태그 관리

소스 코드의 추적 태그(`@trace`, `@req`, `@tc`)를 관리합니다.

## 기능

### 태그 스캔
프로젝트 전체의 추적 태그를 스캔하고 보고합니다:
- `@req REQ-XX-NNN` — 요구사항 추적
- `@tc TC-XX-NNNx` — 테스트 케이스 추적
- `@trace ARCH-XX` — 아키텍처 요소 추적

### 누락 탐지
TC JSON의 TC 목록과 테스트 코드의 `@tc` 어노테이션을 비교하여 누락을 보고합니다.

### 팬텀 참조 탐지
테스트 코드에 `@tc`로 참조되지만 TC JSON에 존재하지 않는 "팬텀" TC를 보고합니다.

## 사용법

```
/trace scan      — 전체 추적 태그 스캔
/trace gaps      — 누락된 추적 태그 보고
/trace phantoms  — 팬텀 참조 보고
/trace matrix    — 추적성 매트릭스 생성
```
