/**
 * ProofChain Parallel Track Manager
 *
 * Manages multiple concurrent feature tracks within the V-Model state machine.
 * Tracks can progress independently and may declare cross-track dependencies,
 * which are used by the merge impact analyzer to determine re-verification scope.
 */

import type {
  FeatureTrackState,
  VModelPhase,
} from '../core/types.js';
import type { VModelStateMachine } from './state-machine.js';

// ─── Public Interface ─────────────────────────────────────────────────────────

export interface ParallelTrackManager {
  /** Create a new feature track, delegating to the underlying state machine. */
  createTrack(featureId: string, initialPhase?: VModelPhase): FeatureTrackState;

  /** Delete a feature track. Returns true if the track existed. */
  deleteTrack(featureId: string): boolean;

  /** List all tracks with their current states. */
  listTracks(): Array<{ featureId: string; state: FeatureTrackState }>;

  /** Return all feature IDs whose current phase matches the given phase. */
  getActiveTracksInPhase(phase: VModelPhase): string[];

  /**
   * Given a feature and a list of features it depends on, return the subset of
   * dependsOn IDs that are not yet in a completed phase (verified or released),
   * i.e. features that are still blocking progress.
   */
  detectCrossTrackDependencies(featureId: string, dependsOn: string[]): string[];

  /** Record that fromFeature depends on toFeature (directional). */
  addCrossTrackDependency(fromFeature: string, toFeature: string): void;

  /** Return all feature IDs that the given feature depends on. */
  getCrossTrackDependencies(featureId: string): string[];
}

// ─── Completed Phases ─────────────────────────────────────────────────────────

const COMPLETED_PHASES = new Set<VModelPhase>(['verified', 'released']);

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createParallelTrackManager(stateMachine: VModelStateMachine): ParallelTrackManager {
  // Soft-deleted feature IDs (state machine has no delete API)
  const deletedTracks = new Set<string>();

  // fromFeature -> set of toFeature IDs it depends on
  const crossTrackDeps = new Map<string, Set<string>>();

  return {
    createTrack(featureId: string, initialPhase?: VModelPhase): FeatureTrackState {
      deletedTracks.delete(featureId);
      return stateMachine.createTrack(featureId, initialPhase);
    },

    deleteTrack(featureId: string): boolean {
      const allTracks = stateMachine.getAllTracks();
      if (!allTracks.has(featureId) || deletedTracks.has(featureId)) {
        return false;
      }
      deletedTracks.add(featureId);
      // Remove as a dependency target from all other features
      for (const deps of crossTrackDeps.values()) {
        deps.delete(featureId);
      }
      crossTrackDeps.delete(featureId);
      return true;
    },

    listTracks(): Array<{ featureId: string; state: FeatureTrackState }> {
      const allTracks = stateMachine.getAllTracks();
      const result: Array<{ featureId: string; state: FeatureTrackState }> = [];
      for (const [featureId, state] of allTracks) {
        if (!deletedTracks.has(featureId)) {
          result.push({ featureId, state });
        }
      }
      return result;
    },

    getActiveTracksInPhase(phase: VModelPhase): string[] {
      const allTracks = stateMachine.getAllTracks();
      const result: string[] = [];
      for (const [featureId, state] of allTracks) {
        if (!deletedTracks.has(featureId) && state.phase === phase) {
          result.push(featureId);
        }
      }
      return result;
    },

    detectCrossTrackDependencies(featureId: string, dependsOn: string[]): string[] {
      void featureId; // parameter reserved for future caller-context filtering
      const allTracks = stateMachine.getAllTracks();
      return dependsOn.filter((depId) => {
        if (deletedTracks.has(depId)) return false;
        const depState = allTracks.get(depId);
        if (depState === undefined) return false;
        // A dependency is "blocking" if it has not reached a completed phase
        return !COMPLETED_PHASES.has(depState.phase);
      });
    },

    addCrossTrackDependency(fromFeature: string, toFeature: string): void {
      let deps = crossTrackDeps.get(fromFeature);
      if (deps === undefined) {
        deps = new Set<string>();
        crossTrackDeps.set(fromFeature, deps);
      }
      deps.add(toFeature);
    },

    getCrossTrackDependencies(featureId: string): string[] {
      const deps = crossTrackDeps.get(featureId);
      return deps !== undefined ? [...deps] : [];
    },
  };
}
