/**
 * ProofChain Tool Qualification Skill
 *
 * Skill handler for tool qualification self-tests and accuracy reporting.
 * Returns formatted summary or full report strings for Claude Code slash commands.
 */

import type { SelfTestRunner } from '../tool-qual/self-test-runner.js';
import type { AccuracyReporter } from '../tool-qual/accuracy-reporter.js';
import type { AsilLevel } from '../core/types.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ToolQualSkill {
  execute(command: 'run' | 'report', asilLevel: AsilLevel): string;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createToolQualSkill(
  runner: SelfTestRunner,
  reporter: AccuracyReporter,
): ToolQualSkill {
  return {
    execute(command: 'run' | 'report', asilLevel: AsilLevel): string {
      switch (command) {
        case 'run': {
          const summary = runner.runAll(asilLevel);
          const accuracyPct = Math.round(summary.overall_accuracy * 100);
          const tprPct = Math.round(summary.true_positive_rate * 100);
          const fprPct = Math.round(summary.false_positive_rate * 100);

          const sampleLines = summary.results.map(r => {
            const icon = r.false_negatives === 0 && r.false_positives === 0
              ? '[PASS]'
              : '[FAIL]';
            return (
              `  ${icon} [${r.sample_id}] ` +
              `expected=${r.expected_violations} detected=${r.detected_violations} ` +
              `TP=${r.true_positives} FP=${r.false_positives} FN=${r.false_negatives}`
            );
          });

          const verdict = summary.passed
            ? 'PASSED — accuracy threshold met'
            : 'FAILED — accuracy below threshold';

          return [
            `[ProofChain] Tool Qualification Self-Test — ASIL-${asilLevel}`,
            `  Samples  : ${summary.total_samples}`,
            `  Accuracy : ${accuracyPct}%`,
            `  TPR      : ${tprPct}%`,
            `  FPR      : ${fprPct}%`,
            ``,
            `Samples:`,
            ...sampleLines,
            ``,
            `Verdict: ${verdict}`,
          ].join('\n');
        }

        case 'report': {
          const summary = runner.runAll(asilLevel);
          // generateReport returns a full ISO 26262-8 compliant Markdown report
          const markdownReport = reporter.generateReport(summary, asilLevel);
          return markdownReport;
        }
      }
    },
  };
}
