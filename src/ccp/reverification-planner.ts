/**
 * ProofChain Reverification Planner
 *
 * Generates a prioritized re-verification work plan from a blast radius result.
 * Priority is computed as: ASIL_weight * (1 / distance) — lower number = higher priority.
 */

import type { AsilLevel, ReverificationWorkItem } from '../core/types.js';
import type { VerificationLedger } from '../ledger/verification-ledger.js';
import type { BlastRadiusDetail } from './blast-radius-calculator.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ReverificationPlan {
  work_items: ReverificationWorkItem[];
  total_items: number;
  estimated_scope: string;
}

export interface ReverificationPlanner {
  plan(
    blastRadius: BlastRadiusDetail,
    ledger: VerificationLedger,
  ): ReverificationPlan;
}

// ─── ASIL Weights ─────────────────────────────────────────────────────────────

const ASIL_WEIGHTS: Readonly<Record<AsilLevel, number>> = {
  D: 5,
  C: 4,
  B: 3,
  A: 2,
  QM: 1,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute priority score.  Lower value = higher priority.
 * Formula: ASIL_weight * (1 / distance).
 * We invert the product so that higher urgency → lower priority number,
 * then negate to sort ascending: priority = 1 / (ASIL_weight * (1 / distance))
 *                                           = distance / ASIL_weight
 * (so ASIL D at distance 1 → 0.2, QM at distance 10 → 10 — D wins)
 */
function computePriority(asil: AsilLevel, distance: number): number {
  const weight = ASIL_WEIGHTS[asil];
  // Guard against zero distance (shouldn't happen, but be safe)
  const safeDist = distance > 0 ? distance : 1;
  return safeDist / weight;
}

function buildEstimatedScope(
  total: number,
  unitCount: number,
  integrationCount: number,
  safetyCount: number,
  fullCount: number,
): string {
  const parts: string[] = [];
  if (unitCount > 0) parts.push(`${unitCount} unit`);
  if (integrationCount > 0) parts.push(`${integrationCount} integration`);
  if (safetyCount > 0) parts.push(`${safetyCount} safety`);
  if (fullCount > 0) parts.push(`${fullCount} full`);
  const breakdown = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `Re-verify ${total} artifact${total === 1 ? '' : 's'}${breakdown}`;
}

function buildReason(
  artifactId: string,
  invalidationReason: string,
  distance: number,
): string {
  return distance === 1
    ? `Direct dependency changed: ${invalidationReason}`
    : `Transitive dependency changed (distance ${distance}): ${invalidationReason}`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createReverificationPlanner(): ReverificationPlanner {
  return {
    plan(
      blastRadius: BlastRadiusDetail,
      ledger: VerificationLedger,
    ): ReverificationPlan {
      const workItems: ReverificationWorkItem[] = [];

      let unitCount = 0;
      let integrationCount = 0;
      let safetyCount = 0;
      let fullCount = 0;

      for (const affected of blastRadius.affected_artifacts) {
        // Enrich ASIL from ledger if available (graph node lacks asil_level)
        const ledgerEntry = ledger.getEntry(affected.artifact_id);
        const asil: AsilLevel = ledgerEntry?.asil_level ?? affected.asil_level;

        const priority = computePriority(asil, affected.distance);

        const reason = buildReason(
          affected.artifact_id,
          affected.invalidation_reason,
          affected.distance,
        );

        const verificationType = affected.reverification_type;

        switch (verificationType) {
          case 'unit':        unitCount++;        break;
          case 'integration': integrationCount++; break;
          case 'safety':      safetyCount++;      break;
          case 'full':        fullCount++;        break;
        }

        workItems.push({
          artifact_id: affected.artifact_id,
          verification_type: verificationType,
          reason,
          priority,
          asil_level: asil,
          estimated_scope: `${verificationType} verification of ${affected.artifact_id}`,
        });
      }

      // Sort ascending by priority number (lower number = higher priority first)
      workItems.sort((a, b) => a.priority - b.priority);

      const total = workItems.length;
      const estimatedScope = buildEstimatedScope(
        total,
        unitCount,
        integrationCount,
        safetyCount,
        fullCount,
      );

      return {
        work_items: workItems,
        total_items: total,
        estimated_scope: estimatedScope,
      };
    },
  };
}
