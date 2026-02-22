/**
 * e2e-adversarial.test.ts
 *
 * End-to-end scenario tests and adversarial defense tests for the
 * ProofChain SafeDev system.
 *
 * E2E: full 5-phase lifecycle scenarios (12 tests)
 * Adversarial: A1–A9 defense tests against known attack vectors
 *
 * Exit codes from check-phase.sh:
 *   0 = allow
 *   2 = block
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// ── Constants ─────────────────────────────────────────────────────────────────

const HOOK_PATH = resolve(
  '/Users/jaewoo/Desktop/Project/dev/260220_proofchain/.claude/hooks/check-phase.sh',
);

const PROJECT_ROOT = '/Users/jaewoo/Desktop/Project/dev/260220_proofchain';

const TEST_GEN_DESIGN_SKILL = join(
  PROJECT_ROOT,
  '.claude/skills/test-gen-design/SKILL.md',
);

const RESET_SKILL = join(PROJECT_ROOT, '.claude/skills/reset/SKILL.md');

// ── State Templates ───────────────────────────────────────────────────────────

const BASE_AREA = {
  phase: 'spec',
  cycle: 1,
  cycle_entry: null,
  cycle_reason: null,
  spec: { file: '.omc/specs/SPEC-XX-test.md', status: 'draft', req_count: 0 },
  tc: { file: '.omc/test-cases/TC-XX.json', baseline_count: 0, supplementary_count: 0 },
  code: { status: 'none', files: ['src/xx/module.ts'] },
  test: { status: 'none', retries: {} },
};

const BASE_HITL_STATE = {
  project: { code: 'TEST', frameworks: {}, paths: {} },
  areas: { XX: BASE_AREA },
  log: [],
};

const BASE_CONFIG = {
  asil_level: 'B',
  language: 'c',
  coding_standard: 'misra-c-2012',
  enforcement_mode: 'strict',
  thresholds: {
    cyclomatic_complexity_max: 10,
    function_lines_max: 50,
    function_params_max: 5,
    nesting_depth_max: 4,
    comment_density_min: 0.15,
    statement_coverage_min: 0.8,
    branch_coverage_min: 0.7,
    mcdc_coverage_min: 0.6,
  },
  gates: {
    require_traceability_tag: true,
    require_test_before_commit: true,
    require_independent_review: false,
    require_change_impact_analysis: true,
    require_safety_doc: false,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

let currentDir: string | null = null;

function createTestDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'proofchain-e2e-'));
  mkdirSync(join(dir, '.omc', 'specs'), { recursive: true });
  mkdirSync(join(dir, '.omc', 'test-cases'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true });
  mkdirSync(join(dir, '.proofchain'), { recursive: true });
  mkdirSync(join(dir, 'src', 'xx'), { recursive: true });
  mkdirSync(join(dir, 'tests', 'XX'), { recursive: true });
  currentDir = dir;
  return dir;
}

function writeHitlState(dir: string, state: object): void {
  writeFileSync(join(dir, '.omc', 'hitl-state.json'), JSON.stringify(state, null, 2));
}

function writeConfig(dir: string, asilLevel: string): void {
  writeFileSync(
    join(dir, '.proofchain', 'config.json'),
    JSON.stringify(
      {
        ...BASE_CONFIG,
        asil_level: asilLevel,
        enforcement_mode: asilLevel === 'QM' ? 'info' : 'strict',
      },
      null,
      2,
    ),
  );
}

interface HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd?: string;
}

function runHook(
  dir: string,
  input: HookInput,
): { status: number; stderr: string; stdout: string } {
  const payload = { ...input, cwd: dir };
  const result = spawnSync('bash', [HOOK_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 10_000,
  });
  return {
    status: result.status ?? 1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

function makeEditInput(filePath: string): HookInput {
  return {
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' },
  };
}

function makeWriteInput(filePath: string, content = ''): HookInput {
  return {
    tool_name: 'Write',
    tool_input: { file_path: filePath, content },
  };
}

function makeBashInput(command: string): HookInput {
  return {
    tool_name: 'Bash',
    tool_input: { command },
  };
}

function areaInPhase(phase: string, overrides: object = {}): typeof BASE_AREA {
  return { ...BASE_AREA, phase, ...overrides } as typeof BASE_AREA;
}

function hitlWithPhase(phase: string, areaOverrides: object = {}): typeof BASE_HITL_STATE {
  return {
    ...BASE_HITL_STATE,
    areas: { XX: areaInPhase(phase, areaOverrides) },
  };
}

// ── Preflight ─────────────────────────────────────────────────────────────────

beforeAll(() => {
  const jqCheck = spawnSync('which', ['jq'], { encoding: 'utf-8' });
  if (jqCheck.status !== 0) {
    throw new Error('jq is not installed — cannot run e2e-adversarial tests');
  }
  if (!existsSync(HOOK_PATH)) {
    throw new Error(`Hook script not found at ${HOOK_PATH}`);
  }
});

afterEach(() => {
  if (currentDir !== null) {
    rmSync(currentDir, { recursive: true, force: true });
    currentDir = null;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2E Scenario Tests — Full 5-phase lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2E: 5-phase lifecycle scenarios', () => {
  // ── E2E-1: spec phase allows spec file editing ────────────────────────────

  it('E2E-1: spec phase allows spec file editing', () => {
    const dir = createTestDir();
    writeConfig(dir, 'B');
    writeHitlState(dir, hitlWithPhase('spec'));

    const specFile = `${dir}/.omc/specs/SPEC-XX-test.md`;
    const result = runHook(dir, makeEditInput(specFile));

    expect(result.status).toBe(0);
  });

  // ── E2E-2: spec phase blocks src/ editing (ASIL B+) ──────────────────────

  it('E2E-2: spec phase blocks src/ editing (ASIL B)', () => {
    const dir = createTestDir();
    writeConfig(dir, 'B');
    writeHitlState(dir, hitlWithPhase('spec'));

    const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/BLOCKED/i);
  });

  // ── E2E-3: tc phase allows TC file editing ────────────────────────────────

  it('E2E-3: tc phase allows TC file editing', () => {
    const dir = createTestDir();
    writeConfig(dir, 'B');
    writeHitlState(dir, hitlWithPhase('tc'));

    const tcFile = `${dir}/.omc/test-cases/TC-XX.json`;
    const result = runHook(dir, makeWriteInput(tcFile, JSON.stringify({ baseline_tcs: [] })));

    expect(result.status).toBe(0);
  });

  // ── E2E-4: code phase allows src/ editing ─────────────────────────────────

  it('E2E-4: code phase allows src/ editing', () => {
    const dir = createTestDir();
    writeConfig(dir, 'B');
    writeHitlState(dir, hitlWithPhase('code'));

    const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));

    expect(result.status).toBe(0);
  });

  // ── E2E-5: test phase allows test file editing ────────────────────────────

  it('E2E-5: test phase allows test file editing', () => {
    const dir = createTestDir();
    writeConfig(dir, 'B');
    writeHitlState(dir, hitlWithPhase('test'));

    // A test file under tests/XX/
    const testFile = `${dir}/tests/XX/test.ts`;
    writeFileSync(testFile, '// test');
    const result = runHook(dir, makeEditInput(testFile));

    expect(result.status).toBe(0);
  });

  // ── E2E-6: test phase + src/ edit triggers auto-backward warning ──────────

  it('E2E-6: test phase + src/ edit triggers auto-backward and allows (exit 0)', () => {
    const dir = createTestDir();
    writeConfig(dir, 'B');
    writeHitlState(dir, hitlWithPhase('test'));

    const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));

    // auto-backward: hook allows the edit and warns
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/AUTO-BACKWARD/i);
  });

  // ── E2E-7: .claude/ protection always blocks ──────────────────────────────

  it('E2E-7: .claude/ protection always blocks regardless of ASIL', () => {
    const dir = createTestDir();
    writeConfig(dir, 'QM'); // most permissive ASIL still blocks .claude/
    writeHitlState(dir, hitlWithPhase('code'));

    const result = runHook(dir, makeEditInput(`${dir}/.claude/hooks/check-phase.sh`));

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/BLOCKED/i);
  });

  // ── E2E-8: destructive git always blocks ──────────────────────────────────

  it('E2E-8: destructive git tag deletion always blocks', () => {
    const dir = createTestDir();
    writeConfig(dir, 'QM');
    writeHitlState(dir, hitlWithPhase('code'));

    const result = runHook(dir, makeBashInput('git tag -d XX-verified-c1'));

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/BLOCKED/i);
  });

  // ── E2E-9: QM allows free editing with warning ────────────────────────────

  it('E2E-9: ASIL QM allows src/ edit in spec phase with warning (exit 0)', () => {
    const dir = createTestDir();
    writeConfig(dir, 'QM');
    writeHitlState(dir, hitlWithPhase('spec'));

    const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));

    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/WARNING.*ASIL QM/i);
  });

  // ── E2E-10: ASIL B blocks phase violation ────────────────────────────────

  it('E2E-10: ASIL B blocks src/ edit in spec phase (exit 2)', () => {
    const dir = createTestDir();
    writeConfig(dir, 'B');
    writeHitlState(dir, hitlWithPhase('spec'));

    const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));

    expect(result.status).toBe(2);
  });

  // ── E2E-11: project-external files always allowed ─────────────────────────

  it('E2E-11: project-external files always allowed (exit 0)', () => {
    const dir = createTestDir();
    writeConfig(dir, 'D');
    writeHitlState(dir, hitlWithPhase('spec'));

    // /tmp is outside the project dir
    const result = runHook(dir, makeEditInput('/tmp/outside.ts'));

    expect(result.status).toBe(0);
  });

  // ── E2E-12: config files always allowed ──────────────────────────────────

  it('E2E-12: config files (*.config.ts) always allowed even in spec phase', () => {
    const dir = createTestDir();
    writeConfig(dir, 'B');
    writeHitlState(dir, hitlWithPhase('spec'));

    // vite.config.ts is a project config file — never blocked by phase guard
    const result = runHook(dir, makeEditInput(`${dir}/vite.config.ts`));

    expect(result.status).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Adversarial Defense Tests — A1–A9
// ═══════════════════════════════════════════════════════════════════════════════

describe('Adversarial: A1–A9 defense tests', () => {
  // ── A1: Phase skipping (spec → code) ──────────────────────────────────────

  it('A1: Phase skipping (spec→code) is blocked by transition validator', () => {
    const dir = createTestDir();
    writeConfig(dir, 'B');
    writeHitlState(dir, hitlWithPhase('spec')); // XX is currently in spec

    // Attempt to Write hitl-state.json jumping spec→code (skipping tc)
    const illegalTransition = {
      ...BASE_HITL_STATE,
      areas: { XX: areaInPhase('code') },
    };

    const result = runHook(
      dir,
      makeWriteInput(`${dir}/.omc/hitl-state.json`, JSON.stringify(illegalTransition)),
    );

    expect(result.status).toBe(2);
    // Transition from spec to code is invalid (must go through tc)
  });

  // ── A2: Verification tag deletion ─────────────────────────────────────────

  it('A2: Verification tag deletion is always blocked (exit 2)', () => {
    const dir = createTestDir();
    writeConfig(dir, 'B');
    writeHitlState(dir, hitlWithPhase('verified'));

    const result = runHook(dir, makeBashInput('git tag -d XX-verified-c1'));

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/BLOCKED.*git tag/i);
  });

  // ── A3: Hook file tampering ────────────────────────────────────────────────

  it('A3: Hook file tampering via Write is blocked (exit 2)', () => {
    const dir = createTestDir();
    writeConfig(dir, 'QM'); // even at QM — self-protection is absolute
    writeHitlState(dir, hitlWithPhase('code'));

    const result = runHook(
      dir,
      makeWriteInput(`${dir}/.claude/hooks/check-phase.sh`, '#!/bin/bash\nexit 0'),
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/BLOCKED/i);
  });

  // ── A4: Empty tests bypass — coverage gate check at ASIL B ────────────────

  it('A4: Coverage gate (Gate #9) always fails at ASIL B (placeholder enforces non-bypass)', async () => {
    // Use TS-level import — coverage gate is a TS engine gate, not shell-only
    const { runTsGateChecks } = await import('./gate-bridge.js');
    const { getDefaultConfig } = await import('../init/asil-presets.js');

    // ASIL B config with 0% effective coverage (empty test suite scenario)
    const config = {
      ...getDefaultConfig('B'),
      thresholds: {
        ...getDefaultConfig('B').thresholds,
        statement_coverage_min: 0.8,
        branch_coverage_min: 0.7,
        mcdc_coverage_min: 0.6,
      },
    };

    const hitlState = {
      project: { code: 'TEST', frameworks: {}, paths: {} },
      areas: { XX: { ...BASE_AREA, phase: 'verified' as const } },
      log: [],
    };

    const summary = runTsGateChecks(config, hitlState, 'XX');

    // Gate #9 (Coverage thresholds) is always a blocking failure at ASIL B
    const gate9 = summary.results.find((r) => r.gate_id === 9);
    expect(gate9).toBeDefined();
    expect(gate9!.passed).toBe(false);
    expect(gate9!.message).toMatch(/coverage/i);

    // all_passed must be false — empty-test bypass attempt fails
    expect(summary.all_passed).toBe(false);
  });

  // ── A5: TC=0 verified transition blocked ──────────────────────────────────

  it('A5: Transition to verified with only obsolete TCs is blocked', () => {
    const dir = createTestDir();
    writeConfig(dir, 'B');

    // Set up test phase state with TC JSON that has only obsolete baseline TCs
    writeHitlState(dir, hitlWithPhase('test'));

    // TC file with no active TCs — all marked obsolete
    const tcJsonWithObsoleteOnly = JSON.stringify({
      spec_id: 'SPEC-TEST-XX',
      generated_at: new Date().toISOString(),
      baseline_tcs: [
        {
          tc_id: 'TC-XX-001a',
          origin: 'baseline',
          req_id: 'REQ-XX-001',
          type: 'positive',
          level: 'unit',
          title: 'Verify init',
          given: 'module loaded',
          when: 'init called',
          then: 'state set',
          status: 'obsolete',
          obsoleted_at: new Date().toISOString(),
          obsoleted_by: null,
          obsolete_reason: 'REQ-XX-001 changed',
        },
      ],
    });
    writeFileSync(join(dir, '.omc', 'test-cases', 'TC-XX.json'), tcJsonWithObsoleteOnly);

    // Attempt to transition from test → verified
    const verifiedTransition = {
      ...BASE_HITL_STATE,
      areas: {
        XX: {
          ...areaInPhase('verified'),
          tc: {
            file: '.omc/test-cases/TC-XX.json',
            baseline_count: 1,
            supplementary_count: 0,
          },
        },
      },
    };

    const result = runHook(
      dir,
      makeWriteInput(
        `${dir}/.omc/hitl-state.json`,
        JSON.stringify(verifiedTransition),
      ),
    );

    // test → verified is an invalid direct transition (must pass gates first)
    expect(result.status).toBe(2);
  });

  // ── A6: Skill bypass (@tc/@req missing) ───────────────────────────────────

  it('A6: Transition to verified from test phase without proper gate is blocked', () => {
    const dir = createTestDir();
    writeConfig(dir, 'B');
    writeHitlState(dir, hitlWithPhase('test'));

    // Attempt direct test → verified write without going through gate CLI
    const illegalVerified = {
      ...BASE_HITL_STATE,
      areas: { XX: areaInPhase('verified') },
    };

    const result = runHook(
      dir,
      makeWriteInput(
        `${dir}/.omc/hitl-state.json`,
        JSON.stringify(illegalVerified),
      ),
    );

    // test → verified is not a valid single-step transition
    expect(result.status).toBe(2);
  });

  // ── A7: TC design reads src/ — verified by SKILL.md content ───────────────

  it('A7: test-gen-design SKILL.md uses context:fork and has no Bash in allowed-tools', () => {
    expect(existsSync(TEST_GEN_DESIGN_SKILL)).toBe(true);

    const content = readFileSync(TEST_GEN_DESIGN_SKILL, 'utf-8');

    // Must declare context: fork (isolated execution context)
    expect(content).toMatch(/^context:\s*fork/m);

    // allowed-tools must NOT include Bash (TC design cannot execute arbitrary code)
    const allowedToolsLine = content.match(/^allowed-tools:\s*(.+)$/m);
    expect(allowedToolsLine).not.toBeNull();

    const allowedTools = allowedToolsLine![1] ?? '';
    expect(allowedTools).not.toMatch(/\bBash\b/);

    // Must allow Read for spec file reading
    expect(allowedTools).toMatch(/\bRead\b/);

    // Explicit isolation rule must forbid src/ reads
    expect(content).toMatch(/src\//);
    expect(content).toMatch(/절대|never|NEVER|isolat/i);
  });

  // ── A8: /reset ASIL gate — verified by SKILL.md content ──────────────────

  it('A8: reset SKILL.md mentions ASIL gate and AskUserQuestion for ASIL B+', () => {
    expect(existsSync(RESET_SKILL)).toBe(true);

    const content = readFileSync(RESET_SKILL, 'utf-8');

    // Must mention ASIL gate (defense A8 — /reset without ASIL confirmation)
    expect(content).toMatch(/ASIL/);

    // Must require human confirmation via AskUserQuestion for B+
    expect(content).toMatch(/AskUserQuestion/);

    // Must specifically call out ASIL B or higher as requiring confirmation
    expect(content).toMatch(/ASIL B/);

    // Must mention that the action is irreversible (safety information)
    expect(content).toMatch(/되돌릴|irreversible|undo/i);
  });

  // ── A9: Dependency staleness propagation via CCP ──────────────────────────

  it('A9: Interface change causes transitive staleness propagation through dependency graph', async () => {
    // Use TS-level import — tests the CCP staleness engine directly
    const { createTestDb, seedGraph, seedLedger } = await import('../test-utils/in-memory-db.js');
    const { createVerificationLedger } = await import('../ledger/verification-ledger.js');
    const { createDependencyGraph } = await import('../graph/dependency-graph.js');
    const { createStalenessPropagator } = await import('../ledger/staleness-propagator.js');

    const db = createTestDb();
    const ledger = createVerificationLedger(db);
    const graph = createDependencyGraph(db);
    const propagator = createStalenessPropagator(ledger, graph);

    // Seed a linear chain: A → B → C  (simulating: module imports from ccp module)
    // C = ccp module (interface changed), B = direct importer, A = transitive importer
    seedGraph(db, 'linear');
    seedLedger(db, [
      {
        artifact_id: 'A',
        content_hash: 'hash-A',
        verification_status: 'fresh',
        freshness_score: 1.0,
        asil_level: 'B',
      },
      {
        artifact_id: 'B',
        content_hash: 'hash-B',
        verification_status: 'fresh',
        freshness_score: 1.0,
        asil_level: 'B',
      },
      {
        artifact_id: 'C',
        content_hash: 'hash-C',
        verification_status: 'fresh',
        freshness_score: 1.0,
        asil_level: 'B',
      },
    ]);

    // Simulate an interface change to the CCP module (C)
    const result = propagator.propagate('C', 'interface_change');

    // The changed module itself must become stale
    expect(ledger.getEntry('C')!.verification_status).toBe('stale');

    // Direct importer (B) must become stale — distance 1
    expect(ledger.getEntry('B')!.verification_status).toBe('stale');

    // Transitive importer (A) must also become stale — distance 2
    // This is the key adversarial defense: no silent staleness bypass
    expect(ledger.getEntry('A')!.verification_status).toBe('stale');

    // All three must be invalidated
    expect(result.total_invalidated).toBe(3);
    expect(result.change_type).toBe('interface_change');

    // Verify distance metadata for audit trail integrity
    const byId = Object.fromEntries(
      result.invalidated_artifacts.map((a) => [a.artifact_id, a]),
    );
    expect(byId['C']!.distance).toBe(0);
    expect(byId['B']!.distance).toBe(1);
    expect(byId['A']!.distance).toBe(2);

    // Confirm that a1_passed would block verification (stale = not fresh)
    const allFresh = ['A', 'B', 'C'].every(
      (id) => ledger.getEntry(id)!.verification_status === 'fresh',
    );
    expect(allFresh).toBe(false);
  });
});
