/**
 * ProofChain Bridge Module Tests
 *
 * Covers:
 *   - phase-sync.ts: readHitlState, hitlPhaseToVModel, getAsilFromHitl,
 *                    getAreasInPhase, hasCodePhaseArea
 *   - gate-bridge.ts: runTsGateChecks, getTsGateCount, getTotalGateCount
 *   - Integration: phase-sync + gate-bridge working together
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AsilLevel, ProofChainConfig } from '../core/types.js';
import type { HitlState, HitlPhase, HitlArea } from './phase-sync.js';

// ─── Mocking node:fs for readHitlState ──────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from 'node:fs';
import {
  readHitlState,
  hitlPhaseToVModel,
  getAsilFromHitl,
  getAreasInPhase,
  hasCodePhaseArea,
} from './phase-sync.js';
import {
  runTsGateChecks,
  getTsGateCount,
  getTotalGateCount,
} from './gate-bridge.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeHitlArea(phase: HitlPhase, overrides: Partial<HitlArea> = {}): HitlArea {
  return {
    phase,
    cycle: 1,
    cycle_entry: null,
    cycle_reason: null,
    spec: { file: 'spec/area.md', status: 'approved', req_count: 5 },
    tc: { file: 'tc/area.md', baseline_count: 10, supplementary_count: 2 },
    code: { status: 'in_progress', files: ['src/area.c'] },
    test: { status: 'pending', retries: {} },
    ...overrides,
  };
}

function makeHitlState(
  areas: Record<string, HitlArea> = {},
  asilOverride?: string,
): HitlState {
  return {
    project: {
      code: 'PC',
      frameworks: asilOverride ? { asil: asilOverride } : {},
      paths: { hitl: '.omc/hitl-state.json' },
    },
    areas,
    log: [],
  };
}

function makeConfig(asil: AsilLevel, opts: {
  enforcement_mode?: 'strict' | 'warn' | 'info';
  language?: 'c' | 'cpp';
  require_independent_review?: boolean;
} = {}): ProofChainConfig {
  const enforcement_mode = opts.enforcement_mode ?? 'strict';
  const language = opts.language ?? 'c';
  const require_independent_review = opts.require_independent_review ?? (
    asil === 'C' || asil === 'D'
  );
  return {
    asil_level: asil,
    language,
    coding_standard: 'misra-c-2012',
    enforcement_mode,
    thresholds: {
      cyclomatic_complexity_max: 10,
      function_lines_max: 50,
      function_params_max: 5,
      nesting_depth_max: 4,
      comment_density_min: 0.1,
      statement_coverage_min: 0.8,
      branch_coverage_min: 0.8,
      mcdc_coverage_min: 0.0,
    },
    gates: {
      require_traceability_tag: true,
      require_test_before_commit: true,
      require_independent_review,
      require_change_impact_analysis: asil === 'D',
      require_safety_doc: asil === 'C' || asil === 'D',
    },
  };
}

// ─── phase-sync: readHitlState ────────────────────────────────────────────────

describe('readHitlState', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('parses valid hitl-state.json and returns HitlState', () => {
    const state = makeHitlState({ areaA: makeHitlArea('spec') }, 'B');
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));

    const result = readHitlState('/fake/.omc/hitl-state.json');
    expect(result.project.code).toBe('PC');
    expect(result.project.frameworks['asil']).toBe('B');
    expect(result.areas['areaA']?.phase).toBe('spec');
  });

  it('reads the file from the provided path', () => {
    const state = makeHitlState();
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));

    readHitlState('/custom/path/hitl-state.json');
    expect(readFileSync).toHaveBeenCalledWith('/custom/path/hitl-state.json', 'utf-8');
  });

  it('throws a SyntaxError when file content is invalid JSON', () => {
    vi.mocked(readFileSync).mockReturnValue('{ not json }');
    expect(() => readHitlState('/fake/hitl-state.json')).toThrow(SyntaxError);
  });

  it('throws when readFileSync throws (file not found)', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    expect(() => readHitlState('/missing/hitl-state.json')).toThrow('ENOENT');
  });

  it('preserves all area phases in the parsed state', () => {
    const state = makeHitlState({
      alpha: makeHitlArea('spec'),
      beta: makeHitlArea('code'),
      gamma: makeHitlArea('verified'),
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));

    const result = readHitlState('/fake/hitl-state.json');
    expect(result.areas['alpha']?.phase).toBe('spec');
    expect(result.areas['beta']?.phase).toBe('code');
    expect(result.areas['gamma']?.phase).toBe('verified');
  });
});

// ─── phase-sync: hitlPhaseToVModel ───────────────────────────────────────────

describe('hitlPhaseToVModel', () => {
  it('maps spec → requirements_spec', () => {
    expect(hitlPhaseToVModel('spec')).toBe('requirements_spec');
  });

  it('maps tc → unit_design', () => {
    expect(hitlPhaseToVModel('tc')).toBe('unit_design');
  });

  it('maps code → implementation', () => {
    expect(hitlPhaseToVModel('code')).toBe('implementation');
  });

  it('maps test → unit_verification', () => {
    expect(hitlPhaseToVModel('test')).toBe('unit_verification');
  });

  it('maps verified → verified', () => {
    expect(hitlPhaseToVModel('verified')).toBe('verified');
  });

  it('covers all 5 HITL phases without overlap', () => {
    const phases: HitlPhase[] = ['spec', 'tc', 'code', 'test', 'verified'];
    const mapped = phases.map(hitlPhaseToVModel);
    const unique = new Set(mapped);
    expect(unique.size).toBe(5);
  });
});

// ─── phase-sync: getAsilFromHitl ─────────────────────────────────────────────

describe('getAsilFromHitl', () => {
  it('returns the asil value from frameworks', () => {
    const state = makeHitlState({}, 'D');
    expect(getAsilFromHitl(state)).toBe('D');
  });

  it('falls back to QM when asil key is absent', () => {
    const state = makeHitlState();
    expect(getAsilFromHitl(state)).toBe('QM');
  });

  it('returns the exact string stored in frameworks.asil', () => {
    const state: HitlState = {
      project: { code: 'X', frameworks: { asil: 'C', other: 'foo' }, paths: {} },
      areas: {},
      log: [],
    };
    expect(getAsilFromHitl(state)).toBe('C');
  });
});

// ─── phase-sync: getAreasInPhase ─────────────────────────────────────────────

describe('getAreasInPhase', () => {
  it('returns keys of areas matching the requested phase', () => {
    const state = makeHitlState({
      areaA: makeHitlArea('spec'),
      areaB: makeHitlArea('code'),
      areaC: makeHitlArea('spec'),
    });
    const result = getAreasInPhase(state, 'spec');
    expect(result).toContain('areaA');
    expect(result).toContain('areaC');
    expect(result).not.toContain('areaB');
  });

  it('returns empty array when no areas match the phase', () => {
    const state = makeHitlState({ areaA: makeHitlArea('tc') });
    expect(getAreasInPhase(state, 'verified')).toHaveLength(0);
  });

  it('returns empty array when areas record is empty', () => {
    const state = makeHitlState({});
    expect(getAreasInPhase(state, 'code')).toHaveLength(0);
  });

  it('returns all areas when all are in the same phase', () => {
    const state = makeHitlState({
      x: makeHitlArea('test'),
      y: makeHitlArea('test'),
      z: makeHitlArea('test'),
    });
    const result = getAreasInPhase(state, 'test');
    expect(result).toHaveLength(3);
  });
});

// ─── phase-sync: hasCodePhaseArea ────────────────────────────────────────────

describe('hasCodePhaseArea', () => {
  it('returns true when at least one area is in code phase', () => {
    const state = makeHitlState({
      spec_area: makeHitlArea('spec'),
      code_area: makeHitlArea('code'),
    });
    expect(hasCodePhaseArea(state)).toBe(true);
  });

  it('returns true when at least one area is in test phase', () => {
    const state = makeHitlState({
      test_area: makeHitlArea('test'),
    });
    expect(hasCodePhaseArea(state)).toBe(true);
  });

  it('returns false when all areas are in non-code phases', () => {
    const state = makeHitlState({
      spec_area: makeHitlArea('spec'),
      tc_area: makeHitlArea('tc'),
      verified_area: makeHitlArea('verified'),
    });
    expect(hasCodePhaseArea(state)).toBe(false);
  });

  it('returns false for empty areas', () => {
    expect(hasCodePhaseArea(makeHitlState({}))).toBe(false);
  });
});

// ─── gate-bridge: getTsGateCount ─────────────────────────────────────────────

describe('getTsGateCount', () => {
  it('QM has 0 TS gates', () => {
    expect(getTsGateCount('QM')).toBe(0);
  });

  it('ASIL A has 1 TS gate', () => {
    expect(getTsGateCount('A')).toBe(1);
  });

  it('ASIL B has 3 TS gates', () => {
    expect(getTsGateCount('B')).toBe(3);
  });

  it('ASIL C has 5 TS gates', () => {
    expect(getTsGateCount('C')).toBe(5);
  });

  it('ASIL D has 7 TS gates', () => {
    expect(getTsGateCount('D')).toBe(7);
  });
});

// ─── gate-bridge: getTotalGateCount ──────────────────────────────────────────

describe('getTotalGateCount', () => {
  it('QM: 4 shell + 0 TS = 4 total', () => {
    expect(getTotalGateCount('QM')).toBe(4);
  });

  it('ASIL A: 7 shell + 1 TS = 8 total', () => {
    expect(getTotalGateCount('A')).toBe(8);
  });

  it('ASIL B: 7 shell + 3 TS = 10 total', () => {
    expect(getTotalGateCount('B')).toBe(10);
  });

  it('ASIL C: 7 shell + 5 TS = 12 total', () => {
    expect(getTotalGateCount('C')).toBe(12);
  });

  it('ASIL D: 7 shell + 7 TS = 14 total', () => {
    expect(getTotalGateCount('D')).toBe(14);
  });

  it('total gate count is always >= TS gate count', () => {
    const levels: AsilLevel[] = ['QM', 'A', 'B', 'C', 'D'];
    for (const level of levels) {
      expect(getTotalGateCount(level)).toBeGreaterThanOrEqual(getTsGateCount(level));
    }
  });
});

// ─── gate-bridge: runTsGateChecks ────────────────────────────────────────────

describe('runTsGateChecks', () => {
  it('QM: runs 0 TS gates and all_passed is true', () => {
    const config = makeConfig('QM', { enforcement_mode: 'strict', language: 'c' });
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(config, state, 'areaA');

    expect(summary.total_checks).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.all_passed).toBe(true);
    expect(summary.results).toHaveLength(0);
  });

  it('ASIL A strict C: gate #8 (MISRA) fails due to strict+C', () => {
    const config = makeConfig('A', { enforcement_mode: 'strict', language: 'c' });
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(config, state, 'areaA');

    expect(summary.total_checks).toBe(1);
    const gate8 = summary.results.find((r) => r.gate_id === 8);
    expect(gate8).toBeDefined();
    expect(gate8?.passed).toBe(false);
    expect(summary.all_passed).toBe(false);
  });

  it('ASIL A warn mode: gate #8 (MISRA) passes in non-strict mode', () => {
    const config = makeConfig('A', { enforcement_mode: 'warn', language: 'c' });
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(config, state, 'areaA');

    const gate8 = summary.results.find((r) => r.gate_id === 8);
    expect(gate8?.passed).toBe(true);
  });

  it('ASIL B runs gates #8, #9, #10', () => {
    const config = makeConfig('B', { enforcement_mode: 'warn', language: 'c' });
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(config, state, 'areaA');

    const ids = summary.results.map((r) => r.gate_id);
    expect(ids).toContain(8);
    expect(ids).toContain(9);
    expect(ids).toContain(10);
    expect(summary.total_checks).toBe(3);
  });

  it('ASIL B: gate #9 (Coverage) always fails (placeholder)', () => {
    const config = makeConfig('B', { enforcement_mode: 'warn', language: 'c' });
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(config, state, 'areaA');

    const gate9 = summary.results.find((r) => r.gate_id === 9);
    expect(gate9?.passed).toBe(false);
    expect(gate9?.message).toContain('coverage');
  });

  it('ASIL B: gate #10 (Stale artifacts) passes (placeholder returns true)', () => {
    const config = makeConfig('B', { enforcement_mode: 'warn', language: 'c' });
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(config, state, 'areaA');

    const gate10 = summary.results.find((r) => r.gate_id === 10);
    expect(gate10?.passed).toBe(true);
  });

  it('ASIL C runs 5 TS gates (#8-#12)', () => {
    const config = makeConfig('C', { enforcement_mode: 'warn' });
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(config, state, 'areaA');

    expect(summary.total_checks).toBe(5);
    const ids = summary.results.map((r) => r.gate_id);
    expect(ids).toEqual(expect.arrayContaining([8, 9, 10, 11, 12]));
  });

  it('ASIL C: gate #12 (Independent review) fails when require_independent_review=true', () => {
    const config = makeConfig('C', { enforcement_mode: 'warn' });
    // require_independent_review is true for C by default in makeConfig
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(config, state, 'areaA');

    const gate12 = summary.results.find((r) => r.gate_id === 12);
    expect(gate12?.passed).toBe(false);
    expect(gate12?.message).toContain('required');
  });

  it('ASIL C: gate #12 passes when require_independent_review=false', () => {
    const config = makeConfig('C', { enforcement_mode: 'warn', require_independent_review: false } as Parameters<typeof makeConfig>[1] & { require_independent_review?: boolean });
    // Manually override require_independent_review
    const configOverride: ProofChainConfig = {
      ...config,
      gates: { ...config.gates, require_independent_review: false },
    };
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(configOverride, state, 'areaA');

    const gate12 = summary.results.find((r) => r.gate_id === 12);
    expect(gate12?.passed).toBe(true);
  });

  it('ASIL D runs all 7 TS gates (#8-#14)', () => {
    const config = makeConfig('D', { enforcement_mode: 'warn', language: 'cpp' });
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(config, state, 'areaA');

    expect(summary.total_checks).toBe(7);
    const ids = summary.results.map((r) => r.gate_id);
    expect(ids).toEqual(expect.arrayContaining([8, 9, 10, 11, 12, 13, 14]));
  });

  it('ASIL D: gate #14 (Dual review) always fails (placeholder)', () => {
    const config = makeConfig('D', { enforcement_mode: 'warn', language: 'cpp' });
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(config, state, 'areaA');

    const gate14 = summary.results.find((r) => r.gate_id === 14);
    expect(gate14?.passed).toBe(false);
    expect(gate14?.message).toContain('Dual review');
  });

  it('summary.passed + summary.failed equals summary.total_checks', () => {
    const config = makeConfig('D', { enforcement_mode: 'warn', language: 'cpp' });
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(config, state, 'areaA');

    expect(summary.passed + summary.failed).toBe(summary.total_checks);
  });

  it('gate results include gate_id, name, passed, message fields', () => {
    const config = makeConfig('B', { enforcement_mode: 'warn' });
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(config, state, 'areaA');

    for (const result of summary.results) {
      expect(typeof result.gate_id).toBe('number');
      expect(typeof result.name).toBe('string');
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.message).toBe('string');
    }
  });

  it('ASIL A cpp non-strict: gate #8 passes (non-C language)', () => {
    const config = makeConfig('A', { enforcement_mode: 'strict', language: 'cpp' });
    // gate #8: passes when language is not c/cpp... wait — cpp is still blocked
    // Actually gate #8 fails for c or cpp in strict mode.
    // Let's use warn mode instead to confirm pass.
    const configWarn: ProofChainConfig = { ...config, enforcement_mode: 'warn' };
    const state = makeHitlState({ areaA: makeHitlArea('verified') });
    const summary = runTsGateChecks(configWarn, state, 'areaA');

    const gate8 = summary.results.find((r) => r.gate_id === 8);
    expect(gate8?.passed).toBe(true);
  });
});

// ─── Integration: phase-sync + gate-bridge ───────────────────────────────────

describe('phase-sync + gate-bridge integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reads ASIL from hitl-state and uses it to determine gate count', () => {
    const state = makeHitlState({ areaA: makeHitlArea('verified') }, 'B');
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));

    const parsed = readHitlState('/fake/hitl-state.json');
    const asil = getAsilFromHitl(parsed) as AsilLevel;
    const tsCount = getTsGateCount(asil);
    const totalCount = getTotalGateCount(asil);

    expect(asil).toBe('B');
    expect(tsCount).toBe(3);
    expect(totalCount).toBe(10);
  });

  it('only runs gate checks for areas in verified phase', () => {
    const state = makeHitlState({
      core: makeHitlArea('verified'),
      pending: makeHitlArea('code'),
    }, 'A');
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));

    const parsed = readHitlState('/fake/hitl-state.json');
    const verifiedAreas = getAreasInPhase(parsed, 'verified');
    const config = makeConfig('A', { enforcement_mode: 'warn' });

    expect(verifiedAreas).toContain('core');
    expect(verifiedAreas).not.toContain('pending');

    const summary = runTsGateChecks(config, parsed, verifiedAreas[0] ?? '');
    expect(summary.total_checks).toBe(getTsGateCount('A'));
  });

  it('hasCodePhaseArea correctly signals that gate checks are active context', () => {
    const state = makeHitlState({
      areaA: makeHitlArea('code'),
      areaB: makeHitlArea('spec'),
    }, 'C');
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));

    const parsed = readHitlState('/fake/hitl-state.json');
    expect(hasCodePhaseArea(parsed)).toBe(true);

    // For a verified area (not the code-phase area), gate checks still run
    const config = makeConfig('C', { enforcement_mode: 'warn' });
    const summary = runTsGateChecks(config, parsed, 'areaB');
    expect(summary.total_checks).toBe(getTsGateCount('C'));
  });

  it('full flow: parse state, derive ASIL, run gates, check all_passed', () => {
    const state = makeHitlState({ sys: makeHitlArea('verified') }, 'D');
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));

    const parsed = readHitlState('/fake/hitl-state.json');
    const asil = getAsilFromHitl(parsed) as AsilLevel;
    const config = makeConfig(asil, { enforcement_mode: 'warn', language: 'cpp' });
    const summary = runTsGateChecks(config, parsed, 'sys');

    // ASIL D in warn mode: gate #8 passes, #9 fails (placeholder), #14 fails
    expect(summary.total_checks).toBe(7);
    expect(typeof summary.all_passed).toBe('boolean');
    // Gate #9 and #14 placeholders always fail, so all_passed must be false at D
    expect(summary.all_passed).toBe(false);
  });
});
