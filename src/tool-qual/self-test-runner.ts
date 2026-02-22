/**
 * ProofChain Tool Qualification — Self-Test Runner
 *
 * Runs the MISRA rule engine against the known-violations corpus and computes
 * detection accuracy metrics. Used to satisfy ISO 26262 Part 8 Clause 11
 * tool qualification requirements.
 *
 * Accuracy metrics computed:
 *  - True Positive Rate  (TPR): detected / expected violations
 *  - False Positive Rate (FPR): spurious detections on expected-clean lines
 *  - False Negative Rate (FNR): missed violations
 *  - Overall Accuracy: (TP + TN) / (TP + TN + FP + FN)
 */

import type { RuleEngine } from '../rules/rule-engine.js';
import type { AsilLevel } from '../core/types.js';
import { getKnownViolationsCorpus } from './known-violations-corpus.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

/** Per-sample self-test result */
export interface SelfTestResult {
  sample_id: string;
  expected_violations: number;
  detected_violations: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  details: string[];
}

/** Aggregate self-test summary across all corpus samples */
export interface SelfTestSummary {
  total_samples: number;
  total_expected: number;
  total_detected: number;
  true_positive_rate: number;
  false_positive_rate: number;
  false_negative_rate: number;
  overall_accuracy: number;
  passed: boolean;
  results: SelfTestResult[];
}

/** Self-test runner interface */
export interface SelfTestRunner {
  runAll(asilLevel: AsilLevel): SelfTestSummary;
  runSingle(sampleId: string, asilLevel: AsilLevel): SelfTestResult;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const ACCURACY_THRESHOLD = 0.95;

function safeRate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSelfTestRunner(ruleEngine: RuleEngine): SelfTestRunner {
  const corpus = getKnownViolationsCorpus();

  const runner: SelfTestRunner = {
    runSingle(sampleId: string, asilLevel: AsilLevel): SelfTestResult {
      const sample = corpus.find((s) => s.id === sampleId);
      if (sample === undefined) {
        return {
          sample_id: sampleId,
          expected_violations: 0,
          detected_violations: 0,
          true_positives: 0,
          false_positives: 0,
          false_negatives: 0,
          details: [`ERROR: Sample '${sampleId}' not found in corpus`],
        };
      }

      const detected = ruleEngine.evaluate(sample.code, sample.file_path, asilLevel);

      const details: string[] = [];
      let truePositives = 0;
      let falsePositives = 0;
      let falseNegatives = 0;

      // Check each expected violation — was it detected?
      for (const expected of sample.expected_violations) {
        const found = detected.some(
          (v) => v.rule_id === expected.rule_id && v.line === expected.line,
        );
        if (found) {
          truePositives++;
          details.push(
            `TP: ${expected.rule_id} @ line ${expected.line} — detected correctly`,
          );
        } else {
          falseNegatives++;
          details.push(
            `FN: ${expected.rule_id} @ line ${expected.line} — NOT detected (missed violation)`,
          );
        }
      }

      // Check each detected violation — was it expected or spurious?
      for (const violation of detected) {
        const wasExpected = sample.expected_violations.some(
          (e) => e.rule_id === violation.rule_id && e.line === violation.line,
        );
        if (!wasExpected) {
          const isCleanLine = sample.expected_clean_lines.includes(violation.line);
          if (isCleanLine) {
            falsePositives++;
            details.push(
              `FP: ${violation.rule_id} @ line ${violation.line} — unexpected on clean line`,
            );
          } else {
            details.push(
              `INFO: ${violation.rule_id} @ line ${violation.line} — detected on unlabelled line`,
            );
          }
        }
      }

      return {
        sample_id: sampleId,
        expected_violations: sample.expected_violations.length,
        detected_violations: detected.length,
        true_positives: truePositives,
        false_positives: falsePositives,
        false_negatives: falseNegatives,
        details,
      };
    },

    runAll(asilLevel: AsilLevel): SelfTestSummary {
      const results: SelfTestResult[] = corpus.map((sample) =>
        runner.runSingle(sample.id, asilLevel),
      );

      let totalExpected = 0;
      let totalDetected = 0;
      let totalTP = 0;
      let totalFP = 0;
      let totalFN = 0;

      for (const r of results) {
        totalExpected += r.expected_violations;
        totalDetected += r.detected_violations;
        totalTP += r.true_positives;
        totalFP += r.false_positives;
        totalFN += r.false_negatives;
      }

      const totalCleanLines = corpus.reduce(
        (sum, s) => sum + s.expected_clean_lines.length,
        0,
      );
      const totalTN = Math.max(0, totalCleanLines - totalFP);

      const tpr = safeRate(totalTP, totalTP + totalFN);
      const fpr = safeRate(totalFP, totalFP + totalTN);
      const fnr = safeRate(totalFN, totalFN + totalTP);
      const accuracy = safeRate(
        totalTP + totalTN,
        totalTP + totalTN + totalFP + totalFN,
      );

      return {
        total_samples: corpus.length,
        total_expected: totalExpected,
        total_detected: totalDetected,
        true_positive_rate: tpr,
        false_positive_rate: fpr,
        false_negative_rate: fnr,
        overall_accuracy: accuracy,
        passed: accuracy >= ACCURACY_THRESHOLD,
        results,
      };
    },
  };

  return runner;
}
