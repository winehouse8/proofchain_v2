/**
 * ProofChain Verification Ledger
 *
 * CRUD operations for the central content-addressed record of every
 * artifact's verification state. ISO 26262 safety-grade audit trail.
 */

import Database from 'better-sqlite3';
import type {
  AsilLevel,
  FreshnessScore,
  LedgerEntry,
  VerificationEvidence,
  VerificationStatus,
} from '../core/types.js';
import { ASIL_WEIGHT } from '../core/types.js';

// ─── Public Input / Interface Types ─────────────────────────────────────────

export interface CreateLedgerInput {
  artifact_id: string;
  content_hash: string;
  interface_hash?: string | null;
  verification_status?: VerificationStatus;
  freshness_score?: FreshnessScore;
  verified_at?: string | null;
  verified_against?: VerificationEvidence | null;
  dependencies?: readonly string[];
  asil_level?: AsilLevel;
}

export interface VerificationLedger {
  /** Create a new ledger entry (or update existing) */
  createEntry(input: CreateLedgerInput): LedgerEntry;

  /** Mark an entry as stale, preserving old evidence */
  invalidateEntry(artifactId: string, reason: string): LedgerEntry | null;

  /** Read current verification state */
  getEntry(artifactId: string): LedgerEntry | null;

  /** Return all stale entries, sorted by ASIL priority (D first) */
  queryStale(): LedgerEntry[];

  /** Return all fresh entries */
  queryFresh(): LedgerEntry[];

  /** Return all entries with a given status */
  queryByStatus(status: VerificationStatus): LedgerEntry[];

  /**
   * Calculate freshness score from dependency states.
   * Formula: max(0.1, 1.0 - 0.2 * interface_changes - 0.1 * impl_changes - 0.1 * asil_weight)
   * UNVERIFIED = null, FAILED = -1.0
   */
  computeFreshness(artifactId: string): FreshnessScore;

  /** Delete an entry */
  deleteEntry(artifactId: string): boolean;

  /** Count entries by status */
  countByStatus(): Record<VerificationStatus, number>;
}

// ─── Internal Row Type ───────────────────────────────────────────────────────

interface LedgerRow {
  artifact_id: string;
  content_hash: string;
  interface_hash: string | null;
  verification_status: string;
  freshness_score: number | null;
  verified_at: string | null;
  verified_against: string | null;
  dependencies: string | null;
  invalidated_by: string | null;
  invalidated_at: string | null;
  asil_level: string;
}

// ─── ASIL Priority Order for Sorting ────────────────────────────────────────

const ASIL_PRIORITY: Record<AsilLevel, number> = {
  D: 0,
  C: 1,
  B: 2,
  A: 3,
  QM: 4,
};

// ─── Row Mapper ──────────────────────────────────────────────────────────────

