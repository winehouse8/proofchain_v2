/**
 * ProofChain ASIL Profile System Tests
 *
 * Covers:
 *   - ASIL_PRESETS coverage thresholds per level (QM/A/B/C/D)
 *   - Coverage monotonicity across ASIL levels
 *   - Gate counts (TS gates and total gates)
 *   - Gate requirement flags per ASIL level
 *   - Enforcement mode per ASIL level
 *   - runTsGateChecks integration with HitlState
 *   - getDefaultConfig field correctness
 */

import { describe, it, expect } from 'vitest';
import type { AsilLevel, ProofChainConfig } from '../core/types.js';
import type { HitlState } from './phase-sync.js';

import { ASIL_PRESETS, getDefaultConfig } from '../init/asil-presets.js';
import { getTsGateCount, getTotalGateCount, runTsGateChecks } from './gate-bridge.js';
import { readHitlState, hitlPhaseToVModel } from './phase-sync.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(asil: AsilLevel): ProofChainConfig {
  return getDefaultConfig(asil);
}

const emptyHitlState: HitlState = {
  project: { code: '', frameworks: {}, paths: {} },
  areas: {},
  log: [],
};

const ALL_LEVELS: readonly AsilLevel[] = ['QM', 'A', 'B', 'C', 'D'];

// ─── Coverage Threshold Tests ─────────────────────────────────────────────────

describe('ASIL coverage thresholds', () => {
  describe('QM thresholds', () => {
    it('QM statement_coverage_min is 0.6', () => {
      expect(ASIL_PRESETS.QM.thresholds.statement_coverage_min).toBe(0.6);
    });

    it('QM branch_coverage_min is 0.5', () => {
      expect(ASIL_PRESETS.QM.thresholds.branch_coverage_min).toBe(0.5);
    });

    it('QM mcdc_coverage_min is 0.0', () => {
      expect(ASIL_PRESETS.QM.thresholds.mcdc_coverage_min).toBe(0.0);
    });

    it('QM cyclomatic_complexity_max is 20', () => {
      expect(ASIL_PRESETS.QM.thresholds.cyclomatic_complexity_max).toBe(20);
    });

    it('QM function_lines_max is 100', () => {
      expect(ASIL_PRESETS.QM.thresholds.function_lines_max).toBe(100);
    });
  });

  describe('ASIL A thresholds', () => {
    it('A statement_coverage_min is 0.7', () => {
      expect(ASIL_PRESETS.A.thresholds.statement_coverage_min).toBe(0.7);
    });

    it('A branch_coverage_min is 0.6', () => {
      expect(ASIL_PRESETS.A.thresholds.branch_coverage_min).toBe(0.6);
    });

    it('A mcdc_coverage_min is 0.5', () => {
      expect(ASIL_PRESETS.A.thresholds.mcdc_coverage_min).toBe(0.5);
    });

    it('A cyclomatic_complexity_max is 15', () => {
      expect(ASIL_PRESETS.A.thresholds.cyclomatic_complexity_max).toBe(15);
    });

    it('A function_lines_max is 75', () => {
      expect(ASIL_PRESETS.A.thresholds.function_lines_max).toBe(75);
    });
  });

  describe('ASIL B thresholds', () => {
    it('B statement_coverage_min is 0.8', () => {
      expect(ASIL_PRESETS.B.thresholds.statement_coverage_min).toBe(0.8);
    });

    it('B branch_coverage_min is 0.7', () => {
      expect(ASIL_PRESETS.B.thresholds.branch_coverage_min).toBe(0.7);
    });

    it('B mcdc_coverage_min is 0.6', () => {
      expect(ASIL_PRESETS.B.thresholds.mcdc_coverage_min).toBe(0.6);
    });

    it('B cyclomatic_complexity_max is 10', () => {
      expect(ASIL_PRESETS.B.thresholds.cyclomatic_complexity_max).toBe(10);
    });

    it('B function_lines_max is 50', () => {
      expect(ASIL_PRESETS.B.thresholds.function_lines_max).toBe(50);
    });
  });

  describe('ASIL C thresholds', () => {
    it('C statement_coverage_min is 0.9', () => {
      expect(ASIL_PRESETS.C.thresholds.statement_coverage_min).toBe(0.9);
    });

    it('C branch_coverage_min is 0.85', () => {
      expect(ASIL_PRESETS.C.thresholds.branch_coverage_min).toBe(0.85);
    });

    it('C mcdc_coverage_min is 0.8', () => {
      expect(ASIL_PRESETS.C.thresholds.mcdc_coverage_min).toBe(0.8);
    });

    it('C cyclomatic_complexity_max is 10', () => {
      expect(ASIL_PRESETS.C.thresholds.cyclomatic_complexity_max).toBe(10);
    });

    it('C function_lines_max is 50', () => {
      expect(ASIL_PRESETS.C.thresholds.function_lines_max).toBe(50);
    });
  });

  describe('ASIL D thresholds', () => {
    it('D statement_coverage_min is 0.95', () => {
      expect(ASIL_PRESETS.D.thresholds.statement_coverage_min).toBe(0.95);
    });

    it('D branch_coverage_min is 0.95', () => {
      expect(ASIL_PRESETS.D.thresholds.branch_coverage_min).toBe(0.95);
    });

    it('D mcdc_coverage_min is 0.9', () => {
      expect(ASIL_PRESETS.D.thresholds.mcdc_coverage_min).toBe(0.9);
    });

    it('D cyclomatic_complexity_max is 10', () => {
      expect(ASIL_PRESETS.D.thresholds.cyclomatic_complexity_max).toBe(10);
    });

    it('D function_lines_max is 50', () => {
      expect(ASIL_PRESETS.D.thresholds.function_lines_max).toBe(50);
    });
  });
});

