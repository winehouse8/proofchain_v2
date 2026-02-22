/**
 * ProofChain Merge Impact Analyzer
 *
 * Analyzes the impact of merging one feature into another within the V-Model
 * lifecycle. Determines which parallel tracks are affected, which artifacts
 * need re-verification, and whether any tracks should regress to an earlier
 * phase to maintain ISO 26262 traceability integrity.
 */

import type { VModelPhase } from '../core/types.js';
import type { ParallelTrackManager } from './parallel-track-manager.js';
import type { VModelStateMachine } from './state-machine.js';

// ─── Public Interface ─────────────────────────────────────────────────────────

export interface MergeImpact {
  /** The feature being merged (source). */
  merging_feature: string;
  /** The feature being merged into (target). */
  target_feature: string;
  /** Feature IDs whose tracks are affected by this merge. */
  affected_tracks: string[];
  /** Artifact IDs / labels that must be re-verified after the merge. */
  artifacts_to_reverify: string[];
  /** Tracks that should regress to an earlier phase, with from/to phases. */
  phase_regressions: Array<{ featureId: string; from: VModelPhase; to: VModelPhase }>;
  /** Human-readable recommendation for the team. */
  recommendation: string;
}

export interface MergeImpactAnalyzer {
  /**
   * Analyze the impact of merging mergingFeature into targetFeature.
   * Returns a full MergeImpact report including which tracks need action.
   */
  analyzeMergeImpact(mergingFeature: string, targetFeature: string): MergeImpact;
}

// ─── Phase Ordering Helpers ───────────────────────────────────────────────────

const PHASE_ORDER: readonly VModelPhase[] = [
  'requirements_spec',
  'architecture_design',
  'unit_design',
  'implementation',
  'unit_verification',
  'integration_verify',
  'safety_verify',
  'verified',
  'released',
];

function phaseIndex(phase: VModelPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * Given a phase that has received a merge, return the phase a dependent track
 * should regress to for re-verification. Tracks past unit_verification must
 * re-run integration; tracks past integration_verify must re-run safety.
 */
function regressionTargetForMerge(affectedPhase: VModelPhase): VModelPhase | null {
  const idx = phaseIndex(affectedPhase);
  // Already at or before unit_verification: regress to unit_verification start
  if (idx <= phaseIndex('unit_verification')) return null;
  // Past unit_verification but not yet safety: regress to integration_verify
  if (idx <= phaseIndex('integration_verify')) return 'unit_verification';
  // Past integration but not yet verified/released: regress to integration_verify
  if (idx <= phaseIndex('safety_verify')) return 'integration_verify';
  // verified or released: regress to safety_verify for fresh independent review
  return 'safety_verify';
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createMergeImpactAnalyzer(
  trackManager: ParallelTrackManager,
  stateMachine: VModelStateMachine,
): MergeImpactAnalyzer {
  return {
    analyzeMergeImpact(mergingFeature: string, targetFeature: string): MergeImpact {
      const allTracks = trackManager.listTracks();
      const allStateTracks = stateMachine.getAllTracks();

      // 1. Find all tracks that depend on the merging feature
      const dependentTracks: string[] = [];
      for (const { featureId } of allTracks) {
        if (featureId === mergingFeature || featureId === targetFeature) continue;
        const deps = trackManager.getCrossTrackDependencies(featureId);
        if (deps.includes(mergingFeature)) {
          dependentTracks.push(featureId);
        }
      }

      // Always include the target feature itself as affected
      const affectedTrackSet = new Set<string>([targetFeature, ...dependentTracks]);
      const affected_tracks = [...affectedTrackSet];

      // 2. Determine artifacts to re-verify
      // Each affected track contributes its feature ID as an artifact label
      const artifacts_to_reverify: string[] = affected_tracks.map(
        (id) => `${id}::post-merge-verification`,
      );

      // Also flag the merging feature's own artifacts
      artifacts_to_reverify.push(`${mergingFeature}::merge-source`);

      // 3. Determine phase regressions
      const phase_regressions: Array<{ featureId: string; from: VModelPhase; to: VModelPhase }> = [];

      for (const featureId of affected_tracks) {
        const state = allStateTracks.get(featureId);
        if (state === undefined) continue;

        // released tracks cannot regress
        if (state.phase === 'released') continue;

        const regressionTarget = regressionTargetForMerge(state.phase);
        if (regressionTarget !== null) {
          phase_regressions.push({
            featureId,
            from: state.phase,
            to: regressionTarget,
          });
        }
      }

      // 4. Build recommendation string
      const mergingState = allStateTracks.get(mergingFeature);
      const targetState = allStateTracks.get(targetFeature);
      const mergingPhase = mergingState?.phase ?? 'unknown';
      const targetPhase = targetState?.phase ?? 'unknown';

      let recommendation: string;

      if (phase_regressions.length === 0 && affected_tracks.length <= 1) {
        recommendation =
          `Merge of '${mergingFeature}' (${mergingPhase}) into '${targetFeature}' (${targetPhase}) ` +
          `has low impact. No phase regressions required. Proceed after updating traceability links.`;
      } else if (phase_regressions.length === 0) {
        recommendation =
          `Merge of '${mergingFeature}' into '${targetFeature}' affects ${affected_tracks.length} track(s). ` +
          `No phase regressions required, but all affected tracks must re-run their current verification step. ` +
          `Update cross-track dependency records before proceeding.`;
      } else {
        const regressionSummary = phase_regressions
          .map((r) => `'${r.featureId}' (${r.from} → ${r.to})`)
          .join(', ');
        recommendation =
          `Merge of '${mergingFeature}' (${mergingPhase}) into '${targetFeature}' (${targetPhase}) ` +
          `requires ${phase_regressions.length} phase regression(s): ${regressionSummary}. ` +
          `Re-verify ${artifacts_to_reverify.length} artifact(s). ` +
          `Apply regressions via VModelStateMachine.regress() before continuing development.`;
      }

      return {
        merging_feature: mergingFeature,
        target_feature: targetFeature,
        affected_tracks,
        artifacts_to_reverify,
        phase_regressions,
        recommendation,
      };
    },
  };
}
