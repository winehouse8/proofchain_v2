// Clock Canvas Web - Express Server Entry Point

import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import { projectRoutes } from './routes/projects.js';
import { nodeRoutes } from './routes/nodes.js';
import { connectionRoutes } from './routes/connections.js';
import { analysisRoutes } from './routes/analysis.js';
import { codegenRoutes } from './routes/codegen.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize database
initDb(process.env.DB_PATH);

// API Routes
app.use('/api/projects', projectRoutes);
app.use('/api/projects', nodeRoutes);
app.use('/api/projects', connectionRoutes);
app.use('/api/projects', analysisRoutes);
app.use('/api/projects', codegenRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Clock Canvas server running on port ${PORT}`);
  });
}

export { app };
export default app;
