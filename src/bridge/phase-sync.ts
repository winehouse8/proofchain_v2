/**
 * ProofChain Bridge — Phase Synchronization
 *
 * Reads hitl-state.json (single source of truth for phase) and maps
 * the 5-phase HITL model to the 9-phase V-Model for TS engine queries.
 * TS engine is READ-ONLY — it never writes to hitl-state.json.
 *
 * Rev.2: tc → unit_design only (architecture_design removed per Architect M2)
 */

import { readFileSync } from 'node:fs';
import type { VModelPhase } from '../core/types.js';

// ─── HITL State Types ───────────────────────────────────────────────────────

/** Phase in the 5-phase HITL model */
export type HitlPhase = 'spec' | 'tc' | 'code' | 'test' | 'verified';

/** HITL log entry */
export interface HitlLogEntry {
  timestamp: string;
  area: string;
  from: string;
  to: string;
  actor: string;
  type: string;
  note?: string;
  reason?: string;
  affected_reqs?: string[];
  skipped_phases?: string[];
  skip_reason?: string;
  /** TC IDs linked to this auto-backward entry */
  tc_ids?: string[];
  /** Source file that triggered the auto-backward */
  src_file?: string;
}

/** HITL area state */
export interface HitlArea {
  phase: HitlPhase;
  cycle: number;
  cycle_entry: string | null;
  cycle_reason: string | null;
  name?: string;
  name_ko?: string;
  spec: { file: string; status: string; req_count: number };
  tc: { file: string; baseline_count: number; supplementary_count: number };
  code: { status: string; files: string[] };
  test: { status: string; retries: Record<string, number> };
}

/** Top-level HITL state (hitl-state.json) */
export interface HitlState {
  project: {
    code: string;
    frameworks: Record<string, string>;
    paths: Record<string, string>;
  };
  areas: Record<string, HitlArea>;
  log: HitlLogEntry[];
}

// ─── Phase Mapping ──────────────────────────────────────────────────────────

/**
 * Map HITL 5-phase to V-Model 9-phase.
 *
 * Rev.2 (Architect M2): tc maps to unit_design only.
 * architecture_design, integration_verify, safety_verify are implicit
 * in the 5-phase model and require a safety argument for ISO audits.
 */
const HITL_TO_VMODEL: Readonly<Record<HitlPhase, VModelPhase>> = {
  spec: 'requirements_spec',
  tc: 'unit_design',
  code: 'implementation',
  test: 'unit_verification',
  verified: 'verified',
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Read and parse hitl-state.json from the given path.
 * Throws if the file does not exist or is invalid JSON.
 */
export function readHitlState(hitlPath: string): HitlState {
  const raw = readFileSync(hitlPath, 'utf-8');
  return JSON.parse(raw) as HitlState;
}

/**
 * Map a HITL phase to the corresponding V-Model phase.
 * Returns 'requirements_spec' for unknown phases.
 */
export function hitlPhaseToVModel(hitlPhase: HitlPhase): VModelPhase {
  return HITL_TO_VMODEL[hitlPhase] ?? 'requirements_spec';
}

/**
 * Get the ASIL level from hitl-state.json project config.
 * Falls back to 'QM' if not specified.
 */
export function getAsilFromHitl(hitlState: HitlState): string {
  const frameworks = hitlState.project.frameworks;
  return frameworks['asil'] ?? 'QM';
}

/**
 * Get all areas currently in a given HITL phase.
 */
export function getAreasInPhase(hitlState: HitlState, phase: HitlPhase): string[] {
  return Object.entries(hitlState.areas)
    .filter(([, area]) => area.phase === phase)
    .map(([key]) => key);
}

/**
 * Check if any area is in a phase that allows code modification.
 */
export function hasCodePhaseArea(hitlState: HitlState): boolean {
  return Object.values(hitlState.areas).some(
    (area) => area.phase === 'code' || area.phase === 'test',
  );
}
