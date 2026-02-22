/**
 * ProofChain CLAUDE.md Injector
 *
 * Injects or updates ASIL-appropriate ProofChain rules into the project's
 * CLAUDE.md file. Idempotent: running twice produces the same result.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ProofChainConfig } from '../core/types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const CLAUDE_MD_FILE    = 'CLAUDE.md';
const MARKER_START      = '<!-- proofchain:rules-start -->';
const MARKER_END        = '<!-- proofchain:rules-end -->';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function claudeMdPath(projectRoot: string): string {
  return join(projectRoot, CLAUDE_MD_FILE);
}

function wrapRules(rulesText: string): string {
  return `${MARKER_START}\n${rulesText}\n${MARKER_END}`;
}

function formatPercent(ratio: number): number {
  return Math.round(ratio * 100);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate the rules text block for a given ProofChainConfig.
 */
export function generateRulesText(config: ProofChainConfig): string {
  const { asil_level, thresholds } = config;

  const asilOrder: Record<string, number> = { QM: 0, A: 1, B: 2, C: 3, D: 4 };
  const level = asilOrder[asil_level] ?? 0;

  const requiredPractices: string[] = [];

  if (level >= 1) {
    requiredPractices.push('- [ASIL A+] All functions must have @trace tags linking to requirements');
    requiredPractices.push('- [ASIL A+] All code changes must have tests before commit');
  }
  if (level >= 2) {
    requiredPractices.push('- [ASIL B+] Independent code review required for all changes');
    requiredPractices.push('- [ASIL B+] No goto statements, no recursion, no dynamic memory allocation');
  }
  if (level >= 3) {
    requiredPractices.push('- [ASIL C+] Change impact analysis required before commit');
    requiredPractices.push('- [ASIL C+] Safety documentation must be maintained');
  }
  if (level >= 4) {
    requiredPractices.push('- [ASIL D] MC/DC coverage of 100% required');
    requiredPractices.push('- [ASIL D] Dual independent review required');
  }

  const practicesSection = requiredPractices.length > 0
    ? requiredPractices.join('\n')
    : '- No additional practices required at QM level';

  return [
    `# ProofChain Safety Rules (ASIL ${asil_level})`,
    '',
    '## Coding Guidelines',
    `- Maximum cyclomatic complexity: ${thresholds.cyclomatic_complexity_max}`,
    `- Maximum function length: ${thresholds.function_lines_max} lines`,
    `- Maximum nesting depth: ${thresholds.nesting_depth_max}`,
    `- Maximum function parameters: ${thresholds.function_params_max}`,
    '',
    '## Required Practices',
    practicesSection,
    '',
    '## Coverage Requirements',
    `- Statement coverage: >= ${formatPercent(thresholds.statement_coverage_min)}%`,
    `- Branch coverage: >= ${formatPercent(thresholds.branch_coverage_min)}%`,
    `- MC/DC coverage: >= ${formatPercent(thresholds.mcdc_coverage_min)}%`,
  ].join('\n');
}

/**
 * Inject or update ProofChain rules in the project's CLAUDE.md file.
 *
 * - If CLAUDE.md does not exist, create it with only the rules block.
 * - If CLAUDE.md exists without markers, append the rules block.
 * - If CLAUDE.md exists with markers, replace only the content between them.
 */
export function injectRules(projectRoot: string, config: ProofChainConfig): void {
  const filePath  = claudeMdPath(projectRoot);
  const rulesText = generateRulesText(config);
  const block     = wrapRules(rulesText);

  if (!existsSync(filePath)) {
    writeFileSync(filePath, block + '\n', 'utf-8');
    return;
  }

  const existing = readFileSync(filePath, 'utf-8');
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx   = existing.indexOf(MARKER_END);

  if (startIdx === -1 || endIdx === -1) {
    // No markers — append at the end
    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    writeFileSync(filePath, existing + separator + block + '\n', 'utf-8');
    return;
  }

  // Replace everything from MARKER_START through MARKER_END (inclusive)
  const before = existing.slice(0, startIdx);
  const after  = existing.slice(endIdx + MARKER_END.length);
  writeFileSync(filePath, before + block + after, 'utf-8');
}

/**
 * Remove ProofChain rules from the project's CLAUDE.md file.
 * If no markers are found, the file is left unchanged.
 */
export function removeRules(projectRoot: string): void {
  const filePath = claudeMdPath(projectRoot);

  if (!existsSync(filePath)) {
    return;
  }

  const existing = readFileSync(filePath, 'utf-8');
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx   = existing.indexOf(MARKER_END);

  if (startIdx === -1 || endIdx === -1) {
    return;
  }

  const before = existing.slice(0, startIdx);
  const after  = existing.slice(endIdx + MARKER_END.length);

  // Trim any double-blank-line gap left behind, then write
  const result = (before + after).replace(/\n{3,}/g, '\n\n');
  writeFileSync(filePath, result, 'utf-8');
}
