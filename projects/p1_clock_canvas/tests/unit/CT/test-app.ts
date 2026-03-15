// Test helper: builds an Express app with in-memory SQLite DB for isolation.
// Do NOT import src/server/index.ts directly — it calls initDb() and app.listen() at module
// load time. Instead we replicate the app wiring here using initMemoryDb().

import express from 'express';
import cors from 'cors';
import { initMemoryDb, closeDb } from '../../../src/server/db.js';
import { projectRoutes } from '../../../src/server/routes/projects.js';
import { nodeRoutes } from '../../../src/server/routes/nodes.js';
import { connectionRoutes } from '../../../src/server/routes/connections.js';
import { analysisRoutes } from '../../../src/server/routes/analysis.js';
import { codegenRoutes } from '../../../src/server/routes/codegen.js';

export function createTestApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Initialize in-memory DB (sets the module-level singleton used by getDb())
  initMemoryDb();

  // Mount routes identically to production server
  app.use('/api/projects', projectRoutes);
  app.use('/api/projects', nodeRoutes);
  app.use('/api/projects', connectionRoutes);
  app.use('/api/projects', analysisRoutes);
  app.use('/api/projects', codegenRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'internal_error', message: err.message });
  });

  return app;
}

export { closeDb };
