/**
 * ProofChain Dependency Graph
 *
 * Build, query, and update the artifact dependency graph.
 * Stored in SQLite tables `dependency_nodes` and `dependency_edges`.
 */

import Database from 'better-sqlite3';
import type {
  ArtifactType,
  DependencyEdgeType,
  DependencyNode,
} from '../core/types.js';

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface AddNodeInput {
  id: string;
  type: ArtifactType;
  file_path?: string | null;
  content_hash: string;
  interface_hash?: string | null;
  traced_requirements?: readonly string[];
  tested_by?: readonly string[];
}

export interface BlastRadiusResult {
  affected: Array<{
    artifact_id: string;
    artifact_type: ArtifactType;
    distance: number;
  }>;
  total: number;
}

export interface DependencyGraph {
  /** Add a node to the graph */
  addNode(node: AddNodeInput): void;

  /** Remove a node and all its edges */
  removeNode(artifactId: string): void;

  /** Add a dependency edge */
  addEdge(from: string, to: string, edgeType: DependencyEdgeType): void;

  /** Remove an edge */
  removeEdge(from: string, to: string, edgeType: DependencyEdgeType): void;

  /** Get all nodes that depend ON this artifact (callers, upstream) */
  getUpstream(artifactId: string): DependencyNode[];

  /** Get all nodes that this artifact depends on (callees, downstream) */
  getDownstream(artifactId: string): DependencyNode[];

  /** Get a single node */
  getNode(artifactId: string): DependencyNode | null;

  /** Update a node's content hash (and optionally interface hash) */
  updateNodeHash(
    artifactId: string,
    contentHash: string,
    interfaceHash?: string | null,
  ): void;

  /**
   * Compute blast radius for a change.
   * For interface changes: propagate transitively through callers.
   * For implementation changes: only direct dependents are affected.
   */
  getBlastRadius(
    artifactId: string,
    isInterfaceChange: boolean,
  ): BlastRadiusResult;

  /** Count nodes */
  nodeCount(): number;

  /** Count edges */
  edgeCount(): number;
}

// ─── SQLite Row Types ─────────────────────────────────────────────────────────

interface NodeRow {
  id: string;
  type: string;
  file_path: string | null;
  content_hash: string;
  interface_hash: string | null;
  traced_requirements: string | null;
  tested_by: string | null;
}

interface EdgeRow {
  from_id: string;
  to_id: string;
  edge_type: string;
}

// ─── Row Mapper ───────────────────────────────────────────────────────────────

