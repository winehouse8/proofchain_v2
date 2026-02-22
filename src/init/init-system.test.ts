/**
 * Tests for ProofChain Init System:
 * - Initializer
 * - CLAUDE.md Injector
 * - Gitignore Generator
 * - Config (load/save/validate/merge)
 * - ASIL Presets
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initializeProject, isInitialized } from './initializer.js';
import { generateRulesText, injectRules, removeRules } from './claude-md-injector.js';
import { generateGitignoreContent } from './gitignore-generator.js';
import { loadConfig, saveConfig, validateConfig, mergeConfig } from '../core/config.js';
import { getDefaultConfig } from './asil-presets.js';
import type { ProofChainConfig } from '../core/types.js';

// ─── Temp directory helpers ───────────────────────────────────────────────────

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'proofchain-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Initializer ─────────────────────────────────────────────────────────────

describe('Initializer', () => {
  describe('initializeProject', () => {
    it('creates all expected directories', () => {
      initializeProject({ projectRoot: tempDir, asilLevel: 'B' });

      const root = join(tempDir, '.proofchain');
      expect(existsSync(root)).toBe(true);
      expect(existsSync(join(root, 'state'))).toBe(true);
      expect(existsSync(join(root, 'requirements'))).toBe(true);
      expect(existsSync(join(root, 'templates'))).toBe(true);
      expect(existsSync(join(root, 'metrics'))).toBe(true);
      expect(existsSync(join(root, 'rules'))).toBe(true);
    });

    it('creates config.json with correct ASIL thresholds', () => {
      initializeProject({ projectRoot: tempDir, asilLevel: 'B' });

      const configPath = join(tempDir, '.proofchain', 'config.json');
      expect(existsSync(configPath)).toBe(true);

      const config = loadConfig(tempDir);
      expect(config.asil_level).toBe('B');
      // ASIL B: cyclomatic_complexity_max = 10 (ISO 26262 Part 6 Table 12)
      expect(config.thresholds.cyclomatic_complexity_max).toBe(10);
      expect(config.thresholds.statement_coverage_min).toBe(0.8);
    });

    it('creates the SQLite database', () => {
      const result = initializeProject({ projectRoot: tempDir, asilLevel: 'QM' });
      expect(existsSync(result.dbPath)).toBe(true);
    });

    it('creates .proofchain/.gitignore', () => {
      initializeProject({ projectRoot: tempDir, asilLevel: 'QM' });
      const gitignorePath = join(tempDir, '.proofchain', '.gitignore');
      expect(existsSync(gitignorePath)).toBe(true);
    });

    it('creates CLAUDE.md with ProofChain rules', () => {
      initializeProject({ projectRoot: tempDir, asilLevel: 'A' });
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      expect(existsSync(claudeMdPath)).toBe(true);
      const content = readFileSync(claudeMdPath, 'utf-8');
      expect(content).toContain('ProofChain Safety Rules');
    });

    it('throws on double initialization', () => {
      initializeProject({ projectRoot: tempDir, asilLevel: 'QM' });
      expect(() =>
        initializeProject({ projectRoot: tempDir, asilLevel: 'QM' }),
      ).toThrow('ProofChain already initialized');
    });

    it('returns correct paths in result', () => {
      const result = initializeProject({ projectRoot: tempDir, asilLevel: 'D' });
      expect(result.configPath).toContain('.proofchain');
      expect(result.configPath).toContain('config.json');
      expect(result.dbPath).toContain('proofchain.db');
      expect(result.directories_created.length).toBeGreaterThan(0);
      expect(result.files_created.length).toBeGreaterThan(0);
    });
  });

  describe('isInitialized', () => {
    it('returns false for an empty directory', () => {
      expect(isInitialized(tempDir)).toBe(false);
    });

    it('returns true after initialization', () => {
      initializeProject({ projectRoot: tempDir, asilLevel: 'QM' });
      expect(isInitialized(tempDir)).toBe(true);
    });
  });
});

// ─── CLAUDE.md Injector ───────────────────────────────────────────────────────

describe('CLAUDE.md Injector', () => {
  function makeConfig(asilLevel: ProofChainConfig['asil_level']): ProofChainConfig {
    return getDefaultConfig(asilLevel);
  }

  describe('generateRulesText', () => {
    it('includes the ASIL level in the heading', () => {
      const text = generateRulesText(makeConfig('C'));
      expect(text).toContain('ASIL C');
    });

    it('includes coverage thresholds', () => {
      const text = generateRulesText(makeConfig('B'));
      // ASIL B: statement_coverage_min = 0.8 → 80%
      expect(text).toContain('80%');
    });

    it('includes QM message for QM level', () => {
      const text = generateRulesText(makeConfig('QM'));
      expect(text).toContain('QM');
    });

    it('includes ASIL D specific rules for level D', () => {
      const text = generateRulesText(makeConfig('D'));
      expect(text).toContain('ASIL D');
      expect(text).toContain('MC/DC');
    });

    it('includes coding guideline numbers', () => {
      const config = makeConfig('A');
      const text = generateRulesText(config);
      expect(text).toContain(String(config.thresholds.cyclomatic_complexity_max));
      expect(text).toContain(String(config.thresholds.function_lines_max));
    });
  });

  describe('injectRules', () => {
    it('creates CLAUDE.md if it does not exist', () => {
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      expect(existsSync(claudeMdPath)).toBe(false);

      injectRules(tempDir, makeConfig('QM'));

      expect(existsSync(claudeMdPath)).toBe(true);
      const content = readFileSync(claudeMdPath, 'utf-8');
      expect(content).toContain('proofchain:rules-start');
      expect(content).toContain('proofchain:rules-end');
    });

    it('is idempotent: running twice produces the same result', () => {
      injectRules(tempDir, makeConfig('A'));
      const first = readFileSync(join(tempDir, 'CLAUDE.md'), 'utf-8');

      injectRules(tempDir, makeConfig('A'));
      const second = readFileSync(join(tempDir, 'CLAUDE.md'), 'utf-8');

      expect(first).toBe(second);
    });

    it('preserves existing content outside markers', () => {
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      const existingContent = '# My Project\n\nSome custom notes.\n';
      // Write existing content without markers
      writeFileSync(claudeMdPath, existingContent, 'utf-8');

      injectRules(tempDir, makeConfig('B'));

      const result = readFileSync(claudeMdPath, 'utf-8');
      expect(result).toContain('# My Project');
      expect(result).toContain('Some custom notes.');
      expect(result).toContain('proofchain:rules-start');
    });

    it('replaces rules block on second call with different config', () => {
      injectRules(tempDir, makeConfig('QM'));
      injectRules(tempDir, makeConfig('D'));

      const content = readFileSync(join(tempDir, 'CLAUDE.md'), 'utf-8');
      // Should contain ASIL D, not two separate blocks
      expect(content).toContain('ASIL D');
      const startCount = (content.match(/proofchain:rules-start/g) ?? []).length;
      expect(startCount).toBe(1);
    });
  });

  describe('removeRules', () => {
    it('removes the marker block from CLAUDE.md', () => {
      injectRules(tempDir, makeConfig('A'));
      removeRules(tempDir);

      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      const content = readFileSync(claudeMdPath, 'utf-8');
      expect(content).not.toContain('proofchain:rules-start');
      expect(content).not.toContain('proofchain:rules-end');
    });

    it('does not throw when CLAUDE.md does not exist', () => {
      expect(() => removeRules(tempDir)).not.toThrow();
    });

    it('does not throw when CLAUDE.md has no markers', () => {
      writeFileSync(join(tempDir, 'CLAUDE.md'), '# No markers here\n', 'utf-8');
      expect(() => removeRules(tempDir)).not.toThrow();
    });

    it('preserves content outside the removed block', () => {
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      // Pre-populate with custom header
      writeFileSync(claudeMdPath, '# My Project\n\nKeep this.\n', 'utf-8');

      injectRules(tempDir, makeConfig('QM'));
      removeRules(tempDir);

      const content = readFileSync(claudeMdPath, 'utf-8');
      expect(content).toContain('# My Project');
      expect(content).toContain('Keep this.');
    });
  });
});

// ─── Gitignore Generator ──────────────────────────────────────────────────────

describe('Gitignore Generator', () => {
  describe('generateGitignoreContent', () => {
    it('ignores state/', () => {
      expect(generateGitignoreContent()).toContain('state/');
    });

    it('ignores metrics/', () => {
      expect(generateGitignoreContent()).toContain('metrics/');
    });

    it('returns a non-empty string', () => {
      expect(generateGitignoreContent().length).toBeGreaterThan(0);
    });
  });
});

// ─── Config ───────────────────────────────────────────────────────────────────

describe('Config', () => {
  describe('loadConfig', () => {
    it('throws when config does not exist', () => {
      expect(() => loadConfig(tempDir)).toThrow();
    });
  });

  describe('saveConfig / loadConfig round-trip', () => {
    it('saves and reads back the same config', () => {
      const config = getDefaultConfig('C');
      saveConfig(tempDir, config);

      const loaded = loadConfig(tempDir);
      expect(loaded.asil_level).toBe('C');
      expect(loaded.enforcement_mode).toBe('strict');
      expect(loaded.thresholds.cyclomatic_complexity_max).toBe(
        config.thresholds.cyclomatic_complexity_max,
      );
      expect(loaded.gates.require_independent_review).toBe(true);
    });

    it('creates .proofchain directory if missing', () => {
      const config = getDefaultConfig('QM');
      saveConfig(tempDir, config);
      expect(existsSync(join(tempDir, '.proofchain', 'config.json'))).toBe(true);
    });
  });

  describe('validateConfig', () => {
    it('returns true for a valid config', () => {
      const config = getDefaultConfig('A');
      expect(validateConfig(config)).toBe(true);
    });

    it('throws for invalid ASIL level', () => {
      const bad = { ...getDefaultConfig('A'), asil_level: 'X' };
      expect(() => validateConfig(bad)).toThrow();
    });

    it('throws for invalid enforcement_mode', () => {
      const bad = { ...getDefaultConfig('A'), enforcement_mode: 'block' };
      expect(() => validateConfig(bad)).toThrow();
    });

    it('throws for invalid language', () => {
      const bad = { ...getDefaultConfig('A'), language: 'rust' };
      expect(() => validateConfig(bad)).toThrow();
    });

    it('throws when config is not an object', () => {
      expect(() => validateConfig(null)).toThrow();
      expect(() => validateConfig('string')).toThrow();
      expect(() => validateConfig(42)).toThrow();
    });
  });

  describe('mergeConfig', () => {
    it('deep merges thresholds', () => {
      const base = getDefaultConfig('B');
      const merged = mergeConfig(base, {
        thresholds: { ...base.thresholds, cyclomatic_complexity_max: 5 },
      });

      expect(merged.thresholds.cyclomatic_complexity_max).toBe(5);
      // All other thresholds preserved
      expect(merged.thresholds.function_lines_max).toBe(base.thresholds.function_lines_max);
    });

    it('overrides top-level fields', () => {
      const base = getDefaultConfig('A');
      const merged = mergeConfig(base, { enforcement_mode: 'warn' });
      expect(merged.enforcement_mode).toBe('warn');
      // Other fields unchanged
      expect(merged.asil_level).toBe('A');
    });

    it('preserves base when no overrides provided', () => {
      const base = getDefaultConfig('D');
      const merged = mergeConfig(base, {});
      expect(merged).toEqual(base);
    });

    it('deep merges gates', () => {
      const base = getDefaultConfig('A');
      const merged = mergeConfig(base, {
        gates: { ...base.gates, require_independent_review: true },
      });
      expect(merged.gates.require_independent_review).toBe(true);
      // Other gates preserved
      expect(merged.gates.require_traceability_tag).toBe(base.gates.require_traceability_tag);
    });
  });
});

// ─── ASIL Presets ─────────────────────────────────────────────────────────────

describe('ASIL Presets', () => {
  describe('getDefaultConfig', () => {
    it('QM returns info enforcement mode', () => {
      const config = getDefaultConfig('QM');
      expect(config.enforcement_mode).toBe('info');
    });

    it('ASIL A returns strict enforcement mode', () => {
      expect(getDefaultConfig('A').enforcement_mode).toBe('strict');
    });

    it('ASIL D returns strict enforcement with mcdc_coverage_min = 0.9', () => {
      const config = getDefaultConfig('D');
      expect(config.enforcement_mode).toBe('strict');
      expect(config.thresholds.mcdc_coverage_min).toBe(0.9);
    });

    it('QM has no gate requirements', () => {
      const config = getDefaultConfig('QM');
      expect(config.gates.require_traceability_tag).toBe(false);
      expect(config.gates.require_test_before_commit).toBe(false);
      expect(config.gates.require_independent_review).toBe(false);
      expect(config.gates.require_change_impact_analysis).toBe(false);
      expect(config.gates.require_safety_doc).toBe(false);
    });

    it('ASIL D enables all gate requirements', () => {
      const config = getDefaultConfig('D');
      expect(config.gates.require_traceability_tag).toBe(true);
      expect(config.gates.require_test_before_commit).toBe(true);
      expect(config.gates.require_independent_review).toBe(true);
      expect(config.gates.require_change_impact_analysis).toBe(true);
      expect(config.gates.require_safety_doc).toBe(true);
    });

    it('defaults language to c when not specified', () => {
      const config = getDefaultConfig('B');
      expect(config.language).toBe('c');
      expect(config.coding_standard).toBe('misra-c-2012');
    });

    it('uses misra-cpp-2008 for cpp language', () => {
      const config = getDefaultConfig('B', 'cpp');
      expect(config.language).toBe('cpp');
      expect(config.coding_standard).toBe('misra-cpp-2008');
    });

    it('returns correct asil_level field', () => {
      for (const level of ['QM', 'A', 'B', 'C', 'D'] as const) {
        expect(getDefaultConfig(level).asil_level).toBe(level);
      }
    });
  });
});