function rowToEntry(row: LedgerRow): LedgerEntry {
  let verified_against: VerificationEvidence | null = null;
  if (row.verified_against !== null && row.verified_against !== '') {
    verified_against = JSON.parse(row.verified_against) as VerificationEvidence;
  }

  let dependencies: readonly string[] = [];
  if (row.dependencies !== null && row.dependencies !== '') {
    dependencies = JSON.parse(row.dependencies) as string[];
  }

  return {
    artifact_id: row.artifact_id,
    content_hash: row.content_hash,
    interface_hash: row.interface_hash,
    verification_status: row.verification_status as VerificationStatus,
    freshness_score: row.freshness_score,
    verified_at: row.verified_at,
    verified_against,
    dependencies,
    invalidated_by: row.invalidated_by,
    invalidated_at: row.invalidated_at,
    asil_level: row.asil_level as AsilLevel,
  };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createVerificationLedger(db: Database.Database): VerificationLedger {
  // Prepared statements
  const stmtUpsert = db.prepare<[
    string, // artifact_id
    string, // content_hash
    string | null, // interface_hash
    string, // verification_status
    number | null, // freshness_score
    string | null, // verified_at
    string | null, // verified_against
    string | null, // dependencies
    string | null, // invalidated_by
    string | null, // invalidated_at
    string, // asil_level
    string, // created_at
    string, // updated_at
  ]>(`
    INSERT INTO verification_ledger (
      artifact_id, content_hash, interface_hash, verification_status,
      freshness_score, verified_at, verified_against, dependencies,
      invalidated_by, invalidated_at, asil_level, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(artifact_id) DO UPDATE SET
      content_hash       = excluded.content_hash,
      interface_hash     = excluded.interface_hash,
      verification_status = excluded.verification_status,
      freshness_score    = excluded.freshness_score,
      verified_at        = excluded.verified_at,
      verified_against   = excluded.verified_against,
      dependencies       = excluded.dependencies,
      invalidated_by     = excluded.invalidated_by,
      invalidated_at     = excluded.invalidated_at,
      asil_level         = excluded.asil_level,
      updated_at         = excluded.updated_at
  `);

  const stmtSelect = db.prepare<[string], LedgerRow>(
    'SELECT * FROM verification_ledger WHERE artifact_id = ?',
  );

  const stmtUpdateStale = db.prepare<[string, string, string, string]>(`
    UPDATE verification_ledger
    SET verification_status = 'stale',
        freshness_score     = 0.5,
        invalidated_by      = ?,
        invalidated_at      = ?,
        updated_at          = ?
    WHERE artifact_id = ?
  `);

  const stmtSelectByStatus = db.prepare<[string], LedgerRow>(
    'SELECT * FROM verification_ledger WHERE verification_status = ?',
  );

  const stmtDelete = db.prepare<[string]>(
    'DELETE FROM verification_ledger WHERE artifact_id = ?',
  );

  const stmtCountAll = db.prepare<[], { verification_status: string; cnt: number }>(
    'SELECT verification_status, COUNT(*) as cnt FROM verification_ledger GROUP BY verification_status',
  );

  return {
    createEntry(input: CreateLedgerInput): LedgerEntry {
      const now = new Date().toISOString();
      const status: VerificationStatus = input.verification_status ?? 'unverified';
      const asil: AsilLevel = input.asil_level ?? 'QM';
      const freshnessScore: number | null = input.freshness_score !== undefined
        ? input.freshness_score
        : null;

      const verifiedAgainstJson: string | null =
        input.verified_against != null
          ? JSON.stringify(input.verified_against)
          : null;

      const dependenciesJson: string | null =
        input.dependencies && input.dependencies.length > 0
          ? JSON.stringify(input.dependencies)
          : null;

      stmtUpsert.run(
        input.artifact_id,
        input.content_hash,
        input.interface_hash ?? null,
        status,
        freshnessScore,
        input.verified_at ?? null,
        verifiedAgainstJson,
        dependenciesJson,
        null, // invalidated_by
        null, // invalidated_at
        asil,
        now,
        now,
      );

      const row = stmtSelect.get(input.artifact_id);
      if (!row) {
        throw new Error(`Failed to retrieve entry after upsert: ${input.artifact_id}`);
      }
      return rowToEntry(row);
    },

    invalidateEntry(artifactId: string, reason: string): LedgerEntry | null {
      const existing = stmtSelect.get(artifactId);
      if (!existing) {
        return null;
      }
      const now = new Date().toISOString();
      stmtUpdateStale.run(reason, now, now, artifactId);
      const updated = stmtSelect.get(artifactId);
      if (!updated) {
        return null;
      }
      return rowToEntry(updated);
    },

    getEntry(artifactId: string): LedgerEntry | null {
      const row = stmtSelect.get(artifactId);
      return row ? rowToEntry(row) : null;
    },

    queryStale(): LedgerEntry[] {
      const rows = stmtSelectByStatus.all('stale');
      const entries = rows.map(rowToEntry);
      // Sort D > C > B > A > QM
      entries.sort((a, b) => {
        const pa = ASIL_PRIORITY[a.asil_level];
        const pb = ASIL_PRIORITY[b.asil_level];
        return pa - pb;
      });
      return entries;
    },

    queryFresh(): LedgerEntry[] {
      const rows = stmtSelectByStatus.all('fresh');
      return rows.map(rowToEntry);
    },

    queryByStatus(status: VerificationStatus): LedgerEntry[] {
      const rows = stmtSelectByStatus.all(status);
      return rows.map(rowToEntry);
    },

    computeFreshness(artifactId: string): FreshnessScore {
      const entry = stmtSelect.get(artifactId);
      if (!entry) {
        return null;
      }

      // UNVERIFIED => null
      if (entry.verification_status === 'unverified') {
        return null;
      }

      // FAILED => -1.0
      if (entry.verification_status === 'failed') {
        return -1.0;
      }

      // Parse dependencies
      let deps: string[] = [];
      if (entry.dependencies !== null && entry.dependencies !== '') {
        deps = JSON.parse(entry.dependencies) as string[];
      }

      if (deps.length === 0) {
        // No dependencies: fresh score or stale score preserved
        if (entry.verification_status === 'fresh') {
          return 1.0;
        }
        // stale with no deps
        const asilWeight = ASIL_WEIGHT[entry.asil_level as AsilLevel];
        const score = 1.0 - 0.1 * asilWeight;
        return Math.max(0.1, score);
      }

      // Count interface changes vs implementation-only changes
      let interfaceChanges = 0;
      let implChanges = 0;

      for (const depId of deps) {
        const depRow = stmtSelect.get(depId);
        if (!depRow) {
          // Missing dependency counts as an implementation change
          implChanges += 1;
          continue;
        }
        if (depRow.verification_status === 'stale' || depRow.verification_status === 'unverified') {
          // Compare interface hashes to classify the change
          if (
            depRow.interface_hash !== null &&
            entry.interface_hash !== null &&
            depRow.interface_hash !== entry.interface_hash
          ) {
            interfaceChanges += 1;
          } else {
            implChanges += 1;
          }
        }
      }

      const asilWeight = ASIL_WEIGHT[entry.asil_level as AsilLevel];
      const score =
        1.0 -
        0.2 * interfaceChanges -
        0.1 * implChanges -
        0.1 * asilWeight;

      return Math.max(0.1, score);
    },

    deleteEntry(artifactId: string): boolean {
      const result = stmtDelete.run(artifactId);
      return result.changes > 0;
    },

    countByStatus(): Record<VerificationStatus, number> {
      const rows = stmtCountAll.all();
      const counts: Record<VerificationStatus, number> = {
        fresh: 0,
        stale: 0,
        unverified: 0,
        failed: 0,
      };
      for (const row of rows) {
        const status = row.verification_status as VerificationStatus;
        if (status in counts) {
          counts[status] = row.cnt;
        }
      }
      return counts;
    },
  };
}
