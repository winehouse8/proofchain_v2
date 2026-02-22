/**
 * ProofChain Requirement Versioner
 *
 * Tracks requirement versions with content-addressed hashing.
 * Uses better-sqlite3 prepared statements for performance.
 */

import type { Database, Statement } from 'better-sqlite3';
import type { AsilLevel, RequirementVersion } from '../core/types.js';
import { hashRequirement } from '../ledger/content-hasher.js';

// ─── Row type for SQLite results ─────────────────────────────────────────────

interface RequirementVersionRow {
  requirement_id: string;
  version: number;
  content_hash: string;
  text: string;
  asil_level: string;
  acceptance_criteria: string | null;
  created_at: string;
}

// ─── Public Interface ────────────────────────────────────────────────────────

export interface RequirementVersioner {
  /** Add or update a requirement. Returns the new version. */
  addOrUpdate(req: {
    requirement_id: string;
    text: string;
    asil_level: AsilLevel;
    acceptance_criteria: string[];
  }): RequirementVersion;

  /** Get the latest version of a requirement */
  getLatest(requirementId: string): RequirementVersion | null;

  /** Get a specific version */
  getVersion(requirementId: string, version: number): RequirementVersion | null;

  /** Get all versions of a requirement (oldest first) */
  getHistory(requirementId: string): RequirementVersion[];

  /** Get all requirements (latest versions only) */
  getAllLatest(): RequirementVersion[];

  /** Check if a requirement has changed since last version */
  hasChanged(requirementId: string, newText: string): boolean;

  /** Delete all versions of a requirement */
  deleteRequirement(requirementId: string): void;

  /** Count total requirements */
  count(): number;
}

// ─── Row → Domain mapping ────────────────────────────────────────────────────

function rowToVersion(row: RequirementVersionRow): RequirementVersion {
  let acceptance_criteria: readonly string[] = [];
  if (row.acceptance_criteria !== null && row.acceptance_criteria.length > 0) {
    try {
      const parsed: unknown = JSON.parse(row.acceptance_criteria);
      if (Array.isArray(parsed)) {
        acceptance_criteria = parsed as string[];
      }
    } catch {
      // Malformed JSON — default to empty
    }
  }

  return {
    requirement_id: row.requirement_id,
    version: row.version,
    content_hash: row.content_hash,
    text: row.text,
    asil_level: row.asil_level as AsilLevel,
    acceptance_criteria,
    created_at: row.created_at,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRequirementVersioner(db: Database): RequirementVersioner {
  // Prepared statements for performance
  const stmtGetLatest = db.prepare<[string], RequirementVersionRow>(
    `SELECT requirement_id, version, content_hash, text, asil_level, acceptance_criteria, created_at
     FROM requirement_versions
     WHERE requirement_id = ?
     ORDER BY version DESC
     LIMIT 1`,
  );

  const stmtGetVersion = db.prepare<[string, number], RequirementVersionRow>(
    `SELECT requirement_id, version, content_hash, text, asil_level, acceptance_criteria, created_at
     FROM requirement_versions
     WHERE requirement_id = ? AND version = ?`,
  );

  const stmtGetHistory = db.prepare<[string], RequirementVersionRow>(
    `SELECT requirement_id, version, content_hash, text, asil_level, acceptance_criteria, created_at
     FROM requirement_versions
     WHERE requirement_id = ?
     ORDER BY version ASC`,
  );

  const stmtGetAllLatest = db.prepare<[], RequirementVersionRow>(
    `SELECT r.requirement_id, r.version, r.content_hash, r.text, r.asil_level, r.acceptance_criteria, r.created_at
     FROM requirement_versions r
     INNER JOIN (
       SELECT requirement_id, MAX(version) AS max_version
       FROM requirement_versions
       GROUP BY requirement_id
     ) latest ON r.requirement_id = latest.requirement_id AND r.version = latest.max_version
     ORDER BY r.requirement_id ASC`,
  );

  const stmtInsert = db.prepare<[string, number, string, string, string, string, string]>(
    `INSERT INTO requirement_versions
       (requirement_id, version, content_hash, text, asil_level, acceptance_criteria, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const stmtDelete = db.prepare<[string]>(
    `DELETE FROM requirement_versions WHERE requirement_id = ?`,
  );

  const stmtCount = db.prepare<[], { total: number }>(
    `SELECT COUNT(DISTINCT requirement_id) AS total FROM requirement_versions`,
  );

  return {
    addOrUpdate(req) {
      const contentHash = hashRequirement(req.requirement_id, req.text);
      const existing = stmtGetLatest.get(req.requirement_id);

      // No change — return existing version as-is
      if (existing !== undefined && existing.content_hash === contentHash) {
        return rowToVersion(existing);
      }

      const nextVersion = existing !== undefined ? existing.version + 1 : 1;
      const createdAt = new Date().toISOString();
      const criteriaJson = JSON.stringify(req.acceptance_criteria);

      stmtInsert.run(
        req.requirement_id,
        nextVersion,
        contentHash,
        req.text,
        req.asil_level,
        criteriaJson,
        createdAt,
      );

      return {
        requirement_id: req.requirement_id,
        version: nextVersion,
        content_hash: contentHash,
        text: req.text,
        asil_level: req.asil_level,
        acceptance_criteria: req.acceptance_criteria,
        created_at: createdAt,
      };
    },

    getLatest(requirementId) {
      const row = stmtGetLatest.get(requirementId);
      return row !== undefined ? rowToVersion(row) : null;
    },

    getVersion(requirementId, version) {
      const row = stmtGetVersion.get(requirementId, version);
      return row !== undefined ? rowToVersion(row) : null;
    },

    getHistory(requirementId) {
      const rows = stmtGetHistory.all(requirementId);
      return rows.map(rowToVersion);
    },

    getAllLatest() {
      const rows = stmtGetAllLatest.all();
      return rows.map(rowToVersion);
    },

    hasChanged(requirementId, newText) {
      const latest = stmtGetLatest.get(requirementId);
      if (latest === undefined) {
        return true;
      }
      const newHash = hashRequirement(requirementId, newText);
      return latest.content_hash !== newHash;
    },

    deleteRequirement(requirementId) {
      stmtDelete.run(requirementId);
    },

    count() {
      const row = stmtCount.get();
      return row !== undefined ? row.total : 0;
    },
  };
}
