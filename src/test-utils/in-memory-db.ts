/**
 * ProofChain Test Utilities — In-Memory Database
 *
 * Provides a fully-initialized in-memory SQLite database for tests,
 * plus helpers to seed specific graph topologies and ledger entries.
 */

import Database from 'better-sqlite3';
import { initializeSchema } from '../state/schema.js';
import type { LedgerEntry, DependencyEdgeType, ArtifactType, AsilLevel } from '../core/types.js';

// Graph shape type
export type GraphShape = 'linear' | 'diamond' | 'circular' | 'disconnected' | 'fan-out';

// ─── Database Factory ────────────────────────────────────────────────────────

/**
 * Create a fresh in-memory SQLite database with the full ProofChain schema.
 * Each call returns an independent database instance.
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  initializeSchema(db);
  return db;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function insertNode(
  db: Database.Database,
  id: string,
  type: ArtifactType = 'function',
  filePath: string | null = null,
): void {
  const ts = now();
  db.prepare(`
    INSERT OR IGNORE INTO dependency_nodes
      (id, type, file_path, content_hash, interface_hash, traced_requirements, tested_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, '[]', '[]', ?, ?)
  `).run(id, type, filePath, `hash-${id}`, ts, ts);
}

function insertEdge(
  db: Database.Database,
  fromId: string,
  toId: string,
  edgeType: DependencyEdgeType = 'calls',
): void {
  db.prepare(`
    INSERT OR IGNORE INTO dependency_edges (from_id, to_id, edge_type, created_at)
    VALUES (?, ?, ?, ?)
  `).run(fromId, toId, edgeType, now());
}

// ─── Graph Seeding ───────────────────────────────────────────────────────────

/**
 * Seed the dependency graph with a specific topology.
 *
 * Shapes:
 *   linear:      A -> B -> C                          (3 nodes, 2 edges)
 *   diamond:     A -> B, A -> C, B -> D, C -> D       (4 nodes, 4 edges)
 *   circular:    A -> B -> C -> A                     (3 nodes, 3 edges)
 *   disconnected: A, B                                (2 nodes, 0 edges)
 *   fan-out:     A -> B, A -> C, A -> D, A -> E, A -> F (6 nodes, 5 edges)
 */
export function seedGraph(db: Database.Database, shape: GraphShape): void {
  switch (shape) {
    case 'linear': {
      // A -> B -> C
      insertNode(db, 'A');
      insertNode(db, 'B');
      insertNode(db, 'C');
      insertEdge(db, 'A', 'B');
      insertEdge(db, 'B', 'C');
      break;
    }
    case 'diamond': {
      // A -> B, A -> C, B -> D, C -> D
      insertNode(db, 'A');
      insertNode(db, 'B');
      insertNode(db, 'C');
      insertNode(db, 'D');
      insertEdge(db, 'A', 'B');
      insertEdge(db, 'A', 'C');
      insertEdge(db, 'B', 'D');
      insertEdge(db, 'C', 'D');
      break;
    }
    case 'circular': {
      // A -> B -> C -> A
      insertNode(db, 'A');
      insertNode(db, 'B');
      insertNode(db, 'C');
      insertEdge(db, 'A', 'B');
      insertEdge(db, 'B', 'C');
      insertEdge(db, 'C', 'A');
      break;
    }
    case 'disconnected': {
      // A, B  (no edges)
      insertNode(db, 'A');
      insertNode(db, 'B');
      break;
    }
    case 'fan-out': {
      // A -> B, A -> C, A -> D, A -> E, A -> F
      insertNode(db, 'A');
      insertNode(db, 'B');
      insertNode(db, 'C');
      insertNode(db, 'D');
      insertNode(db, 'E');
      insertNode(db, 'F');
      insertEdge(db, 'A', 'B');
      insertEdge(db, 'A', 'C');
      insertEdge(db, 'A', 'D');
      insertEdge(db, 'A', 'E');
      insertEdge(db, 'A', 'F');
      break;
    }
  }
}

// ─── Ledger Seeding ──────────────────────────────────────────────────────────

/**
 * Seed the verification ledger with entries.
 * Each entry in `entries` is merged with sensible defaults.
 */
export function seedLedger(db: Database.Database, entries: Partial<LedgerEntry>[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO verification_ledger
      (artifact_id, content_hash, interface_hash, verification_status, freshness_score,
       verified_at, verified_against, dependencies, invalidated_by, invalidated_at,
       asil_level, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const ts = now();

  for (const entry of entries) {
    const artifactId = entry.artifact_id ?? `artifact-${Math.random().toString(36).slice(2, 9)}`;
    const contentHash = entry.content_hash ?? `hash-${artifactId}`;
    const interfaceHash = entry.interface_hash ?? null;
    const verificationStatus = entry.verification_status ?? 'unverified';
    const freshnessScore = entry.freshness_score ?? null;
    const verifiedAt = entry.verified_at ?? null;
    const verifiedAgainst = entry.verified_against != null
      ? JSON.stringify(entry.verified_against)
      : null;
    const dependencies = entry.dependencies != null
      ? JSON.stringify(entry.dependencies)
      : JSON.stringify([]);
    const invalidatedBy = entry.invalidated_by ?? null;
    const invalidatedAt = entry.invalidated_at ?? null;
    const asilLevel: AsilLevel = entry.asil_level ?? 'QM';

    stmt.run(
      artifactId,
      contentHash,
      interfaceHash,
      verificationStatus,
      freshnessScore,
      verifiedAt,
      verifiedAgainst,
      dependencies,
      invalidatedBy,
      invalidatedAt,
      asilLevel,
      ts,
      ts,
    );
  }
}

// ─── Query Helpers ───────────────────────────────────────────────────────────

/** Return the total number of nodes in the dependency graph. */
export function countNodes(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM dependency_nodes').get() as { cnt: number };
  return row.cnt;
}

/** Return the total number of edges in the dependency graph. */
export function countEdges(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM dependency_edges').get() as { cnt: number };
  return row.cnt;
}

/** Return all node IDs in the dependency graph. */
export function getNodes(db: Database.Database): string[] {
  const rows = db.prepare('SELECT id FROM dependency_nodes ORDER BY id').all() as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/** Return all edges in the dependency graph. */
export function getEdges(
  db: Database.Database,
): Array<{ from_id: string; to_id: string; edge_type: string }> {
  return db
    .prepare('SELECT from_id, to_id, edge_type FROM dependency_edges ORDER BY id')
    .all() as Array<{ from_id: string; to_id: string; edge_type: string }>;
}
