/**
 * shell-hooks.test.ts
 *
 * Integration tests for .claude/hooks/check-phase.sh
 * Spawns the script with various mock inputs and checks exit codes.
 *
 * Exit codes:
 *   0 = allow
 *   2 = block
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// ── Constants ────────────────────────────────────────────────────────────────

const HOOK_PATH = resolve('/Users/jaewoo/Desktop/Project/dev/260220_proofchain/.claude/hooks/check-phase.sh');

const BASE_HITL_STATE = {
  project: { code: 'TEST', frameworks: {}, paths: {} },
  areas: {
    XX: {
      phase: 'spec',
      cycle: 1,
      cycle_entry: null,
      cycle_reason: null,
      spec: { file: '.omc/specs/SPEC-XX-test.md', status: 'draft', req_count: 0 },
      tc: { file: '.omc/test-cases/TC-XX.json', baseline_count: 0, supplementary_count: 0 },
      code: { status: 'none', files: ['src/xx/module.ts'] },
      test: { status: 'none', retries: {} },
    },
  },
  log: [],
};

const BASE_CONFIG = {
  asil_level: 'B',
  language: 'c',
  coding_standard: 'misra-c-2012',
  enforcement_mode: 'strict',
  thresholds: {},
  gates: {},
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTestDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'proofchain-test-'));
  mkdirSync(join(dir, '.omc'), { recursive: true });
  mkdirSync(join(dir, '.omc', 'specs'), { recursive: true });
  mkdirSync(join(dir, '.omc', 'test-cases'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true });
  mkdirSync(join(dir, '.proofchain'), { recursive: true });
  mkdirSync(join(dir, 'src', 'xx'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  return dir;
}

function writeHitlState(dir: string, state: object): void {
  writeFileSync(join(dir, '.omc', 'hitl-state.json'), JSON.stringify(state, null, 2));
}

function writeConfig(dir: string, asilLevel: string): void {
  writeFileSync(
    join(dir, '.proofchain', 'config.json'),
    JSON.stringify({ ...BASE_CONFIG, asil_level: asilLevel }, null, 2),
  );
}

interface HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

function runHook(
  dir: string,
  input: HookInput,
): { status: number; stderr: string; stdout: string } {
  const result = spawnSync('bash', [HOOK_PATH], {
    input: JSON.stringify({ ...input, cwd: dir }),
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

function makeReadInput(filePath: string): HookInput {
  return {
    tool_name: 'Read',
    tool_input: { file_path: filePath },
  };
}

function makeGlobInput(pattern: string): HookInput {
  return {
    tool_name: 'Glob',
    tool_input: { pattern },
  };
}

function makeGrepInput(pattern: string): HookInput {
  return {
    tool_name: 'Grep',
    tool_input: { pattern },
  };
}

// ── Preflight ─────────────────────────────────────────────────────────────────

beforeAll(() => {
  const jqCheck = spawnSync('which', ['jq'], { encoding: 'utf-8' });
  if (jqCheck.status !== 0) {
    throw new Error('jq is not installed — cannot run shell-hooks tests');
  }
  if (!existsSync(HOOK_PATH)) {
    throw new Error(`Hook script not found at ${HOOK_PATH}`);
  }
});

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('check-phase.sh', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTestDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Self-Protection — always block regardless of ASIL or phase
  // ══════════════════════════════════════════════════════════════════════════

  describe('Self-Protection (.claude/ directory)', () => {
    it('blocks Edit on .claude/hooks/check-phase.sh', () => {
      writeHitlState(dir, BASE_HITL_STATE);
      writeConfig(dir, 'QM'); // even at the most permissive level
      const result = runHook(dir, makeEditInput(`${dir}/.claude/hooks/check-phase.sh`));
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/BLOCKED.*\.claude/i);
    });

    it('blocks Write on .claude/settings.json', () => {
      writeHitlState(dir, BASE_HITL_STATE);
      writeConfig(dir, 'QM');
      const result = runHook(dir, makeWriteInput(`${dir}/.claude/settings.json`, '{}'));
      expect(result.status).toBe(2);
    });

    it('blocks Edit on any file inside .claude/', () => {
      writeHitlState(dir, BASE_HITL_STATE);
      writeConfig(dir, 'A');
      const result = runHook(dir, makeEditInput(`${dir}/.claude/hooks/custom.sh`));
      expect(result.status).toBe(2);
    });

    it('blocks Bash sed -i targeting .claude/hooks/x.sh', () => {
      writeHitlState(dir, BASE_HITL_STATE);
      writeConfig(dir, 'QM');
      const result = runHook(
        dir,
        makeBashInput(`sed -i 's/old/new/g' ${dir}/.claude/hooks/x.sh`),
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/BLOCKED/);
    });

    it('blocks Bash tee targeting .claude/hooks/check-phase.sh', () => {
      writeHitlState(dir, BASE_HITL_STATE);
      writeConfig(dir, 'QM');
      const result = runHook(
        dir,
        makeBashInput(`echo 'exit 0' | tee ${dir}/.claude/hooks/check-phase.sh`),
      );
      expect(result.status).toBe(2);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Destructive Git — always block
  // ══════════════════════════════════════════════════════════════════════════

  describe('Destructive Git commands', () => {
    it('blocks git tag -d', () => {
      const result = runHook(dir, makeBashInput('git tag -d XX-verified-c1'));
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/BLOCKED.*git tag/i);
    });

    it('blocks git tag --delete', () => {
      const result = runHook(dir, makeBashInput('git tag --delete XX-verified-c1'));
      expect(result.status).toBe(2);
    });

    it('blocks git reset --hard', () => {
      const result = runHook(dir, makeBashInput('git reset --hard HEAD~1'));
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/BLOCKED.*git reset/i);
    });

    it('blocks git push --force origin main', () => {
      const result = runHook(dir, makeBashInput('git push --force origin main'));
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/BLOCKED.*git push/i);
    });

    it('blocks git push -f origin main', () => {
      const result = runHook(dir, makeBashInput('git push -f origin main'));
      expect(result.status).toBe(2);
    });

    it('blocks git checkout .claude/hooks/check-phase.sh', () => {
      const result = runHook(
        dir,
        makeBashInput('git checkout .claude/hooks/check-phase.sh'),
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/BLOCKED/);
    });

    it('blocks git restore .claude/hooks/check-phase.sh', () => {
      const result = runHook(
        dir,
        makeBashInput('git restore .claude/hooks/check-phase.sh'),
      );
      expect(result.status).toBe(2);
    });

    it('allows normal git push (no force flag)', () => {
      const result = runHook(dir, makeBashInput('git push origin main'));
      expect(result.status).toBe(0);
    });

    it('allows git checkout -b new-branch (branch creation)', () => {
      const result = runHook(dir, makeBashInput('git checkout -b new-feature'));
      expect(result.status).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Phase Guards — ASIL-adaptive (QM/A = exit 0 warn, B+ = exit 2)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Phase Guards — ASIL B (block)', () => {
    beforeEach(() => {
      writeConfig(dir, 'B');
    });

    it('blocks Edit src/x.ts in spec phase (ASIL B)', () => {
      writeHitlState(dir, BASE_HITL_STATE); // area XX is in spec phase
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/BLOCKED/);
    });

    it('allows Edit src/x.ts in code phase (ASIL B)', () => {
      const codeState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'code' } },
      };
      writeHitlState(dir, codeState);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(0);
    });

    it('blocks Edit src/x.ts in verified phase (ASIL B)', () => {
      const verifiedState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'verified' } },
      };
      writeHitlState(dir, verifiedState);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(2);
    });
  });

  describe('Phase Guards — ASIL D (block)', () => {
    it('blocks Edit src/x.ts in spec phase (ASIL D)', () => {
      writeConfig(dir, 'D');
      writeHitlState(dir, BASE_HITL_STATE);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(2);
    });

    it('blocks Edit src/x.ts in verified phase (all ASIL)', () => {
      writeConfig(dir, 'D');
      const verifiedState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'verified' } },
      };
      writeHitlState(dir, verifiedState);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(2);
    });
  });

  describe('Phase Guards — ASIL QM (warn only, exit 0)', () => {
    beforeEach(() => {
      writeConfig(dir, 'QM');
    });

    it('allows Edit src/x.ts in spec phase (ASIL QM, warn only)', () => {
      writeHitlState(dir, BASE_HITL_STATE);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/WARNING.*ASIL QM/i);
    });
  });

  describe('Phase Guards — ASIL A (warn only, exit 0)', () => {
    beforeEach(() => {
      writeConfig(dir, 'A');
    });

    it('allows Edit src/x.ts in spec phase (ASIL A, warn only)', () => {
      writeHitlState(dir, BASE_HITL_STATE);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/WARNING.*ASIL A/i);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Spec file access
  // ══════════════════════════════════════════════════════════════════════════

  describe('Spec file access rules', () => {
    it('allows Write to .omc/specs/SPEC-XX-test.md in spec phase', () => {
      writeConfig(dir, 'B');
      writeHitlState(dir, BASE_HITL_STATE); // spec phase
      const specPath = `${dir}/.omc/specs/SPEC-XX-test.md`;
      const result = runHook(dir, makeWriteInput(specPath, '# Spec'));
      expect(result.status).toBe(0);
    });

    it('blocks Write to .omc/specs/SPEC-XX-test.md in code phase (ASIL B)', () => {
      writeConfig(dir, 'B');
      const codeState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'code' } },
      };
      writeHitlState(dir, codeState);
      const specPath = `${dir}/.omc/specs/SPEC-XX-test.md`;
      const result = runHook(dir, makeWriteInput(specPath, '# Spec'));
      expect(result.status).toBe(2);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // No hitl-state.json — all Edit/Write should pass
  // ══════════════════════════════════════════════════════════════════════════

  describe('No hitl-state.json (no state file)', () => {
    it('allows Edit any file when hitl-state.json is absent', () => {
      writeConfig(dir, 'B');
      // Deliberately do NOT write hitl-state.json
      const result = runHook(dir, makeEditInput(`${dir}/src/anything.ts`));
      expect(result.status).toBe(0);
    });

    it('allows Bash write command when hitl-state.json is absent', () => {
      writeConfig(dir, 'B');
      const result = runHook(dir, makeBashInput(`echo "hello" > ${dir}/src/hello.ts`));
      expect(result.status).toBe(0);
    });

    it('still blocks .claude/ Edit even without hitl-state.json', () => {
      writeConfig(dir, 'QM');
      // .claude/ self-protection does not depend on state file
      const result = runHook(dir, makeEditInput(`${dir}/.claude/hooks/check-phase.sh`));
      expect(result.status).toBe(2);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Read / Glob / Grep — always pass
  // ══════════════════════════════════════════════════════════════════════════

  describe('Read-only tools always pass', () => {
    beforeEach(() => {
      writeConfig(dir, 'D');
      writeHitlState(dir, BASE_HITL_STATE); // most restrictive state
    });

    it('allows Read tool in spec phase', () => {
      const result = runHook(dir, makeReadInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(0);
    });

    it('allows Glob tool in spec phase', () => {
      const result = runHook(dir, makeGlobInput('src/**/*.ts'));
      expect(result.status).toBe(0);
    });

    it('allows Grep tool in spec phase', () => {
      const result = runHook(dir, makeGrepInput('function'));
      expect(result.status).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Auto-backward: test phase + Edit src/ → exit 0 + phase becomes "code"
  // ══════════════════════════════════════════════════════════════════════════

  describe('Auto-backward (test → code)', () => {
    it('allows Edit src/x.ts in test phase and changes phase to code', () => {
      writeConfig(dir, 'B');
      const testPhaseState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'test' } },
      };
      writeHitlState(dir, testPhaseState);

      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      // auto-backward should allow the edit (exit 0)
      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/AUTO-BACKWARD/i);

      // hitl-state.json should now show "code" for area XX
      const updatedState = JSON.parse(
        readFileSync(join(dir, '.omc', 'hitl-state.json'), 'utf-8'),
      );
      expect(updatedState.areas.XX.phase).toBe('code');
    });

    it('adds auto-backward log entry when test → code transition occurs', () => {
      writeConfig(dir, 'B');
      const testPhaseState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'test' } },
      };
      writeHitlState(dir, testPhaseState);

      runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));

      const updatedState = JSON.parse(
        readFileSync(join(dir, '.omc', 'hitl-state.json'), 'utf-8'),
      );
      expect(updatedState.log.length).toBeGreaterThan(0);
      const logEntry = updatedState.log[updatedState.log.length - 1];
      expect(logEntry.type).toBe('auto-backward');
      expect(logEntry.from).toBe('test');
      expect(logEntry.to).toBe('code');
      expect(logEntry.actor).toBe('hook');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Transition Validation (Write hitl-state.json)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Transition validation via Write hitl-state.json', () => {
    it('blocks invalid transition spec → code', () => {
      writeConfig(dir, 'B');
      writeHitlState(dir, BASE_HITL_STATE); // XX is in spec

      // Attempt to jump from spec directly to code (skipping tc)
      const newState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'code' } },
      };
      const result = runHook(
        dir,
        makeWriteInput(
          `${dir}/.omc/hitl-state.json`,
          JSON.stringify(newState),
        ),
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/BLOCKED.*전환/);
    });

    it('allows valid forward transition spec → tc', () => {
      writeConfig(dir, 'B');
      writeHitlState(dir, BASE_HITL_STATE); // XX in spec

      const newState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'tc' } },
      };
      const result = runHook(
        dir,
        makeWriteInput(
          `${dir}/.omc/hitl-state.json`,
          JSON.stringify(newState),
        ),
      );
      expect(result.status).toBe(0);
    });

    it('allows valid backward transition tc → spec', () => {
      writeConfig(dir, 'B');
      const tcState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'tc' } },
      };
      writeHitlState(dir, tcState);

      const newState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'spec' } },
      };
      const result = runHook(
        dir,
        makeWriteInput(
          `${dir}/.omc/hitl-state.json`,
          JSON.stringify(newState),
        ),
      );
      expect(result.status).toBe(0);
    });

    it('blocks invalid transition tc → test (skipping code)', () => {
      writeConfig(dir, 'B');
      const tcState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'tc' } },
      };
      writeHitlState(dir, tcState);

      const newState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'test' } },
      };
      const result = runHook(
        dir,
        makeWriteInput(
          `${dir}/.omc/hitl-state.json`,
          JSON.stringify(newState),
        ),
      );
      expect(result.status).toBe(2);
    });

    it('blocks invalid transition code → verified (skipping test)', () => {
      writeConfig(dir, 'QM');
      const codeState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'code' } },
      };
      writeHitlState(dir, codeState);

      const newState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'verified' } },
      };
      const result = runHook(
        dir,
        makeWriteInput(
          `${dir}/.omc/hitl-state.json`,
          JSON.stringify(newState),
        ),
      );
      expect(result.status).toBe(2);
    });

    it('allows same-phase Write (no transition, just editing content)', () => {
      writeConfig(dir, 'B');
      writeHitlState(dir, BASE_HITL_STATE); // spec

      // Write the same phase (no actual transition)
      const sameState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'spec', req_count: 5 } },
      };
      const result = runHook(
        dir,
        makeWriteInput(
          `${dir}/.omc/hitl-state.json`,
          JSON.stringify(sameState),
        ),
      );
      expect(result.status).toBe(0);
    });

    it('blocks reentry (verified → spec) without cycle increment', () => {
      writeConfig(dir, 'B');
      const verifiedState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'verified', cycle: 1 } },
      };
      writeHitlState(dir, verifiedState);

      // Attempt reentry without bumping cycle
      const reentryState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'spec', cycle: 1 } },
      };
      const result = runHook(
        dir,
        makeWriteInput(
          `${dir}/.omc/hitl-state.json`,
          JSON.stringify(reentryState),
        ),
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/cycle/);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ASIL-adaptive behavior — same violation, different outcomes per level
  // ══════════════════════════════════════════════════════════════════════════

  describe('ASIL-adaptive phase guards', () => {
    const specPhaseState = BASE_HITL_STATE; // XX is in spec

    it('ASIL QM: spec + Edit src/x.ts → exit 0 with warning', () => {
      writeConfig(dir, 'QM');
      writeHitlState(dir, specPhaseState);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/WARNING.*ASIL QM/i);
    });

    it('ASIL A: spec + Edit src/x.ts → exit 0 with warning', () => {
      writeConfig(dir, 'A');
      writeHitlState(dir, specPhaseState);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/WARNING.*ASIL A/i);
    });

    it('ASIL B: spec + Edit src/x.ts → exit 2 (block)', () => {
      writeConfig(dir, 'B');
      writeHitlState(dir, specPhaseState);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(2);
    });

    it('ASIL C: spec + Edit src/x.ts → exit 2 (block)', () => {
      writeConfig(dir, 'C');
      writeHitlState(dir, specPhaseState);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(2);
    });

    it('ASIL D: spec + Edit src/x.ts → exit 2 (block)', () => {
      writeConfig(dir, 'D');
      writeHitlState(dir, specPhaseState);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(2);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Verified phase — all ASILs block src/ edits
  // ══════════════════════════════════════════════════════════════════════════

  describe('Verified phase blocks src/ for all ASIL levels', () => {
    const verifiedState = {
      ...BASE_HITL_STATE,
      areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'verified' } },
    };

    for (const asil of ['QM', 'A', 'B', 'D']) {
      it(`ASIL ${asil}: verified + Edit src/x.ts → exit 2`, () => {
        writeConfig(dir, asil);
        writeHitlState(dir, verifiedState);
        const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
        expect(result.status).toBe(2);
      });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Code phase — src/ edits always allowed
  // ══════════════════════════════════════════════════════════════════════════

  describe('Code phase allows src/ edits', () => {
    it('code phase + Edit src/x.ts → exit 0', () => {
      writeConfig(dir, 'D');
      const codeState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'code' } },
      };
      writeHitlState(dir, codeState);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Files outside CWD — always pass
  // ══════════════════════════════════════════════════════════════════════════

  describe('Files outside project CWD are always allowed', () => {
    it('allows Edit on a file outside cwd', () => {
      writeConfig(dir, 'D');
      writeHitlState(dir, BASE_HITL_STATE);
      // Use /tmp path which is outside `dir`
      const result = runHook(dir, makeEditInput('/tmp/some-random-file.ts'));
      expect(result.status).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Code extension checks outside src/ (Approach A)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Code files outside managed paths (Approach A)', () => {
    it('blocks Edit on a .ts file outside src/ or tests/ (ASIL B)', () => {
      writeConfig(dir, 'B');
      writeHitlState(dir, BASE_HITL_STATE);
      // Place a .ts file directly under the project root (not in src/ or tests/)
      const result = runHook(dir, makeEditInput(`${dir}/random-script.ts`));
      expect(result.status).toBe(2);
    });

    it('allows Edit on config file outside src/ (*.config.ts exception)', () => {
      writeConfig(dir, 'B');
      writeHitlState(dir, BASE_HITL_STATE);
      const result = runHook(dir, makeEditInput(`${dir}/vite.config.ts`));
      expect(result.status).toBe(0);
    });

    it('allows Edit on .eslintrc.js config file', () => {
      writeConfig(dir, 'B');
      writeHitlState(dir, BASE_HITL_STATE);
      const result = runHook(dir, makeEditInput(`${dir}/.eslintrc.js`));
      expect(result.status).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Bash write heuristics
  // ══════════════════════════════════════════════════════════════════════════

  describe('Bash write heuristics for managed paths', () => {
    it('blocks Bash redirect write to src/ in spec phase (ASIL B)', () => {
      writeConfig(dir, 'B');
      writeHitlState(dir, BASE_HITL_STATE); // spec phase

      const result = runHook(
        dir,
        makeBashInput(`echo "content" > ${dir}/src/xx/module.ts`),
      );
      expect(result.status).toBe(2);
    });

    it('allows Bash redirect write to src/ in code phase', () => {
      writeConfig(dir, 'B');
      const codeState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'code' } },
      };
      writeHitlState(dir, codeState);

      const result = runHook(
        dir,
        makeBashInput(`echo "content" > ${dir}/src/xx/module.ts`),
      );
      expect(result.status).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TC file access rules
  // ══════════════════════════════════════════════════════════════════════════

  describe('TC file access', () => {
    it('allows Write to .omc/test-cases/TC-XX.json in tc phase', () => {
      writeConfig(dir, 'B');
      const tcState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'tc' } },
      };
      writeHitlState(dir, tcState);
      const result = runHook(
        dir,
        makeWriteInput(`${dir}/.omc/test-cases/TC-XX.json`, '{}'),
      );
      expect(result.status).toBe(0);
    });

    it('allows Write to .omc/test-cases/TC-XX.json in code phase', () => {
      writeConfig(dir, 'B');
      const codeState = {
        ...BASE_HITL_STATE,
        areas: { XX: { ...BASE_HITL_STATE.areas.XX, phase: 'code' } },
      };
      writeHitlState(dir, codeState);
      const result = runHook(
        dir,
        makeWriteInput(`${dir}/.omc/test-cases/TC-XX.json`, '{}'),
      );
      expect(result.status).toBe(0);
    });

    it('blocks Write to .omc/test-cases/TC-XX.json in spec phase (ASIL B)', () => {
      writeConfig(dir, 'B');
      writeHitlState(dir, BASE_HITL_STATE); // spec phase
      const result = runHook(
        dir,
        makeWriteInput(`${dir}/.omc/test-cases/TC-XX.json`, '{}'),
      );
      expect(result.status).toBe(2);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // No config.json (defaults to QM)
  // ══════════════════════════════════════════════════════════════════════════

  describe('No .proofchain/config.json defaults to QM behavior', () => {
    it('warns but allows (exit 0) when no config and in spec phase', () => {
      // Deliberately do NOT write config.json — should default to QM
      writeHitlState(dir, BASE_HITL_STATE);
      const result = runHook(dir, makeEditInput(`${dir}/src/xx/module.ts`));
      expect(result.status).toBe(0);
    });
  });
});
