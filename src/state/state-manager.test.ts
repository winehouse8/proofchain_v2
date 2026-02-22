/**
 * Tests for ProofChain StateManager
 */

import { describe, it, expect } from 'vitest';
import { createInMemoryStateManager } from './state-manager.js';

describe('StateManager', () => {
  describe('createInMemoryStateManager', () => {
    it('creates a working DB with initialized schema', () => {
      const sm = createInMemoryStateManager();
      // Should be able to query _meta table without throwing
      const row = sm.db.prepare('SELECT value FROM _meta WHERE key = ?').get('schema_version') as { value: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.value).toBe('1');
      sm.close();
    });

    it('core tables exist after initialization', () => {
      const sm = createInMemoryStateManager();
      const tables = sm.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('_meta');
      expect(tableNames).toContain('audit_events');
      expect(tableNames).toContain('verification_ledger');
      expect(tableNames).toContain('dependency_nodes');
      expect(tableNames).toContain('dependency_edges');
      sm.close();
    });
  });

  describe('getSchemaVersion', () => {
    it('returns the correct schema version after initialization', () => {
      const sm = createInMemoryStateManager();
      expect(sm.getSchemaVersion()).toBe(1);
      sm.close();
    });

    it('returns 0 when _meta has no schema_version row', () => {
      const sm = createInMemoryStateManager();
      sm.db.prepare("DELETE FROM _meta WHERE key = 'schema_version'").run();
      expect(sm.getSchemaVersion()).toBe(0);
      sm.close();
    });
  });

  describe('transaction', () => {
    it('wraps operations atomically — insert within transaction is visible after', () => {
      const sm = createInMemoryStateManager();
      const now = new Date().toISOString();

      sm.transaction(() => {
        sm.db.prepare(`
          INSERT INTO audit_events
            (timestamp, event_type, agent_id, artifact_id, file_path, function_name,
             change_type, asil_level, details, before_snapshot, after_snapshot)
          VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL)
        `).run(now, 'code_change', '{}');
      });

      const count = sm.db.prepare('SELECT COUNT(*) as cnt FROM audit_events').get() as { cnt: number };
      expect(count.cnt).toBe(1);
      sm.close();
    });

    it('rolls back on error — insert inside a throwing transaction does not persist', () => {
      const sm = createInMemoryStateManager();
      const now = new Date().toISOString();

      expect(() => {
        sm.transaction(() => {
          sm.db.prepare(`
            INSERT INTO audit_events
              (timestamp, event_type, agent_id, artifact_id, file_path, function_name,
               change_type, asil_level, details, before_snapshot, after_snapshot)
            VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL)
          `).run(now, 'code_change', '{}');
          throw new Error('deliberate rollback');
        });
      }).toThrow('deliberate rollback');

      const count = sm.db.prepare('SELECT COUNT(*) as cnt FROM audit_events').get() as { cnt: number };
      expect(count.cnt).toBe(0);
      sm.close();
    });

    it('returns the value from the wrapped function', () => {
      const sm = createInMemoryStateManager();
      const result = sm.transaction(() => 42);
      expect(result).toBe(42);
      sm.close();
    });
  });

  describe('applyMigrations', () => {
    it('succeeds with empty migrations array (no-op)', () => {
      const sm = createInMemoryStateManager();
      // The migrations array is empty in schema.ts; calling applyMigrations should not throw
      expect(() => sm.applyMigrations()).not.toThrow();
      sm.close();
    });

    it('does not change schema version when there are no pending migrations', () => {
      const sm = createInMemoryStateManager();
      const versionBefore = sm.getSchemaVersion();
      sm.applyMigrations();
      expect(sm.getSchemaVersion()).toBe(versionBefore);
      sm.close();
    });
  });

  describe('close', () => {
    it('closes the DB so further operations throw', () => {
      const sm = createInMemoryStateManager();
      sm.close();
      expect(() => {
        sm.db.prepare('SELECT 1').get();
      }).toThrow();
    });
  });
});
