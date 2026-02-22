/**
 * ProofChain Gap Analyzer
 *
 * Computes traceability coverage gaps and generates a human-readable report.
 */

import type { AsilLevel, ArtifactType } from '../core/types.js';
import type { TraceMatrix } from './trace-matrix.js';

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface TraceabilityGap {
  type: 'missing_code_trace' | 'missing_test_trace' | 'missing_requirement_trace';
  artifact_id: string;
  artifact_type: ArtifactType;
  asil_level: AsilLevel | null;
  recommendation: string;
}

export interface GapReport {
  requirement_to_code_coverage: number;   // 0.0 to 1.0
  code_to_test_coverage: number;          // 0.0 to 1.0
  requirement_to_test_coverage: number;   // 0.0 to 1.0
  gaps: TraceabilityGap[];
  summary: string;                         // Human-readable summary
}

export interface GapAnalyzer {
  analyze(
    matrix: TraceMatrix,
    knownRequirements: Array<{ id: string; asil_level: AsilLevel }>,
    knownCodeArtifacts: string[],
    knownTests: string[],
  ): GapReport;
}

// ─── ASIL Sort Order ──────────────────────────────────────────────────────────

const ASIL_ORDER: Record<AsilLevel, number> = {
  D: 0,
  C: 1,
  B: 2,
  A: 3,
  QM: 4,
};

const GAP_TYPE_ORDER: Record<TraceabilityGap['type'], number> = {
  missing_code_trace: 0,
  missing_test_trace: 1,
  missing_requirement_trace: 2,
};

function sortGaps(gaps: TraceabilityGap[]): TraceabilityGap[] {
  return [...gaps].sort((a, b) => {
    const aAsil = a.asil_level !== null ? ASIL_ORDER[a.asil_level] : 5;
    const bAsil = b.asil_level !== null ? ASIL_ORDER[b.asil_level] : 5;
    if (aAsil !== bAsil) return aAsil - bAsil;
    return GAP_TYPE_ORDER[a.type] - GAP_TYPE_ORDER[b.type];
  });
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createGapAnalyzer(): GapAnalyzer {
  return {
    analyze(
      matrix: TraceMatrix,
      knownRequirements: Array<{ id: string; asil_level: AsilLevel }>,
      knownCodeArtifacts: string[],
      knownTests: string[],
    ): GapReport {
      const gaps: TraceabilityGap[] = [];

      // Build lookup: requirement id -> asil_level
      const reqAsilMap = new Map<string, AsilLevel>();
      for (const r of knownRequirements) {
        reqAsilMap.set(r.id, r.asil_level);
      }

      // ── Requirement → Code coverage ────────────────────────────────────────
      let reqWithCode = 0;
      for (const req of knownRequirements) {
        const code = matrix.getCodeForRequirement(req.id);
        if (code.length > 0) {
          reqWithCode++;
        } else {
          gaps.push({
            type: 'missing_code_trace',
            artifact_id: req.id,
            artifact_type: 'requirement',
            asil_level: req.asil_level,
            recommendation: `Add @trace ${req.id} tag to implementing function`,
          });
        }
      }

      const requirement_to_code_coverage =
        knownRequirements.length > 0 ? reqWithCode / knownRequirements.length : 1.0;

      // ── Code → Test coverage ───────────────────────────────────────────────
      let codeWithTest = 0;
      for (const artifactId of knownCodeArtifacts) {
        const tests = matrix.getTestsForCode(artifactId);
        if (tests.length > 0) {
          codeWithTest++;
        } else {
          gaps.push({
            type: 'missing_test_trace',
            artifact_id: artifactId,
            artifact_type: 'function',
            asil_level: null,
            recommendation: `Add test for ${artifactId}`,
          });
        }
      }

      const code_to_test_coverage =
        knownCodeArtifacts.length > 0 ? codeWithTest / knownCodeArtifacts.length : 1.0;

      // ── Code → Requirement coverage (missing_requirement_trace) ───────────
      let codeWithReq = 0;
      for (const artifactId of knownCodeArtifacts) {
        const reqs = matrix.getRequirementsForCode(artifactId);
        if (reqs.length > 0) {
          codeWithReq++;
        } else {
          gaps.push({
            type: 'missing_requirement_trace',
            artifact_id: artifactId,
            artifact_type: 'function',
            asil_level: null,
            recommendation: `Add @trace tag or document requirement for ${artifactId}`,
          });
        }
      }

      // ── Requirement → Test coverage ────────────────────────────────────────
      let reqWithTest = 0;
      for (const req of knownRequirements) {
        const code = matrix.getCodeForRequirement(req.id);
        const hasTest = code.some(c => matrix.getTestsForCode(c).length > 0);
        if (hasTest) {
          reqWithTest++;
        }
      }

      const requirement_to_test_coverage =
        knownRequirements.length > 0 ? reqWithTest / knownRequirements.length : 1.0;

      // ── Sort gaps ──────────────────────────────────────────────────────────
      const sortedGaps = sortGaps(gaps);

      // ── Summary ────────────────────────────────────────────────────────────
      const summary =
        `Traceability: ${pct(requirement_to_code_coverage)} req→code, ` +
        `${pct(code_to_test_coverage)} code→test, ` +
        `${pct(requirement_to_test_coverage)} req→test. ` +
        `${sortedGaps.length} gap${sortedGaps.length === 1 ? '' : 's'} found.`;

      return {
        requirement_to_code_coverage,
        code_to_test_coverage,
        requirement_to_test_coverage,
        gaps: sortedGaps,
        summary,
      };
    },
  };
}
