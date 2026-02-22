/**
 * ProofChain SQLite Schema
 *
 * Defines the database schema for all ProofChain state tables.
 * Follows ISO 26262 audit and traceability requirements.
 */

export const SCHEMA_VERSION = 1;

// SQL statements to create all tables
export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS _meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verification_ledger (
    artifact_id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    interface_hash TEXT,
    verification_status TEXT NOT NULL DEFAULT 'unverified',
    freshness_score REAL,
    verified_at TEXT,
    verified_against TEXT,  -- JSON
    dependencies TEXT,      -- JSON array
    invalidated_by TEXT,
    invalidated_at TEXT,
    asil_level TEXT NOT NULL DEFAULT 'QM',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dependency_nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    file_path TEXT,
    content_hash TEXT NOT NULL,
    interface_hash TEXT,
    traced_requirements TEXT, -- JSON array
    tested_by TEXT,           -- JSON array
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dependency_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    edge_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(from_id, to_id, edge_type)
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    agent_id TEXT,
    artifact_id TEXT,
    file_path TEXT,
    function_name TEXT,
    change_type TEXT,
    asil_level TEXT,
    details TEXT NOT NULL,     -- JSON
    before_snapshot TEXT,      -- JSON
    after_snapshot TEXT        -- JSON
  );

  CREATE TABLE IF NOT EXISTS traceability_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requirement_id TEXT NOT NULL,
    requirement_version INTEGER NOT NULL,
    architecture_id TEXT,
    code_artifact_id TEXT NOT NULL,
    test_artifact_ids TEXT,    -- JSON array
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(requirement_id, code_artifact_id)
  );

  CREATE TABLE IF NOT EXISTS requirement_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requirement_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    text TEXT NOT NULL,
    asil_level TEXT NOT NULL,
    acceptance_criteria TEXT,  -- JSON array
    created_at TEXT NOT NULL,
    UNIQUE(requirement_id, version)
  );

  CREATE TABLE IF NOT EXISTS verification_debt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artifact_id TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    stale_since TEXT NOT NULL,
    asil_level TEXT NOT NULL,
    estimated_effort TEXT,
    blocks_release INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_audit_artifact ON audit_events(artifact_id);
  CREATE INDEX IF NOT EXISTS idx_edges_from ON dependency_edges(from_id);
  CREATE INDEX IF NOT EXISTS idx_edges_to ON dependency_edges(to_id);
  CREATE INDEX IF NOT EXISTS idx_ledger_status ON verification_ledger(verification_status);
  CREATE INDEX IF NOT EXISTS idx_trace_req ON traceability_links(requirement_id);
  CREATE INDEX IF NOT EXISTS idx_trace_code ON traceability_links(code_artifact_id);
  CREATE INDEX IF NOT EXISTS idx_debt_asil ON verification_debt(asil_level);
`;

// Initialize the database with the schema
export function initializeSchema(db: import('better-sqlite3').Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(CREATE_TABLES_SQL);
  // Set schema version
  const stmt = db.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)');
  stmt.run('schema_version', String(SCHEMA_VERSION));
}

// Migration function type for future schema evolution
export type Migration = (db: import('better-sqlite3').Database) => void;

// Migrations array — v1 is the initial schema, no migration needed
export const migrations: Migration[] = [
  // v1 is the initial schema, no migration needed
];
