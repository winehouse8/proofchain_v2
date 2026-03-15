// Clock Tree Engine - Node CRUD Routes
// Implements REQ-CT-002 (create), REQ-CT-009 (delete), REQ-CT-016 (update)

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { validateNodeCreation, validateNodeCount, validatePropertyValues } from '../services/validation.js';
import { propagateAndPersist } from '../services/clock-tree.js';
import type {
  ClockNode,
  ComponentType,
  CreateNodeRequest,
  UpdateNodeRequest,
  NodeProperties,
} from '../models/types.js';
import { DEFAULT_PROPERTIES } from '../models/types.js';

export const nodeRoutes = Router();

// ==================== POST /api/projects/:projectId/nodes (REQ-CT-002, CT-003, CT-018) ====================

nodeRoutes.post('/:projectId/nodes', (req, res) => {
  try {
    const { projectId } = req.params;
    const db = getDb();

    // Verify project exists
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      res.status(404).json({ error: 'not_found', message: `Project '${projectId}' not found` });
      return;
    }

    const body = req.body as CreateNodeRequest;

    // Validate node creation request (REQ-CT-003)
    const validationError = validateNodeCreation(body);
    if (validationError) {
      res.status(validationError.status).json({
        error: validationError.error,
        message: validationError.message,
      });
      return;
    }

    // Check node count limit (REQ-CT-018)
    const countError = validateNodeCount(db, projectId);
    if (countError) {
      res.status(countError.status).json({
        error: countError.error,
        message: countError.message,
      });
      return;
    }

    const id = uuidv4();
    const defaults = DEFAULT_PROPERTIES[body.type] || {};
    const properties: NodeProperties = { ...defaults, ...body.properties };
    const position = body.position || { x: 0, y: 0 };

    db.prepare(
      'INSERT INTO nodes (id, project_id, type, properties, position_x, position_y, computed_freq) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, projectId, body.type, JSON.stringify(properties), position.x, position.y, null);

    // Propagate frequencies after adding node
    const graph = propagateAndPersist(db, projectId);
    const updatedNode = graph.nodes.get(id);

    const node: ClockNode = {
      id,
      type: body.type,
      properties,
      position,
      computed_freq: updatedNode?.computed_freq ?? null,
    };

    // Update project timestamp
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), projectId);

    res.status(201).json(node);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});

// ==================== PATCH /api/projects/:projectId/nodes/:nodeId (REQ-CT-016) ====================

nodeRoutes.patch('/:projectId/nodes/:nodeId', (req, res) => {
  try {
    const { projectId, nodeId } = req.params;
    const db = getDb();

    // Verify project exists
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      res.status(404).json({ error: 'not_found', message: `Project '${projectId}' not found` });
      return;
    }

    // Verify node exists
    const nodeRow = db.prepare(
      'SELECT id, type, properties, position_x, position_y, computed_freq FROM nodes WHERE id = ? AND project_id = ?'
    ).get(nodeId, projectId) as {
      id: string;
      type: ComponentType;
      properties: string;
      position_x: number;
      position_y: number;
      computed_freq: number | null;
    } | undefined;

    if (!nodeRow) {
      res.status(404).json({ error: 'not_found', message: `Node '${nodeId}' not found in project '${projectId}'` });
      return;
    }

    const body = req.body as UpdateNodeRequest;
    const existingProps = JSON.parse(nodeRow.properties) as NodeProperties;

    // Merge properties
    const updatedProps: NodeProperties = body.properties
      ? { ...existingProps, ...body.properties }
      : existingProps;

    // Validate property values if properties are being updated
    if (body.properties) {
      const propError = validatePropertyValues(nodeRow.type as ComponentType, body.properties);
      if (propError) {
        res.status(propError.status).json({
          error: propError.error,
          message: propError.message,
        });
        return;
      }
    }

    // Update position if provided
    const posX = body.position?.x ?? nodeRow.position_x;
    const posY = body.position?.y ?? nodeRow.position_y;

    db.prepare(
      'UPDATE nodes SET properties = ?, position_x = ?, position_y = ? WHERE id = ? AND project_id = ?'
    ).run(JSON.stringify(updatedProps), posX, posY, nodeId, projectId);

    // Recalculate frequencies if frequency-affecting property changed
    const freqAffecting = ['output_freq', 'ratio', 'select_index'];
    const needsRecalc = body.properties && freqAffecting.some(p => p in body.properties!);

    if (needsRecalc) {
      propagateAndPersist(db, projectId);
    }

    // Re-read node after propagation
    const finalRow = db.prepare(
      'SELECT id, type, properties, position_x, position_y, computed_freq FROM nodes WHERE id = ? AND project_id = ?'
    ).get(nodeId, projectId) as {
      id: string;
      type: ComponentType;
      properties: string;
      position_x: number;
      position_y: number;
      computed_freq: number | null;
    };

    const node: ClockNode = {
      id: finalRow.id,
      type: finalRow.type,
      properties: JSON.parse(finalRow.properties) as NodeProperties,
      position: { x: finalRow.position_x, y: finalRow.position_y },
      computed_freq: finalRow.computed_freq,
    };

    // Update project timestamp
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), projectId);

    res.json(node);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});

// ==================== DELETE /api/projects/:projectId/nodes/:nodeId (REQ-CT-009) ====================

nodeRoutes.delete('/:projectId/nodes/:nodeId', (req, res) => {
  try {
    const { projectId, nodeId } = req.params;
    const db = getDb();

    // Verify node exists
    const nodeRow = db.prepare(
      'SELECT id FROM nodes WHERE id = ? AND project_id = ?'
    ).get(nodeId, projectId) as { id: string } | undefined;

    if (!nodeRow) {
      res.status(404).json({ error: 'not_found', message: `Node '${nodeId}' not found in project '${projectId}'` });
      return;
    }

    // Delete edges connected to this node (both source and target references)
    // Edge source/target format: "nodeId:portName"
    db.prepare(
      "DELETE FROM edges WHERE project_id = ? AND (source LIKE ? OR target LIKE ?)"
    ).run(projectId, `${nodeId}:%`, `${nodeId}:%`);

    // Delete the node
    db.prepare('DELETE FROM nodes WHERE id = ? AND project_id = ?').run(nodeId, projectId);

    // Recalculate frequencies for remaining nodes
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
