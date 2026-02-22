/**
 * ProofChain Incremental Verifier
 *
 * Orchestrates incremental re-verification: skips artifacts that are already
 * fresh, marks others as verified, and returns an aggregate result.
 *
 * Note: This module contains a stub verification path. In production, the
 * `verify` method would invoke actual test runners per verification_type.
 * Currently it marks items as 'passed' and updates the ledger to 'fresh'.
 */

import type { ReverificationType } from '../core/types.js';
import type { VerificationLedger } from '../ledger/verification-ledger.js';
import type { VerificationSchedule } from './verification-scheduler.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface VerificationResult {
  artifact_id: string;
  status: 'passed' | 'failed' | 'skipped';
  verification_type: ReverificationType;
  reason: string;
  duration_ms: number;
}

export interface IncrementalVerificationResult {
  results: VerificationResult[];
  total_verified: number;
  total_skipped: number;
  total_failed: number;
  all_passed: boolean;
}

export interface IncrementalVerifier {
  /**
   * Run incremental verification for each item in the schedule.
   * Skips fresh artifacts. Marks verified artifacts as fresh in the ledger.
   */
  verify(
    schedule: VerificationSchedule,
    ledger: VerificationLedger,
  ): IncrementalVerificationResult;

  /**
   * Returns true if the artifact is already fresh and can be skipped.
   */
  shouldSkip(artifactId: string, ledger: VerificationLedger): boolean;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createIncrementalVerifier(): IncrementalVerifier {
  return {
    shouldSkip(artifactId: string, ledger: VerificationLedger): boolean {
      const entry = ledger.getEntry(artifactId);
      if (!entry) return false;
      return entry.verification_status === 'fresh';
    },

    verify(
      schedule: VerificationSchedule,
      ledger: VerificationLedger,
    ): IncrementalVerificationResult {
      const results: VerificationResult[] = [];
      let totalVerified = 0;
      let totalSkipped = 0;
      let totalFailed = 0;

      for (const scheduledItem of schedule.items) {
        const { artifact_id, verification_type } = scheduledItem.work_item;
        const startMs = Date.now();

        if (this.shouldSkip(artifact_id, ledger)) {
          results.push({
            artifact_id,
            status: 'skipped',
            verification_type,
            reason: 'Artifact is already fresh; skipping re-verification.',
            duration_ms: Date.now() - startMs,
          });
          totalSkipped++;
          continue;
        }

        // --- Stub verification path ---
        // In production this would invoke test runners based on verification_type.
        // For now, mark as passed and update ledger to fresh.
        const now = new Date().toISOString();

        try {
          const existing = ledger.getEntry(artifact_id);
          if (existing) {
            // Update to fresh: re-create with current content hash and fresh status
            ledger.createEntry({
              artifact_id,
              content_hash: existing.content_hash,
              interface_hash: existing.interface_hash,
              verification_status: 'fresh',
              freshness_score: 1.0,
              verified_at: now,
              verified_against: existing.verified_against ?? undefined,
              dependencies: existing.dependencies as string[],
              asil_level: existing.asil_level,
            });
          }

          const duration = Date.now() - startMs;
          results.push({
            artifact_id,
            status: 'passed',
            verification_type,
            reason: `${verification_type} verification passed (stub).`,
            duration_ms: duration,
          });
          totalVerified++;
        } catch (err) {
          const duration = Date.now() - startMs;
          const message = err instanceof Error ? err.message : String(err);
          results.push({
            artifact_id,
            status: 'failed',
            verification_type,
            reason: `Verification error: ${message}`,
            duration_ms: duration,
          });
          totalFailed++;
        }
      }

      return {
        results,
        total_verified: totalVerified,
        total_skipped: totalSkipped,
        total_failed: totalFailed,
        all_passed: totalFailed === 0,
      };
    },
  };
}
