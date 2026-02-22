/**
 * ProofChain Dual Review Orchestrator
 *
 * Implements ASIL-D dual independent review per ISO 26262-8.
 * Two reviewers with complementary emphases examine the same code
 * independently; this orchestrator merges their results, identifies
 * agreements and conflicts, and determines the final verdict.
 */

import type {
  ReviewDimension,
  ReviewDimensionStatus,
  FindingSeverity,
  ReviewFinding,
  DimensionResult,
  SafetyReviewResult,
} from '../core/types.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface DualReviewAgreement {
  dimension: ReviewDimension;
  status: ReviewDimensionStatus;
  confirmed_findings: readonly ReviewFinding[];
}

export interface DualReviewConflict {
  dimension: ReviewDimension;
  status_a: ReviewDimensionStatus;
  status_b: ReviewDimensionStatus;
  severity_a: FindingSeverity;
  severity_b: FindingSeverity;
  requires_escalation: boolean;
}

export interface DualReviewResult {
  review_a: SafetyReviewResult;
  review_b: SafetyReviewResult;
  merged: SafetyReviewResult;
  agreements: DualReviewAgreement[];
  conflicts: DualReviewConflict[];
  single_reviewer_findings: ReviewFinding[];
}

export interface DualReviewOrchestrator {
  /** Compare two independent reviews and merge results */
  mergeReviews(reviewA: SafetyReviewResult, reviewB: SafetyReviewResult): DualReviewResult;

  /** Generate review emphasis parameters for Reviewer A */
  getReviewerAEmphasis(): readonly ReviewDimension[];

  /** Generate review emphasis parameters for Reviewer B */
  getReviewerBEmphasis(): readonly ReviewDimension[];
}

// ─── Reviewer emphasis assignments ───────────────────────────────────────────

const REVIEWER_A_EMPHASIS: readonly ReviewDimension[] = [
  'defensive_programming',
  'error_handling',
  'resource_management',
  'coding_standard',
];

const REVIEWER_B_EMPHASIS: readonly ReviewDimension[] = [
  'interface_correctness',
  'concurrency_safety',
  'requirements_compliance',
  'complexity_compliance',
];

// ─── Severity ordering ────────────────────────────────────────────────────────

const SEVERITY_RANK: Readonly<Record<FindingSeverity, number>> = {
  minor: 0,
  major: 1,
  critical: 2,
};

function severityDiff(a: FindingSeverity, b: FindingSeverity): number {
  return Math.abs(SEVERITY_RANK[a] - SEVERITY_RANK[b]);
}

// ─── Finding identity ─────────────────────────────────────────────────────────

/** Two findings are considered the same if they point to the same file:line. */
function findingKey(f: ReviewFinding): string {
  return `${f.file}:${f.line}`;
}

/**
 * Partition findings from A and B into:
 * - confirmed: present in both (same file:line)
 * - only_in_a: unique to reviewer A
 * - only_in_b: unique to reviewer B
 */
function partitionFindings(
  findingsA: readonly ReviewFinding[],
  findingsB: readonly ReviewFinding[],
): {
  confirmed: ReviewFinding[];
  only_in_a: ReviewFinding[];
  only_in_b: ReviewFinding[];
} {
  const keysA = new Map<string, ReviewFinding>();
  for (const f of findingsA) keysA.set(findingKey(f), f);

  const keysB = new Map<string, ReviewFinding>();
  for (const f of findingsB) keysB.set(findingKey(f), f);

  const confirmed: ReviewFinding[] = [];
  const only_in_a: ReviewFinding[] = [];
  const only_in_b: ReviewFinding[] = [];

  for (const [key, finding] of keysA) {
    if (keysB.has(key)) {
      confirmed.push(finding);
    } else {
      only_in_a.push(finding);
    }
  }

  for (const [key, finding] of keysB) {
    if (!keysA.has(key)) {
      only_in_b.push(finding);
    }
  }

  return { confirmed, only_in_a, only_in_b };
}

// ─── Status merging ───────────────────────────────────────────────────────────

/**
 * Determine the merged status for a dimension when reviewers agree.
 * Trivial: both are the same value.
 */
function mergedStatusForAgreement(status: ReviewDimensionStatus): ReviewDimensionStatus {
  return status;
}

/**
 * Determine the merged status when reviewers disagree.
 * Conservative rule: take the worse of the two statuses.
 * fail > warn > pass
 */
const STATUS_RANK: Readonly<Record<ReviewDimensionStatus, number>> = {
  pass: 0,
  warn: 1,
  fail: 2,
};

function worseStatus(
  a: ReviewDimensionStatus,
  b: ReviewDimensionStatus,
): ReviewDimensionStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

