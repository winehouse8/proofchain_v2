/**
 * ProofChain Verification Debt Tracker
 *
 * Tracks and reports verification debt — stale artifacts that have not yet
 * been re-verified. Persists to SQLite `verification_debt` table.
 * ISO 26262 compliance: ASIL-dependent debt ceilings enforced.
 */

import type {
  AsilLevel,
  VerificationDebtItem,
  VerificationDebtSummary,
  DebtTrend,
} from '../core/types.js';
import { DEBT_CEILING } from '../core/types.js';
import type { VerificationLedger } from '../ledger/verification-ledger.js';

// ─── Public Interface ─────────────────────────────────────────────────────────

export interface DebtTracker {
  /** Insert or replace a debt item. blocks_release defaults to true for ASIL A+. */
  addDebt(item: Omit<VerificationDebtItem, 'blocks_release'> & { blocks_release?: boolean }): void;

  /** Remove a debt item by artifact ID. Returns true if a row was deleted. */
  removeDebt(artifactId: string): boolean;

  /** Retrieve a single debt item, or null if not present. */
  getDebt(artifactId: string): VerificationDebtItem | null;

  /** Aggregate summary with counts by ASIL and trend information. */
  getSummary(): VerificationDebtSummary;

  /** All debt items for a given ASIL level. */
  getDebtForAsil(asilLevel: AsilLevel): VerificationDebtItem[];

  /** True when the number of debt items for the given ASIL >= its ceiling. */
  isOverCeiling(asilLevel: AsilLevel): boolean;

  /**
   * Sync debt from all stale ledger entries.
   * Adds entries that are stale but not yet in the debt table.
   * Returns the count of newly-added items.
   */
  syncFromLedger(ledger: VerificationLedger): number;

  /** Total number of debt items. */
  count(): number;
}

// ─── Internal Row Type ────────────────────────────────────────────────────────

