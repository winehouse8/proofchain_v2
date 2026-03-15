// Clock Canvas Web - SQLite Database Setup
// Uses better-sqlite3 for synchronous API (per SPEC-CC-CT Constraint 1)

import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(dbPath?: string): Database.Database {
  const resolvedPath = dbPath || path.join(process.cwd(), 'clock-canvas.db');
  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables(db);
  return db;
}

export function initMemoryDb(): Database.Database {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createTables(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}

function createTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('PLL', 'Divider', 'Mux', 'ClockGate', 'IPBlock', 'ClockDomain')),
      properties TEXT NOT NULL DEFAULT '{}',
      position_x REAL NOT NULL DEFAULT 0,
      position_y REAL NOT NULL DEFAULT 0,
      computed_freq REAL,
      PRIMARY KEY (id, project_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS edges (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      PRIMARY KEY (id, project_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_project ON nodes(project_id);
    CREATE INDEX IF NOT EXISTS idx_edges_project ON edges(project_id);
    CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(project_id, source);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(project_id, target);
  `);
}

export default { getDb, initDb, initMemoryDb, closeDb };
