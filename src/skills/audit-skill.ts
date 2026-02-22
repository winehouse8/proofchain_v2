/**
 * ProofChain Audit Skill
 *
 * Skill handler for audit trail inspection and export.
 * Returns formatted audit event tables or JSON export strings
 * for Claude Code slash commands.
 */

import type { AuditLogger } from '../state/audit-logger.js';
import type { AuditEvent } from '../core/types.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface AuditSkill {
  execute(command: 'show' | 'export', args?: { limit?: number; eventType?: string }): string;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

const COL_W_ID = 5;
const COL_W_TIME = 24;
const COL_W_TYPE = 26;
const COL_W_ARTIFACT = 20;
const COL_W_ASIL = 6;

function padR(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}

function formatTableRow(event: AuditEvent): string {
  return [
    padR(String(event.id), COL_W_ID),
    padR(event.timestamp.slice(0, 23), COL_W_TIME),
    padR(event.event_type, COL_W_TYPE),
    padR(event.artifact_id ?? '-', COL_W_ARTIFACT),
    padR(event.asil_level ?? '-', COL_W_ASIL),
  ].join(' | ');
}

function formatTableHeader(): string {
  const header = [
    padR('ID', COL_W_ID),
    padR('Timestamp', COL_W_TIME),
    padR('Event Type', COL_W_TYPE),
    padR('Artifact', COL_W_ARTIFACT),
    padR('ASIL', COL_W_ASIL),
  ].join(' | ');
  const separator = '-'.repeat(header.length);
  return `${header}\n${separator}`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAuditSkill(logger: AuditLogger): AuditSkill {
  return {
    execute(command: 'show' | 'export', args?: { limit?: number; eventType?: string }): string {
      switch (command) {
        case 'show': {
          const limit = args?.limit ?? 20;
          const eventType = args?.eventType;

          let events: AuditEvent[];
          if (eventType !== undefined) {
            // Import AuditEventType to satisfy the type — cast is safe since it comes from user input
            const typedEvents = logger.queryByEventType(
              eventType as Parameters<typeof logger.queryByEventType>[0],
            );
            events = typedEvents.slice(0, limit);
          } else {
            events = logger.getRecentEvents(limit);
          }

          const totalCount = logger.count();

          if (events.length === 0) {
            return `[ProofChain] Audit Trail: no events found.`;
          }

          const rows = events.map(formatTableRow);
          return [
            `[ProofChain] Audit Trail (showing ${events.length} of ${totalCount} total events)`,
            formatTableHeader(),
            ...rows,
          ].join('\n');
        }

        case 'export': {
          const limit = args?.limit ?? 1000;
          const events = logger.getRecentEvents(limit);
          const totalCount = logger.count();
          const exported = {
            exported_at: new Date().toISOString(),
            total_events: totalCount,
            exported_count: events.length,
            events,
          };
          return JSON.stringify(exported, null, 2);
        }
      }
    },
  };
}
