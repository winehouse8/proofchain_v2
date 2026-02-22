/**
 * ProofChain Gate Enforcer
 *
 * Enforces commit, phase-advance, and release gates based on the current
 * verification debt and project enforcement mode.
 */

import type { AsilLevel, EnforcementMode, ProofChainConfig } from '../core/types.js';
import { DEBT_CEILING } from '../core/types.js';
import type { VerificationLedger } from '../ledger/verification-ledger.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface GateViolation {
  artifact_id: string;
  asil_level: AsilLevel;
  reason: string;
}

export interface GateCheckResult {
  gate_passed: boolean;
  enforcement_mode: EnforcementMode;
  blocked_reason: string | null;
  debt_count: number;
  violations: GateViolation[];
}

export type GateType = 'commit' | 'phase_advance' | 'release';

export interface GateEnforcer {
  checkGate(
    gateType: GateType,
    config: ProofChainConfig,
    ledger: VerificationLedger,
  ): GateCheckResult;
}

// ─── ASIL priority for ordering (D = highest) ─────────────────────────────────

const ASIL_PRIORITY: Readonly<Record<AsilLevel, number>> = {
  D: 0,
  C: 1,
  B: 2,
  A: 3,
  QM: 4,
};

/** Returns true if the given ASIL level is B or above (ASIL B+). */
function isAsilBPlus(asil: AsilLevel): boolean {
  return asil === 'B' || asil === 'C' || asil === 'D';
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createGateEnforcer(): GateEnforcer {
  return {
    checkGate(
      gateType: GateType,
      config: ProofChainConfig,
      ledger: VerificationLedger,
    ): GateCheckResult {
      const mode = config.enforcement_mode;
      const projectAsil = config.asil_level;

      // Collect all stale entries
      const staleEntries = ledger.queryStale();
      const unverifiedEntries = ledger.queryByStatus('unverified');
      const failedEntries = ledger.queryByStatus('failed');

      const debtCount = staleEntries.length;

      // Build violations list from stale entries sorted by ASIL priority
      const violations: GateViolation[] = staleEntries
        .slice()
        .sort((a, b) => ASIL_PRIORITY[a.asil_level] - ASIL_PRIORITY[b.asil_level])
        .map(entry => ({
          artifact_id: entry.artifact_id,
          asil_level: entry.asil_level,
          reason: entry.invalidated_by ?? 'Artifact is stale',
        }));

      // Check debt ceiling breach
      const ceiling = DEBT_CEILING[projectAsil];
      const debtCeilingBreached = debtCount > ceiling;

      switch (gateType) {
        case 'commit': {
          // For ASIL B+ in strict mode: block if ANY stale entries exist.
          // For warn mode: allow with annotations.
          // For info mode: log only.
          const hasAsilBPlusStale = staleEntries.some(e => isAsilBPlus(e.asil_level));
          const shouldBlock =
            mode === 'strict' &&
            (isAsilBPlus(projectAsil)
              ? staleEntries.length > 0
              : hasAsilBPlusStale || debtCeilingBreached);

          if (shouldBlock) {
            return {
              gate_passed: false,
              enforcement_mode: mode,
              blocked_reason: debtCeilingBreached
                ? `Verification debt ceiling breached: ${debtCount} stale entries (ceiling: ${ceiling} for ASIL ${projectAsil})`
                : `Commit blocked: ${debtCount} stale artifact(s) detected for ASIL ${projectAsil} project in strict mode`,
              debt_count: debtCount,
              violations,
            };
          }

          // warn mode: gate passes but violations are surfaced
          return {
            gate_passed: true,
            enforcement_mode: mode,
            blocked_reason: null,
            debt_count: debtCount,
            violations: mode === 'info' ? [] : violations,
          };
        }

        case 'phase_advance': {
          // Block if debt count > 0 regardless of mode
          if (debtCount > 0) {
            return {
              gate_passed: false,
              enforcement_mode: mode,
              blocked_reason: `Phase advance blocked: ${debtCount} stale artifact(s) must be resolved before advancing`,
              debt_count: debtCount,
              violations,
            };
          }

          return {
            gate_passed: true,
            enforcement_mode: mode,
            blocked_reason: null,
            debt_count: 0,
            violations: [],
          };
        }

        case 'release': {
          // Block if ANY stale or unverified entries exist — always strict
          const releaseBlockers = [
            ...staleEntries,
            ...unverifiedEntries,
            ...failedEntries,
          ];

          const releaseViolations: GateViolation[] = releaseBlockers
            .slice()
            .sort((a, b) => ASIL_PRIORITY[a.asil_level] - ASIL_PRIORITY[b.asil_level])
            .map(entry => ({
              artifact_id: entry.artifact_id,
              asil_level: entry.asil_level,
              reason:
                entry.verification_status === 'stale'
                  ? (entry.invalidated_by ?? 'Artifact is stale')
                  : entry.verification_status === 'unverified'
                    ? 'Artifact has never been verified'
                    : 'Last verification failed',
            }));

          if (releaseBlockers.length > 0) {
            return {
              gate_passed: false,
              enforcement_mode: 'strict', // release gate always strict
              blocked_reason: `Release blocked: ${releaseBlockers.length} artifact(s) are not in a fresh verified state (${staleEntries.length} stale, ${unverifiedEntries.length} unverified, ${failedEntries.length} failed)`,
              debt_count: debtCount,
              violations: releaseViolations,
            };
          }

          return {
            gate_passed: true,
            enforcement_mode: 'strict',
            blocked_reason: null,
            debt_count: 0,
            violations: [],
          };
        }
      }
    },
  };
}
