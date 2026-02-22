/**
 * ProofChain Verify Skill
 *
 * Skill handler for verification workflow execution.
 * Returns formatted workflow result strings for Claude Code slash commands.
 */

import type {
  VerificationWorkflow,
  VerificationWorkflowDeps,
  WorkflowResult,
} from '../verification/verification-workflow.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface VerifySkill {
  execute(
    command: 'full' | 'incremental' | 'status',
    args?: { artifactIds?: string[] },
    deps?: VerificationWorkflowDeps,
  ): string;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

function stepIcon(status: string): string {
  switch (status) {
    case 'passed':  return '[PASS]';
    case 'failed':  return '[FAIL]';
    case 'skipped': return '[SKIP]';
    case 'running': return '[RUN ]';
    default:        return '[    ]';
  }
}

function formatWorkflowResult(result: WorkflowResult): string {
  const statusEmoji = result.overall_status === 'passed'
    ? 'PASSED'
    : result.overall_status === 'partial'
    ? 'PARTIAL'
    : 'FAILED';

  const stepLines = result.steps.map(
    s => `  ${stepIcon(s.status)} ${s.name.padEnd(22)} (${s.duration_ms}ms) ${s.details}`,
  );

  const lines: string[] = [
    `[ProofChain] Verification Result: ${statusEmoji}`,
    `  Timestamp  : ${result.timestamp}`,
    `  Verified   : ${result.artifacts_verified}`,
    `  Failed     : ${result.artifacts_failed}`,
    `  Skipped    : ${result.artifacts_skipped}`,
    `  Debt after : ${result.debt_after}`,
    ``,
    `Steps:`,
    ...stepLines,
  ];

  if (result.coverage_result !== null) {
    lines.push(``, `Coverage: ${result.coverage_result.summary}`);
  }

  return lines.join('\n');
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createVerifySkill(workflow: VerificationWorkflow): VerifySkill {
  return {
    execute(
      command: 'full' | 'incremental' | 'status',
      args?: { artifactIds?: string[] },
      deps?: VerificationWorkflowDeps,
    ): string {
      switch (command) {
        case 'full': {
          if (deps === undefined) {
            return `[ProofChain] Error: 'full' verification requires runtime deps (ledger, debtTracker, auditLogger, asilLevel).`;
          }
          const artifactIds = args?.artifactIds ?? [];
          if (artifactIds.length === 0) {
            return `[ProofChain] Error: 'full' verification requires at least one artifact ID.`;
          }
          const result = workflow.runFull(artifactIds, deps);
          return formatWorkflowResult(result);
        }

        case 'incremental': {
          if (deps === undefined) {
            return `[ProofChain] Error: 'incremental' verification requires runtime deps.`;
          }
          const result = workflow.runIncremental(deps);
          return formatWorkflowResult(result);
        }

        case 'status': {
          if (deps === undefined) {
            return `[ProofChain] Verification status: no deps provided — cannot query ledger state.`;
          }
          // Run a lightweight incremental check without side effects by querying ledger
          const { ledger, debtTracker } = deps;
          const staleEntries = ledger.queryStale();
          const unverifiedEntries = ledger.queryByStatus('unverified');
          const failedEntries = ledger.queryByStatus('failed');
          const debtCount = debtTracker.count();

          return [
            `[ProofChain] Verification Status`,
            `  Stale artifacts    : ${staleEntries.length}`,
            `  Unverified         : ${unverifiedEntries.length}`,
            `  Failed             : ${failedEntries.length}`,
            `  Verification debt  : ${debtCount}`,
            ``,
            staleEntries.length + unverifiedEntries.length + failedEntries.length === 0
              ? `  All artifacts are fresh and verified.`
              : `  Run 'verify incremental' to process pending work.`,
          ].join('\n');
        }
      }
    },
  };
}
