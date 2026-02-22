/**
 * ProofChain Verification Workflow
 *
 * End-to-end verification workflow orchestrator.
 * Executes verification steps in order, tracks durations, logs to audit trail.
 * ISO 26262 Part 6 compliant workflow sequencing.
 */

import type { AsilLevel, SafetyReviewResult } from '../core/types.js';
import type { CoverageGateResult } from '../coverage/coverage-gate.js';
import type { VerificationLedger } from '../ledger/verification-ledger.js';
import type { DebtTracker } from './debt-tracker.js';
import type { AuditLogger } from '../state/audit-logger.js';

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface WorkflowStep {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  details: string;
}

export interface WorkflowResult {
  overall_status: 'passed' | 'failed' | 'partial';
  steps: WorkflowStep[];
  artifacts_verified: number;
  artifacts_failed: number;
  artifacts_skipped: number;
  review_result: SafetyReviewResult | null;
  coverage_result: CoverageGateResult | null;
  debt_after: number;
  timestamp: string;
}

export interface VerificationWorkflowDeps {
  ledger: VerificationLedger;
  debtTracker: DebtTracker;
  auditLogger: AuditLogger;
  asilLevel: AsilLevel;
}

export interface FixWorkItem {
  artifact_id: string;
  step_failed: string;
  description: string;
  priority: number;
  asil_level: AsilLevel;
}

export interface VerificationWorkflow {
  /** Run full verification for a set of artifacts */
  runFull(artifactIds: string[], deps: VerificationWorkflowDeps): WorkflowResult;

  /** Run incremental verification for stale artifacts only */
  runIncremental(deps: VerificationWorkflowDeps): WorkflowResult;

  /** Generate fix work items from failed verification */
  generateFixItems(result: WorkflowResult): FixWorkItem[];
}

// ─── ASIL Priority Map ────────────────────────────────────────────────────────

