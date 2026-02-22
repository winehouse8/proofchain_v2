/**
 * ProofChain Trace Skill
 *
 * Skill handler for traceability validation, orphan detection, and gap analysis.
 * Returns formatted reports as strings for Claude Code slash commands.
 */

import type { TraceValidator } from '../traceability/trace-validator.js';
import type { OrphanDetector } from '../traceability/orphan-detector.js';
import type { GapAnalyzer } from '../traceability/gap-analyzer.js';
import type { TraceMatrix } from '../traceability/trace-matrix.js';
import type { DependencyGraph } from '../graph/dependency-graph.js';
import type { AsilLevel } from '../core/types.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface TraceSkillContext {
  matrix: TraceMatrix;
  graph: DependencyGraph;
  knownRequirements: Array<{ id: string; asil_level: AsilLevel }>;
  knownCodeArtifacts: string[];
  knownTests: string[];
}

export interface TraceSkill {
  execute(command: 'validate' | 'orphans' | 'gaps' | 'coverage', context?: TraceSkillContext): string;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createTraceSkill(
  validator: TraceValidator,
  orphanDetector: OrphanDetector,
  gapAnalyzer: GapAnalyzer,
): TraceSkill {
  return {
    execute(command: 'validate' | 'orphans' | 'gaps' | 'coverage', context?: TraceSkillContext): string {
      if (context === undefined) {
        return `[ProofChain] Error: trace commands require a runtime context (matrix, graph, requirements, artifacts).`;
      }

      const { matrix, graph, knownRequirements, knownCodeArtifacts, knownTests } = context;

      switch (command) {
        case 'validate': {
          const reqIds = knownRequirements.map(r => r.id);
          const result = validator.validate(matrix, reqIds, knownCodeArtifacts);

          const verdict = result.is_valid ? 'VALID' : 'INVALID';
          const lines: string[] = [
            `[ProofChain] Traceability Validation: ${verdict}`,
            `  Total links           : ${result.total_links}`,
            `  Coverage              : ${pct(result.coverage_percentage)}`,
            `  Untraced code         : ${result.untraced_code.length}`,
            `  Unimplemented reqs    : ${result.unimplemented_requirements.length}`,
            `  Untested code         : ${result.untested_code.length}`,
            `  Untested requirements : ${result.untested_requirements.length}`,
          ];
          if (result.untraced_code.length > 0) {
            lines.push(``, `Untraced code artifacts:`);
            result.untraced_code.slice(0, 10).forEach(a => lines.push(`  - ${a}`));
            if (result.untraced_code.length > 10) {
              lines.push(`  ... and ${result.untraced_code.length - 10} more`);
            }
          }
          if (result.unimplemented_requirements.length > 0) {
            lines.push(``, `Unimplemented requirements:`);
            result.unimplemented_requirements.slice(0, 10).forEach(r => lines.push(`  - ${r}`));
            if (result.unimplemented_requirements.length > 10) {
              lines.push(`  ... and ${result.unimplemented_requirements.length - 10} more`);
            }
          }
          return lines.join('\n');
        }

        case 'orphans': {
          const report = orphanDetector.detect(matrix, graph);
          const lines: string[] = [
            `[ProofChain] Orphan Detection Report`,
            `  Total orphans        : ${report.total_orphans}`,
            `  Orphan code          : ${report.orphan_code.length}`,
            `  Orphan requirements  : ${report.orphan_requirements.length}`,
            `  Orphan tests         : ${report.orphan_tests.length}`,
          ];
          if (report.orphan_code.length > 0) {
            lines.push(``, `Orphan Code (no requirement trace):`);
            report.orphan_code.slice(0, 10).forEach(o =>
              lines.push(`  - ${o.id}${o.file_path ? ` (${o.file_path})` : ''}: ${o.reason}`),
            );
            if (report.orphan_code.length > 10) lines.push(`  ... and ${report.orphan_code.length - 10} more`);
          }
          if (report.orphan_requirements.length > 0) {
            lines.push(``, `Orphan Requirements (no implementation):`);
            report.orphan_requirements.slice(0, 10).forEach(o =>
              lines.push(`  - ${o.id}: ${o.reason}`),
            );
            if (report.orphan_requirements.length > 10) lines.push(`  ... and ${report.orphan_requirements.length - 10} more`);
          }
          if (report.orphan_tests.length > 0) {
            lines.push(``, `Orphan Tests (no code linkage):`);
            report.orphan_tests.slice(0, 10).forEach(o =>
              lines.push(`  - ${o.id}${o.file_path ? ` (${o.file_path})` : ''}: ${o.reason}`),
            );
            if (report.orphan_tests.length > 10) lines.push(`  ... and ${report.orphan_tests.length - 10} more`);
          }
          if (report.total_orphans === 0) {
            lines.push(``, `No orphans detected. Traceability integrity is intact.`);
          }
          return lines.join('\n');
        }

        case 'gaps': {
          const report = gapAnalyzer.analyze(
            matrix,
            knownRequirements,
            knownCodeArtifacts,
            knownTests,
          );
          const lines: string[] = [
            `[ProofChain] Traceability Gap Analysis`,
            `  Req -> Code coverage  : ${pct(report.requirement_to_code_coverage)}`,
            `  Code -> Test coverage : ${pct(report.code_to_test_coverage)}`,
            `  Req -> Test coverage  : ${pct(report.requirement_to_test_coverage)}`,
            `  Total gaps            : ${report.gaps.length}`,
            ``,
            `Summary: ${report.summary}`,
          ];
          if (report.gaps.length > 0) {
            lines.push(``, `Top Gaps (by ASIL priority):`);
            report.gaps.slice(0, 10).forEach(g =>
              lines.push(
                `  [${g.asil_level ?? 'QM'}] ${g.type}: ${g.artifact_id} — ${g.recommendation}`,
              ),
            );
            if (report.gaps.length > 10) lines.push(`  ... and ${report.gaps.length - 10} more`);
          }
          return lines.join('\n');
        }

        case 'coverage': {
          const reqIds = knownRequirements.map(r => r.id);
          const validationResult = validator.validate(matrix, reqIds, knownCodeArtifacts);
          const gapReport = gapAnalyzer.analyze(
            matrix,
            knownRequirements,
            knownCodeArtifacts,
            knownTests,
          );

          return [
            `[ProofChain] Traceability Coverage Summary`,
            `  Requirements         : ${reqIds.length}`,
            `  Code artifacts       : ${knownCodeArtifacts.length}`,
            `  Test artifacts       : ${knownTests.length}`,
            `  Trace links          : ${validationResult.total_links}`,
            ``,
            `  Code coverage        : ${pct(validationResult.coverage_percentage)}`,
            `  Req -> Code          : ${pct(gapReport.requirement_to_code_coverage)}`,
            `  Code -> Test         : ${pct(gapReport.code_to_test_coverage)}`,
            `  Req -> Test          : ${pct(gapReport.requirement_to_test_coverage)}`,
            ``,
            gapReport.summary,
          ].join('\n');
        }
      }
    },
  };
}
