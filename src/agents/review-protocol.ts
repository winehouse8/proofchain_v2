/**
 * ProofChain Review Protocol
 *
 * ASIL-tiered review protocol specifications per ISO 26262-8.
 * Maps each ASIL level to its independence level, review type,
 * required dimensions, agent tier, and acceptance thresholds.
 */

import type {
  AsilLevel,
  IndependenceLevel,
  ReviewDimension,
  SafetyReviewResult,
  FindingSeverity,
} from '../core/types.js';

// ─── All 8 review dimensions ──────────────────────────────────────────────────

const ALL_DIMENSIONS: readonly ReviewDimension[] = [
  'requirements_compliance',
  'coding_standard',
  'defensive_programming',
  'error_handling',
  'resource_management',
  'concurrency_safety',
  'interface_correctness',
  'complexity_compliance',
];

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ReviewProtocolSpec {
  asil_level: AsilLevel;
  independence_level: IndependenceLevel;
  review_type: 'self_review' | 'single_independent' | 'dual_independent';
  required_dimensions: readonly ReviewDimension[];
  agent_tier: string;
  /** Number of critical findings in a single dimension that triggers rejection */
  min_findings_to_reject: number;
  requires_formal_checklist: boolean;
}

export interface ReviewProtocol {
  /** Determine the review protocol for a given ASIL level */
  getProtocol(asilLevel: AsilLevel): ReviewProtocolSpec;

  /** Check if the review result satisfies the protocol requirements */
  isProtocolSatisfied(result: SafetyReviewResult, protocol: ReviewProtocolSpec): boolean;
}

// ─── Protocol table ───────────────────────────────────────────────────────────

const PROTOCOL_TABLE: Readonly<Record<AsilLevel, ReviewProtocolSpec>> = {
  QM: {
    asil_level: 'QM',
    independence_level: 'I0',
    review_type: 'self_review',
    required_dimensions: ALL_DIMENSIONS,
    agent_tier: 'code-reviewer',
    min_findings_to_reject: 1,
    requires_formal_checklist: false,
  },
  A: {
    asil_level: 'A',
    independence_level: 'I0',
    review_type: 'self_review',
    required_dimensions: ALL_DIMENSIONS,
    agent_tier: 'code-reviewer',
    min_findings_to_reject: 1,
    requires_formal_checklist: false,
  },
  B: {
    asil_level: 'B',
    independence_level: 'I1',
    review_type: 'single_independent',
    required_dimensions: ALL_DIMENSIONS,
    agent_tier: 'code-reviewer',
    min_findings_to_reject: 1,
    requires_formal_checklist: false,
  },
  C: {
    asil_level: 'C',
    independence_level: 'I2',
    review_type: 'single_independent',
    required_dimensions: ALL_DIMENSIONS,
    agent_tier: 'architect',
    min_findings_to_reject: 1,
    requires_formal_checklist: true,
  },
  D: {
    asil_level: 'D',
    independence_level: 'I3',
    review_type: 'dual_independent',
    required_dimensions: ALL_DIMENSIONS,
    agent_tier: 'architect',
    min_findings_to_reject: 1,
    requires_formal_checklist: true,
  },
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Count critical findings within a single dimension result.
 * A 'fail' dimension with severity 'critical' contributes all its findings
 * toward the rejection threshold — the dimension itself is the signal.
 */
function hasCriticalFailure(
  result: SafetyReviewResult,
  minFindingsToReject: number,
): boolean {
  for (const dim of result.dimensions) {
    if (dim.status === 'fail' && dim.severity === 'critical') {
      // Each critical-fail dimension counts as at least 1 critical finding.
      // The threshold is how many such dimensions trigger rejection.
      if (minFindingsToReject <= 1) return true;

      // If threshold > 1, count total critical findings across the dimension
      const criticalCount = dim.findings.length > 0 ? dim.findings.length : 1;
      if (criticalCount >= minFindingsToReject) return true;
    }
  }
  return false;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createReviewProtocol(): ReviewProtocol {
  return {
    getProtocol(asilLevel: AsilLevel): ReviewProtocolSpec {
      return PROTOCOL_TABLE[asilLevel];
    },

    isProtocolSatisfied(
      result: SafetyReviewResult,
      protocol: ReviewProtocolSpec,
    ): boolean {
      const reviewedDimensions = new Set<string>(result.dimensions.map(d => d.name));

      // All required dimensions must have been reviewed
      for (const required of protocol.required_dimensions) {
        if (!reviewedDimensions.has(required)) return false;
      }

      // Any critical failure causes the protocol to not be satisfied
      if (hasCriticalFailure(result, protocol.min_findings_to_reject)) {
        return false;
      }

      return true;
    },
  };
}
