// Clock Tree Engine - Analysis Routes
// Implements REQ-CT-010 (CDC analysis), REQ-CT-011 (gating analysis)

import { Router } from 'express';
import { getDb } from '../db.js';
import { buildGraph, analyzeCDC, analyzeGating } from '../services/clock-tree.js';

export const analysisRoutes = Router();

// ==================== GET /api/projects/:projectId/analysis/cdc (REQ-CT-010) ====================

analysisRoutes.get('/:projectId/analysis/cdc', (req, res) => {
  try {
    const { projectId } = req.params;
    const db = getDb();

    // Verify project exists
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      res.status(404).json({ error: 'not_found', message: `Project '${projectId}' not found` });
      return;
    }

    const graph = buildGraph(db, projectId);
    const crossings = analyzeCDC(graph);

    res.json({ crossings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});

// ==================== GET /api/projects/:projectId/analysis/gating (REQ-CT-011) ====================

analysisRoutes.get('/:projectId/analysis/gating', (req, res) => {
  try {
    const { projectId } = req.params;
    const db = getDb();

    // Verify project exists
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      res.status(404).json({ error: 'not_found', message: `Project '${projectId}' not found` });
      return;
    }

    const graph = buildGraph(db, projectId);
    const result = analyzeGating(graph);

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});
