/**
 * ProofChain Configuration Loader
 *
 * Reads, validates, saves, and merges `.proofchain/config.json`.
 * No `any` types – JSON is parsed as `unknown` and narrowed via type guards.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type {
  ProofChainConfig,
  AsilLevel,
  SupportedLanguage,
  CodingStandard,
  EnforcementMode,
  AsilThresholds,
  AsilGates,
} from './types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONFIG_DIR  = '.proofchain';
const CONFIG_FILE = 'config.json';

const VALID_ASIL_LEVELS:      readonly AsilLevel[]        = ['QM', 'A', 'B', 'C', 'D'];
const VALID_LANGUAGES:        readonly SupportedLanguage[] = ['c', 'cpp'];
const VALID_CODING_STANDARDS: readonly CodingStandard[]   = ['misra-c-2012', 'misra-cpp-2008'];
const VALID_ENFORCEMENT_MODES: readonly EnforcementMode[] = ['strict', 'warn', 'info'];

// ─── Internal helpers ─────────────────────────────────────────────────────────

function configPath(projectRoot: string): string {
  return join(projectRoot, CONFIG_DIR, CONFIG_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNonNegativeNumber(obj: Record<string, unknown>, key: string, ctx: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || isNaN(v) || v < 0) {
    throw new Error(`${ctx}: '${key}' must be a non-negative number, got ${JSON.stringify(v)}`);
  }
  return v;
}

function assertCoverageNumber(obj: Record<string, unknown>, key: string, ctx: string): number {
  const v = assertNonNegativeNumber(obj, key, ctx);
  if (v > 1.0) {
    throw new Error(`${ctx}: '${key}' must be between 0.0 and 1.0, got ${v}`);
  }
  return v;
}

function assertBoolean(obj: Record<string, unknown>, key: string, ctx: string): boolean {
  const v = obj[key];
  if (typeof v !== 'boolean') {
    throw new Error(`${ctx}: '${key}' must be a boolean, got ${JSON.stringify(v)}`);
  }
  return v;
}

// ─── Threshold validator ──────────────────────────────────────────────────────

function validateThresholds(raw: unknown): AsilThresholds {
  if (!isRecord(raw)) {
    throw new Error("config.thresholds must be an object");
  }
  const ctx = 'thresholds';
  return {
    cyclomatic_complexity_max: assertNonNegativeNumber(raw, 'cyclomatic_complexity_max', ctx),
    function_lines_max:        assertNonNegativeNumber(raw, 'function_lines_max',        ctx),
    function_params_max:       assertNonNegativeNumber(raw, 'function_params_max',       ctx),
    nesting_depth_max:         assertNonNegativeNumber(raw, 'nesting_depth_max',         ctx),
    comment_density_min:       assertCoverageNumber(raw,    'comment_density_min',       ctx),
    statement_coverage_min:    assertCoverageNumber(raw,    'statement_coverage_min',    ctx),
    branch_coverage_min:       assertCoverageNumber(raw,    'branch_coverage_min',       ctx),
    mcdc_coverage_min:         assertCoverageNumber(raw,    'mcdc_coverage_min',         ctx),
  };
}

// ─── Gates validator ─────────────────────────────────────────────────────────

function validateGates(raw: unknown): AsilGates {
  if (!isRecord(raw)) {
    throw new Error("config.gates must be an object");
  }
  const ctx = 'gates';
  return {
    require_traceability_tag:       assertBoolean(raw, 'require_traceability_tag',       ctx),
    require_test_before_commit:     assertBoolean(raw, 'require_test_before_commit',     ctx),
    require_independent_review:     assertBoolean(raw, 'require_independent_review',     ctx),
    require_change_impact_analysis: assertBoolean(raw, 'require_change_impact_analysis', ctx),
    require_safety_doc:             assertBoolean(raw, 'require_safety_doc',             ctx),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Type guard that validates a config object.
 * Throws a descriptive error for any invalid field.
 * Returns true if the object is a valid ProofChainConfig.
 */
