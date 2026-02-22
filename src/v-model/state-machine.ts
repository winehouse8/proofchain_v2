/**
 * ProofChain V-Model State Machine
 *
 * Tracks each feature's position in the ISO 26262 V-Model development
 * lifecycle. State is per-feature (not global). Supports forward transitions
 * gated by PhaseGateStatus checks, backward regression for failure recovery,
 * and orthogonal meta-states (change_pending, reverify_required, debt_acknowledged).
 */

import type {
  FeatureTrackState,
  PhaseGateStatus,
  VModelMetaState,
  VModelPhase,
} from '../core/types.js';

// ─── Phase Order ─────────────────────────────────────────────────────────────

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

// ─── Gate Requirements Per Transition ────────────────────────────────────────

/**
 * Maps each phase to the gate fields that must be true before advancing
 * to the next phase. An empty array means no gate checks required.
 */
const FORWARD_GATE_REQUIREMENTS: Readonly<Record<VModelPhase, ReadonlyArray<keyof PhaseGateStatus>>> = {
  requirements_spec:  ['traceability_complete'],
  architecture_design: ['traceability_complete'],
  unit_design:        ['traceability_complete', 'complexity_ok'],
  implementation:     ['trace_tags_present', 'misra_clean', 'complexity_ok'],
  unit_verification:  ['coverage_met', 'tests_passing'],
  integration_verify: ['coverage_met', 'tests_passing', 'misra_clean'],
  safety_verify:      ['independent_review_done'],
  verified:           ['coverage_met', 'tests_passing', 'misra_clean', 'traceability_complete', 'trace_tags_present', 'complexity_ok', 'independent_review_done'],
  // released is terminal — no forward transition
  released:           [],
};

// ─── Default Gate Status ─────────────────────────────────────────────────────

function defaultGateStatus(): PhaseGateStatus {
  return {
    coverage_met: false,
    tests_passing: false,
    misra_clean: false,
    traceability_complete: false,
    trace_tags_present: false,
    complexity_ok: false,
    independent_review_done: false,
  };
}

// ─── Persistence Interface ───────────────────────────────────────────────────

/** Optional persistence adapter for V-Model state. */
export interface VModelPersistence {
  /** Load persisted tracks. Returns empty map if no prior state. */
  load(): Map<string, FeatureTrackState>;
  /** Save all tracks to persistent storage. */
  save(tracks: Map<string, FeatureTrackState>): void;
}

// ─── Public Interface ─────────────────────────────────────────────────────────

export interface VModelStateMachine {
  /** Get the current phase for a feature, or null if the feature is unknown. */
  getPhase(featureId: string): VModelPhase | null;

  /** Get the full track state for a feature, or null if unknown. */
  getTrackState(featureId: string): FeatureTrackState | null;

  /** Return all feature tracks as a Map. */
  getAllTracks(): Map<string, FeatureTrackState>;

  /** Create a new feature track, defaulting to requirements_spec. */
  createTrack(featureId: string, initialPhase?: VModelPhase): FeatureTrackState;

  /**
   * Advance a feature to the next phase if all gate requirements are met.
   * Returns success=true and the new phase on success, or an error string.
   */
  advance(
    featureId: string,
    gateStatus: PhaseGateStatus,
  ): { success: boolean; newPhase: VModelPhase | null; error: string | null };

  /**
   * Regress a feature to an earlier phase (failure recovery).
   * Preserves track history, updates phase and entered_at.
   */
  regress(
    featureId: string,
    targetPhase: VModelPhase,
    reason: string,
  ): { success: boolean; error: string | null };

  /** Add a meta-state to a feature track (idempotent). */
  addMetaState(featureId: string, meta: VModelMetaState): void;

  /** Remove a meta-state from a feature track. */
  removeMetaState(featureId: string, meta: VModelMetaState): void;

  /** Merge partial gate status updates into the current gate status. */
  updateGateStatus(featureId: string, gateStatus: Partial<PhaseGateStatus>): void;
}

// ─── Mutable Internal Track ───────────────────────────────────────────────────

interface MutableTrack {
  phase: VModelPhase;
  meta_states: VModelMetaState[];
  entered_at: string;
  gate_status: PhaseGateStatus;
  verification_debt: number;
  blocked_by: string[];
}

