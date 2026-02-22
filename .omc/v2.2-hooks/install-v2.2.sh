#!/bin/bash
# ProofChain v2.2 — Installation Script
# Copies v2.2 hooks from .omc/v2.2-hooks/ to .claude/hooks/
# and updates .claude/settings.json
#
# IMPORTANT: Run this from your terminal, NOT from Claude Code!
# The hooks block writes to .claude/ directory,
# so this must be executed outside Claude Code session.
#
# Usage:
#   cd /path/to/project
#   bash .omc/v2.2-hooks/install-v2.2.sh
#
# What changed from v2.1:
#   - L5 (Agent Hook) removed: 30s Write delay eliminated
#   - L7 (Stop Hook) removed: replaced by CLAUDE.md directive
#   - L3+L4 merged: integrity-audit.sh now handles both init + audit
#   - hmac-init.sh removed: absorbed into integrity-audit.sh init
#   - proofchain-hmac-lib.sh added: shared HMAC library
#   - L1 phase dedup: NotebookEdit/MCP delegated to check-phase.sh
#   - PostToolUse matcher expanded: includes mcp__.*

set -euo pipefail

CWD=$(pwd)
V22_DIR="$CWD/.omc/v2.2-hooks"
HOOKS_DIR="$CWD/.claude/hooks"
BACKUP_DIR="$CWD/.omc/v2.1-backup"
PROOFCHAIN_HOME="$HOME/.proofchain"

echo "══════════════════════════════════════════════"
echo " ProofChain v2.2 Installation"
echo " 4+1 Layer Defense Architecture"
echo "══════════════════════════════════════════════"
echo ""

# ── Verify source files exist ──
REQUIRED_FILES=(
  "universal-guard.sh"
  "check-phase.sh"
  "integrity-audit.sh"
  "proofchain-hmac-lib.sh"
  "config-protect.sh"
  "subagent-context-inject.sh"
  "restore-state.sh"
  "phase-commit.sh"
  "trace-change.sh"
  "artifact-commit.sh"
  "checkpoint.sh"
  "settings.json"
)

echo "[1/5] Verifying source files..."
for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$V22_DIR/$f" ]; then
    echo "ERROR: Missing source file: $V22_DIR/$f" >&2
    exit 1
  fi
done
echo "  ✓ All ${#REQUIRED_FILES[@]} source files found"

# ── Backup current hooks ──
echo ""
echo "[2/5] Backing up current v2.1 hooks to .omc/v2.1-backup/..."
mkdir -p "$BACKUP_DIR"

if [ -d "$HOOKS_DIR" ]; then
  cp -r "$HOOKS_DIR" "$BACKUP_DIR/hooks-$(date +%Y%m%d_%H%M%S)"
  echo "  ✓ Hooks backed up"
fi

if [ -f "$CWD/.claude/settings.json" ]; then
  cp "$CWD/.claude/settings.json" "$BACKUP_DIR/settings-$(date +%Y%m%d_%H%M%S).json"
  echo "  ✓ Settings backed up"
fi

# ── Copy new hook files ──
echo ""
echo "[3/5] Installing v2.2 hook files..."
mkdir -p "$HOOKS_DIR"

# New in v2.2
cp "$V22_DIR/proofchain-hmac-lib.sh" "$HOOKS_DIR/proofchain-hmac-lib.sh"
echo "  ✓ proofchain-hmac-lib.sh (HMAC shared library — NEW)"

# Modified in v2.2
cp "$V22_DIR/universal-guard.sh" "$HOOKS_DIR/universal-guard.sh"
echo "  ✓ universal-guard.sh (L1 router — phase dedup)"

cp "$V22_DIR/check-phase.sh" "$HOOKS_DIR/check-phase.sh"
echo "  ✓ check-phase.sh (L2 guard — NotebookEdit/MCP support)"

cp "$V22_DIR/integrity-audit.sh" "$HOOKS_DIR/integrity-audit.sh"
echo "  ✓ integrity-audit.sh (L3 unified integrity — init+audit)"

cp "$V22_DIR/phase-commit.sh" "$HOOKS_DIR/phase-commit.sh"
echo "  ✓ phase-commit.sh (PostToolUse — uses HMAC lib)"

cp "$V22_DIR/restore-state.sh" "$HOOKS_DIR/restore-state.sh"
echo "  ✓ restore-state.sh (SessionStart — uses HMAC lib)"

