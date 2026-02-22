/**
 * ProofChain Trace Validator
 *
 * Validates bidirectional traceability completeness.
 */

import type { TraceMatrix } from './trace-matrix.js';

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface TraceValidationResult {
  is_valid: boolean;
  untraced_code: string[];            // Code artifacts with no requirement trace
  unimplemented_requirements: string[]; // Requirements with no code trace
  untested_code: string[];            // Code artifacts with no test trace
  untested_requirements: string[];    // Requirements with no test coverage
  total_links: number;
  coverage_percentage: number;        // 0.0 to 1.0
}

export interface TraceValidator {
  validate(
    matrix: TraceMatrix,
    knownRequirements: string[],
    knownCodeArtifacts: string[],
  ): TraceValidationResult;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createTraceValidator(): TraceValidator {
  return {
    validate(
      matrix: TraceMatrix,
      knownRequirements: string[],
      knownCodeArtifacts: string[],
    ): TraceValidationResult {
      const untraced_code: string[] = [];
      const untested_code: string[] = [];

      for (const artifact of knownCodeArtifacts) {
        const reqs = matrix.getRequirementsForCode(artifact);
        if (reqs.length === 0) {
          untraced_code.push(artifact);
        }

        const tests = matrix.getTestsForCode(artifact);
        if (tests.length === 0) {
          untested_code.push(artifact);
        }
      }

      const unimplemented_requirements: string[] = [];
      const untested_requirements: string[] = [];

      for (const reqId of knownRequirements) {
        const code = matrix.getCodeForRequirement(reqId);
        if (code.length === 0) {
          unimplemented_requirements.push(reqId);
        } else {
          // Check if ANY of the code artifacts for this requirement have tests
          const hasTest = code.some(c => matrix.getTestsForCode(c).length > 0);
          if (!hasTest) {
            untested_requirements.push(reqId);
          }
        }
      }

      const totalCode = knownCodeArtifacts.length;
      const tracedCount = totalCode - untraced_code.length;
      const coverage_percentage = totalCode > 0 ? tracedCount / totalCode : 1.0;

      return {
        is_valid: untraced_code.length === 0 && unimplemented_requirements.length === 0,
        untraced_code,
        unimplemented_requirements,
        untested_code,
        untested_requirements,
        total_links: matrix.count(),
        coverage_percentage,
      };
    },
  };
}