function rowToNode(row: NodeRow): DependencyNode {
  return {
    id: row.id,
    type: row.type as ArtifactType,
    file_path: row.file_path,
    content_hash: row.content_hash,
    interface_hash: row.interface_hash,
    traced_requirements: row.traced_requirements
      ? (JSON.parse(row.traced_requirements) as string[])
      : [],
    tested_by: row.tested_by
      ? (JSON.parse(row.tested_by) as string[])
      : [],
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createDependencyGraph(db: Database.Database): DependencyGraph {
  const now = () => new Date().toISOString();

  // ── Prepared statements ──────────────────────────────────────────────────

  const stmtInsertNode = db.prepare<[
    string, string, string | null, string, string | null,
    string | null, string | null, string, string,
  ]>(`
    INSERT OR REPLACE INTO dependency_nodes
      (id, type, file_path, content_hash, interface_hash,
       traced_requirements, tested_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const stmtDeleteNode = db.prepare<[string]>(`
    DELETE FROM dependency_nodes WHERE id = ?
  `);

  const stmtDeleteEdgesForNode = db.prepare<[string, string]>(`
    DELETE FROM dependency_edges WHERE from_id = ? OR to_id = ?
  `);

  const stmtInsertEdge = db.prepare<[string, string, string, string]>(`
    INSERT OR IGNORE INTO dependency_edges (from_id, to_id, edge_type, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const stmtDeleteEdge = db.prepare<[string, string, string]>(`
    DELETE FROM dependency_edges WHERE from_id = ? AND to_id = ? AND edge_type = ?
  `);

  // Upstream: nodes that depend ON the given artifact (edges pointing TO it)
  const stmtGetUpstream = db.prepare<[string]>(`
    SELECT n.id, n.type, n.file_path, n.content_hash,
           n.interface_hash, n.traced_requirements, n.tested_by
    FROM dependency_nodes n
    INNER JOIN dependency_edges e ON e.from_id = n.id
    WHERE e.to_id = ?
  `);

  // Downstream: nodes that this artifact depends on (edges pointing FROM it)
  const stmtGetDownstream = db.prepare<[string]>(`
    SELECT n.id, n.type, n.file_path, n.content_hash,
           n.interface_hash, n.traced_requirements, n.tested_by
    FROM dependency_nodes n
    INNER JOIN dependency_edges e ON e.to_id = n.id
    WHERE e.from_id = ?
  `);

  const stmtGetNode = db.prepare<[string]>(`
    SELECT id, type, file_path, content_hash, interface_hash,
           traced_requirements, tested_by
    FROM dependency_nodes WHERE id = ?
  `);

  const stmtUpdateHash = db.prepare<[string, string | null, string, string]>(`
    UPDATE dependency_nodes
    SET content_hash = ?, interface_hash = ?, updated_at = ?
    WHERE id = ?
  `);

  const stmtCountNodes = db.prepare<[]>(`
    SELECT COUNT(*) as cnt FROM dependency_nodes
  `);

  const stmtCountEdges = db.prepare<[]>(`
    SELECT COUNT(*) as cnt FROM dependency_edges
  `);

  // Direct callers of a given node (used in BFS)
  const stmtGetDirectCallers = db.prepare<[string]>(`
    SELECT n.id, n.type, n.file_path, n.content_hash,
           n.interface_hash, n.traced_requirements, n.tested_by
    FROM dependency_nodes n
    INNER JOIN dependency_edges e ON e.from_id = n.id
    WHERE e.to_id = ?
  `);

  // ── Interface implementation ─────────────────────────────────────────────

  const graph: DependencyGraph = {
    addNode(node: AddNodeInput): void {
      const ts = now();
      stmtInsertNode.run(
        node.id,
        node.type,
        node.file_path ?? null,
        node.content_hash,
        node.interface_hash ?? null,
        node.traced_requirements ? JSON.stringify(node.traced_requirements) : null,
        node.tested_by ? JSON.stringify(node.tested_by) : null,
        ts,
        ts,
      );
    },

    removeNode(artifactId: string): void {
      stmtDeleteEdgesForNode.run(artifactId, artifactId);
      stmtDeleteNode.run(artifactId);
    },

    addEdge(from: string, to: string, edgeType: DependencyEdgeType): void {
      stmtInsertEdge.run(from, to, edgeType, now());
    },

    removeEdge(from: string, to: string, edgeType: DependencyEdgeType): void {
      stmtDeleteEdge.run(from, to, edgeType);
    },

    getUpstream(artifactId: string): DependencyNode[] {
      const rows = stmtGetUpstream.all(artifactId) as NodeRow[];
      return rows.map(rowToNode);
    },

    getDownstream(artifactId: string): DependencyNode[] {
      const rows = stmtGetDownstream.all(artifactId) as NodeRow[];
      return rows.map(rowToNode);
    },

    getNode(artifactId: string): DependencyNode | null {
      const row = stmtGetNode.get(artifactId) as NodeRow | undefined;
      return row !== undefined ? rowToNode(row) : null;
    },

    updateNodeHash(
      artifactId: string,
      contentHash: string,
      interfaceHash?: string | null,
    ): void {
      stmtUpdateHash.run(
        contentHash,
        interfaceHash !== undefined ? interfaceHash : null,
        now(),
        artifactId,
      );
    },

    getBlastRadius(
      artifactId: string,
      isInterfaceChange: boolean,
    ): BlastRadiusResult {
      const affected: BlastRadiusResult['affected'] = [];

      if (isInterfaceChange) {
        // BFS through reverse edges (callers) — transitive propagation
        const visited = new Set<string>();
        // Queue entries: [artifactId, distance]
        const queue: Array<[string, number]> = [[artifactId, 0]];
        visited.add(artifactId);

        while (queue.length > 0) {
          const entry = queue.shift();
          if (entry === undefined) break;
          const [currentId, distance] = entry;

          if (distance > 0) {
            // Don't include the changed artifact itself in affected list
            const node = graph.getNode(currentId);
            if (node !== null) {
              affected.push({
                artifact_id: currentId,
                artifact_type: node.type,
                distance,
              });
            }
          }

          // Get direct callers of currentId
          const callers = stmtGetDirectCallers.all(currentId) as NodeRow[];
          for (const caller of callers) {
            if (!visited.has(caller.id)) {
              visited.add(caller.id);
              queue.push([caller.id, distance + 1]);
            }
          }
        }
      } else {
        // Only direct dependents (1 hop)
        const upstream = graph.getUpstream(artifactId);
        for (const node of upstream) {
          affected.push({
            artifact_id: node.id,
            artifact_type: node.type,
            distance: 1,
          });
        }
      }

      return { affected, total: affected.length };
    },

    nodeCount(): number {
      const row = stmtCountNodes.get() as { cnt: number };
      return row.cnt;
    },

    edgeCount(): number {
      const row = stmtCountEdges.get() as { cnt: number };
      return row.cnt;
    },
  };

  return graph;
}