// ─── Coverage Monotonicity Tests ──────────────────────────────────────────────

describe('Coverage monotonicity across ASIL levels', () => {
  it('statement_coverage_min increases with ASIL level', () => {
    const values = ALL_LEVELS.map((l) => ASIL_PRESETS[l].thresholds.statement_coverage_min);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]!);
    }
  });

  it('branch_coverage_min increases with ASIL level', () => {
    const values = ALL_LEVELS.map((l) => ASIL_PRESETS[l].thresholds.branch_coverage_min);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]!);
    }
  });

  it('mcdc_coverage_min increases with ASIL level', () => {
    const values = ALL_LEVELS.map((l) => ASIL_PRESETS[l].thresholds.mcdc_coverage_min);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]!);
    }
  });

  it('cyclomatic_complexity_max decreases or stays equal from QM to D', () => {
    const values = ALL_LEVELS.map((l) => ASIL_PRESETS[l].thresholds.cyclomatic_complexity_max);
    // QM=20, A=15, B/C/D=10 — strictly non-increasing
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]!);
    }
  });
});

// ─── Gate Count Tests ─────────────────────────────────────────────────────────

describe('TS gate counts', () => {
  it('QM has 1 TS gate (gate #15)', () => {
    expect(getTsGateCount('QM')).toBe(1);
  });

  it('A has 2 TS gates (gates #8, #15)', () => {
    expect(getTsGateCount('A')).toBe(2);
  });

  it('B has 4 TS gates (gates #8, #9, #10, #15)', () => {
    expect(getTsGateCount('B')).toBe(4);
  });

  it('C has 6 TS gates (gates #8-#12, #15)', () => {
    expect(getTsGateCount('C')).toBe(6);
  });

  it('D has 8 TS gates (gates #8-#15)', () => {
    expect(getTsGateCount('D')).toBe(8);
  });
});

describe('Total gate counts (shell + TS)', () => {
  it('QM total is 5 (4 shell + 1 TS)', () => {
    expect(getTotalGateCount('QM')).toBe(5);
  });

  it('A total is 9 (7 shell + 2 TS)', () => {
    expect(getTotalGateCount('A')).toBe(9);
  });

  it('B total is 11 (7 shell + 4 TS)', () => {
    expect(getTotalGateCount('B')).toBe(11);
  });

  it('C total is 13 (7 shell + 6 TS)', () => {
    expect(getTotalGateCount('C')).toBe(13);
  });

  it('D total is 15 (7 shell + 8 TS)', () => {
    expect(getTotalGateCount('D')).toBe(15);
  });
});

// ─── Gate Requirement Tests ───────────────────────────────────────────────────

