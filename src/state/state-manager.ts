/**
 * ProofChain State Manager
 *
 * SQLite database manager wrapping better-sqlite3 for ProofChain state management.
 * Supports WAL mode for file-based databases and in-memory databases for testing.
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { initializeSchema, migrations } from './schema.js';
import type { Migration } from './schema.js';

export interface StateManager {
  /** Direct access to the underlying database */
  db: Database.Database;

  /** Wraps operations in a SQLite transaction */
  transaction<T>(fn: () => T): T;

  /** Reads current schema version from _meta table */
  getSchemaVersion(): number;

  /** Applies any pending migrations from schema.ts migrations array */
  applyMigrations(): void;

  /** Closes the database connection */
  close(): void;
}

/**
 * Opens or creates a SQLite database at the given path,
 * runs initializeSchema, and returns a StateManager.
 */
export function createStateManager(dbPath: string): StateManager {
  // Ensure parent directories exist
  const dir = dirname(dbPath);
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Enable WAL mode for file-based databases
  db.pragma('journal_mode = WAL');

  initializeSchema(db);

  return buildStateManager(db);
}

/**
 * Creates an in-memory SQLite database for testing.
 */
export function createInMemoryStateManager(): StateManager {
  const db = new Database(':memory:');
  initializeSchema(db);
  return buildStateManager(db);
}

function buildStateManager(db: Database.Database): StateManager {
  return {
    db,

    transaction<T>(fn: () => T): T {
      const txn = db.transaction(fn);
      return txn();
    },

    getSchemaVersion(): number {
      const row = db
        .prepare<[string], { value: string }>(
          'SELECT value FROM _meta WHERE key = ?',
        )
        .get('schema_version');

      if (!row) {
        return 0;
      }
      const parsed = parseInt(row.value, 10);
      return isNaN(parsed) ? 0 : parsed;
    },

    applyMigrations(): void {
      const currentVersion = this.getSchemaVersion();
      const pending: Migration[] = migrations.slice(currentVersion);

      for (let i = 0; i < pending.length; i++) {
        const migration = pending[i];
        if (migration) {
          const txn = db.transaction(() => {
            migration(db);
            const newVersion = currentVersion + i + 1;
            db.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)').run(
              'schema_version',
              String(newVersion),
            );
          });
          txn();
        }
      }
    },

    close(): void {
      db.close();
    },
  };
}