export function validateConfig(config: unknown): config is ProofChainConfig {
  if (!isRecord(config)) {
    throw new Error("Config must be a JSON object");
  }

  // asil_level
  if (!VALID_ASIL_LEVELS.includes(config['asil_level'] as AsilLevel)) {
    throw new Error(
      `Config: 'asil_level' must be one of ${VALID_ASIL_LEVELS.join(', ')}, ` +
      `got ${JSON.stringify(config['asil_level'])}`,
    );
  }

  // language
  if (!VALID_LANGUAGES.includes(config['language'] as SupportedLanguage)) {
    throw new Error(
      `Config: 'language' must be one of ${VALID_LANGUAGES.join(', ')}, ` +
      `got ${JSON.stringify(config['language'])}`,
    );
  }

  // coding_standard
  if (!VALID_CODING_STANDARDS.includes(config['coding_standard'] as CodingStandard)) {
    throw new Error(
      `Config: 'coding_standard' must be one of ${VALID_CODING_STANDARDS.join(', ')}, ` +
      `got ${JSON.stringify(config['coding_standard'])}`,
    );
  }

  // enforcement_mode
  if (!VALID_ENFORCEMENT_MODES.includes(config['enforcement_mode'] as EnforcementMode)) {
    throw new Error(
      `Config: 'enforcement_mode' must be one of ${VALID_ENFORCEMENT_MODES.join(', ')}, ` +
      `got ${JSON.stringify(config['enforcement_mode'])}`,
    );
  }

  // thresholds and gates – validateThresholds/validateGates throw on invalid input
  validateThresholds(config['thresholds']);
  validateGates(config['gates']);

  return true;
}

/**
 * Load and validate the ProofChain config from `<projectRoot>/.proofchain/config.json`.
 * Throws if the file does not exist or is invalid.
 */
export function loadConfig(projectRoot: string): ProofChainConfig {
  const filePath = configPath(projectRoot);

  if (!existsSync(filePath)) {
    throw new Error(
      "ProofChain not initialized. Run 'proofchain init' first.",
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  } catch (err) {
    throw new Error(
      `Failed to parse ProofChain config at ${filePath}: ${(err as Error).message}`,
    );
  }

  validateConfig(raw);

  // After validateConfig passes, raw satisfies ProofChainConfig.
  // We reconstruct the object explicitly so TypeScript narrows it cleanly.
  const obj = raw as Record<string, unknown>;
  return {
    asil_level:       obj['asil_level']       as AsilLevel,
    language:         obj['language']         as SupportedLanguage,
    coding_standard:  obj['coding_standard']  as CodingStandard,
    enforcement_mode: obj['enforcement_mode'] as EnforcementMode,
    thresholds:       validateThresholds(obj['thresholds']),
    gates:            validateGates(obj['gates']),
  };
}

/**
 * Write a ProofChainConfig to `<projectRoot>/.proofchain/config.json`.
 * Creates the `.proofchain` directory if it does not already exist.
 */
export function saveConfig(projectRoot: string, config: ProofChainConfig): void {
  const dir      = join(projectRoot, CONFIG_DIR);
  const filePath = join(dir, CONFIG_FILE);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Deep-merge `overrides` into `base`, preserving nested `thresholds` and `gates` objects.
 */
export function mergeConfig(
  base: ProofChainConfig,
  overrides: Partial<ProofChainConfig>,
): ProofChainConfig {
  return {
    asil_level:       overrides.asil_level       ?? base.asil_level,
    language:         overrides.language         ?? base.language,
    coding_standard:  overrides.coding_standard  ?? base.coding_standard,
    enforcement_mode: overrides.enforcement_mode ?? base.enforcement_mode,
    thresholds: overrides.thresholds !== undefined
      ? { ...base.thresholds, ...overrides.thresholds }
      : base.thresholds,
    gates: overrides.gates !== undefined
      ? { ...base.gates, ...overrides.gates }
      : base.gates,
  };
}