function worseSeverity(a: FindingSeverity, b: FindingSeverity): FindingSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

// ─── Overall status computation ───────────────────────────────────────────────

function computeOverallStatus(
  dimensions: readonly DimensionResult[],
): SafetyReviewResult['overall_status'] {
  let hasWarn = false;

  for (const dim of dimensions) {
    if (dim.status === 'fail' && dim.severity === 'critical') {
      return 'rejected';
    }
    if (dim.status === 'warn' || dim.status === 'fail') {
      hasWarn = true;
    }
  }

  return hasWarn ? 'approved_with_conditions' : 'approved';
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createDualReviewOrchestrator(): DualReviewOrchestrator {
  return {
    getReviewerAEmphasis(): readonly ReviewDimension[] {
      return REVIEWER_A_EMPHASIS;
    },

    getReviewerBEmphasis(): readonly ReviewDimension[] {
      return REVIEWER_B_EMPHASIS;
    },

    mergeReviews(
      reviewA: SafetyReviewResult,
      reviewB: SafetyReviewResult,
    ): DualReviewResult {
      // Build lookup maps keyed by dimension name
      const dimMapA = new Map<string, DimensionResult>();
      for (const d of reviewA.dimensions) dimMapA.set(d.name, d);

      const dimMapB = new Map<string, DimensionResult>();
      for (const d of reviewB.dimensions) dimMapB.set(d.name, d);

      // Collect all dimension names across both reviews (union)
      const allDimNames = new Set<string>([
        ...dimMapA.keys(),
        ...dimMapB.keys(),
      ]);

      const agreements: DualReviewAgreement[] = [];
      const conflicts: DualReviewConflict[] = [];
      const singleReviewerFindings: ReviewFinding[] = [];
      const mergedDimensions: DimensionResult[] = [];

      for (const dimName of allDimNames) {
        const dimA = dimMapA.get(dimName);
        const dimB = dimMapB.get(dimName);

        if (dimA !== undefined && dimB !== undefined) {
          // Both reviewers assessed this dimension
          const { confirmed, only_in_a, only_in_b } = partitionFindings(
            dimA.findings,
            dimB.findings,
          );

          singleReviewerFindings.push(...only_in_a, ...only_in_b);

          if (dimA.status === dimB.status) {
            // Agreement
            const agreedStatus = mergedStatusForAgreement(dimA.status);
            const agreedSeverity = worseSeverity(dimA.severity, dimB.severity);

            agreements.push({
              dimension: dimName as ReviewDimension,
              status: agreedStatus,
              confirmed_findings: confirmed,
            });

            mergedDimensions.push({
              name: dimName as ReviewDimension,
              status: agreedStatus,
              severity: agreedSeverity,
              findings: confirmed,
            });
          } else {
            // Conflict
            const diff = severityDiff(dimA.severity, dimB.severity);
            const requiresEscalation = diff > 1;

            conflicts.push({
              dimension: dimName as ReviewDimension,
              status_a: dimA.status,
              status_b: dimB.status,
              severity_a: dimA.severity,
              severity_b: dimB.severity,
              requires_escalation: requiresEscalation,
            });

            // Conservative merge: take the worse status and severity
            mergedDimensions.push({
              name: dimName as ReviewDimension,
              status: worseStatus(dimA.status, dimB.status),
              severity: worseSeverity(dimA.severity, dimB.severity),
              // Include all findings from both reviewers in conflict case
              findings: [...dimA.findings, ...dimB.findings],
            });
          }
        } else if (dimA !== undefined) {
          // Only reviewer A assessed this dimension
          singleReviewerFindings.push(...dimA.findings);
          mergedDimensions.push(dimA);
        } else if (dimB !== undefined) {
          // Only reviewer B assessed this dimension
          singleReviewerFindings.push(...dimB.findings);
          mergedDimensions.push(dimB);
        }
      }

      const overallStatus = computeOverallStatus(mergedDimensions);

      // Use the later of the two review timestamps
      const mergedAt =
        reviewA.reviewed_at >= reviewB.reviewed_at
          ? reviewA.reviewed_at
          : reviewB.reviewed_at;

      const merged: SafetyReviewResult = {
        dimensions: mergedDimensions,
        overall_status: overallStatus,
        reviewer_id: `dual:${reviewA.reviewer_id}+${reviewB.reviewer_id}`,
        reviewed_at: mergedAt,
      };

      return {
        review_a: reviewA,
        review_b: reviewB,
        merged,
        agreements,
        conflicts,
        single_reviewer_findings: singleReviewerFindings,
      };
    },
  };
}
