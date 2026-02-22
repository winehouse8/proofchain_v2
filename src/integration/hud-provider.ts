/**
 * ProofChain HUD Data Provider
 *
 * Provides real-time status data for the Claude Code HUD (heads-up display).
 * Formats a one-line status summary and a multi-line dashboard for display
 * in the Claude Code interface.
 */

import type { AsilLevel, VModelPhase } from '../core/types.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface HudData {
  asil_level: AsilLevel;
  current_phase: VModelPhase;
  verification_debt: number;
  debt_ceiling: number;
  coverage_avg: { statement: number; branch: number; mcdc: number };
  active_features: number;
  misra_violations: number;
  traceability_coverage: number;
  last_verification: string | null;
}

export interface HudDataProvider {
  getData(): HudData;
  formatStatusLine(): string;
  formatDashboard(): string;
}

// ─── Debt Ceiling Map ─────────────────────────────────────────────────────────

const DEBT_CEILING_MAP: Record<AsilLevel, number> = {
  QM: 999,
  A: 20,
  B: 10,
  C: 5,
  D: 2,
};

// ─── Formatting Helpers ───────────────────────────────────────────────────────

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

function phaseAbbrev(phase: VModelPhase): string {
  const abbrevMap: Record<VModelPhase, string> = {
    requirements_spec:   'REQ',
    architecture_design: 'ARCH',
    unit_design:         'DSGN',
    implementation:      'IMPL',
    unit_verification:   'UVER',
    integration_verify:  'IVER',
    safety_verify:       'SVER',
    verified:            'VERF',
    released:            'RELD',
  };
  return abbrevMap[phase];
}

function debtBar(debt: number, ceiling: number): string {
  if (ceiling === 999) return `${debt}/inf`;
  return `${debt}/${ceiling}`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createHudProvider(config: { asilLevel: AsilLevel }): HudDataProvider {
  // Mutable internal state — updated via getData() callers
  let _data: HudData = {
    asil_level: config.asilLevel,
    current_phase: 'implementation',
    verification_debt: 0,
    debt_ceiling: DEBT_CEILING_MAP[config.asilLevel],
    coverage_avg: { statement: 0, branch: 0, mcdc: 0 },
    active_features: 0,
    misra_violations: 0,
    traceability_coverage: 0,
    last_verification: null,
  };

  return {
    getData(): HudData {
      return { ..._data };
    },

    formatStatusLine(): string {
      const d = _data;
      const covAvg = Math.round(
        (d.coverage_avg.statement + d.coverage_avg.branch + d.coverage_avg.mcdc) / 3,
      );
      const traceStr = pct(d.traceability_coverage * 100);
      const debtStr = debtBar(d.verification_debt, d.debt_ceiling);
      const misraStr = String(d.misra_violations);
      const phase = phaseAbbrev(d.current_phase);

      return `[ASIL-${d.asil_level}] ${phase} | Debt: ${debtStr} | Cov: ${pct(covAvg)} | MISRA: ${misraStr} | Trace: ${traceStr}`;
    },

    formatDashboard(): string {
      const d = _data;
      const covAvg = Math.round(
        (d.coverage_avg.statement + d.coverage_avg.branch + d.coverage_avg.mcdc) / 3,
      );
      const debtStatus = d.verification_debt >= d.debt_ceiling ? 'CEILING REACHED' : 'OK';
      const lastVer = d.last_verification ?? 'Never';

      const debtStr = debtBar(d.verification_debt, d.debt_ceiling);

      return [
        `╔══════════════════════════════════════════════════╗`,
        `║         ProofChain Safety Status Dashboard       ║`,
        `╠══════════════════════════════════════════════════╣`,
        `║  ASIL Level      : ASIL-${d.asil_level.padEnd(25)}║`,
        `║  Current Phase   : ${phaseAbbrev(d.current_phase).padEnd(30)}║`,
        `║  Active Features : ${String(d.active_features).padEnd(30)}║`,
        `╠══════════════════════════════════════════════════╣`,
        `║  Verification Debt: ${debtStr.padEnd(19)} [${debtStatus.padEnd(8)}]║`,
        `╠══════════════════════════════════════════════════╣`,
        `║  Coverage                                        ║`,
        `║    Statement : ${pct(d.coverage_avg.statement).padEnd(34)}║`,
        `║    Branch    : ${pct(d.coverage_avg.branch).padEnd(34)}║`,
        `║    MC/DC     : ${pct(d.coverage_avg.mcdc).padEnd(34)}║`,
        `║    Average   : ${pct(covAvg).padEnd(34)}║`,
        `╠══════════════════════════════════════════════════╣`,
        `║  MISRA Violations  : ${String(d.misra_violations).padEnd(28)}║`,
        `║  Traceability Cov  : ${pct(d.traceability_coverage * 100).padEnd(28)}║`,
        `║  Last Verification : ${lastVer.slice(0, 28).padEnd(28)}║`,
        `╚══════════════════════════════════════════════════╝`,
      ].join('\n');
    },
  };
}
