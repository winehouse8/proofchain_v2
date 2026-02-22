/**
 * ProofChain ASIL Preset Configurations
 *
 * Canonical threshold and gate values per ASIL level, as specified in the PRD.
 * Used during `proofchain init` to populate .proofchain/config.json.
 */

import type {
  AsilLevel,
  AsilThresholds,
  AsilGates,
  ProofChainConfig,
  SupportedLanguage,
  CodingStandard,
  EnforcementMode,
} from '../core/types.js';

// ─── Preset Table ─────────────────────────────────────────────────────────────

export const ASIL_PRESETS: Record<
  AsilLevel,
  { thresholds: AsilThresholds; gates: AsilGates }
> = {
  // ISO 26262 Part 6 Table 12 aligned coverage values (Rev.2 plan)
  QM: {
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
  },

  A: {
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
  },

  B: {
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
  },

  C: {
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
  },

  D: {
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
  },
};

// ─── Default Config Factory ──────────────────────────────────────────────────

/**
 * Build a complete ProofChainConfig from an ASIL level and optional language.
 *
 * - Language defaults to 'c'.
 * - Coding standard defaults to 'misra-c-2012' for C, 'misra-cpp-2008' for C++.
 * - Enforcement mode is 'info' for QM, 'strict' for ASIL A through D.
 */
export function getDefaultConfig(
  asilLevel: AsilLevel,
  language: SupportedLanguage = 'c',
): ProofChainConfig {
  const preset = ASIL_PRESETS[asilLevel];

  const codingStandard: CodingStandard =
    language === 'cpp' ? 'misra-cpp-2008' : 'misra-c-2012';

  const enforcementMode: EnforcementMode =
    asilLevel === 'QM' ? 'info' : 'strict';

  return {
    asil_level:       asilLevel,
    language,
    coding_standard:  codingStandard,
    enforcement_mode: enforcementMode,
    thresholds:       preset.thresholds,
    gates:            preset.gates,
  };
}
