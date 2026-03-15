// Clock Canvas Web - Export/Import Service
// REQ-CG-006 (export), REQ-CG-007 (import), REQ-CG-008 (schema validation)

import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type {
  ExportSchema,
  ComponentType,
  NodeProperties,
  Position,
} from '../models/types.js';
import { SCHEMA_VERSION, parsePort } from '../models/types.js';

// ==================== Export (REQ-CG-006) ====================

export function exportProject(
  db: Database.Database,
  projectId: string,
): ExportSchema {
  const project = db.prepare(
    'SELECT id, name FROM projects WHERE id = ?'
  ).get(projectId) as { id: string; name: string } | undefined;

  if (!project) {
    throw new Error('Project not found');
  }

  const nodeRows = db.prepare(
    'SELECT id, type, properties, position_x, position_y FROM nodes WHERE project_id = ?'
  ).all(projectId) as Array<{
    id: string; type: string; properties: string;
    position_x: number; position_y: number;
  }>;

  const edgeRows = db.prepare(
    'SELECT source, target FROM edges WHERE project_id = ?'
  ).all(projectId) as Array<{ source: string; target: string }>;

  return {
    schema_version: SCHEMA_VERSION,
    project_name: project.name,
    exported_at: new Date().toISOString(),
    nodes: nodeRows.map(r => ({
      id: r.id,
      type: r.type as ComponentType,
      properties: JSON.parse(r.properties) as NodeProperties,
      position: { x: r.position_x, y: r.position_y } as Position,
    })),
    edges: edgeRows.map(r => ({
      source: r.source,
      target: r.target,
    })),
  };
}

// ==================== Schema Validation (REQ-CG-008) ====================

export interface ImportValidationError {
  field: string;
  message: string;
}

export function validateImportSchema(data: unknown): ImportValidationError[] {
  const errors: ImportValidationError[] = [];

  if (typeof data !== 'object' || data === null) {
    errors.push({ field: 'root', message: 'Expected a JSON object' });
    return errors;
  }

  const obj = data as Record<string, unknown>;

  // Schema version
  if (obj.schema_version !== SCHEMA_VERSION) {
    errors.push({
      field: 'schema_version',
      message: `Unsupported schema version: ${String(obj.schema_version ?? 'missing')}. Expected: ${SCHEMA_VERSION}`,
    });
  }

  // Project name
  if (typeof obj.project_name !== 'string' || obj.project_name.trim().length === 0) {
    errors.push({ field: 'project_name', message: 'project_name is required and must be a non-empty string' });
  }

  // Nodes
  const validTypes: ComponentType[] = ['PLL', 'Divider', 'Mux', 'ClockGate', 'IPBlock', 'ClockDomain'];

  if (!Array.isArray(obj.nodes)) {
    errors.push({ field: 'nodes', message: 'nodes must be an array' });
  } else {
    for (let i = 0; i < obj.nodes.length; i++) {
      const node = obj.nodes[i] as Record<string, unknown>;
      if (typeof node !== 'object' || node === null) {
        errors.push({ field: `nodes[${i}]`, message: 'Each node must be an object' });
        continue;
      }
      if (typeof node.id !== 'string') {
        errors.push({ field: `nodes[${i}].id`, message: 'Node id must be a string' });
      }
      if (!validTypes.includes(node.type as ComponentType)) {
        errors.push({ field: `nodes[${i}].type`, message: `Invalid component type: ${String(node.type)}` });
      }
      if (typeof node.properties !== 'object' || node.properties === null) {
        errors.push({ field: `nodes[${i}].properties`, message: 'Node properties must be an object' });
      }
      if (typeof node.position !== 'object' || node.position === null) {
        errors.push({ field: `nodes[${i}].position`, message: 'Node position must be an object with x and y' });
      } else {
        const pos = node.position as Record<string, unknown>;
        if (typeof pos.x !== 'number' || typeof pos.y !== 'number') {
          errors.push({ field: `nodes[${i}].position`, message: 'Position x and y must be numbers' });
        }
      }
    }
  }

  // Edges
  if (!Array.isArray(obj.edges)) {
    errors.push({ field: 'edges', message: 'edges must be an array' });
  } else {
    for (let i = 0; i < obj.edges.length; i++) {
      const edge = obj.edges[i] as Record<string, unknown>;
      if (typeof edge !== 'object' || edge === null) {
        errors.push({ field: `edges[${i}]`, message: 'Each edge must be an object' });
        continue;
      }
      if (typeof edge.source !== 'string') {
        errors.push({ field: `edges[${i}].source`, message: 'Edge source must be a string' });
      }
      if (typeof edge.target !== 'string') {
        errors.push({ field: `edges[${i}].target`, message: 'Edge target must be a string' });
      }
    }
  }

  return errors;
}

// ==================== Import (REQ-CG-007) ====================

export function importProject(
  db: Database.Database,
  data: ExportSchema,
): string {
  const projectId = uuidv4();
  const now = new Date().toISOString();

  const importAll = db.transaction(() => {
    db.prepare(
      'INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)'
    ).run(projectId, data.project_name, now, now);

    const insertNode = db.prepare(
      'INSERT INTO nodes (id, project_id, type, properties, position_x, position_y) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const node of data.nodes) {
      insertNode.run(
        node.id, projectId, node.type,
        JSON.stringify(node.properties),
        node.position.x, node.position.y,
      );
    }

    const insertEdge = db.prepare(
      'INSERT INTO edges (id, project_id, source, target) VALUES (?, ?, ?, ?)'
    );

    for (const edge of data.edges) {
      insertEdge.run(uuidv4(), projectId, edge.source, edge.target);
    }
  });

  importAll();

  // Post-import cycle check: verify imported graph is a DAG
  const nodeIds = new Set(data.nodes.map(n => n.id));
  const adjOut = new Map<string, string[]>();
  for (const id of nodeIds) adjOut.set(id, []);
  for (const edge of data.edges) {
    const src = parsePort(edge.source);
    const tgt = parsePort(edge.target);
    if (adjOut.has(src.nodeId)) {
      adjOut.get(src.nodeId)!.push(tgt.nodeId);
    }
  }
  // Kahn's algorithm — if sorted count != node count, a cycle exists
  const inDeg = new Map<string, number>();
  for (const id of nodeIds) inDeg.set(id, 0);
  for (const [, targets] of adjOut) {
    for (const t of targets) {
      inDeg.set(t, (inDeg.get(t) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }
  let sortedCount = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    sortedCount++;
    for (const next of adjOut.get(cur) ?? []) {
      const d = (inDeg.get(next) ?? 1) - 1;
      inDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (sortedCount !== nodeIds.size) {
    // Rollback: delete the imported project
    db.prepare('DELETE FROM edges WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM nodes WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    throw new Error('Imported design contains a cycle and cannot be loaded');
  }

  return projectId;
}