# Unchanged from v2.1
cp "$V22_DIR/config-protect.sh" "$HOOKS_DIR/config-protect.sh"
echo "  ✓ config-protect.sh (ConfigChange — unchanged)"

cp "$V22_DIR/subagent-context-inject.sh" "$HOOKS_DIR/subagent-context-inject.sh"
echo "  ✓ subagent-context-inject.sh (SubagentStart — unchanged)"

cp "$V22_DIR/trace-change.sh" "$HOOKS_DIR/trace-change.sh"
echo "  ✓ trace-change.sh (PostToolUse — unchanged)"

cp "$V22_DIR/artifact-commit.sh" "$HOOKS_DIR/artifact-commit.sh"
echo "  ✓ artifact-commit.sh (PostToolUse — unchanged)"

cp "$V22_DIR/checkpoint.sh" "$HOOKS_DIR/checkpoint.sh"
echo "  ✓ checkpoint.sh (PreCompact — unchanged)"

# Settings
cp "$V22_DIR/settings.json" "$CWD/.claude/settings.json"
echo "  ✓ settings.json (v2.2 4+1 Layer configuration)"

# Remove obsolete files
if [ -f "$HOOKS_DIR/hmac-init.sh" ]; then
  rm "$HOOKS_DIR/hmac-init.sh"
  echo "  ✗ hmac-init.sh (REMOVED — absorbed into integrity-audit.sh)"
fi

# ── Set permissions ──
echo ""
echo "[4/5] Setting file permissions..."
chmod +x "$HOOKS_DIR"/*.sh
chmod 644 "$CWD/.claude/settings.json"
echo "  ✓ All hook scripts made executable"

# ── Initialize HMAC infrastructure ──
echo ""
echo "[5/5] Initializing HMAC infrastructure..."

mkdir -p "$PROOFCHAIN_HOME/integrity" "$PROOFCHAIN_HOME/audit"

if [ ! -f "$PROOFCHAIN_HOME/hmac-key" ]; then
  openssl rand -hex 32 > "$PROOFCHAIN_HOME/hmac-key"
  chmod 600 "$PROOFCHAIN_HOME/hmac-key"
  echo "  ✓ HMAC key generated at $PROOFCHAIN_HOME/hmac-key"
else
  echo "  ✓ HMAC key already exists"
fi

# Sign all protected files using the library
source "$HOOKS_DIR/proofchain-hmac-lib.sh"
proofchain_hmac_vars
proofchain_protected_files "$CWD"

SIGNED_COUNT=0
for f in "${PROOFCHAIN_ALL_PROTECTED[@]}"; do
  if [ -f "$f" ]; then
    proofchain_sign_file "$f"
    SIGNED_COUNT=$((SIGNED_COUNT + 1))
  fi
done
echo "  ✓ ${SIGNED_COUNT} files signed with HMAC-SHA256"

# ── Summary ──
echo ""
echo "══════════════════════════════════════════════"
echo " Installation Complete!"
echo "══════════════════════════════════════════════"
echo ""
echo " Installed layers:"
echo "   L1: Universal Router + Access Control"
echo "   L2: Deterministic Phase Guard (+ NotebookEdit/MCP)"
echo "   L3: Unified Integrity (SHA-256 + HMAC + Merkle)"
echo "   L4: Semantic Guard (Haiku prompt)"
echo "   +1: Process Automation (7 support hooks)"
echo ""
echo " Removed (v2.1 → v2.2):"
echo "   ✗ L5 Agent Hook (30s Write delay → eliminated)"
echo "   ✗ L7 Stop Hook (→ CLAUDE.md directive)"
echo "   ✗ hmac-init.sh (→ integrity-audit.sh init)"
echo ""
echo " Added:"
echo "   ✓ proofchain-hmac-lib.sh (shared HMAC library)"
echo ""
echo " Backup location: $BACKUP_DIR/"
echo " HMAC key: $PROOFCHAIN_HOME/hmac-key"
echo ""
echo " Next steps:"
echo "   1. Start a new Claude Code session"
echo "   2. Verify '4+1 Layer Defense' in session start output"
echo "   3. Test with a protected operation to confirm blocking"
echo ""
echo " To rollback to v2.1:"
echo "   cp .omc/v2.1-backup/hooks-*/*.sh .claude/hooks/"
echo "   cp .omc/v2.1-backup/settings-*.json .claude/settings.json"
echo "   cp .omc/v2-hooks/hmac-init.sh .claude/hooks/  # restore deleted file"
