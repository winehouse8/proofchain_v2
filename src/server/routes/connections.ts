// Clock Tree Engine - Connection Routes
// Implements REQ-CT-004 (create with validation), REQ-CT-017 (delete)

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { validateConnection } from '../services/validation.js';
import { propagateAndPersist } from '../services/clock-tree.js';
import type { ClockEdge, CreateConnectionRequest } from '../models/types.js';

export const connectionRoutes = Router();

// ==================== POST /api/projects/:projectId/connections (REQ-CT-004, CT-005, CT-006) ====================

connectionRoutes.post('/:projectId/connections', (req, res) => {
  try {
    const { projectId } = req.params;
    const db = getDb();

    // Verify project exists
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      res.status(404).json({ error: 'not_found', message: `Project '${projectId}' not found` });
      return;
    }

    const body = req.body as CreateConnectionRequest;

    // Validate connection (nodes exist, ports valid, no occupied input, no cycle, port type rules)
    const validationError = validateConnection(db, projectId, body);
    if (validationError) {
      res.status(validationError.status).json({
        error: validationError.error,
        message: validationError.message,
      });
      return;
    }

    const id = uuidv4();

    db.prepare(
      'INSERT INTO edges (id, project_id, source, target) VALUES (?, ?, ?, ?)'
    ).run(id, projectId, body.source, body.target);

    // Recalculate frequencies after new connection
    propagateAndPersist(db, projectId);

    const edge: ClockEdge = {
      id,
      source: body.source,
      target: body.target,
    };

    // Update project timestamp
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), projectId);

    res.status(201).json(edge);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});

// ==================== DELETE /api/projects/:projectId/connections/:connectionId (REQ-CT-017) ====================

connectionRoutes.delete('/:projectId/connections/:connectionId', (req, res) => {
  try {
    const { projectId, connectionId } = req.params;
    const db = getDb();

    // Verify project exists
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      res.status(404).json({ error: 'not_found', message: `Project '${projectId}' not found` });
      return;
    }

    // Verify connection exists
    const edge = db.prepare(
      'SELECT id FROM edges WHERE id = ? AND project_id = ?'
    ).get(connectionId, projectId) as { id: string } | undefined;

    if (!edge) {
      res.status(404).json({ error: 'not_found', message: `Connection '${connectionId}' not found` });
      return;
    }

    // Delete the connection
    db.prepare('DELETE FROM edges WHERE id = ? AND project_id = ?').run(connectionId, projectId);

    // Recalculate frequencies after deletion
    propagateAndPersist(db, projectId);

    // Update project timestamp
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), projectId);

    res.status(204).send();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});
