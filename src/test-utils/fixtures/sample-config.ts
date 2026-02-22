/**
 * ProofChain Test Fixtures: Sample Configurations per ASIL Level
 *
 * One canonical ProofChainConfig object for every supported ASIL level.
 * Threshold and gate values follow the PRD specification table.
 * Use these when you need a fully populated config without touching the
 * real .proofchain/config.json on disk.
 */

import type { ProofChainConfig, AsilLevel } from '../../core/types.js';

// ─── QM (Quality-Managed, no safety integrity requirement) ───────────────────

export const CONFIG_QM: ProofChainConfig = {
  asil_level: 'QM',
  language: 'c',
  coding_standard: 'misra-c-2012',
  enforcement_mode: 'info',
  thresholds: {
    cyclomatic_complexity_max: 20,
    function_lines_max:        100,
    function_params_max:       7,
    nesting_depth_max:         6,
    comment_density_min:       0.0,
    statement_coverage_min:    0.6,
    branch_coverage_min:       0.5,
    mcdc_coverage_min:         0.0,
  },
  gates: {
    require_traceability_tag:       false,
    require_test_before_commit:     false,
    require_independent_review:     false,
    require_change_impact_analysis: false,
    require_safety_doc:             false,
  },
};

// ─── ASIL A ──────────────────────────────────────────────────────────────────

export const CONFIG_ASIL_A: ProofChainConfig = {
  asil_level: 'A',
  language: 'c',
  coding_standard: 'misra-c-2012',
  enforcement_mode: 'strict',
  thresholds: {
    cyclomatic_complexity_max: 15,
    function_lines_max:        75,
    function_params_max:       6,
    nesting_depth_max:         5,
    comment_density_min:       0.1,
    statement_coverage_min:    0.7,
    branch_coverage_min:       0.6,
    mcdc_coverage_min:         0.5,
  },
  gates: {
    require_traceability_tag:       true,
    require_test_before_commit:     true,
    require_independent_review:     false,
    require_change_impact_analysis: false,
    require_safety_doc:             false,
  },
};

// ─── ASIL B ──────────────────────────────────────────────────────────────────

export const CONFIG_ASIL_B: ProofChainConfig = {
  asil_level: 'B',
  language: 'c',
  coding_standard: 'misra-c-2012',
  enforcement_mode: 'strict',
  thresholds: {
    cyclomatic_complexity_max: 10,
    function_lines_max:        50,
    function_params_max:       5,
    nesting_depth_max:         4,
    comment_density_min:       0.15,
    statement_coverage_min:    0.8,
    branch_coverage_min:       0.7,
    mcdc_coverage_min:         0.6,
  },
  gates: {
    require_traceability_tag:       true,
    require_test_before_commit:     true,
    require_independent_review:     false,
    require_change_impact_analysis: true,
    require_safety_doc:             false,
  },
};

// ─── ASIL C ──────────────────────────────────────────────────────────────────

export const CONFIG_ASIL_C: ProofChainConfig = {
  asil_level: 'C',
  language: 'c',
  coding_standard: 'misra-c-2012',
  enforcement_mode: 'strict',
  thresholds: {
    cyclomatic_complexity_max: 10,
    function_lines_max:        50,
    function_params_max:       5,
    nesting_depth_max:         4,
    comment_density_min:       0.2,
    statement_coverage_min:    0.9,
    branch_coverage_min:       0.85,
    mcdc_coverage_min:         0.8,
  },
  gates: {
    require_traceability_tag:       true,
    require_test_before_commit:     true,
    require_independent_review:     true,
    require_change_impact_analysis: true,
    require_safety_doc:             true,
  },
};

// ─── ASIL D (highest integrity) ──────────────────────────────────────────────

export const CONFIG_ASIL_D: ProofChainConfig = {
  asil_level: 'D',
  language: 'c',
  coding_standard: 'misra-c-2012',
  enforcement_mode: 'strict',
  thresholds: {
    cyclomatic_complexity_max: 10,
    function_lines_max:        50,
    function_params_max:       5,
    nesting_depth_max:         4,
    comment_density_min:       0.2,
    statement_coverage_min:    0.95,
    branch_coverage_min:       0.95,
    mcdc_coverage_min:         0.9,
  },
  gates: {
    require_traceability_tag:       true,
    require_test_before_commit:     true,
    require_independent_review:     true,
    require_change_impact_analysis: true,
    require_safety_doc:             true,
  },
};

// ─── Aggregate Record ────────────────────────────────────────────────────────

export const SAMPLE_CONFIGS: Readonly<Record<AsilLevel, ProofChainConfig>> = {
  QM: CONFIG_QM,
  A:  CONFIG_ASIL_A,
  B:  CONFIG_ASIL_B,
  C:  CONFIG_ASIL_C,
  D:  CONFIG_ASIL_D,
};

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Return the canonical sample config for the given ASIL level.
 * Useful in parameterised tests where the level is a variable.
 */
export function getConfigForAsil(level: AsilLevel): ProofChainConfig {
  return SAMPLE_CONFIGS[level];
}
