/**
 * ProofChain Verification Report Generator
 *
 * Generates formal verification reports per ISO 26262 Part 6.
 * Produces structured FormalVerificationReport objects and
 * professional ISO 26262 style Markdown output.
 */

import type { AsilLevel, SafetyReviewResult } from '../core/types.js';
import type { WorkflowResult } from './verification-workflow.js';

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface FormalVerificationReport {
  title: string;
  document_id: string;
  asil_level: AsilLevel;
  generated_at: string;

  // Section 1: Scope
  scope: {
    artifacts_in_scope: number;
    asil_level: AsilLevel;
    verification_methods: string[];
  };

  // Section 2: Verification Results
  results: {
    total_artifacts: number;
    verified: number;
    failed: number;
    pending: number;
    coverage_summary: {
      statement: number;
      branch: number;
      mcdc: number;
    };
  };

  // Section 3: Findings
  findings: {
    critical: number;
    major: number;
    minor: number;
    details: FormalFinding[];
  };

  // Section 4: Review Evidence
  review_evidence: {
    reviewer_id: string;
    independence_level: string;
    review_date: string;
    dimensions_reviewed: number;
    overall_verdict: string;
  } | null;

  // Section 5: Deviations
  deviations: FormalDeviation[];

  // Section 6: Conclusion
  conclusion: {
    verification_complete: boolean;
    remaining_debt: number;
    recommendation: string;
  };
}

export interface FormalFinding {
  id: string;
  severity: string;
  artifact_id: string;
  description: string;
  remediation: string;
  status: 'open' | 'resolved';
}

export interface FormalDeviation {
  rule_id: string;
  justification: string;
  asil_impact: string;
  approved_by: string | null;
}

export interface VerificationReportGenerator {
  generate(
    workflowResult: WorkflowResult,
    asilLevel: AsilLevel,
    reviewResult?: SafetyReviewResult | null,
  ): FormalVerificationReport;

  formatAsMarkdown(report: FormalVerificationReport): string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function compactTimestamp(): string {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    'T' +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    'Z'
  );
}

