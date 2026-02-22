#!/bin/bash
# ProofChain v2.2 — Unified Integrity Layer (L3)
# Merged from v2.1 L3 (integrity-audit.sh) + L4 (hmac-init.sh)
#
# Modes:
#   init  — SessionStart: key generation + directory setup + initial signing
#   post  — PostToolUse: SHA-256 verify + HMAC verify + auto-rollback + Merkle chain
#
# matcher (PostToolUse): "Edit|Write|Bash|NotebookEdit|mcp__.*"
# PostToolUse hooks CANNOT block (exit 0 always in post mode)
# SessionStart hooks should not block session (exit 0 always in init mode)

set -euo pipefail

# ── [IR-2] MODE branch: MUST be before INPUT=$(cat) to prevent stdin hang ──
MODE="${1:-post}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/proofchain-hmac-lib.sh"

case "$MODE" in
# ══════════════════════════════════════════════════════════════
# ── init mode: SessionStart (no stdin) ──
# ══════════════════════════════════════════════════════════════
init)
  trap 'exit 0' ERR  # SessionStart should not block session

  CWD=$(pwd)
  proofchain_hmac_vars
  proofchain_protected_files "$CWD"
  mkdir -p "$INTEGRITY_DIR" "$AUDIT_DIR"

  # Key generation (first run only)
  if [ ! -f "$HMAC_KEY_FILE" ]; then
    openssl rand -hex 32 > "$HMAC_KEY_FILE"
    chmod 600 "$HMAC_KEY_FILE"
    echo "[ProofChain] HMAC key generated at $HMAC_KEY_FILE" >&2
  fi

  # Sign all protected files
  for f in "${PROOFCHAIN_ALL_PROTECTED[@]}"; do
    [ -f "$f" ] && proofchain_sign_file "$f"
  done

  echo "[ProofChain] Integrity signatures updated" >&2
  exit 0
  ;;

# ══════════════════════════════════════════════════════════════
# ── post mode: PostToolUse (reads stdin JSON) ──
# ══════════════════════════════════════════════════════════════
post)
  trap 'exit 0' ERR  # PostToolUse must never block

  INPUT=$(cat)
  TOOL=$(echo "$INPUT" | jq -r '.tool_name')
  CWD=$(echo "$INPUT" | jq -r '.cwd')

  proofchain_hmac_vars
  proofchain_protected_files "$CWD"
  AUDIT_LOG="$AUDIT_DIR/tool-audit.jsonl"

  # Skip if integrity infrastructure not initialized
  [ ! -d "$INTEGRITY_DIR" ] && exit 0

  # ══════════════════════════════════════════════════════════════
  # ── Section 1: Protected File Integrity Verification ──
  # ══════════════════════════════════════════════════════════════

  VIOLATION_COUNT=0
  VIOLATIONS=""

  # v2.1 FIX: Skip hitl-state.json rollback when legitimately modified
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
  SKIP_STATE_ROLLBACK=false
  case "$FILE_PATH" in
    */.omc/hitl-state.json) SKIP_STATE_ROLLBACK=true ;;
  esac

  # Derive relative paths from library's PROOFCHAIN_ALL_PROTECTED (single source of truth)
  PROTECTED_REL=()
  for f in "${PROOFCHAIN_ALL_PROTECTED[@]}"; do
    PROTECTED_REL+=("${f#$CWD/}")
  done

  for f in "${PROTECTED_REL[@]}"; do
    FULL="$CWD/$f"
    [ -f "$FULL" ] || continue

    if $SKIP_STATE_ROLLBACK && [ "$f" = ".omc/hitl-state.json" ]; then
      continue
    fi

    if ! proofchain_verify_hash "$FULL"; then
      VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
      VIOLATIONS="${VIOLATIONS}  - $f (hash mismatch)\n"

      if proofchain_rollback_file "$FULL"; then
        echo "INTEGRITY VIOLATION: $f was tampered with. Auto-restored from backup." >&2

        TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        printf '{"event":"integrity_violation","file":"%s","tool":"%s","expected_hash":"%s","actual_hash":"%s","action":"auto_rollback","timestamp":"%s"}\n' \
          "$f" "$TOOL" "$PROOFCHAIN_HASH_EXPECTED" "$PROOFCHAIN_HASH_CURRENT" "$TS" \
          >> "$AUDIT_DIR/integrity-violations.jsonl" 2>/dev/null || true
      else
        echo "INTEGRITY VIOLATION: $f was tampered with. No backup available for rollback." >&2

        TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        printf '{"event":"integrity_violation_no_backup","file":"%s","tool":"%s","expected_hash":"%s","actual_hash":"%s","timestamp":"%s"}\n' \
          "$f" "$TOOL" "$PROOFCHAIN_HASH_EXPECTED" "$PROOFCHAIN_HASH_CURRENT" "$TS" \
          >> "$AUDIT_DIR/integrity-violations.jsonl" 2>/dev/null || true
      fi
    fi
  done

  if [ "$VIOLATION_COUNT" -gt 0 ]; then
    cat >&2 <<EOF
