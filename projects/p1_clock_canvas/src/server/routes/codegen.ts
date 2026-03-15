// Clock Canvas Web - Code Generation & Export/Import Routes
// REQ-CG-001 through REQ-CG-011

import { Router } from 'express';
import archiver from 'archiver';
import { getDb } from '../db.js';
import { generateRTL, generateSDC, validateDesignCompleteness } from '../services/codegen.js';
import { exportProject, validateImportSchema, importProject } from '../services/export-import.js';
import type { ExportSchema } from '../models/types.js';

export const codegenRoutes = Router();

// ==================== GET /generate/preview (REQ-CG-004) ====================

codegenRoutes.get('/:projectId/generate/preview', (req, res) => {
  try {
    const { projectId } = req.params;
    const db = getDb();

    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectId) as { id: string; name: string } | undefined;
    if (!project) {
      res.status(404).json({ error: 'not_found', message: 'Project not found' });
      return;
    }

    // Check empty design (REQ-CG-011)
    const row = db.prepare('SELECT COUNT(*) as count FROM nodes WHERE project_id = ?').get(projectId) as { count: number };
    if (row.count === 0) {
      res.status(422).json({ error: 'empty_design', message: 'Cannot generate code for an empty design' });
      return;
    }

    // Validate completeness (REQ-CG-003)
    const incomplete = validateDesignCompleteness(db, projectId);
    if (incomplete.length > 0) {
      res.status(422).json({ error: 'incomplete_design', incomplete_items: incomplete });
      return;
    }

    const rtl = generateRTL(db, projectId, project.name);
    const sdc = generateSDC(db, projectId, project.name);

    res.json({ rtl, sdc });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});

// ==================== GET /generate/download (REQ-CG-005) ====================

codegenRoutes.get('/:projectId/generate/download', (req, res) => {
  try {
    const { projectId } = req.params;
    const db = getDb();

    const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectId) as { id: string; name: string } | undefined;
    if (!project) {
      res.status(404).json({ error: 'not_found', message: 'Project not found' });
      return;
    }

    // Check empty design (REQ-CG-011)
    const row = db.prepare('SELECT COUNT(*) as count FROM nodes WHERE project_id = ?').get(projectId) as { count: number };
    if (row.count === 0) {
      res.status(422).json({ error: 'empty_design', message: 'Cannot generate code for an empty design' });
      return;
    }

    // Validate completeness (REQ-CG-003)
    const incomplete = validateDesignCompleteness(db, projectId);
    if (incomplete.length > 0) {
      res.status(422).json({ error: 'incomplete_design', incomplete_items: incomplete });
      return;
    }

    const rtl = generateRTL(db, projectId, project.name);
    const sdc = generateSDC(db, projectId, project.name);
    const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    archive.append(rtl, { name: `${safeName}.v` });
    archive.append(sdc, { name: `${safeName}.sdc` });
    archive.finalize();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});

// ==================== GET /export (REQ-CG-006) ====================

codegenRoutes.get('/:projectId/export', (req, res) => {
  try {
    const { projectId } = req.params;
    const db = getDb();

    const data = exportProject(db, projectId);
    const safeName = data.project_name.replace(/[^a-zA-Z0-9_-]/g, '_');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.json"`);
    res.json(data);
  } catch (err) {
    if (err instanceof Error && err.message === 'Project not found') {
      res.status(404).json({ error: 'not_found', message: 'Project not found' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'internal_error', message });
  }
});

// ==================== POST /import (REQ-CG-007, REQ-CG-008) ====================

codegenRoutes.post('/import', (req, res) => {
  try {
    const db = getDb();
    const body = req.body as unknown;

    // Validate schema (REQ-CG-008)
    const errors = validateImportSchema(body);
    if (errors.length > 0) {
      res.status(400).json({ error: 'validation_error', errors });
      return;
    }

    const projectId = importProject(db, body as ExportSchema);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, unknown>;

    res.status(201).json(project);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: 'import_error', message });
  }
});
