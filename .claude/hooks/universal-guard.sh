#!/bin/bash
# ProofChain v2.2 — Layer 1: Universal Tool Interception Router
# matcher: ".*" — ALL tools pass through this gate
# Routes Edit/Write/Bash to Layer 2 (check-phase.sh)
# Routes NotebookEdit/MCP to Layer 2 for phase checks (v2.2: phase dedup)
# Handles Read, Task directly
#
# Defense coverage:
#   V5:  Symlink resolution (readlink -f) before all path checks
#   V6:  Block Read of .claude/hooks/ source (prevent bypass strategy)
#   V7:  NotebookEdit self-protection + L2 delegation (v2.2)
#   V8:  Task subagent (inherited hooks — Claude Code guarantee)
#   V9:  MCP tool self-protection + L2 delegation (v2.2)
#   V12: Block Read of ~/.proofchain/ key storage
#
# [IR-1]: Self-protection checks (.claude/, .proofchain/, hitl-state.json)
#         are ALWAYS performed BEFORE exec delegation to check-phase.sh
#
# Fail-Closed: crash → block (exit 2)
# exit 0 = allow, exit 2 = block

set -euo pipefail
trap 'echo "HOOK CRASH: fail-closed (universal-guard)" >&2; exit 2' ERR

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# ── ASIL 레벨 읽기 ──
ASIL_LEVEL="QM"
PC_CONFIG="$CWD/.proofchain/config.json"
if [ -f "$PC_CONFIG" ]; then
  ASIL_LEVEL=$(jq -r '.asil_level // "QM"' "$PC_CONFIG" 2>/dev/null) || ASIL_LEVEL="QM"
fi

PROOFCHAIN_HOME="$HOME/.proofchain"

# ══════════════════════════════════════════════════════════════
# ── Tool-Based Routing ──
# ══════════════════════════════════════════════════════════════

case "$TOOL" in

  # ── Edit/Write/Bash → Layer 2 (check-phase.sh) ──
  Edit|Write|Bash)
    exec "$CWD/.claude/hooks/check-phase.sh" <<< "$INPUT"
    ;;

  # ── NotebookEdit: Self-protection + L2 delegation (V7) ──
  NotebookEdit)
    FILE=$(echo "$INPUT" | jq -r '.tool_input.notebook_path // empty')
    [ -z "$FILE" ] && exit 0

    # V5: resolve symlinks
    FILE=$(readlink -f "$FILE" 2>/dev/null || realpath "$FILE" 2>/dev/null || echo "$FILE")

    # [IR-1] Self-protection BEFORE delegation
    case "$FILE" in
      */.claude/*|*/.claude/)
        echo "BLOCKED: .claude/ directory is protected." >&2
        exit 2 ;;
      "${PROOFCHAIN_HOME}"/*|*/.proofchain/*)
        echo "BLOCKED: ProofChain key storage is protected." >&2
        exit 2 ;;
      */.omc/hitl-state.json)
        echo "BLOCKED: hitl-state.json은 /phase 스킬로만 수정 가능합니다." >&2
        exit 2 ;;
    esac

    # Phase check: delegate to check-phase.sh for managed paths
    case "$FILE" in
      */src/*|*/tests/*|*/.omc/specs/*|*/.omc/test-cases/*)
        exec "$CWD/.claude/hooks/check-phase.sh" <<< "$INPUT"
        ;;
    esac
    ;;

  # ── Read: Block hook source and HMAC key reading (V6, V12) ──
  Read)
    FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
    [ -z "$FILE" ] && exit 0

    # V5: resolve symlinks
    FILE=$(readlink -f "$FILE" 2>/dev/null || realpath "$FILE" 2>/dev/null || echo "$FILE")

    # V6: Block .claude/hooks/ source reading
    case "$FILE" in
      */.claude/hooks/*.sh|*/.claude/hooks/*.py|*/.claude/hooks/*.js)
        echo "BLOCKED: Hook 소스 파일은 읽기가 차단됩니다." >&2
        echo "  AI가 훅 우회 전략을 수립하는 것을 방지합니다." >&2
        echo "  훅 설정 확인은 /hooks 메뉴를 사용하세요." >&2
        exit 2
        ;;
    esac

    # V12: Block ~/.proofchain/ key reading
    case "$FILE" in
      "${PROOFCHAIN_HOME}"/*|"${PROOFCHAIN_HOME}")
        echo "BLOCKED: ProofChain 키 저장소는 읽기가 차단됩니다." >&2
        echo "  HMAC 서명 키는 AI가 접근할 수 없습니다." >&2
        exit 2
        ;;
    esac

    # Block .proofchain/ integrity data in project
    case "$FILE" in
      */.proofchain/hmac-key|*/.proofchain/integrity/*)
        echo "BLOCKED: ProofChain 무결성 데이터는 읽기가 차단됩니다." >&2
        exit 2
        ;;
    esac
    ;;

  # ── Task: Subagents inherit parent hooks (V8) ──
  Task)
    ;;

  # ── MCP tools: Self-protection + L2 delegation (V9) ──
  mcp__*)
    FILE=$(echo "$INPUT" | jq -r '
      .tool_input.path //
      .tool_input.file_path //
      .tool_input.file //
      .tool_input.filename //
      .tool_input.target //
      empty
    ')
    [ -z "$FILE" ] && exit 0

    # V5: resolve symlinks
    FILE=$(readlink -f "$FILE" 2>/dev/null || realpath "$FILE" 2>/dev/null || echo "$FILE")

    # [IR-1] Self-protection BEFORE delegation
    case "$FILE" in
      */.claude/*|*/.claude/)
        echo "BLOCKED: MCP 도구 — .claude/ 디렉토리는 보호됩니다." >&2
        exit 2 ;;
      */.omc/hitl-state.json)
        echo "BLOCKED: MCP 도구 — hitl-state.json은 /phase 스킬로만 수정 가능합니다." >&2
        exit 2 ;;
      "${PROOFCHAIN_HOME}"/*|*/.proofchain/*)
        echo "BLOCKED: MCP 도구 — ProofChain 키/설정은 보호됩니다." >&2
        exit 2 ;;
    esac

    # Phase check: delegate to check-phase.sh for managed paths
    case "$FILE" in
      */src/*|*/tests/*|*/.omc/specs/*|*/.omc/test-cases/*)
        exec "$CWD/.claude/hooks/check-phase.sh" <<< "$INPUT"
        ;;
    esac
    ;;

  # ── Known safe tools: allow ──
  Glob|Grep|WebFetch|WebSearch|AskUserQuestion|EnterPlanMode|ExitPlanMode)
    ;;

  # ── TodoWrite, TaskCreate, TaskUpdate, TaskList, TaskGet, Skill, etc. ──
  TodoWrite|TaskCreate|TaskUpdate|TaskList|TaskGet|Skill|TaskOutput|TaskStop)
    ;;

  # ── Unknown tools: default allow ──
  *)
    ;;
esac

exit 0