describe('Gate requirement flags per ASIL level', () => {
  it('QM: all gate requirements are false', () => {
    const gates = ASIL_PRESETS.QM.gates;
    expect(gates.require_traceability_tag).toBe(false);
    expect(gates.require_test_before_commit).toBe(false);
    expect(gates.require_independent_review).toBe(false);
    expect(gates.require_change_impact_analysis).toBe(false);
    expect(gates.require_safety_doc).toBe(false);
  });

  it('A: traceability and test_before_commit are true; others false', () => {
    const gates = ASIL_PRESETS.A.gates;
    expect(gates.require_traceability_tag).toBe(true);
    expect(gates.require_test_before_commit).toBe(true);
    expect(gates.require_independent_review).toBe(false);
    expect(gates.require_change_impact_analysis).toBe(false);
    expect(gates.require_safety_doc).toBe(false);
  });

  it('B: adds change_impact_analysis but NOT independent_review', () => {
    const gates = ASIL_PRESETS.B.gates;
    expect(gates.require_traceability_tag).toBe(true);
    expect(gates.require_test_before_commit).toBe(true);
    expect(gates.require_change_impact_analysis).toBe(true);
    expect(gates.require_independent_review).toBe(false);
    expect(gates.require_safety_doc).toBe(false);
  });

  it('C: independent_review and safety_doc both become true', () => {
    const gates = ASIL_PRESETS.C.gates;
    expect(gates.require_traceability_tag).toBe(true);
    expect(gates.require_test_before_commit).toBe(true);
    expect(gates.require_independent_review).toBe(true);
    expect(gates.require_change_impact_analysis).toBe(true);
    expect(gates.require_safety_doc).toBe(true);
  });

  it('D: all five gate requirements are true', () => {
    const gates = ASIL_PRESETS.D.gates;
    expect(gates.require_traceability_tag).toBe(true);
    expect(gates.require_test_before_commit).toBe(true);
    expect(gates.require_independent_review).toBe(true);
    expect(gates.require_change_impact_analysis).toBe(true);
    expect(gates.require_safety_doc).toBe(true);
  });
});

// ─── Enforcement Mode Tests ───────────────────────────────────────────────────

describe('Enforcement mode per ASIL level', () => {
  it('QM getDefaultConfig returns info enforcement', () => {
    expect(getDefaultConfig('QM').enforcement_mode).toBe('info');
  });

  it('A getDefaultConfig returns strict enforcement', () => {
    expect(getDefaultConfig('A').enforcement_mode).toBe('strict');
  });

  it('B getDefaultConfig returns strict enforcement', () => {
    expect(getDefaultConfig('B').enforcement_mode).toBe('strict');
  });

  it('C getDefaultConfig returns strict enforcement', () => {
    expect(getDefaultConfig('C').enforcement_mode).toBe('strict');
  });

  it('D getDefaultConfig returns strict enforcement', () => {
    expect(getDefaultConfig('D').enforcement_mode).toBe('strict');
  });
});

// ─── runTsGateChecks Integration Tests ───────────────────────────────────────

