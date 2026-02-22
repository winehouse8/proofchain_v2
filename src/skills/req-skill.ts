/**
 * ProofChain Requirements Skill
 *
 * Skill handler for requirement listing, diffing, and version history.
 * Returns formatted strings for Claude Code slash commands.
 */

import type { RequirementParser } from '../requirements/requirement-parser.js';
import type { RequirementVersioner } from '../requirements/requirement-versioner.js';
import type { RequirementDiffer } from '../requirements/requirement-differ.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ReqSkill {
  execute(
    command: 'list' | 'diff' | 'history',
    args?: { reqId?: string; version?: number },
  ): string;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

const SEVERITY_ICON: Record<string, string> = {
  critical: '[CRIT]',
  high:     '[HIGH]',
  medium:   '[MED ]',
  low:      '[LOW ]',
};

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createReqSkill(
  parser: RequirementParser,
  versioner: RequirementVersioner,
  differ: RequirementDiffer,
): ReqSkill {
  // Suppress unused parser — retained in signature for future directory scanning
  void parser;

  return {
    execute(
      command: 'list' | 'diff' | 'history',
      args?: { reqId?: string; version?: number },
    ): string {
      switch (command) {
        case 'list': {
          const requirements = versioner.getAllLatest();
          if (requirements.length === 0) {
            return `[ProofChain] No requirements tracked. Use the requirement versioner to add requirements.`;
          }
          const lines: string[] = [
            `[ProofChain] Requirements (${requirements.length} total, latest versions):`,
            ``,
            `  ${'ID'.padEnd(20)} ${'ASIL'.padEnd(6)} ${'Ver'.padEnd(4)} ${'Hash'.padEnd(10)} Text`,
            `  ${'-'.repeat(80)}`,
          ];
          for (const req of requirements) {
            const textPreview = req.text.length > 40
              ? req.text.slice(0, 37) + '...'
              : req.text;
            lines.push(
              `  ${req.requirement_id.padEnd(20)} ${req.asil_level.padEnd(6)} ${String(req.version).padEnd(4)} ${req.content_hash.slice(0, 8).padEnd(10)} ${textPreview}`,
            );
          }
          return lines.join('\n');
        }

        case 'diff': {
          const { reqId, version } = args ?? {};
          if (reqId === undefined) {
            return `[ProofChain] Error: 'diff' command requires reqId.`;
          }

          const latest = versioner.getLatest(reqId);
          if (latest === null) {
            return `[ProofChain] Requirement '${reqId}' not found.`;
          }

          // If version provided, diff that version against latest; otherwise diff latest against previous
          const compareVersion = version ?? (latest.version - 1);
          if (compareVersion < 1) {
            return `[ProofChain] No previous version exists for '${reqId}' (current: v${latest.version}).`;
          }

          const oldVersion = versioner.getVersion(reqId, compareVersion);
          if (oldVersion === null) {
            return `[ProofChain] Version ${compareVersion} of '${reqId}' not found.`;
          }

          const diff = differ.diff(reqId, oldVersion, latest);
          const icon = SEVERITY_ICON[diff.severity] ?? '[    ]';

          const lines: string[] = [
            `[ProofChain] Requirement Diff: ${reqId}`,
            `  v${diff.old_version} -> v${diff.new_version}`,
            `  Severity  : ${icon} ${diff.severity.toUpperCase()}`,
            `  Changes   : ${[
              diff.text_changed ? 'text' : null,
              diff.asil_changed ? 'ASIL' : null,
              diff.criteria_changed ? 'criteria' : null,
            ].filter(Boolean).join(', ') || 'none'}`,
            ``,
            `Description: ${diff.description}`,
            ``,
            `Old text: ${diff.old_text}`,
            `New text: ${diff.new_text}`,
          ];
          return lines.join('\n');
        }

        case 'history': {
          const { reqId } = args ?? {};
          if (reqId === undefined) {
            return `[ProofChain] Error: 'history' command requires reqId.`;
          }

          const history = versioner.getHistory(reqId);
          if (history.length === 0) {
            return `[ProofChain] No history found for requirement '${reqId}'.`;
          }

          const lines: string[] = [
            `[ProofChain] Version History: ${reqId} (${history.length} version(s))`,
            ``,
            `  ${'Ver'.padEnd(4)} ${'ASIL'.padEnd(6)} ${'Hash'.padEnd(10)} ${'Created'.padEnd(24)} Text`,
            `  ${'-'.repeat(80)}`,
          ];
          for (const v of history) {
            const textPreview = v.text.length > 40 ? v.text.slice(0, 37) + '...' : v.text;
            lines.push(
              `  ${String(v.version).padEnd(4)} ${v.asil_level.padEnd(6)} ${v.content_hash.slice(0, 8).padEnd(10)} ${v.created_at.slice(0, 23).padEnd(24)} ${textPreview}`,
            );
          }
          return lines.join('\n');
        }
      }
    },
  };
}
