/**
 * Tests for ProofChain AuditLogger
 */

import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-utils/in-memory-db.js';
import { createAuditLogger } from './audit-logger.js';
import type { AuditLogInput } from './audit-logger.js';

function makeEvent(overrides: Partial<AuditLogInput> = {}): AuditLogInput {
  return {
    timestamp: new Date().toISOString(),
    event_type: 'code_change',
    agent_id: null,
    artifact_id: null,
    file_path: null,
    function_name: null,
    change_type: null,
    asil_level: null,
    details: '{}',
    before_snapshot: null,
    after_snapshot: null,
    ...overrides,
  };
}

describe('AuditLogger', () => {
  describe('log', () => {
    it('inserts an event and returns a numeric ID', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);
      const id = logger.log(makeEvent());
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('sequential events get strictly increasing IDs', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);
      const id1 = logger.log(makeEvent());
      const id2 = logger.log(makeEvent());
      const id3 = logger.log(makeEvent());
      expect(id2).toBeGreaterThan(id1);
      expect(id3).toBeGreaterThan(id2);
    });
  });

  describe('queryByTimeRange', () => {
    it('returns events within the range', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);

      logger.log(makeEvent({ timestamp: '2024-01-01T10:00:00.000Z', artifact_id: 'a1' }));
      logger.log(makeEvent({ timestamp: '2024-01-02T10:00:00.000Z', artifact_id: 'a2' }));
      logger.log(makeEvent({ timestamp: '2024-01-03T10:00:00.000Z', artifact_id: 'a3' }));

      const results = logger.queryByTimeRange(
        '2024-01-01T00:00:00.000Z',
        '2024-01-02T23:59:59.999Z',
      );
      expect(results).toHaveLength(2);
      const ids = results.map(e => e.artifact_id);
      expect(ids).toContain('a1');
      expect(ids).toContain('a2');
    });

    it('excludes events outside the range', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);

      logger.log(makeEvent({ timestamp: '2024-01-01T10:00:00.000Z', artifact_id: 'outside' }));
      logger.log(makeEvent({ timestamp: '2024-06-15T10:00:00.000Z', artifact_id: 'inside' }));

      const results = logger.queryByTimeRange(
        '2024-06-01T00:00:00.000Z',
        '2024-06-30T23:59:59.999Z',
      );
      expect(results).toHaveLength(1);
      expect(results[0]!.artifact_id).toBe('inside');
    });

    it('returns empty array when no events match the range', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);
      logger.log(makeEvent({ timestamp: '2024-01-01T10:00:00.000Z' }));

      const results = logger.queryByTimeRange(
        '2025-01-01T00:00:00.000Z',
        '2025-12-31T23:59:59.999Z',
      );
      expect(results).toHaveLength(0);
    });
  });

  describe('queryByArtifact', () => {
    it('returns only events for the specified artifact', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);

      logger.log(makeEvent({ artifact_id: 'art-A', event_type: 'code_change' }));
      logger.log(makeEvent({ artifact_id: 'art-A', event_type: 'verification_passed' }));
      logger.log(makeEvent({ artifact_id: 'art-B', event_type: 'code_change' }));

      const results = logger.queryByArtifact('art-A');
      expect(results).toHaveLength(2);
      expect(results.every(e => e.artifact_id === 'art-A')).toBe(true);
    });

    it('returns empty array for unknown artifact', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);
      logger.log(makeEvent({ artifact_id: 'art-X' }));

      const results = logger.queryByArtifact('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('queryByEventType', () => {
    it('filters correctly by event type', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);

      logger.log(makeEvent({ event_type: 'code_change' }));
      logger.log(makeEvent({ event_type: 'code_change' }));
      logger.log(makeEvent({ event_type: 'verification_passed' }));
      logger.log(makeEvent({ event_type: 'gate_blocked' }));

      const codeChanges = logger.queryByEventType('code_change');
      expect(codeChanges).toHaveLength(2);
      expect(codeChanges.every(e => e.event_type === 'code_change')).toBe(true);

      const passed = logger.queryByEventType('verification_passed');
      expect(passed).toHaveLength(1);
    });

    it('returns empty array for event type with no events', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);
      logger.log(makeEvent({ event_type: 'code_change' }));

      const results = logger.queryByEventType('gate_blocked');
      expect(results).toHaveLength(0);
    });
  });

  describe('getRecentEvents', () => {
    it('returns the last N events in reverse chronological order (by ID)', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);

      const ids: number[] = [];
      for (let i = 0; i < 8; i++) {
        ids.push(logger.log(makeEvent({ artifact_id: `art-${i}` })));
      }

      const recent = logger.getRecentEvents(5);
      expect(recent).toHaveLength(5);

      // Should be in descending ID order
      for (let i = 0; i < recent.length - 1; i++) {
        expect(recent[i]!.id).toBeGreaterThan(recent[i + 1]!.id);
      }

      // The 5 most recent should be the last 5 inserted
      const recentIds = recent.map(e => e.id);
      expect(recentIds).toContain(ids[7]);
      expect(recentIds).toContain(ids[6]);
      expect(recentIds).toContain(ids[5]);
      expect(recentIds).toContain(ids[4]);
      expect(recentIds).toContain(ids[3]);
    });

    it('returns all events when limit exceeds total count', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);

      logger.log(makeEvent());
      logger.log(makeEvent());

      const recent = logger.getRecentEvents(100);
      expect(recent).toHaveLength(2);
    });

    it('returns empty array when no events exist', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);
      const recent = logger.getRecentEvents(5);
      expect(recent).toHaveLength(0);
    });
  });

  describe('count', () => {
    it('returns 0 on empty table', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);
      expect(logger.count()).toBe(0);
    });

    it('returns total event count', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);

      logger.log(makeEvent());
      logger.log(makeEvent());
      logger.log(makeEvent());

      expect(logger.count()).toBe(3);
    });

    it('increments correctly with each log call', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);

      for (let i = 1; i <= 5; i++) {
        logger.log(makeEvent());
        expect(logger.count()).toBe(i);
      }
    });
  });

  describe('event field preservation', () => {
    it('preserves all fields including details JSON string', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);

      const detailsObj = { rule: 'MISRA-C:2012-R15.5', severity: 'mandatory', line: 42 };
      const input: AuditLogInput = {
        timestamp: '2024-06-15T12:00:00.000Z',
        event_type: 'gate_blocked',
        agent_id: 'agent-007',
        artifact_id: 'func::safety_check',
        file_path: 'src/safety.c',
        function_name: 'safety_check',
        change_type: 'code_change',
        asil_level: 'D',
        details: JSON.stringify(detailsObj),
        before_snapshot: JSON.stringify({ hash: 'sha256:abc' }),
        after_snapshot: JSON.stringify({ hash: 'sha256:def' }),
      };

      const id = logger.log(input);
      const [event] = logger.queryByArtifact('func::safety_check');
      expect(event).toBeDefined();
      expect(event!.id).toBe(id);
      expect(event!.timestamp).toBe('2024-06-15T12:00:00.000Z');
      expect(event!.event_type).toBe('gate_blocked');
      expect(event!.agent_id).toBe('agent-007');
      expect(event!.artifact_id).toBe('func::safety_check');
      expect(event!.file_path).toBe('src/safety.c');
      expect(event!.function_name).toBe('safety_check');
      expect(event!.change_type).toBe('code_change');
      expect(event!.asil_level).toBe('D');
      expect(event!.details).toBe(JSON.stringify(detailsObj));
      expect(event!.before_snapshot).toBe(JSON.stringify({ hash: 'sha256:abc' }));
      expect(event!.after_snapshot).toBe(JSON.stringify({ hash: 'sha256:def' }));
    });

    it('preserves null optional fields', () => {
      const db = createTestDb();
      const logger = createAuditLogger(db);

      const id = logger.log(makeEvent({
        agent_id: null,
        artifact_id: null,
        file_path: null,
        function_name: null,
        change_type: null,
        asil_level: null,
        before_snapshot: null,
        after_snapshot: null,
      }));

      const [event] = logger.getRecentEvents(1);
      expect(event!.id).toBe(id);
      expect(event!.agent_id).toBeNull();
      expect(event!.artifact_id).toBeNull();
      expect(event!.file_path).toBeNull();
      expect(event!.function_name).toBeNull();
      expect(event!.change_type).toBeNull();
      expect(event!.asil_level).toBeNull();
      expect(event!.before_snapshot).toBeNull();
      expect(event!.after_snapshot).toBeNull();
    });
  });
});
