/**
 * ProofChain Audit Logger
 *
 * INSERT-only audit event logger that writes to the `audit_events` SQLite table.
 * NEVER deletes or updates existing events (append-only per ISO 26262 audit trail).
 */

import Database from 'better-sqlite3';
import type { AuditEvent, AuditEventType, ChangeType, AsilLevel } from '../core/types.js';

/** AuditLogInput has all AuditEvent fields except `id` (auto-generated) */
export type AuditLogInput = Omit<AuditEvent, 'id'>;

export interface AuditLogger {
  /** INSERT a new audit event, returns the generated event ID */
  log(event: AuditLogInput): number;

  /** Query events by ISO 8601 timestamp range (inclusive) */
  queryByTimeRange(start: string, end: string): AuditEvent[];

  /** Query events for a specific artifact */
  queryByArtifact(artifactId: string): AuditEvent[];

  /** Query events by event type */
  queryByEventType(eventType: AuditEventType): AuditEvent[];

  /** Get N most recent events */
  getRecentEvents(limit: number): AuditEvent[];

  /** Total event count */
  count(): number;
}

/** Raw row shape returned from SQLite — all nullable columns are string | null */
interface AuditEventRow {
  id: number;
  timestamp: string;
  event_type: string;
  agent_id: string | null;
  artifact_id: string | null;
  file_path: string | null;
  function_name: string | null;
  change_type: string | null;
  asil_level: string | null;
  details: string;
  before_snapshot: string | null;
  after_snapshot: string | null;
}

function rowToAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    event_type: row.event_type as AuditEventType,
    agent_id: row.agent_id,
    artifact_id: row.artifact_id,
    file_path: row.file_path,
    function_name: row.function_name,
    change_type: row.change_type as ChangeType | null,
    asil_level: row.asil_level as AsilLevel | null,
    details: row.details,
    before_snapshot: row.before_snapshot,
    after_snapshot: row.after_snapshot,
  };
}

/**
 * Creates an AuditLogger bound to the given SQLite database.
 */
export function createAuditLogger(db: Database.Database): AuditLogger {
  const insertStmt = db.prepare<[
    string,  // timestamp
    string,  // event_type
    string | null,  // agent_id
    string | null,  // artifact_id
    string | null,  // file_path
    string | null,  // function_name
    string | null,  // change_type
    string | null,  // asil_level
    string,  // details
    string | null,  // before_snapshot
    string | null,  // after_snapshot
  ]>(`
    INSERT INTO audit_events
      (timestamp, event_type, agent_id, artifact_id, file_path,
       function_name, change_type, asil_level, details, before_snapshot, after_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const queryByTimeRangeStmt = db.prepare<[string, string]>(`
    SELECT * FROM audit_events
    WHERE timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC
  `);

  const queryByArtifactStmt = db.prepare<[string]>(`
    SELECT * FROM audit_events
    WHERE artifact_id = ?
    ORDER BY timestamp ASC
  `);

  const queryByEventTypeStmt = db.prepare<[string]>(`
    SELECT * FROM audit_events
    WHERE event_type = ?
    ORDER BY timestamp ASC
  `);

  const getRecentEventsStmt = db.prepare<[number]>(`
    SELECT * FROM audit_events
    ORDER BY id DESC
    LIMIT ?
  `);

  const countStmt = db.prepare<[], { count: number }>(`
    SELECT COUNT(*) AS count FROM audit_events
  `);

  return {
    log(event: AuditLogInput): number {
      const result = insertStmt.run(
        event.timestamp,
        event.event_type,
        event.agent_id,
        event.artifact_id,
        event.file_path,
        event.function_name,
        event.change_type,
        event.asil_level,
        event.details,
        event.before_snapshot,
        event.after_snapshot,
      );
      return Number(result.lastInsertRowid);
    },

    queryByTimeRange(start: string, end: string): AuditEvent[] {
      const rows = queryByTimeRangeStmt.all(start, end) as AuditEventRow[];
      return rows.map(rowToAuditEvent);
    },

    queryByArtifact(artifactId: string): AuditEvent[] {
      const rows = queryByArtifactStmt.all(artifactId) as AuditEventRow[];
      return rows.map(rowToAuditEvent);
    },

    queryByEventType(eventType: AuditEventType): AuditEvent[] {
      const rows = queryByEventTypeStmt.all(eventType) as AuditEventRow[];
      return rows.map(rowToAuditEvent);
    },

    getRecentEvents(limit: number): AuditEvent[] {
      const rows = getRecentEventsStmt.all(limit) as AuditEventRow[];
      return rows.map(rowToAuditEvent);
    },

    count(): number {
      const row = countStmt.get();
      return row ? row.count : 0;
    },
  };
}
