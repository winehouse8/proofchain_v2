/**
 * ProofChain Staleness Propagator
 *
 * Walks the dependency graph when an artifact changes, invalidating all
 * affected ledger entries. This is the core mechanism that ensures
 * "zero silent staleness".
 */

import type { VerificationLedger } from './verification-ledger.js';
import type { DependencyGraph } from '../graph/dependency-graph.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type PropagationChangeType = 'interface_change' | 'implementation_change';

export interface InvalidatedArtifact {
  artifact_id: string;
  distance: number;       // hops from original change
  reason: string;         // human-readable reason
  previous_status: string; // status before invalidation
}

export interface PropagationResult {
  changed_artifact: string;
  change_type: PropagationChangeType;
  invalidated_artifacts: InvalidatedArtifact[];
  total_invalidated: number;
}

export interface StalenessPropagator {
  /**
   * Propagate staleness from a changed artifact through the dependency graph.
   * Returns the list of all artifacts that were invalidated.
   */
  propagate(
    changedArtifactId: string,
    changeType: PropagationChangeType,
  ): PropagationResult;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createStalenessPropagator(
  ledger: VerificationLedger,
  graph: DependencyGraph,
): StalenessPropagator {
  return {
    propagate(
      changedArtifactId: string,
      changeType: PropagationChangeType,
    ): PropagationResult {
      const invalidated: InvalidatedArtifact[] = [];

      // 1. Get blast radius from dependency graph.
      //    Interface changes propagate transitively; implementation changes only 1-hop.
      const isInterfaceChange = changeType === 'interface_change';
      const blastRadius = graph.getBlastRadius(changedArtifactId, isInterfaceChange);

      // 2. Invalidate the changed artifact itself (distance 0).
      const selfEntry = ledger.getEntry(changedArtifactId);
      if (selfEntry !== null) {
        const previousStatus = selfEntry.verification_status;
        ledger.invalidateEntry(changedArtifactId, 'Content changed');
        invalidated.push({
          artifact_id: changedArtifactId,
          distance: 0,
          reason: 'Content changed',
          previous_status: previousStatus,
        });
      }

      // 3. For each artifact in the blast radius, invalidate if needed.
      for (const affected of blastRadius.affected) {
        const entry = ledger.getEntry(affected.artifact_id);

        // 4. Skip untracked artifacts (no ledger entry).
        if (entry === null) {
          continue;
        }

        // Skip already-invalidated entries — no need to re-invalidate.
        const status = entry.verification_status;
        if (status === 'unverified' || status === 'failed') {
          continue;
        }

        const reason =
          `${changedArtifactId} ${changeType} at distance ${affected.distance}`;

        ledger.invalidateEntry(affected.artifact_id, reason);

        invalidated.push({
          artifact_id: affected.artifact_id,
          distance: affected.distance,
          reason,
          previous_status: status,
        });
      }

      return {
        changed_artifact: changedArtifactId,
        change_type: changeType,
        invalidated_artifacts: invalidated,
        total_invalidated: invalidated.length,
      };
    },
  };
}