[ProofChain] INTEGRITY AUDIT: ${VIOLATION_COUNT}개 무결성 위반 감지 및 복원
$(printf "$VIOLATIONS")
  보호된 파일이 변조되었으나 백업에서 자동 복원되었습니다.
  이 이벤트는 감사 로그에 기록되었습니다.
EOF
  fi

  # ══════════════════════════════════════════════════════════════
  # ── Section 2: HMAC Signature Verification ──
  # ══════════════════════════════════════════════════════════════

  if [ -f "$HMAC_KEY_FILE" ]; then
    HMAC_CHECK_FILES=(
      ".omc/hitl-state.json"
      ".proofchain/config.json"
    )

    for f in "${HMAC_CHECK_FILES[@]}"; do
      if ! proofchain_verify_hmac "$f" "$CWD"; then
        echo "[ProofChain] HMAC MISMATCH: $f — 서명이 일치하지 않습니다." >&2
        echo "  파일이 서명 경로 외부에서 수정되었을 수 있습니다." >&2

        TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        printf '{"event":"hmac_mismatch","file":"%s","tool":"%s","timestamp":"%s"}\n' \
          "$f" "$TOOL" "$TS" \
          >> "$AUDIT_DIR/integrity-violations.jsonl" 2>/dev/null || true
      fi
    done
  fi

  # ══════════════════════════════════════════════════════════════
  # ── Section 3: Merkle Tree Audit Log ──
  # ══════════════════════════════════════════════════════════════

  mkdir -p "$AUDIT_DIR" 2>/dev/null || true

  if [ -f "$AUDIT_LOG" ]; then
    PREV_HASH=$(tail -1 "$AUDIT_LOG" 2>/dev/null | jq -r '.entry_hash // "genesis"' 2>/dev/null) || PREV_HASH="genesis"
  else
    PREV_HASH="genesis"
  fi

  TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  TOOL_INPUT_SUMMARY=$(echo "$INPUT" | jq -c '
    .tool_input |
    if .command then {command: (.command | .[0:200])}
    elif .file_path then {file_path: .file_path}
    elif .notebook_path then {notebook_path: .notebook_path}
    elif .pattern then {pattern: .pattern}
    else {type: "other"}
    end
  ' 2>/dev/null) || TOOL_INPUT_SUMMARY='{"type":"parse_error"}'

  ENTRY=$(jq -n \
    --arg tool "$TOOL" \
    --arg input "$TOOL_INPUT_SUMMARY" \
    --arg ts "$TS" \
    --arg prev "$PREV_HASH" \
    --argjson violations "$VIOLATION_COUNT" \
    '{tool: $tool, input: $input, timestamp: $ts, prev_hash: $prev, violations: $violations}' 2>/dev/null) || exit 0

  ENTRY_HASH=$(printf '%s' "$ENTRY" | shasum -a 256 2>/dev/null | cut -d' ' -f1) || exit 0

  echo "$ENTRY" | jq -c --arg hash "$ENTRY_HASH" '. + {entry_hash: $hash}' >> "$AUDIT_LOG" 2>/dev/null || true

  # ══════════════════════════════════════════════════════════════
  # ── Section 4: Audit Log Rotation ──
  # ══════════════════════════════════════════════════════════════

  if [ -f "$AUDIT_LOG" ]; then
    LOG_SIZE=$(wc -c < "$AUDIT_LOG" 2>/dev/null) || LOG_SIZE=0
    if [ "$LOG_SIZE" -gt 10485760 ]; then
      ROTATE_TS=$(date -u +"%Y%m%d_%H%M%S")
      mv "$AUDIT_LOG" "$AUDIT_DIR/tool-audit-${ROTATE_TS}.jsonl" 2>/dev/null || true
      echo "[ProofChain] Audit log rotated (${LOG_SIZE} bytes)" >&2
    fi
  fi

  exit 0
  ;;

*)
  echo "[ProofChain] Unknown mode: $MODE (expected 'init' or 'post')" >&2
  exit 0
  ;;
esac
