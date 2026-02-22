#!/bin/bash
# ProofChain v2.1 — ConfigChange Protection Hook
# Layer 1: Blocks ALL configuration changes during session
# Prevents disabling hooks or modifying settings mid-session

set -euo pipefail
trap 'exit 2' ERR

echo "BLOCKED: ProofChain 설정은 세션 중 변경할 수 없습니다." >&2
echo "  새 설정을 적용하려면 세션을 종료하고 재시작하세요." >&2
echo "  이 보호는 세션 중 훅 비활성화를 방지합니다." >&2
exit 2
