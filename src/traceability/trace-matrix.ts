/**
 * ProofChain Trace Matrix
 *
 * Build and query the traceability matrix stored in SQLite.
 */

import type Database from 'better-sqlite3';
import type { TraceTag, TraceabilityLink } from '../core/types.js';

// ─── Public Interface ─────────────────────────────────────────────────────────

export interface TraceMatrix {
  /** Add or update a traceability link */
  addLink(
    link: Omit<TraceabilityLink, 'test_artifact_ids'> & {
      test_artifact_ids?: readonly string[];
    },
  ): void;

  /** Remove a link */
  removeLink(requirementId: string, codeArtifactId: string): void;

  /** Get all code artifacts linked to a requirement */
  getCodeForRequirement(requirementId: string): string[];

  /** Get all requirements linked to a code artifact */
  getRequirementsForCode(codeArtifactId: string): string[];

  /** Get all tests linked to a code artifact (via traceability links) */
  getTestsForCode(codeArtifactId: string): string[];

  /** Get all requirements linked to a test (via code artifacts) */
  getRequirementsForTest(testArtifactId: string): string[];

  /** Update links from parsed trace tags for a single file */
  updateFromTraceTags(tags: TraceTag[], requirementVersion?: number): void;

  /** Get all links */
  getAllLinks(): TraceabilityLink[];

  /** Count total links */
  count(): number;
}

// ─── SQLite Row Types ─────────────────────────────────────────────────────────

interface LinkRow {
  requirement_id: string;
  requirement_version: number;
  architecture_id: string | null;
  code_artifact_id: string;
  test_artifact_ids: string | null;
}

interface CountRow {
  cnt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToLink(row: LinkRow): TraceabilityLink {
  return {
    requirement_id: row.requirement_id,
    requirement_version: row.requirement_version,
    architecture_id: row.architecture_id,
    code_artifact_id: row.code_artifact_id,
    test_artifact_ids: row.test_artifact_ids !== null
      ? (JSON.parse(row.test_artifact_ids) as string[])
      : [],
  };
}

function parseTestIds(raw: string | null): string[] {
  if (raw === null || raw === '') return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return (parsed as unknown[]).filter((x): x is string => typeof x === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createTraceMatrix(db: Database.Database): TraceMatrix {
  const now = () => new Date().toISOString();

  // ── Prepared statements ────────────────────────────────────────────────────

  const stmtInsert = db.prepare<[
    string, number, string | null, string, string | null, string, string,
  ]>(`
    INSERT OR REPLACE INTO traceability_links
      (requirement_id, requirement_version, architecture_id, code_artifact_id,
       test_artifact_ids, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtDelete = db.prepare<[string, string]>(`
    DELETE FROM traceability_links
    WHERE requirement_id = ? AND code_artifact_id = ?
  `);

  const stmtGetCodeForReq = db.prepare<[string]>(`
    SELECT code_artifact_id FROM traceability_links WHERE requirement_id = ?
  `);

  const stmtGetReqsForCode = db.prepare<[string]>(`
    SELECT requirement_id FROM traceability_links WHERE code_artifact_id = ?
  `);

  const stmtGetTestsForCode = db.prepare<[string]>(`
    SELECT test_artifact_ids FROM traceability_links WHERE code_artifact_id = ?
  `);

  const stmtGetAllTestIds = db.prepare<[]>(`
    SELECT code_artifact_id, requirement_id, test_artifact_ids
    FROM traceability_links
    WHERE test_artifact_ids IS NOT NULL
  `);

  const stmtGetAll = db.prepare<[]>(`
    SELECT requirement_id, requirement_version, architecture_id,
           code_artifact_id, test_artifact_ids
    FROM traceability_links
  `);

  const stmtCount = db.prepare<[]>(`
    SELECT COUNT(*) as cnt FROM traceability_links
  `);

  // ── Interface implementation ───────────────────────────────────────────────

  return {
    addLink(
      link: Omit<TraceabilityLink, 'test_artifact_ids'> & {
        test_artifact_ids?: readonly string[];
      },
    ): void {
      const ts = now();
      const testIds = link.test_artifact_ids !== undefined && link.test_artifact_ids.length > 0
        ? JSON.stringify(link.test_artifact_ids)
        : null;
      stmtInsert.run(
        link.requirement_id,
        link.requirement_version,
        link.architecture_id ?? null,
        link.code_artifact_id,
        testIds,
        ts,
        ts,
      );
    },

    removeLink(requirementId: string, codeArtifactId: string): void {
      stmtDelete.run(requirementId, codeArtifactId);
    },

    getCodeForRequirement(requirementId: string): string[] {
      const rows = stmtGetCodeForReq.all(requirementId) as Array<{ code_artifact_id: string }>;
      return rows.map(r => r.code_artifact_id);
    },

    getRequirementsForCode(codeArtifactId: string): string[] {
      const rows = stmtGetReqsForCode.all(codeArtifactId) as Array<{ requirement_id: string }>;
      return rows.map(r => r.requirement_id);
    },

    getTestsForCode(codeArtifactId: string): string[] {
      const rows = stmtGetTestsForCode.all(codeArtifactId) as Array<{ test_artifact_ids: string | null }>;
      const result: string[] = [];
      for (const row of rows) {
        const ids = parseTestIds(row.test_artifact_ids);
        result.push(...ids);
      }
      return [...new Set(result)];
    },

    getRequirementsForTest(testArtifactId: string): string[] {
      interface TestRow {
        code_artifact_id: string;
        requirement_id: string;
        test_artifact_ids: string | null;
      }
      const rows = stmtGetAllTestIds.all() as TestRow[];
      const reqIds = new Set<string>();
      for (const row of rows) {
        const ids = parseTestIds(row.test_artifact_ids);
        if (ids.includes(testArtifactId)) {
          reqIds.add(row.requirement_id);
        }
      }
      return [...reqIds];
    },

    updateFromTraceTags(tags: TraceTag[], requirementVersion = 1): void {
      const ts = now();
      for (const tag of tags) {
        const codeArtifactId = `${tag.file}::${tag.function_name}`;
        // Each traced requirement gets its own link
        for (const reqId of tag.traced_requirements) {
          // Use the first architecture reference, if any
          const archId = tag.traced_architecture.length > 0
            ? (tag.traced_architecture[0] ?? null)
            : null;
          stmtInsert.run(
            reqId,
            requirementVersion,
            archId,
            codeArtifactId,
            null,
            ts,
            ts,
          );
        }
      }
    },

    getAllLinks(): TraceabilityLink[] {
      const rows = stmtGetAll.all() as LinkRow[];
      return rows.map(rowToLink);
    },

    count(): number {
      const row = stmtCount.get() as CountRow;
      return row.cnt;
    },
  };
}