function trackToState(t: MutableTrack): FeatureTrackState {
  return {
    phase: t.phase,
    meta_states: [...t.meta_states],
    entered_at: t.entered_at,
    gate_status: { ...t.gate_status },
    verification_debt: t.verification_debt,
    blocked_by: [...t.blocked_by],
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createVModelStateMachine(persistence?: VModelPersistence): VModelStateMachine {
  const tracks = new Map<string, MutableTrack>();

  // ── Restore persisted state on creation ──────────────────────────────────
  if (persistence) {
    const loaded = persistence.load();
    for (const [id, state] of loaded) {
      tracks.set(id, {
        phase: state.phase,
        meta_states: [...state.meta_states],
        entered_at: state.entered_at,
        gate_status: { ...state.gate_status },
        verification_debt: state.verification_debt,
        blocked_by: [...state.blocked_by],
      });
    }
  }

  /** Persist current state to storage (if adapter provided). */
  function persist(): void {
    if (!persistence) return;
    const snapshot = new Map<string, FeatureTrackState>();
    for (const [id, t] of tracks) {
      snapshot.set(id, trackToState(t));
    }
    persistence.save(snapshot);
  }

  function requireTrack(featureId: string): MutableTrack | null {
    return tracks.get(featureId) ?? null;
  }

  function phaseIndex(phase: VModelPhase): number {
    return PHASE_ORDER.indexOf(phase);
  }

  function nextPhase(phase: VModelPhase): VModelPhase | null {
    const idx = phaseIndex(phase);
    if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
    return PHASE_ORDER[idx + 1] ?? null;
  }

  return {
    getPhase(featureId: string): VModelPhase | null {
      return tracks.get(featureId)?.phase ?? null;
    },

    getTrackState(featureId: string): FeatureTrackState | null {
      const t = requireTrack(featureId);
      return t !== null ? trackToState(t) : null;
    },

    getAllTracks(): Map<string, FeatureTrackState> {
      const result = new Map<string, FeatureTrackState>();
      for (const [id, t] of tracks) {
        result.set(id, trackToState(t));
      }
      return result;
    },

    createTrack(featureId: string, initialPhase: VModelPhase = 'requirements_spec'): FeatureTrackState {
      const track: MutableTrack = {
        phase: initialPhase,
        meta_states: [],
        entered_at: new Date().toISOString(),
        gate_status: defaultGateStatus(),
        verification_debt: 0,
        blocked_by: [],
      };
      tracks.set(featureId, track);
      persist();
      return trackToState(track);
    },

    advance(
      featureId: string,
      gateStatus: PhaseGateStatus,
    ): { success: boolean; newPhase: VModelPhase | null; error: string | null } {
      const track = requireTrack(featureId);
      if (track === null) {
        return { success: false, newPhase: null, error: `Feature track '${featureId}' does not exist` };
      }

      const current = track.phase;

      if (current === 'released') {
        return { success: false, newPhase: null, error: `Feature '${featureId}' is already released and immutable` };
      }

      // Special release check: zero debt required
      if (current === 'verified') {
        if (track.verification_debt > 0) {
          return {
            success: false,
            newPhase: null,
            error: `Cannot release '${featureId}': verification_debt is ${track.verification_debt} (must be 0)`,
          };
        }
      }

      const requiredGates = FORWARD_GATE_REQUIREMENTS[current];
      const failing = requiredGates.filter((gate) => !gateStatus[gate]);

      if (failing.length > 0) {
        return {
          success: false,
          newPhase: null,
          error: `Gate check failed for '${featureId}' at phase '${current}': ${failing.join(', ')} must be true`,
        };
      }

      const target = nextPhase(current);
      if (target === null) {
        return { success: false, newPhase: null, error: `No next phase after '${current}'` };
      }

      // Commit transition
      track.phase = target;
      track.entered_at = new Date().toISOString();
      track.gate_status = { ...gateStatus };
      persist();

      return { success: true, newPhase: target, error: null };
    },

    regress(
      featureId: string,
      targetPhase: VModelPhase,
      reason: string,
    ): { success: boolean; error: string | null } {
      const track = requireTrack(featureId);
      if (track === null) {
        return { success: false, error: `Feature track '${featureId}' does not exist` };
      }

      const currentIdx = phaseIndex(track.phase);
      const targetIdx = phaseIndex(targetPhase);

      if (targetIdx >= currentIdx) {
        return {
          success: false,
          error: `Cannot regress '${featureId}' from '${track.phase}' to '${targetPhase}': target must be an earlier phase`,
        };
      }

      track.phase = targetPhase;
      track.entered_at = new Date().toISOString();
      // Increment debt to record the regression
      track.verification_debt += 1;
      // Mark as reverify_required if not already present
      if (!track.meta_states.includes('reverify_required')) {
        track.meta_states.push('reverify_required');
      }

      // Suppress unused reason warning — stored conceptually; callers may log it
      void reason;
      persist();

      return { success: true, error: null };
    },

    addMetaState(featureId: string, meta: VModelMetaState): void {
      const track = requireTrack(featureId);
      if (track === null) return;
      if (!track.meta_states.includes(meta)) {
        track.meta_states.push(meta);
        persist();
      }
    },

    removeMetaState(featureId: string, meta: VModelMetaState): void {
      const track = requireTrack(featureId);
      if (track === null) return;
      const idx = track.meta_states.indexOf(meta);
      if (idx !== -1) {
        track.meta_states.splice(idx, 1);
        persist();
      }
    },

    updateGateStatus(featureId: string, gateStatus: Partial<PhaseGateStatus>): void {
      const track = requireTrack(featureId);
      if (track === null) return;
      track.gate_status = { ...track.gate_status, ...gateStatus };
      persist();
    },
  };
}