interface DebtRow {
  id: number;
  artifact_id: string;
  reason: string;
  stale_since: string;
  asil_level: string;
  estimated_effort: string | null;
  blocks_release: number;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** ASIL levels that require blocks_release = true by default */
const RELEASE_BLOCKING_ASIL = new Set<AsilLevel>(['A', 'B', 'C', 'D']);

function rowToItem(row: DebtRow): VerificationDebtItem {
  return {
    artifact_id: row.artifact_id,
    reason: row.reason,
    stale_since: row.stale_since,
    asil_level: row.asil_level as AsilLevel,
    estimated_effort: row.estimated_effort ?? 'unknown',
    blocks_release: row.blocks_release !== 0,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createDebtTracker(db: import('better-sqlite3').Database): DebtTracker {
  const stmtUpsert = db.prepare<[
    string,         // artifact_id
    string,         // reason
    string,         // stale_since
    string,         // asil_level
    string | null,  // estimated_effort
    number,         // blocks_release (0 or 1)
    string,         // created_at
  ]>(`
    INSERT INTO verification_debt
      (artifact_id, reason, stale_since, asil_level, estimated_effort, blocks_release, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(artifact_id) DO UPDATE SET
      reason           = excluded.reason,
      stale_since      = excluded.stale_since,
      asil_level       = excluded.asil_level,
      estimated_effort = excluded.estimated_effort,
      blocks_release   = excluded.blocks_release
  `);

  const stmtDelete = db.prepare<[string]>(
    'DELETE FROM verification_debt WHERE artifact_id = ?',
  );

  const stmtSelect = db.prepare<[string], DebtRow>(
    'SELECT * FROM verification_debt WHERE artifact_id = ?',
  );

  const stmtAll = db.prepare<[], DebtRow>(
    'SELECT * FROM verification_debt ORDER BY asil_level ASC',
  );

  const stmtByAsil = db.prepare<[string], DebtRow>(
    'SELECT * FROM verification_debt WHERE asil_level = ?',
  );

  const stmtCountByAsil = db.prepare<[string], { cnt: number }>(
    'SELECT COUNT(*) as cnt FROM verification_debt WHERE asil_level = ?',
  );

  const stmtCount = db.prepare<[], { cnt: number }>(
    'SELECT COUNT(*) as cnt FROM verification_debt',
  );

  // For trend: fetch created_at timestamps for items created in last N days
  const stmtCreatedAfter = db.prepare<[string], { created_at: string }>(
    'SELECT created_at FROM verification_debt WHERE created_at >= ?',
  );

  return {
    addDebt(item): void {
      const asil = item.asil_level as AsilLevel;
      const blocksRelease =
        item.blocks_release !== undefined
          ? item.blocks_release
          : RELEASE_BLOCKING_ASIL.has(asil);

      const now = new Date().toISOString();
      stmtUpsert.run(
        item.artifact_id,
        item.reason,
        item.stale_since,
        item.asil_level,
        item.estimated_effort ?? null,
        blocksRelease ? 1 : 0,
        now,
      );
    },

    removeDebt(artifactId: string): boolean {
      const result = stmtDelete.run(artifactId);
      return result.changes > 0;
    },

    getDebt(artifactId: string): VerificationDebtItem | null {
      const row = stmtSelect.get(artifactId);
      return row ? rowToItem(row) : null;
    },

    getSummary(): VerificationDebtSummary {
      const allRows = stmtAll.all();
      const items = allRows.map(rowToItem);

      const byAsil: Record<AsilLevel, number> = { QM: 0, A: 0, B: 0, C: 0, D: 0 };
      for (const item of items) {
        byAsil[item.asil_level] += 1;
      }

      // Trend: compare avg items created in last 7 days vs prior 7 days
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const cutoff7 = new Date(now - sevenDaysMs).toISOString();
      const cutoff14 = new Date(now - 2 * sevenDaysMs).toISOString();

      const last7Rows = stmtCreatedAfter.all(cutoff7);
      const prior7Rows = stmtCreatedAfter.all(cutoff14).filter(
        (r) => r.created_at < cutoff7,
      );

      const sevenDayAvg = last7Rows.length / 7;
      const prior7Avg = prior7Rows.length / 7;

      let direction: DebtTrend['direction'];
      const delta = sevenDayAvg - prior7Avg;
      if (Math.abs(delta) < 0.01) {
        direction = 'stable';
      } else if (delta > 0) {
        direction = 'increasing';
      } else {
        direction = 'decreasing';
      }

      return {
        total_debt: items.length,
        by_asil: byAsil,
        items,
        trend: {
          seven_day_avg: Math.round(sevenDayAvg * 100) / 100,
          direction,
        },
      };
    },

    getDebtForAsil(asilLevel: AsilLevel): VerificationDebtItem[] {
      const rows = stmtByAsil.all(asilLevel);
      return rows.map(rowToItem);
    },

    isOverCeiling(asilLevel: AsilLevel): boolean {
      const ceiling = DEBT_CEILING[asilLevel];
      if (!isFinite(ceiling)) return false;
      const row = stmtCountByAsil.get(asilLevel);
      const cnt = row?.cnt ?? 0;
      return cnt >= ceiling;
    },

    syncFromLedger(ledger: VerificationLedger): number {
      const staleEntries = ledger.queryStale();
      let added = 0;

      for (const entry of staleEntries) {
        // Skip if already tracked
        const existing = stmtSelect.get(entry.artifact_id);
        if (existing) continue;

        const asil = entry.asil_level as AsilLevel;
        const blocksRelease = RELEASE_BLOCKING_ASIL.has(asil);
        const staleSince = entry.invalidated_at ?? entry.verified_at ?? new Date().toISOString();

        const now = new Date().toISOString();
        stmtUpsert.run(
          entry.artifact_id,
          entry.invalidated_by ?? 'Stale dependency',
          staleSince,
          entry.asil_level,
          null,
          blocksRelease ? 1 : 0,
          now,
        );
        added++;
      }

      return added;
    },

    count(): number {
      const row = stmtCount.get();
      return row?.cnt ?? 0;
    },
  };
}
