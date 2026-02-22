/**
 * ProofChain Phase Skill
 *
 * Skill handler for V-Model phase management commands.
 * Exposes phase status, advancement, regression, checklist, and gate-check
 * operations as formatted string output for Claude Code slash commands.
 */

import type { VModelStateMachine } from '../v-model/state-machine.js';
import type { PhaseEnforcer } from '../v-model/phase-enforcer.js';
import type { VModelPhase, PhaseGateStatus } from '../core/types.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type PhaseCommand = 'status' | 'advance' | 'set' | 'checklist' | 'gate-check';

export interface PhaseSkillDeps {
  stateMachine: VModelStateMachine;
  enforcer: PhaseEnforcer;
}

export interface PhaseSkill {
  execute(
    command: PhaseCommand,
    featureId: string,
    args?: { targetPhase?: VModelPhase; gateStatus?: PhaseGateStatus },
  ): string;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

function formatGateStatus(gate: PhaseGateStatus): string {
  const lines: string[] = [];
  const entries = Object.entries(gate) as Array<[keyof PhaseGateStatus, boolean]>;
  for (const [key, value] of entries) {
    lines.push(`  ${value ? '[PASS]' : '[FAIL]'} ${key}`);
  }
  return lines.join('\n');
}

function formatPhaseLabel(phase: VModelPhase): string {
  return phase.replace(/_/g, ' ').toUpperCase();
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createPhaseSkill(deps: PhaseSkillDeps): PhaseSkill {
  const { stateMachine, enforcer } = deps;

  return {
    execute(
      command: PhaseCommand,
      featureId: string,
      args?: { targetPhase?: VModelPhase; gateStatus?: PhaseGateStatus },
    ): string {
      switch (command) {
        case 'status': {
          const state = stateMachine.getTrackState(featureId);
          if (state === null) {
            return `[ProofChain] Feature '${featureId}' has no V-Model track. Use 'phase set' to initialize.`;
          }
          const metaStr = state.meta_states.length > 0
            ? `  Meta-states : ${state.meta_states.join(', ')}`
            : `  Meta-states : (none)`;
          const debtStr = `  Debt        : ${state.verification_debt}`;
          const enteredStr = `  Entered     : ${state.entered_at}`;
          const gateStr = formatGateStatus(state.gate_status);
          return [
            `[ProofChain] V-Model Status: ${featureId}`,
            `  Phase       : ${formatPhaseLabel(state.phase)}`,
            metaStr,
            debtStr,
            enteredStr,
            `  Gate Status :`,
            gateStr,
          ].join('\n');
        }

        case 'advance': {
          const gateStatus = args?.gateStatus;
          if (gateStatus === undefined) {
            // Check readiness without advancing
            const { ready, missing } = enforcer.checkGateReadiness(featureId);
            if (!ready) {
              return [
                `[ProofChain] Cannot advance '${featureId}': gate checks not satisfied.`,
                `  Missing: ${missing.join(', ')}`,
                `  Use 'phase gate-check ${featureId}' for full details.`,
              ].join('\n');
            }
            return `[ProofChain] Gates are ready for '${featureId}'. Provide gate status to advance.`;
          }
          const result = stateMachine.advance(featureId, gateStatus);
          if (result.success) {
            return [
              `[ProofChain] Advanced '${featureId}' to phase: ${formatPhaseLabel(result.newPhase!)}`,
              `  All gate checks passed.`,
            ].join('\n');
          }
          return `[ProofChain] Advance failed for '${featureId}': ${result.error}`;
        }

        case 'set': {
          const targetPhase = args?.targetPhase;
          if (targetPhase === undefined) {
            return `[ProofChain] Error: 'set' command requires a targetPhase argument.`;
          }
          const existing = stateMachine.getTrackState(featureId);
          if (existing === null) {
            stateMachine.createTrack(featureId, targetPhase);
            return `[ProofChain] Created track for '${featureId}' at phase: ${formatPhaseLabel(targetPhase)}`;
          }
          const result = stateMachine.regress(featureId, targetPhase, 'Manual phase set via skill');
          if (result.success) {
            return `[ProofChain] Regressed '${featureId}' to phase: ${formatPhaseLabel(targetPhase)}`;
          }
          return `[ProofChain] Set failed for '${featureId}': ${result.error}`;
        }

        case 'checklist': {
          const state = stateMachine.getTrackState(featureId);
          if (state === null) {
            return `[ProofChain] Feature '${featureId}' has no V-Model track.`;
          }
          const required = enforcer.getRequiredGates(state.phase);
          if (required.length === 0) {
            return `[ProofChain] No gate requirements for phase '${formatPhaseLabel(state.phase)}' (terminal phase).`;
          }
          const gateStatus = state.gate_status;
          const lines: string[] = [
            `[ProofChain] Checklist to advance from '${formatPhaseLabel(state.phase)}':`,
          ];
          for (const gate of required) {
            const done = gateStatus[gate as keyof PhaseGateStatus];
            lines.push(`  ${done ? '[x]' : '[ ]'} ${gate}`);
          }
          const doneCount = required.filter(g => gateStatus[g as keyof PhaseGateStatus]).length;
          lines.push(`  Progress: ${doneCount}/${required.length} gates satisfied`);
          return lines.join('\n');
        }

        case 'gate-check': {
          const state = stateMachine.getTrackState(featureId);
          if (state === null) {
            return `[ProofChain] Feature '${featureId}' has no V-Model track.`;
          }
          const { ready, missing } = enforcer.checkGateReadiness(featureId);
          const gateStr = formatGateStatus(state.gate_status);
          const verdict = ready ? 'READY TO ADVANCE' : `BLOCKED (${missing.length} gate(s) failing)`;
          const lines: string[] = [
            `[ProofChain] Gate Check: ${featureId} @ ${formatPhaseLabel(state.phase)}`,
            `  Verdict: ${verdict}`,
            `  Gate Status:`,
            gateStr,
          ];
          if (!ready) {
            lines.push(`  Failing gates: ${missing.join(', ')}`);
          }
          return lines.join('\n');
        }
      }
    },
  };
}
