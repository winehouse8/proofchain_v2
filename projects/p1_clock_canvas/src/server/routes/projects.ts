// Clock Tree Engine - Project CRUD Routes
// Implements REQ-CT-012 (create), REQ-CT-013 (save), REQ-CT-014 (load),
// REQ-CT-015 (list), REQ-CT-019 (delete)

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import type {
  ComponentType,
  NodeProperties,
  Project,
  ProjectData,
  ProjectListItem,
} from '../models/types.js';

export const projectRoutes = Router();

// ==================== POST /api/projects (REQ-CT-012) ====================

projectRoutes.post('/', (req, res) => {
  try {
    const { name } = req.body as { name?: string };

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'validation_error', message: "'name' is required" });
      return;
    }

    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)'
    ).run(id, name.trim(), now, now);

    const project: Project = {
      id,
      name: name.trim(),
      created_at: now,
      updated_at: now,
    };

    res.status(201).json(project);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});

// ==================== GET /api/projects (REQ-CT-015) ====================

projectRoutes.get('/', (_req, res) => {
  try {
    const db = getDb();

    const rows = db.prepare(`
      SELECT p.id, p.name, p.created_at, p.updated_at,
             (SELECT COUNT(*) FROM nodes n WHERE n.project_id = p.id) as node_count
      FROM projects p
      ORDER BY p.updated_at DESC
    `).all() as ProjectListItem[];

    res.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});

// ==================== GET /api/projects/:projectId (REQ-CT-014) ====================

projectRoutes.get('/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;
    const db = getDb();

    const project = db.prepare(
      'SELECT id, name, created_at, updated_at FROM projects WHERE id = ?'
    ).get(projectId) as Project | undefined;

    if (!project) {
      res.status(404).json({ error: 'not_found', message: `Project '${projectId}' not found` });
      return;
    }

    const nodeRows = db.prepare(
      'SELECT id, type, properties, position_x, position_y, computed_freq FROM nodes WHERE project_id = ?'
    ).all(projectId) as Array<{
      id: string;
      type: ComponentType;
      properties: string;
      position_x: number;
      position_y: number;
      computed_freq: number | null;
    }>;

    const nodes = nodeRows.map(row => ({
      id: row.id,
      type: row.type,
      properties: JSON.parse(row.properties) as NodeProperties,
      position: { x: row.position_x, y: row.position_y },
      computed_freq: row.computed_freq,
    }));

    const edges = db.prepare(
      'SELECT id, source, target FROM edges WHERE project_id = ?'
    ).all(projectId) as Array<{ id: string; source: string; target: string }>;

    const projectData: ProjectData = {
      ...project,
      nodes,
      edges,
    };

    res.json(projectData);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});

// ==================== PUT /api/projects/:projectId (REQ-CT-013) ====================

projectRoutes.put('/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;
    const db = getDb();

    const project = db.prepare(
      'SELECT id, name, created_at, updated_at FROM projects WHERE id = ?'
    ).get(projectId) as Project | undefined;

    if (!project) {
      res.status(404).json({ error: 'not_found', message: `Project '${projectId}' not found` });
      return;
    }

    const now = new Date().toISOString();

    // Update name if provided
    const { name } = req.body as { name?: string };
    const updatedName = (name && typeof name === 'string' && name.trim().length > 0)
      ? name.trim()
      : project.name;

    db.prepare(
      'UPDATE projects SET name = ?, updated_at = ? WHERE id = ?'
    ).run(updatedName, now, projectId);

    const updatedProject: Project = {
      id: projectId,
      name: updatedName,
      created_at: project.created_at,
      updated_at: now,
    };

    res.json(updatedProject);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});

// ==================== DELETE /api/projects/:projectId (REQ-CT-019) ====================

projectRoutes.delete('/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;
    const db = getDb();

    const project = db.prepare(
      'SELECT id FROM projects WHERE id = ?'
    ).get(projectId) as { id: string } | undefined;

    if (!project) {
      res.status(404).json({ error: 'not_found', message: `Project '${projectId}' not found` });
      return;
    }

    // CASCADE will handle nodes and edges deletion
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

    res.json({ message: `Project '${projectId}' deleted successfully` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});