const ASIL_PRIORITY: Record<AsilLevel, number> = {
  D: 1,
  C: 2,
  B: 3,
  A: 4,
  QM: 5,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function elapsed(start: number): number {
  return Date.now() - start;
}

function makeStep(name: string): WorkflowStep {
  return { name, status: 'pending', duration_ms: 0, details: '' };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createVerificationWorkflow(): VerificationWorkflow {
  function executeSteps(
    artifactIds: string[],
    deps: VerificationWorkflowDeps,
  ): WorkflowResult {
    const { ledger, debtTracker, auditLogger, asilLevel } = deps;
    const timestamp = now();

    const steps: WorkflowStep[] = [
      makeStep('Automated Checks'),
      makeStep('Coverage Gate'),
      makeStep('MISRA Compliance'),
      makeStep('Independent Review'),
      makeStep('Report Generation'),
    ];

    let artifactsVerified = 0;
    let artifactsFailed = 0;
    let artifactsSkipped = 0;
    let coverageResult: CoverageGateResult | null = null;

    // ── Step 0: Automated Checks ──────────────────────────────────────────────
    {
      const step = steps[0]!;
      step.status = 'running';
      const t0 = Date.now();

      const stale: string[] = [];
      const unverified: string[] = [];
      const failed: string[] = [];
      const fresh: string[] = [];

      for (const id of artifactIds) {
        const entry = ledger.getEntry(id);
        if (!entry) {
          unverified.push(id);
          artifactsFailed += 1;
          continue;
        }
        switch (entry.verification_status) {
          case 'fresh':
            fresh.push(id);
            artifactsVerified += 1;
            break;
          case 'stale':
            stale.push(id);
            artifactsFailed += 1;
            break;
          case 'unverified':
            unverified.push(id);
            artifactsFailed += 1;
            break;
          case 'failed':
            failed.push(id);
            artifactsFailed += 1;
            break;
        }
      }

      step.duration_ms = elapsed(t0);

      const needsWork = stale.length + unverified.length + failed.length;
      if (needsWork > 0) {
        step.status = 'failed';
        step.details =
          `${fresh.length} fresh, ${stale.length} stale, ` +
          `${unverified.length} unverified, ${failed.length} failed`;
      } else {
        step.status = 'passed';
        step.details = `All ${fresh.length} artifact(s) verified fresh`;
      }

      auditLogger.log({
        timestamp: now(),
        event_type: artifactsFailed > 0 ? 'verification_failed' : 'verification_passed',
        agent_id: 'verification-workflow',
        artifact_id: null,
        file_path: null,
        function_name: null,
        change_type: null,
        asil_level: asilLevel,
        details: JSON.stringify({
          step: 'Automated Checks',
          fresh: fresh.length,
          stale: stale.length,
          unverified: unverified.length,
          failed: failed.length,
        }),
        before_snapshot: null,
        after_snapshot: null,
      });
    }

    // ── Step 1: Coverage Gate ─────────────────────────────────────────────────
    {
      const step = steps[1]!;
      step.status = 'running';
      const t0 = Date.now();

      // Coverage data is checked via ledger evidence on fresh entries
      let hasCoverageData = false;
      let totalStatement = 0;
      let totalBranch = 0;
      let totalMcdc = 0;
      let covCount = 0;
      let covFailures = 0;

      for (const id of artifactIds) {
        const entry = ledger.getEntry(id);
        if (entry?.verified_against?.coverage) {
          hasCoverageData = true;
          const cov = entry.verified_against.coverage;
          totalStatement += cov.statement;
          totalBranch += cov.branch;
          totalMcdc += cov.mcdc;
          covCount += 1;
          // Simple threshold check: statement < 80 counts as failure
          if (cov.statement < 80 || cov.branch < 70) {
            covFailures += 1;
          }
        }
      }

      step.duration_ms = elapsed(t0);

      if (!hasCoverageData) {
        step.status = 'skipped';
        step.details = 'No coverage data available in ledger entries';
      } else {
        const avgStatement = covCount > 0 ? totalStatement / covCount : 0;
        const avgBranch = covCount > 0 ? totalBranch / covCount : 0;
        const avgMcdc = covCount > 0 ? totalMcdc / covCount : 0;

        coverageResult = {
          passed: covFailures === 0,
          failures: [],
          summary: covFailures === 0
            ? `Coverage gate: PASSED (stmt=${avgStatement.toFixed(1)}% branch=${avgBranch.toFixed(1)}% mcdc=${avgMcdc.toFixed(1)}%)`
            : `Coverage gate: FAILED - ${covFailures} artifact(s) below threshold`,
        };

        step.status = covFailures === 0 ? 'passed' : 'failed';
        step.details = coverageResult.summary;
      }
    }

    // ── Step 2: MISRA Compliance ──────────────────────────────────────────────
    {
      const step = steps[2]!;
      step.status = 'running';
      const t0 = Date.now();

      let misraCleanCount = 0;
      let misraDirtyCount = 0;
      let hasEvidence = false;

      for (const id of artifactIds) {
        const entry = ledger.getEntry(id);
        if (entry?.verified_against) {
          hasEvidence = true;
          if (entry.verified_against.misra_clean) {
            misraCleanCount += 1;
          } else {
            misraDirtyCount += 1;
          }
        }
      }

      step.duration_ms = elapsed(t0);

      if (!hasEvidence) {
        step.status = 'skipped';
        step.details = 'No MISRA compliance evidence in ledger entries';
      } else if (misraDirtyCount > 0) {
        step.status = 'failed';
        step.details = `${misraDirtyCount} artifact(s) have MISRA violations; ${misraCleanCount} clean`;
      } else {
        step.status = 'passed';
        step.details = `All ${misraCleanCount} artifact(s) are MISRA compliant`;
      }
    }

    // ── Step 3: Independent Review ────────────────────────────────────────────
    {
      const step = steps[3]!;
      step.status = 'pending';
      const t0 = Date.now();
      step.duration_ms = elapsed(t0);
      step.details =
        'Independent review pending — actual agent invocation handled externally';
    }

    // ── Step 4: Report Generation ─────────────────────────────────────────────
    {
      const step = steps[4]!;
      step.status = 'running';
      const t0 = Date.now();

      const passedSteps = steps.slice(0, 4).filter(s => s.status === 'passed').length;
      const failedSteps = steps.slice(0, 4).filter(s => s.status === 'failed').length;
      const skippedSteps = steps.slice(0, 4).filter(s => s.status === 'skipped').length;

      step.duration_ms = elapsed(t0);
      step.status = 'passed';
      step.details =
        `Summary: ${passedSteps} passed, ${failedSteps} failed, ${skippedSteps} skipped ` +
        `across ${artifactIds.length} artifact(s)`;
    }

    // ── Sync debt from ledger ─────────────────────────────────────────────────
    debtTracker.syncFromLedger(ledger);
    const debtAfter = debtTracker.count();

    // ── Determine overall status ──────────────────────────────────────────────
    const anyFailed = steps.some(s => s.status === 'failed');
    const anyPassed = steps.some(s => s.status === 'passed');
    let overallStatus: WorkflowResult['overall_status'];
    if (!anyFailed) {
      overallStatus = 'passed';
    } else if (anyPassed) {
      overallStatus = 'partial';
    } else {
      overallStatus = 'failed';
    }

    auditLogger.log({
      timestamp: now(),
      event_type: overallStatus === 'passed' ? 'verification_passed' : 'verification_failed',
      agent_id: 'verification-workflow',
      artifact_id: null,
      file_path: null,
      function_name: null,
      change_type: null,
      asil_level: asilLevel,
      details: JSON.stringify({
        overall_status: overallStatus,
        artifacts_total: artifactIds.length,
        artifacts_verified: artifactsVerified,
        artifacts_failed: artifactsFailed,
        debt_after: debtAfter,
      }),
      before_snapshot: null,
      after_snapshot: null,
    });

    return {
      overall_status: overallStatus,
      steps,
      artifacts_verified: artifactsVerified,
      artifacts_failed: artifactsFailed,
      artifacts_skipped: artifactsSkipped,
      review_result: null,
      coverage_result: coverageResult,
      debt_after: debtAfter,
      timestamp,
    };
  }

  return {
    runFull(artifactIds: string[], deps: VerificationWorkflowDeps): WorkflowResult {
      return executeSteps(artifactIds, deps);
    },

    runIncremental(deps: VerificationWorkflowDeps): WorkflowResult {
      const { ledger } = deps;

      // Query only stale and unverified entries
      const staleEntries = ledger.queryStale();
      const unverifiedEntries = ledger.queryByStatus('unverified');

      const targetIds = [
        ...staleEntries.map(e => e.artifact_id),
        ...unverifiedEntries.map(e => e.artifact_id),
      ];

      // Deduplicate
      const uniqueIds = [...new Set(targetIds)];

      if (uniqueIds.length === 0) {
        // Nothing to do — all fresh
        const timestamp = now();
        const steps: WorkflowStep[] = [
          {
            name: 'Automated Checks',
            status: 'skipped',
            duration_ms: 0,
            details: 'All artifacts are fresh; no incremental work required',
          },
        ];

        deps.auditLogger.log({
          timestamp,
          event_type: 'verification_passed',
          agent_id: 'verification-workflow',
          artifact_id: null,
          file_path: null,
          function_name: null,
          change_type: null,
          asil_level: deps.asilLevel,
          details: JSON.stringify({ step: 'incremental', result: 'all_fresh' }),
          before_snapshot: null,
          after_snapshot: null,
        });

        return {
          overall_status: 'passed',
          steps,
          artifacts_verified: 0,
          artifacts_failed: 0,
          artifacts_skipped: 0,
          review_result: null,
          coverage_result: null,
          debt_after: deps.debtTracker.count(),
          timestamp,
        };
      }

      return executeSteps(uniqueIds, deps);
    },

    generateFixItems(result: WorkflowResult): FixWorkItem[] {
      const items: FixWorkItem[] = [];

      const failedSteps = result.steps.filter(s => s.status === 'failed');
      if (failedSteps.length === 0) {
        return items;
      }

      // Build fix items: one per failed step with a synthetic artifact group
      for (const step of failedSteps) {
        const artifactId = `workflow-fix::${step.name.toLowerCase().replace(/\s+/g, '-')}`;
        const priority = ASIL_PRIORITY['QM']; // default; caller can refine

        let description: string;
        switch (step.name) {
          case 'Automated Checks':
            description =
              'Re-verify stale and unverified artifacts. ' +
              'Run unit tests, update ledger entries with fresh verification evidence. ' +
              `Details: ${step.details}`;
            break;
          case 'Coverage Gate':
            description =
              'Improve test coverage to meet ASIL thresholds. ' +
              'Add test cases for uncovered branches and statements. ' +
              `Details: ${step.details}`;
            break;
          case 'MISRA Compliance':
            description =
              'Resolve MISRA rule violations in flagged artifacts. ' +
              'Apply suggested fixes and re-run the MISRA rule engine. ' +
              `Details: ${step.details}`;
            break;
          case 'Independent Review':
            description =
              'Schedule and complete independent safety review. ' +
              'Assign a qualified reviewer at the required independence level. ' +
              `Details: ${step.details}`;
            break;
          default:
            description = `Remediate failure in step "${step.name}". Details: ${step.details}`;
        }

        items.push({
          artifact_id: artifactId,
          step_failed: step.name,
          description,
          priority,
          asil_level: 'QM',
        });
      }

      return items;
    },
  };
}
