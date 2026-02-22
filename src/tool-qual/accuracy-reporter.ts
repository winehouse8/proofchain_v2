/**
 * ProofChain Tool Qualification — Accuracy Reporter
 *
 * Formats self-test results into an ISO 26262 Part 8 Clause 11 compliant
 * tool qualification report in Markdown. Includes:
 *  - Tool identification
 *  - Tool Confidence Level (TCL) classification
 *  - Detection accuracy metrics table
 *  - Per-sample results
 *  - Conclusion and recommendation
 */

import type { AsilLevel } from '../core/types.js';
import type { SelfTestSummary, SelfTestResult } from './self-test-runner.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

/** Tool Confidence Level per ISO 26262-8:2018 Table 4 */
export type ToolConfidenceLevel = 'TCL1' | 'TCL2' | 'TCL3';

/** Interface for generating tool qualification accuracy reports */
export interface AccuracyReporter {
  generateReport(summary: SelfTestSummary, asilLevel: AsilLevel): string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * Classify TCL based on ASIL level and overall accuracy.
 *
 * ISO 26262-8:2018 §11.4 — higher ASIL requires higher confidence:
 *  TCL1 = no additional qualification needed
 *  TCL2 = validation suite sufficient
 *  TCL3 = formal qualification required
 */
function classifyTcl(asilLevel: AsilLevel, accuracy: number): ToolConfidenceLevel {
  if (asilLevel === 'D' || asilLevel === 'C') {
    if (accuracy >= 0.99) return 'TCL1';
    if (accuracy >= 0.95) return 'TCL2';
    return 'TCL3';
  }
  if (asilLevel === 'B' || asilLevel === 'A') {
    if (accuracy >= 0.95) return 'TCL1';
    if (accuracy >= 0.90) return 'TCL2';
    return 'TCL3';
  }
  // QM
  if (accuracy >= 0.90) return 'TCL1';
  if (accuracy >= 0.80) return 'TCL2';
  return 'TCL3';
}

function tclDescription(tcl: ToolConfidenceLevel): string {
  switch (tcl) {
    case 'TCL1':
      return (
        'No additional qualification measures required. ' +
        'Tool malfunctions are considered unlikely to introduce or miss safety violations.'
      );
    case 'TCL2':
      return (
        'Increased confidence from use (ISO 26262-8:11.4.8) sufficient. ' +
        'Validation suite evidence documents acceptable tool behaviour.'
      );
    case 'TCL3':
      return (
        'Formal tool qualification required (ISO 26262-8:11.4.9). ' +
        'Tool accuracy is insufficient for the target ASIL without additional measures.'
      );
  }
}

function minAccuracyLabel(asilLevel: AsilLevel): string {
  if (asilLevel === 'D' || asilLevel === 'C') return '>= 99% (TCL1)';
  if (asilLevel === 'B' || asilLevel === 'A') return '>= 95% (TCL1)';
  return '>= 90% (TCL1)';
}

function formatSampleRow(r: SelfTestResult): string {
  const tpr =
    r.expected_violations > 0
      ? fmtPct(r.true_positives / r.expected_violations)
      : 'N/A';
  const status =
    r.false_negatives === 0 && r.false_positives === 0 ? 'PASS' : 'PARTIAL';
  return (
    `| ${r.sample_id} ` +
    `| ${r.expected_violations} ` +
    `| ${r.true_positives} ` +
    `| ${r.false_positives} ` +
    `| ${r.false_negatives} ` +
    `| ${tpr} ` +
    `| ${status} |`
  );
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAccuracyReporter(): AccuracyReporter {
  return {
    generateReport(summary: SelfTestSummary, asilLevel: AsilLevel): string {
      const now = new Date().toISOString();
      const tcl = classifyTcl(asilLevel, summary.overall_accuracy);
      const overallStatus = summary.passed ? 'PASS' : 'FAIL';

      const lines: string[] = [];

      // ── Header ───────────────────────────────────────────────────────────────
      lines.push('# ProofChain MISRA Rule Engine — Tool Qualification Report');
      lines.push('');
      lines.push('**Standard:** ISO 26262-8:2018 Clause 11 — Tool Confidence Level');
      lines.push(`**Generated:** ${now}`);
      lines.push(`**Target ASIL:** ${asilLevel}`);
      lines.push(`**Overall Status:** **${overallStatus}**`);
      lines.push('');
      lines.push('---');
      lines.push('');

      // ── Section 1: Tool Identification ───────────────────────────────────────
      lines.push('## 1. Tool Identification');
      lines.push('');
      lines.push('| Field | Value |');
      lines.push('|-------|-------|');
      lines.push('| Tool Name | ProofChain MISRA Rule Engine |');
      lines.push('| Tool Version | 0.1.0 |');
      lines.push('| Vendor | ProofChain Project |');
      lines.push('| Tool Category | Software Verification Tool (ISO 26262-8:11.2.1 — T2) |');
      lines.push('| Qualification Method | Validation Suite (ISO 26262-8:11.4.8) |');
      lines.push('| Target Language | C / C++ (MISRA C:2012) |');
      lines.push(`| Evaluation Date | ${now.substring(0, 10)} |`);
      lines.push('');

      // ── Section 2: TCL Classification ────────────────────────────────────────
      lines.push('## 2. Tool Confidence Level Classification');
      lines.push('');
      lines.push(`**Assigned TCL:** \`${tcl}\``);
      lines.push('');
      lines.push(tclDescription(tcl));
      lines.push('');
      lines.push('| ASIL Level | Required Min. Accuracy | Achieved Accuracy | TCL |');
      lines.push('|------------|------------------------|-------------------|-----|');
      lines.push(
        `| ${asilLevel} | ${minAccuracyLabel(asilLevel)} | ${fmtPct(summary.overall_accuracy)} | ${tcl} |`,
      );
      lines.push('');

      // ── Section 3: Detection Accuracy Metrics ────────────────────────────────
      lines.push('## 3. Detection Accuracy Metrics');
      lines.push('');
      lines.push('| Metric | Value |');
      lines.push('|--------|-------|');
      lines.push(`| Total Corpus Samples | ${summary.total_samples} |`);
      lines.push(`| Total Expected Violations | ${summary.total_expected} |`);
      lines.push(`| Total Detected Violations | ${summary.total_detected} |`);
      lines.push(`| True Positive Rate (Recall) | ${fmtPct(summary.true_positive_rate)} |`);
      lines.push(`| False Positive Rate | ${fmtPct(summary.false_positive_rate)} |`);
      lines.push(`| False Negative Rate | ${fmtPct(summary.false_negative_rate)} |`);
      lines.push(`| Overall Accuracy | **${fmtPct(summary.overall_accuracy)}** |`);
      lines.push('');

      // ── Section 4: Per-Sample Results ────────────────────────────────────────
      lines.push('## 4. Per-Sample Results');
      lines.push('');
      lines.push('| Sample ID | Expected | TP | FP | FN | TPR | Status |');
      lines.push('|-----------|----------|----|----|----|-----|--------|');
      for (const r of summary.results) {
        lines.push(formatSampleRow(r));
      }
      lines.push('');

      // Detail section for non-passing samples only
      const failingSamples = summary.results.filter(
        (r) => r.false_negatives > 0 || r.false_positives > 0,
      );
      if (failingSamples.length > 0) {
        lines.push('### 4.1 Detail for Non-Passing Samples');
        lines.push('');
        for (const r of failingSamples) {
          lines.push(`**${r.sample_id}**`);
          lines.push('');
          for (const detail of r.details) {
            if (detail.startsWith('FN') || detail.startsWith('FP')) {
              lines.push(`- ${detail}`);
            }
          }
          lines.push('');
        }
      }

      // ── Section 5: Conclusion and Recommendation ─────────────────────────────
      lines.push('## 5. Conclusion and Recommendation');
      lines.push('');
      if (summary.passed) {
        lines.push(
          `The ProofChain MISRA Rule Engine achieved an overall accuracy of ` +
          `**${fmtPct(summary.overall_accuracy)}** against the known-violations corpus, ` +
          `satisfying the minimum threshold for ASIL ${asilLevel} tool qualification.`,
        );
        lines.push('');
        lines.push(
          `**Recommendation:** The tool may be used in ASIL ${asilLevel} development activities ` +
          `under the qualification method described in ISO 26262-8:11.4.8 ` +
          `(Increased confidence from use).`,
        );
      } else {
        lines.push(
          `The ProofChain MISRA Rule Engine achieved an overall accuracy of ` +
          `**${fmtPct(summary.overall_accuracy)}**, which is below the minimum threshold ` +
          `for ASIL ${asilLevel} tool qualification.`,
        );
        lines.push('');
        lines.push(
          `**Recommendation:** Do NOT use this tool in ASIL ${asilLevel} development activities ` +
          `without first resolving the false-negative violations identified in Section 4. ` +
          `Re-run the qualification suite after rule engine improvements.`,
        );
      }
      lines.push('');
      lines.push(`**Assigned Confidence Level: \`${tcl}\`**`);
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push(
        '*Generated by ProofChain — ISO 26262-inspired safety-grade development enforcer*',
      );
      lines.push('');

      return lines.join('\n');
    },
  };
}
