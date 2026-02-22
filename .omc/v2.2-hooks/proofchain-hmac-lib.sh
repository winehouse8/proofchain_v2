#!/bin/bash
# ProofChain v2.2 — HMAC Shared Library
# Single source of truth for cryptographic integrity functions and protected file lists.
# Sourced by: integrity-audit.sh, phase-commit.sh, restore-state.sh
#
# IMPORTANT: This file uses 'return' only (never 'exit') for source compatibility.
# All consumers must have 'set -euo pipefail' set before sourcing.

# ── Variable initialization ──
proofchain_hmac_vars() {
  PROOFCHAIN_HOME="$HOME/.proofchain"
  INTEGRITY_DIR="$PROOFCHAIN_HOME/integrity"
  AUDIT_DIR="$PROOFCHAIN_HOME/audit"
  HMAC_KEY_FILE="$PROOFCHAIN_HOME/hmac-key"
}

# ── Protected file lists (single source of truth) ──
# ALL_PROTECTED: full signing/audit/backup target set
# CRITICAL_PROTECTED: subset for session-start hash verification display
proofchain_protected_files() {
  local cwd="$1"
  PROOFCHAIN_ALL_PROTECTED=(
    "$cwd/.omc/hitl-state.json"
    "$cwd/.proofchain/config.json"
    "$cwd/.claude/hooks/check-phase.sh"
    "$cwd/.claude/hooks/universal-guard.sh"
    "$cwd/.claude/hooks/integrity-audit.sh"
    "$cwd/.claude/hooks/proofchain-hmac-lib.sh"
    "$cwd/.claude/hooks/config-protect.sh"
    "$cwd/.claude/settings.json"
  )
  PROOFCHAIN_CRITICAL_PROTECTED=(
    "$cwd/.claude/hooks/check-phase.sh"
    "$cwd/.claude/hooks/universal-guard.sh"
    "$cwd/.claude/settings.json"
  )
}

# ── Sign a single file (HMAC + SHA-256 + backup) ──
proofchain_sign_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  [ -f "$HMAC_KEY_FILE" ] || return 0

  local key
  key=$(cat "$HMAC_KEY_FILE")
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local content
  content=$(cat "$file")
  local hmac
  hmac=$(printf '%s%s' "$content" "$ts" | openssl dgst -sha256 -hmac "$key" -hex 2>/dev/null | awk '{print $NF}') || return 0

  local basename
  basename=$(basename "$file")
  printf '{"hmac":"%s","timestamp":"%s","file":"%s"}\n' "$hmac" "$ts" "$basename" > "$INTEGRITY_DIR/${basename}.sig"
  printf '%s' "$content" | shasum -a 256 | cut -d' ' -f1 > "$INTEGRITY_DIR/${basename}.sha256"
  cp "$file" "$INTEGRITY_DIR/${basename}.backup"
}

# ── Verify HMAC signature of a file ──
# Returns 0 if valid or skipped, 1 if mismatch
proofchain_verify_hmac() {
  local file="$1"
  local cwd="$2"
  [ -f "$HMAC_KEY_FILE" ] || return 0

  local key
  key=$(cat "$HMAC_KEY_FILE")
  local basename
  basename=$(basename "$file")
  local sig_file="$INTEGRITY_DIR/${basename}.sig"
  [ -f "$sig_file" ] || return 0

  local stored_hmac stored_ts
  stored_hmac=$(jq -r '.hmac // empty' "$sig_file" 2>/dev/null) || return 0
  stored_ts=$(jq -r '.timestamp // empty' "$sig_file" 2>/dev/null) || return 0
  { [ -z "$stored_hmac" ] || [ -z "$stored_ts" ]; } && return 0

  local full_path="$cwd/$file"
  [ -f "$full_path" ] || return 0

  local content
  content=$(cat "$full_path")
  local computed
  computed=$(printf '%s%s' "$content" "$stored_ts" | openssl dgst -sha256 -hmac "$key" -hex 2>/dev/null | awk '{print $NF}') || return 0

  if [ "$stored_hmac" != "$computed" ]; then
    return 1
  fi
  return 0
}

# ── Verify SHA-256 hash of a file ──
# Returns 0 if valid or skipped, 1 if mismatch
# Sets PROOFCHAIN_HASH_CURRENT and PROOFCHAIN_HASH_EXPECTED for caller use
proofchain_verify_hash() {
  local full_path="$1"
  [ -f "$full_path" ] || return 0

  local basename
  basename=$(basename "$full_path")
  local expected_file="$INTEGRITY_DIR/${basename}.sha256"
  [ -f "$expected_file" ] || return 0

  PROOFCHAIN_HASH_CURRENT=$(shasum -a 256 "$full_path" 2>/dev/null | cut -d' ' -f1) || return 0
  PROOFCHAIN_HASH_EXPECTED=$(cat "$expected_file" 2>/dev/null) || return 0

  if [ "$PROOFCHAIN_HASH_CURRENT" != "$PROOFCHAIN_HASH_EXPECTED" ]; then
    return 1
  fi
  return 0
}

# ── Rollback a file from backup ──
proofchain_rollback_file() {
  local full_path="$1"
  local basename
  basename=$(basename "$full_path")
  local backup_file="$INTEGRITY_DIR/${basename}.backup"

  if [ -f "$backup_file" ]; then
    cp "$backup_file" "$full_path"
    return 0
  fi
  return 1
}

# ── Re-sign a file after legitimate modification (e.g., phase transition) ──
proofchain_resign_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  [ -f "$HMAC_KEY_FILE" ] || return 0
  [ -d "$INTEGRITY_DIR" ] || return 0

  local key
  key=$(cat "$HMAC_KEY_FILE")
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local content
  content=$(cat "$file")
  local hmac
  hmac=$(printf '%s%s' "$content" "$ts" | openssl dgst -sha256 -hmac "$key" -hex 2>/dev/null | awk '{print $NF}') || return 0

  local basename
  basename=$(basename "$file")
  printf '{"hmac":"%s","timestamp":"%s","file":"%s"}\n' "$hmac" "$ts" "$basename" > "$INTEGRITY_DIR/${basename}.sig"
  printf '%s' "$content" | shasum -a 256 | cut -d' ' -f1 > "$INTEGRITY_DIR/${basename}.sha256"
  cp "$file" "$INTEGRITY_DIR/${basename}.backup"
}