/** Build a markdown table from headers + rows */
function mdTable(headers: string[], rows: string[][]): string {
  const sep = headers.map(() => '---');
  const headerRow = `| ${headers.join(' | ')} |`;
  const sepRow = `| ${sep.join(' | ')} |`;
  const dataRows = rows.map(r => `| ${r.join(' | ')} |`);
  return [headerRow, sepRow, ...dataRows].join('\n');
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createVerificationReportGenerator(): VerificationReportGenerator {
  return {
    generate(
      workflowResult: WorkflowResult,
      asilLevel: AsilLevel,
      reviewResult?: SafetyReviewResult | null,
    ): FormalVerificationReport {
      const ts = compactTimestamp();
      const documentId = `VR-${asilLevel}-${ts}`;
      const generatedAt = new Date().toISOString();

      // ── Section 1: Scope ────────────────────────────────────────────────────
      const verificationMethods: string[] = ['Automated Ledger Check'];

      const coverageStep = workflowResult.steps.find(s => s.name === 'Coverage Gate');
      if (coverageStep && coverageStep.status !== 'skipped') {
        verificationMethods.push('Coverage Gate Analysis');
      }

      const misraStep = workflowResult.steps.find(s => s.name === 'MISRA Compliance');
      if (misraStep && misraStep.status !== 'skipped') {
        verificationMethods.push('MISRA Compliance Check');
      }

      const reviewStep = workflowResult.steps.find(s => s.name === 'Independent Review');
      if (reviewStep && reviewStep.status === 'passed') {
        verificationMethods.push('Independent Safety Review');
      }

      const totalArtifacts =
        workflowResult.artifacts_verified +
        workflowResult.artifacts_failed +
        workflowResult.artifacts_skipped;

      // ── Section 2: Results ──────────────────────────────────────────────────
      const pending = workflowResult.steps.some(s => s.status === 'pending') ? 1 : 0;

      let coverageSummary = { statement: 0, branch: 0, mcdc: 0 };
      if (workflowResult.coverage_result) {
        // Extract averages from coverage result summary text if available
        const summaryText = workflowResult.coverage_result.summary;
        const stmtMatch = summaryText.match(/stmt=([\d.]+)%/);
        const branchMatch = summaryText.match(/branch=([\d.]+)%/);
        const mcdcMatch = summaryText.match(/mcdc=([\d.]+)%/);
        coverageSummary = {
          statement: stmtMatch ? parseFloat(stmtMatch[1] ?? '0') : 0,
          branch: branchMatch ? parseFloat(branchMatch[1] ?? '0') : 0,
          mcdc: mcdcMatch ? parseFloat(mcdcMatch[1] ?? '0') : 0,
        };
      }

      // ── Section 3: Findings ─────────────────────────────────────────────────
      const formalFindings: FormalFinding[] = [];
      let findingSeq = 1;

      for (const step of workflowResult.steps) {
        if (step.status !== 'failed') continue;

        let severity: string;
        let description: string;
        let remediation: string;

        switch (step.name) {
          case 'Automated Checks':
            severity = 'major';
            description = `Ledger check failed: ${step.details}`;
            remediation = 'Re-verify stale and unverified artifacts against current requirements and tests.';
            break;
          case 'Coverage Gate':
            severity = asilLevel === 'D' || asilLevel === 'C' ? 'critical' : 'major';
            description = `Coverage thresholds not met: ${step.details}`;
            remediation = 'Add test cases targeting uncovered branches and statements.';
            break;
          case 'MISRA Compliance':
            severity = 'major';
            description = `MISRA rule violations detected: ${step.details}`;
            remediation = 'Apply suggested fixes from the MISRA rule engine and re-run compliance check.';
            break;
          case 'Independent Review':
            severity = asilLevel === 'D' || asilLevel === 'C' ? 'critical' : 'major';
            description = 'Independent review has not been completed.';
            remediation = 'Assign a qualified independent reviewer at the required ISO 26262-8 independence level.';
            break;
          default:
            severity = 'minor';
            description = `Step "${step.name}" failed: ${step.details}`;
            remediation = 'Investigate and resolve the reported failure.';
        }

        formalFindings.push({
          id: `FND-${findingSeq.toString().padStart(3, '0')}`,
          severity,
          artifact_id: `workflow::${step.name.toLowerCase().replace(/\s+/g, '-')}`,
          description,
          remediation,
          status: 'open',
        });
        findingSeq += 1;
      }

      const criticalCount = formalFindings.filter(f => f.severity === 'critical').length;
      const majorCount = formalFindings.filter(f => f.severity === 'major').length;
      const minorCount = formalFindings.filter(f => f.severity === 'minor').length;

      // ── Section 4: Review Evidence ──────────────────────────────────────────
      let reviewEvidence: FormalVerificationReport['review_evidence'] = null;

      const resolvedReview = reviewResult ?? workflowResult.review_result;
      if (resolvedReview) {
        reviewEvidence = {
          reviewer_id: resolvedReview.reviewer_id,
          independence_level: 'I2', // ISO 26262-8 default; actual level determined by reviewer config
          review_date: resolvedReview.reviewed_at,
          dimensions_reviewed: resolvedReview.dimensions.length,
          overall_verdict: resolvedReview.overall_status,
        };
      }

      // ── Section 5: Deviations ───────────────────────────────────────────────
      // Deviations are extracted from workflow steps that were skipped
      const deviations: FormalDeviation[] = [];
      for (const step of workflowResult.steps) {
        if (step.status !== 'skipped') continue;
        let ruleId: string;
        let asilImpact: string;
        switch (step.name) {
          case 'Coverage Gate':
            ruleId = 'ISO26262-6:Table-10';
            asilImpact = 'Coverage verification deferred; residual risk unquantified';
            break;
          case 'MISRA Compliance':
            ruleId = 'MISRA-C-2012:Dir-4.1';
            asilImpact = 'Coding standard compliance unverified';
            break;
          case 'Independent Review':
            ruleId = 'ISO26262-6:6.4.7';
            asilImpact = 'Independent review deferred; review independence not demonstrated';
            break;
          default:
            ruleId = `PROOFCHAIN::${step.name.toUpperCase().replace(/\s+/g, '_')}`;
            asilImpact = 'Step skipped; impact to be assessed';
        }
        deviations.push({
          rule_id: ruleId,
          justification: step.details,
          asil_impact: asilImpact,
          approved_by: null,
        });
      }

      // ── Section 6: Conclusion ───────────────────────────────────────────────
      const verificationComplete = workflowResult.overall_status === 'passed';
      const remainingDebt = workflowResult.debt_after;

      let recommendation: string;
      if (verificationComplete && remainingDebt === 0) {
        recommendation = 'Verification complete. Recommend release.';
      } else if (verificationComplete && remainingDebt > 0) {
        recommendation =
          `Verification complete with ${remainingDebt} outstanding debt item(s). ` +
          'Review debt items before release.';
      } else {
        const openFindings = formalFindings.filter(f => f.status === 'open').length;
        recommendation =
          `Verification incomplete. ${openFindings} item(s) require remediation prior to release.`;
      }

      return {
        title: `Verification Report — ASIL ${asilLevel}`,
        document_id: documentId,
        asil_level: asilLevel,
        generated_at: generatedAt,
        scope: {
          artifacts_in_scope: totalArtifacts,
          asil_level: asilLevel,
          verification_methods: verificationMethods,
        },
        results: {
          total_artifacts: totalArtifacts,
          verified: workflowResult.artifacts_verified,
          failed: workflowResult.artifacts_failed,
          pending,
          coverage_summary: coverageSummary,
        },
        findings: {
          critical: criticalCount,
          major: majorCount,
          minor: minorCount,
          details: formalFindings,
        },
        review_evidence: reviewEvidence,
        deviations,
        conclusion: {
          verification_complete: verificationComplete,
          remaining_debt: remainingDebt,
          recommendation,
        },
      };
    },

    formatAsMarkdown(report: FormalVerificationReport): string {
      const lines: string[] = [];

      // ── Header ──────────────────────────────────────────────────────────────
      lines.push(`# ${report.title}`);
      lines.push('');
      lines.push(`**Document ID:** ${report.document_id}  `);
      lines.push(`**ASIL Level:** ${report.asil_level}  `);
      lines.push(`**Generated:** ${report.generated_at}  `);
      lines.push(`**Status:** ${report.conclusion.verification_complete ? 'COMPLETE' : 'INCOMPLETE'}  `);
      lines.push('');
      lines.push('---');
      lines.push('');

      // ── Table of Contents ────────────────────────────────────────────────────
      lines.push('## Table of Contents');
      lines.push('');
      lines.push('1. [Scope](#1-scope)');
      lines.push('2. [Verification Results](#2-verification-results)');
      lines.push('3. [Findings](#3-findings)');
      lines.push('4. [Review Evidence](#4-review-evidence)');
      lines.push('5. [Deviations](#5-deviations)');
      lines.push('6. [Conclusion](#6-conclusion)');
      lines.push('');
      lines.push('---');
      lines.push('');

      // ── Section 1: Scope ────────────────────────────────────────────────────
      lines.push('## 1. Scope');
      lines.push('');
      lines.push(`This verification report covers **${report.scope.artifacts_in_scope}** artifact(s) ` +
        `at ASIL **${report.scope.asil_level}** integrity level, in accordance with ISO 26262 Part 6.`);
      lines.push('');
      lines.push('**Verification Methods Applied:**');
      lines.push('');
      for (const method of report.scope.verification_methods) {
        lines.push(`- ${method}`);
      }
      lines.push('');

      // ── Section 2: Verification Results ─────────────────────────────────────
      lines.push('## 2. Verification Results');
      lines.push('');
      lines.push(mdTable(
        ['Metric', 'Value'],
        [
          ['Total Artifacts', report.results.total_artifacts.toString()],
          ['Verified (Fresh)', report.results.verified.toString()],
          ['Failed', report.results.failed.toString()],
          ['Pending', report.results.pending.toString()],
        ],
      ));
      lines.push('');
      lines.push('### 2.1 Coverage Summary');
      lines.push('');

      const hasCovData =
        report.results.coverage_summary.statement > 0 ||
        report.results.coverage_summary.branch > 0 ||
        report.results.coverage_summary.mcdc > 0;

      if (hasCovData) {
        lines.push(mdTable(
          ['Metric', 'Average (%)'],
          [
            ['Statement Coverage', report.results.coverage_summary.statement.toFixed(1)],
            ['Branch Coverage', report.results.coverage_summary.branch.toFixed(1)],
            ['MC/DC Coverage', report.results.coverage_summary.mcdc.toFixed(1)],
          ],
        ));
      } else {
        lines.push('_No coverage data available._');
      }
      lines.push('');

      // ── Section 3: Findings ─────────────────────────────────────────────────
      lines.push('## 3. Findings');
      lines.push('');
      lines.push(mdTable(
        ['Severity', 'Count'],
        [
          ['Critical', report.findings.critical.toString()],
          ['Major', report.findings.major.toString()],
          ['Minor', report.findings.minor.toString()],
        ],
      ));
      lines.push('');

      if (report.findings.details.length > 0) {
        lines.push('### 3.1 Finding Details');
        lines.push('');
        lines.push(mdTable(
          ['ID', 'Severity', 'Artifact', 'Description', 'Remediation', 'Status'],
          report.findings.details.map(f => [
            f.id,
            f.severity.toUpperCase(),
            f.artifact_id,
            f.description.replace(/\|/g, '\\|'),
            f.remediation.replace(/\|/g, '\\|'),
            f.status.toUpperCase(),
          ]),
        ));
      } else {
        lines.push('_No findings recorded._');
      }
      lines.push('');

      // ── Section 4: Review Evidence ───────────────────────────────────────────
      lines.push('## 4. Review Evidence');
      lines.push('');
      if (report.review_evidence) {
        const re = report.review_evidence;
        lines.push(mdTable(
          ['Field', 'Value'],
          [
            ['Reviewer ID', re.reviewer_id],
            ['Independence Level', re.independence_level],
            ['Review Date', re.review_date],
            ['Dimensions Reviewed', re.dimensions_reviewed.toString()],
            ['Overall Verdict', re.overall_verdict.toUpperCase()],
          ],
        ));
      } else {
        lines.push('_No independent review evidence available._');
      }
      lines.push('');

      // ── Section 5: Deviations ────────────────────────────────────────────────
      lines.push('## 5. Deviations');
      lines.push('');
      if (report.deviations.length > 0) {
        lines.push(mdTable(
          ['Rule ID', 'Justification', 'ASIL Impact', 'Approved By'],
          report.deviations.map(d => [
            d.rule_id,
            d.justification.replace(/\|/g, '\\|'),
            d.asil_impact.replace(/\|/g, '\\|'),
            d.approved_by ?? '_Pending_',
          ]),
        ));
      } else {
        lines.push('_No deviations from the verification plan._');
      }
      lines.push('');

      // ── Section 6: Conclusion ────────────────────────────────────────────────
      lines.push('## 6. Conclusion');
      lines.push('');
      lines.push(mdTable(
        ['Field', 'Value'],
        [
          ['Verification Complete', report.conclusion.verification_complete ? 'YES' : 'NO'],
          ['Remaining Debt Items', report.conclusion.remaining_debt.toString()],
          ['Recommendation', report.conclusion.recommendation.replace(/\|/g, '\\|')],
        ],
      ));
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push(
        `_This document was generated automatically by ProofChain in accordance with ` +
        `ISO 26262 Part 6. Document ID: ${report.document_id}_`,
      );

      return lines.join('\n');
    },
  };
}
