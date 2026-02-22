/**
 * ProofChain Verification Reporter
 *
 * Generates structured and Markdown verification reports combining ledger state
 * and verification debt. ISO 26262 section references included.
 */

import type { AsilLevel, VerificationStatus } from '../core/types.js';
import type { VerificationLedger } from '../ledger/verification-ledger.js';
import type { DebtTracker } from './debt-tracker.js';
import type { VerificationDebtSummary } from '../core/types.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ArtifactDetail {
  artifact_id: string;
  status: VerificationStatus;
  freshness_score: number | null;
  last_verified: string | null;
  asil_level: AsilLevel;
}

export interface VerificationReport {
  generated_at: string;
  asil_level: AsilLevel;
  total_artifacts: number;
  fresh_count: number;
  stale_count: number;
  unverified_count: number;
  failed_count: number;
  /** fresh / total, or 0 if no artifacts */
  freshness_percentage: number;
  debt_summary: VerificationDebtSummary;
  artifact_details: ArtifactDetail[];
}

export interface VerificationReporter {
  generateReport(
    ledger: VerificationLedger,
    debtTracker: DebtTracker,
    asilLevel: AsilLevel,
  ): VerificationReport;

  formatAsMarkdown(report: VerificationReport): string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function statusEmoji(status: VerificationStatus): string {
  switch (status) {
    case 'fresh':       return 'FRESH';
    case 'stale':       return 'STALE';
    case 'unverified':  return 'UNVERIFIED';
    case 'failed':      return 'FAILED';
  }
}

function freshnessBar(score: number | null): string {
  if (score === null) return 'n/a';
  if (score < 0)      return '-1.0 (failed)';
  const filled = Math.round(score * 10);
  const empty  = 10 - filled;
  return `[${'#'.repeat(filled)}${'.'.repeat(empty)}] ${score.toFixed(2)}`;
}

/** ISO 26262 section reference by ASIL level */
function isoReference(asil: AsilLevel): string {
  const refs: Record<AsilLevel, string> = {
    QM:  'ISO 26262-8:2018 §7 (Quality Management)',
    A:   'ISO 26262-8:2018 §8 (ASIL A verification)',
    B:   'ISO 26262-8:2018 §9 (ASIL B verification)',
    C:   'ISO 26262-8:2018 §10 (ASIL C verification)',
    D:   'ISO 26262-8:2018 §11 (ASIL D verification)',
  };
  return refs[asil];
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createVerificationReporter(): VerificationReporter {
  return {
    generateReport(
      ledger: VerificationLedger,
      debtTracker: DebtTracker,
      asilLevel: AsilLevel,
    ): VerificationReport {
      const counts = ledger.countByStatus();
      const freshCount      = counts.fresh;
      const staleCount      = counts.stale;
      const unverifiedCount = counts.unverified;
      const failedCount     = counts.failed;
      const totalArtifacts  = freshCount + staleCount + unverifiedCount + failedCount;

      const freshnessPercentage =
        totalArtifacts > 0 ? freshCount / totalArtifacts : 0;

      // Collect details from each status group
      const allEntries = [
        ...ledger.queryByStatus('fresh'),
        ...ledger.queryByStatus('stale'),
        ...ledger.queryByStatus('unverified'),
        ...ledger.queryByStatus('failed'),
      ];

      const artifactDetails: ArtifactDetail[] = allEntries.map((entry) => ({
        artifact_id:    entry.artifact_id,
        status:         entry.verification_status,
        freshness_score: ledger.computeFreshness(entry.artifact_id),
        last_verified:  entry.verified_at,
        asil_level:     entry.asil_level,
      }));

      const debtSummary = debtTracker.getSummary();

      return {
        generated_at:         new Date().toISOString(),
        asil_level:           asilLevel,
        total_artifacts:      totalArtifacts,
        fresh_count:          freshCount,
        stale_count:          staleCount,
        unverified_count:     unverifiedCount,
        failed_count:         failedCount,
        freshness_percentage: freshnessPercentage,
        debt_summary:         debtSummary,
        artifact_details:     artifactDetails,
      };
    },

    formatAsMarkdown(report: VerificationReport): string {
      const lines: string[] = [];

      // ── Header ──────────────────────────────────────────────────────────────
      lines.push(`# ProofChain Verification Report`);
      lines.push('');
      lines.push(`**Generated:** ${report.generated_at}`);
      lines.push(`**ASIL Level:** ${report.asil_level}`);
      lines.push(`**Reference:** ${isoReference(report.asil_level)}`);
      lines.push('');

      // ── Summary ─────────────────────────────────────────────────────────────
      lines.push('## Summary');
      lines.push('');
      lines.push(`| Metric | Value |`);
      lines.push(`|--------|-------|`);
      lines.push(`| Total Artifacts | ${report.total_artifacts} |`);
      lines.push(`| Fresh | ${report.fresh_count} |`);
      lines.push(`| Stale | ${report.stale_count} |`);
      lines.push(`| Unverified | ${report.unverified_count} |`);
      lines.push(`| Failed | ${report.failed_count} |`);
      lines.push(`| Freshness | ${pct(report.freshness_percentage)} |`);
      lines.push('');

      // ── Artifacts by Status ──────────────────────────────────────────────────
      lines.push('## Artifacts by Status');
      lines.push('');

      const byStatus: Record<VerificationStatus, ArtifactDetail[]> = {
        fresh: [],
        stale: [],
        unverified: [],
        failed: [],
      };
      for (const detail of report.artifact_details) {
        byStatus[detail.status].push(detail);
      }

      const statusOrder: VerificationStatus[] = ['failed', 'stale', 'unverified', 'fresh'];
      for (const status of statusOrder) {
        const group = byStatus[status];
        if (group.length === 0) continue;

        lines.push(`### ${statusEmoji(status)} (${group.length})`);
        lines.push('');
        lines.push('| Artifact ID | ASIL | Freshness | Last Verified |');
        lines.push('|-------------|------|-----------|---------------|');
        for (const d of group) {
          const lastVerified = d.last_verified ?? 'never';
          lines.push(
            `| ${d.artifact_id} | ${d.asil_level} | ${freshnessBar(d.freshness_score)} | ${lastVerified} |`,
          );
        }
        lines.push('');
      }

      // ── Debt Summary ─────────────────────────────────────────────────────────
      lines.push('## Verification Debt Summary');
      lines.push('');
      lines.push(`**Total Debt:** ${report.debt_summary.total_debt}`);
      lines.push(
        `**Trend:** ${report.debt_summary.trend.direction} ` +
        `(7-day avg: ${report.debt_summary.trend.seven_day_avg.toFixed(2)} items/day)`,
      );
      lines.push('');
      lines.push('### Debt by ASIL');
      lines.push('');
      lines.push('| ASIL | Count |');
      lines.push('|------|-------|');
      const asilOrder: AsilLevel[] = ['D', 'C', 'B', 'A', 'QM'];
      for (const asil of asilOrder) {
        lines.push(`| ${asil} | ${report.debt_summary.by_asil[asil]} |`);
      }
      lines.push('');

      if (report.debt_summary.items.length > 0) {
        lines.push('### Debt Items');
        lines.push('');
        lines.push('| Artifact ID | ASIL | Stale Since | Blocks Release | Reason |');
        lines.push('|-------------|------|-------------|----------------|--------|');
        for (const item of report.debt_summary.items) {
          const staleSince = item.stale_since.substring(0, 10);
          const blocks = item.blocks_release ? 'YES' : 'no';
          lines.push(
            `| ${item.artifact_id} | ${item.asil_level} | ${staleSince} | ${blocks} | ${item.reason} |`,
          );
        }
        lines.push('');
      }

      // ── Timeline ──────────────────────────────────────────────────────────────
      lines.push('## Timeline');
      lines.push('');
      lines.push(`- Report generated at: ${report.generated_at}`);

      const freshEntries = report.artifact_details
        .filter((d) => d.last_verified !== null)
        .sort((a, b) => {
          const ta = a.last_verified ?? '';
          const tb = b.last_verified ?? '';
          return tb.localeCompare(ta);
        });

      if (freshEntries.length > 0) {
        const latest = freshEntries[0];
        if (latest !== undefined) {
          lines.push(`- Most recently verified: \`${latest.artifact_id}\` at ${latest.last_verified ?? 'unknown'}`);
        }
        const oldest = freshEntries[freshEntries.length - 1];
        if (oldest !== undefined && oldest !== freshEntries[0]) {
          lines.push(`- Oldest verified entry: \`${oldest.artifact_id}\` at ${oldest.last_verified ?? 'unknown'}`);
        }
      }

      lines.push('');
      lines.push('---');
      lines.push('*Generated by ProofChain — ISO 26262-inspired safety-grade development enforcer*');
      lines.push('');

      return lines.join('\n');
    },
  };
}
