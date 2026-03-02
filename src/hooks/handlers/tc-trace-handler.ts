/**
 * ProofChain TC Trace Handler
 *
 * Verifies that src/ edits during the test phase have TC/REQ traceability tags.
 * Called via `node dist/bridge/cli-entry.js tier1-trace` from check-phase.sh
 * after an auto-backward (test→code) transition.
 *
 * ASIL-adaptive behavior:
 *   QM  → info (allow)
 *   A   → warning (allow)
 *   B+  → block (exit 2)
 */

import type { AsilLevel } from '../../core/types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Input for the tier1-trace command (stdin JSON) */
export interface TcTraceInput {
  /** The tool that triggered the edit (Edit, Write, etc.) */
  tool_name: string;
  /** Tool input containing file_path, new_string/content, etc. */
  tool_input: Record<string, unknown>;
  /** Current HITL phase of the area */
  hitl_phase: string;
  /** Area code (e.g., "CV", "CT", "CG") */
  area: string;
  /** Project ASIL level */
  asil_level: string;
}

/** Result of TC trace verification */
export interface TcTraceResult {
  decision: 'allow' | 'block';
  reason?: string;
  tc_ids: string[];
  req_ids: string[];
  severity: 'info' | 'warning' | 'error';
  message: string;
}

// ─── Tag Extraction ──────────────────────────────────────────────────────────

/** Pattern: @tc TC-XX-NNN (e.g., @tc TC-CV-001, @tc TC-CT-037) */
const TC_TAG_PATTERN = /@tc\s+(TC-[A-Z]{2,4}-\d{3})/g;

/** Pattern: @req REQ-XX-NNN (e.g., @req REQ-CV-001) */
const REQ_TAG_PATTERN = /@req\s+(REQ-[A-Z]{2,4}-\d{3})/g;

/**
 * Extract all TC IDs from text content.
 */
export function extractTcIds(content: string): string[] {
  const matches = [...content.matchAll(TC_TAG_PATTERN)];
  const ids = matches.map((m) => m[1]).filter((id): id is string => id !== undefined);
  return [...new Set(ids)];
}

/**
 * Extract all REQ IDs from text content.
 */
export function extractReqIds(content: string): string[] {
  const matches = [...content.matchAll(REQ_TAG_PATTERN)];
  const ids = matches.map((m) => m[1]).filter((id): id is string => id !== undefined);
  return [...new Set(ids)];
}

// ─── ASIL Severity Mapping ──────────────────────────────────────────────────

const ASIL_ORDER: readonly string[] = ['QM', 'A', 'B', 'C', 'D'];

function asilAtLeast(current: string, minimum: string): boolean {
  const currentIdx = ASIL_ORDER.indexOf(current);
  const minimumIdx = ASIL_ORDER.indexOf(minimum);
  if (currentIdx === -1 || minimumIdx === -1) return false;
  return currentIdx >= minimumIdx;
}

/**
 * Determine severity based on ASIL level.
 * QM → info, A → warning, B+ → error (block)
 */
function asilToSeverity(asil: string): 'info' | 'warning' | 'error' {
  if (asilAtLeast(asil, 'B')) return 'error';
  if (asil === 'A') return 'warning';
  return 'info';
}

// ─── Source File Detection ───────────────────────────────────────────────────

/**
 * Check if the file path is under src/ (the protected source directory).
 */
function isSrcFile(filePath: string): boolean {
  // Normalize: handle both absolute and relative paths
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes('/src/') || normalized.startsWith('src/');
}

/**
 * Extract the file path from tool input.
 */
function getFilePath(toolInput: Record<string, unknown>): string {
  if (typeof toolInput['file_path'] === 'string') return toolInput['file_path'];
  if (typeof toolInput['path'] === 'string') return toolInput['path'];
  return '';
}

/**
 * Extract the editable content from tool input (new_string for Edit, content for Write).
 */
function getEditContent(toolName: string, toolInput: Record<string, unknown>): string {
  if (toolName === 'Edit' && typeof toolInput['new_string'] === 'string') {
    return toolInput['new_string'];
  }
  if (toolName === 'Write' && typeof toolInput['content'] === 'string') {
    return toolInput['content'];
  }
  // For other tools, try common field names
  if (typeof toolInput['new_string'] === 'string') return toolInput['new_string'];
  if (typeof toolInput['content'] === 'string') return toolInput['content'];
  return '';
}

// ─── Main Handler ────────────────────────────────────────────────────────────

/**
 * Verify TC/REQ traceability for a src/ edit in test phase.
 *
 * Returns:
 *   - allow + info: QM level, tags found or not
 *   - allow + warning: ASIL A, tags missing but not blocking
 *   - block + error: ASIL B+, tags missing → hard block
 *   - allow: tags found at any ASIL level
 */
export function checkTcTrace(input: TcTraceInput): TcTraceResult {
  const filePath = getFilePath(input.tool_input);
  const content = getEditContent(input.tool_name, input.tool_input);
  const asil = input.asil_level || 'QM';

  // Only enforce on src/ files in test phase
  if (!isSrcFile(filePath)) {
    return {
      decision: 'allow',
      tc_ids: [],
      req_ids: [],
      severity: 'info',
      message: `[tier1-trace] Skipped: ${filePath} is not under src/`,
    };
  }

  if (input.hitl_phase !== 'test') {
    return {
      decision: 'allow',
      tc_ids: [],
      req_ids: [],
      severity: 'info',
      message: `[tier1-trace] Skipped: phase is '${input.hitl_phase}', not 'test'`,
    };
  }

  // Extract tags from the edit content
  const tcIds = extractTcIds(content);
  const reqIds = extractReqIds(content);
  const hasTags = tcIds.length > 0 || reqIds.length > 0;

  if (hasTags) {
    return {
      decision: 'allow',
      tc_ids: tcIds,
      req_ids: reqIds,
      severity: 'info',
      message: `[tier1-trace] TC traceability OK: ${tcIds.length} TC(s), ${reqIds.length} REQ(s) found in ${filePath}`,
    };
  }

  // No tags found — severity depends on ASIL
  const severity = asilToSeverity(asil);
  const shouldBlock = severity === 'error';

  const asilLabel = shouldBlock ? 'BLOCKED' : severity === 'warning' ? 'WARNING' : 'INFO';

  return {
    decision: shouldBlock ? 'block' : 'allow',
    reason: shouldBlock
      ? `[tier1-trace] ASIL ${asil}: src/ edit in test phase requires @tc/@req tags. Add traceability tags to ${filePath}.`
      : undefined,
    tc_ids: [],
    req_ids: [],
    severity,
    message: `[tier1-trace] ${asilLabel} [ASIL ${asil}]: No @tc/@req tags found in ${filePath} edit during test phase. ` +
      (shouldBlock
        ? 'Add @tc TC-XX-NNN or @req REQ-XX-NNN tags to link this change to a test case.'
        : 'Consider adding @tc/@req tags for traceability.'),
  };
}