describe('runTsGateChecks integration', () => {
  it('QM: runTsGateChecks returns 1 total check (gate #15)', () => {
    const config = makeConfig('QM');
    const summary = runTsGateChecks(config, emptyHitlState, '');
    expect(summary.total_checks).toBe(1);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]?.gate_id).toBe(15);
    expect(summary.all_passed).toBe(true);
  });

  it('A: runTsGateChecks returns 2 checks (gates #8, #15)', () => {
    // Use info enforcement so gate #8 passes, allowing us to test count only
    const config: ProofChainConfig = { ...makeConfig('A'), enforcement_mode: 'info' };
    const summary = runTsGateChecks(config, emptyHitlState, '');
    expect(summary.total_checks).toBe(2);
    expect(summary.results[0]?.gate_id).toBe(8);
  });

  it('D: runTsGateChecks returns 8 checks', () => {
    const config: ProofChainConfig = { ...makeConfig('D'), enforcement_mode: 'info' };
    const summary = runTsGateChecks(config, emptyHitlState, '');
    expect(summary.total_checks).toBe(8);
  });

  it('Gate filtering: QM runs gate #15 only, B runs gates with asil_min <= B', () => {
    const configQM = makeConfig('QM');
    const configB: ProofChainConfig = { ...makeConfig('B'), enforcement_mode: 'info' };

    const summaryQM = runTsGateChecks(configQM, emptyHitlState, '');
    const summaryB = runTsGateChecks(configB, emptyHitlState, '');

    // QM: gate #15 only
    expect(summaryQM.total_checks).toBe(1);
    expect(summaryQM.results[0]?.gate_id).toBe(15);
    // B: gates #8, #9, #10, #15 (asil_min A, B, B, QM)
    expect(summaryB.total_checks).toBe(4);
    const ids = summaryB.results.map((r) => r.gate_id);
    expect(ids).toContain(8);
    expect(ids).toContain(9);
    expect(ids).toContain(10);
    expect(ids).toContain(15);
    // Gate #11 (asil_min C) must NOT be present at B
    expect(ids).not.toContain(11);
  });

  it('summary.passed + summary.failed equals summary.total_checks for each ASIL', () => {
    for (const level of ALL_LEVELS) {
      const config: ProofChainConfig = { ...makeConfig(level), enforcement_mode: 'info' };
      const summary = runTsGateChecks(config, emptyHitlState, '');
      expect(summary.passed + summary.failed).toBe(summary.total_checks);
    }
  });

  it('gate #8 fails under strict + C language (MISRA gate placeholder logic)', () => {
    const config: ProofChainConfig = {
      ...makeConfig('A'),
      enforcement_mode: 'strict',
      language: 'c',
    };
    const summary = runTsGateChecks(config, emptyHitlState, '');
    const gate8 = summary.results.find((r) => r.gate_id === 8);
    expect(gate8?.passed).toBe(false);
  });

  it('gate #8 passes in non-strict mode regardless of language', () => {
    const config: ProofChainConfig = {
      ...makeConfig('A'),
      enforcement_mode: 'info',
      language: 'c',
    };
    const summary = runTsGateChecks(config, emptyHitlState, '');
    const gate8 = summary.results.find((r) => r.gate_id === 8);
    expect(gate8?.passed).toBe(true);
  });
});

// ─── getDefaultConfig Tests ───────────────────────────────────────────────────

describe('getDefaultConfig', () => {
  it('each ASIL level returns the correct asil_level field', () => {
    for (const level of ALL_LEVELS) {
      expect(getDefaultConfig(level).asil_level).toBe(level);
    }
  });

  it('language defaults to c when not specified', () => {
    for (const level of ALL_LEVELS) {
      expect(getDefaultConfig(level).language).toBe('c');
    }
  });

  it('C++ language returns misra-cpp-2008 coding standard', () => {
    for (const level of ALL_LEVELS) {
      const config = getDefaultConfig(level, 'cpp');
      expect(config.coding_standard).toBe('misra-cpp-2008');
    }
  });

  it('C language (default) returns misra-c-2012 coding standard', () => {
    for (const level of ALL_LEVELS) {
      const config = getDefaultConfig(level);
      expect(config.coding_standard).toBe('misra-c-2012');
    }
  });

  it('thresholds in getDefaultConfig match ASIL_PRESETS for each level', () => {
    for (const level of ALL_LEVELS) {
      const config = getDefaultConfig(level);
      expect(config.thresholds).toEqual(ASIL_PRESETS[level].thresholds);
    }
  });

  it('gates in getDefaultConfig match ASIL_PRESETS for each level', () => {
    for (const level of ALL_LEVELS) {
      const config = getDefaultConfig(level);
      expect(config.gates).toEqual(ASIL_PRESETS[level].gates);
    }
  });
});

// ─── hitlPhaseToVModel (from phase-sync) ──────────────────────────────────────

describe('hitlPhaseToVModel', () => {
  it('maps spec to requirements_spec', () => {
    expect(hitlPhaseToVModel('spec')).toBe('requirements_spec');
  });

  it('maps tc to unit_design', () => {
    expect(hitlPhaseToVModel('tc')).toBe('unit_design');
  });

  it('maps code to implementation', () => {
    expect(hitlPhaseToVModel('code')).toBe('implementation');
  });

  it('maps test to unit_verification', () => {
    expect(hitlPhaseToVModel('test')).toBe('unit_verification');
  });

  it('maps verified to verified', () => {
    expect(hitlPhaseToVModel('verified')).toBe('verified');
  });
});
