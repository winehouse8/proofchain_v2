/**
 * ProofChain Phase Enforcer
 *
 * Enforces phase-appropriate action restrictions for V-Model feature tracks.
 * Each V-Model phase permits a specific set of actions; this module provides
 * the policy layer that answers "can I do X right now?" given a feature's
 * current phase and gate readiness.
 */

import type {
  PhaseGateStatus,
  VModelPhase,
} from '../core/types.js';
import type { VModelStateMachine } from './state-machine.js';

// ─── Phase Action Type ────────────────────────────────────────────────────────

/** Actions that can be restricted or permitted per V-Model phase. */
export type PhaseAction =
  | 'write_code'
  | 'write_test'
  | 'run_verification'
  | 'generate_docs'
  | 'release'
  | 'modify_requirements'
  | 'modify_architecture';

// ─── Public Interface ─────────────────────────────────────────────────────────

export interface PhaseEnforcer {
  /**
   * Check whether a given action is permitted for a feature at its
   * current phase. Returns allowed=true or allowed=false with a reason.
   */
  canPerformAction(
    featureId: string,
    action: PhaseAction,
  ): { allowed: boolean; reason: string | null };

  /**
   * Return the list of gate field names that must be satisfied before
   * the given phase can advance.
   */
  getRequiredGates(phase: VModelPhase): string[];

  /**
   * Check whether all required gates are met for the feature's current
   * phase transition. Returns ready=true, or ready=false with a list of
   * missing gate names.
   */
  checkGateReadiness(featureId: string): { ready: boolean; missing: string[] };
}

// ─── Allowed Actions Per Phase ────────────────────────────────────────────────

const PHASE_ALLOWED_ACTIONS: Readonly<Record<VModelPhase, ReadonlyArray<PhaseAction>>> = {
  requirements_spec:   ['modify_requirements'],
  architecture_design: ['modify_architecture', 'modify_requirements'],
  unit_design:         ['modify_architecture'],
  implementation:      ['write_code', 'modify_requirements'],
  unit_verification:   ['write_test', 'run_verification', 'write_code'],
  integration_verify:  ['run_verification', 'write_test'],
  safety_verify:       ['run_verification', 'generate_docs'],
  verified:            ['generate_docs', 'release'],
  released:            [],  // immutable — nothing allowed
};

// ─── Required Gates Per Phase (before advancing) ──────────────────────────────

const PHASE_REQUIRED_GATES: Readonly<Record<VModelPhase, ReadonlyArray<keyof PhaseGateStatus>>> = {
  requirements_spec:   ['traceability_complete'],
  architecture_design: ['traceability_complete'],
  unit_design:         ['traceability_complete', 'complexity_ok'],
  implementation:      ['trace_tags_present', 'misra_clean', 'complexity_ok'],
  unit_verification:   ['coverage_met', 'tests_passing'],
  integration_verify:  ['coverage_met', 'tests_passing', 'misra_clean'],
  safety_verify:       ['independent_review_done'],
  verified:            ['coverage_met', 'tests_passing', 'misra_clean', 'traceability_complete', 'trace_tags_present', 'complexity_ok', 'independent_review_done'],
  released:            [],
};

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createPhaseEnforcer(stateMachine: VModelStateMachine): PhaseEnforcer {
  return {
    canPerformAction(
      featureId: string,
      action: PhaseAction,
    ): { allowed: boolean; reason: string | null } {
      const phase = stateMachine.getPhase(featureId);

      if (phase === null) {
        return {
          allowed: false,
          reason: `Feature '${featureId}' has no active V-Model track`,
        };
      }

      const allowed = PHASE_ALLOWED_ACTIONS[phase];

      if (phase === 'released') {
        return {
          allowed: false,
          reason: `Feature '${featureId}' is released and immutable — no actions permitted`,
        };
      }

      if ((allowed as ReadonlyArray<PhaseAction>).includes(action)) {
        return { allowed: true, reason: null };
      }

      return {
        allowed: false,
        reason: `Action '${action}' is not permitted in phase '${phase}'. Permitted actions: ${allowed.length > 0 ? allowed.join(', ') : '(none)'}`,
      };
    },

    getRequiredGates(phase: VModelPhase): string[] {
      return [...PHASE_REQUIRED_GATES[phase]];
    },

    checkGateReadiness(featureId: string): { ready: boolean; missing: string[] } {
      const trackState = stateMachine.getTrackState(featureId);

      if (trackState === null) {
        return { ready: false, missing: [`Feature track '${featureId}' does not exist`] };
      }

      const required = PHASE_REQUIRED_GATES[trackState.phase];
      const gateStatus = trackState.gate_status;

      const missing = (required as ReadonlyArray<keyof PhaseGateStatus>).filter(
        (gate) => !gateStatus[gate],
      );

      return {
        ready: missing.length === 0,
        missing: [...missing],
      };
    },
  };
}
