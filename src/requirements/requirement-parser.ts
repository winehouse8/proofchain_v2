/**
 * ProofChain Requirement Parser
 *
 * Parses requirements from markdown files using REQ-XXX-NNN [ASIL X] header format.
 * Gracefully skips malformed requirements.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AsilLevel } from '../core/types.js';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface ParsedRequirement {
  id: string;
  text: string;
  asil_level: AsilLevel;
  acceptance_criteria: string[];
  source_file: string;
  line_number: number;
}

export interface RequirementParser {
  parseFile(content: string, filePath: string): ParsedRequirement[];
  parseDirectory(dirPath: string): ParsedRequirement[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Matches: ### REQ-SSR-042 [ASIL D] or ## REQ-SSR-042 [ASIL D] */
const HEADER_REGEX = /^###?\s+(REQ-[A-Z]+-\d+)\s+\[ASIL\s+([A-Z]+)\]/m;
const HEADER_REGEX_GLOBAL = /^###?\s+(REQ-[A-Z]+-\d+)\s+\[ASIL\s+([A-Z]+)\]/gm;

/** Valid ASIL levels */
const VALID_ASIL: ReadonlySet<string> = new Set(['QM', 'A', 'B', 'C', 'D']);

/** Matches acceptance criteria section header */
const CRITERIA_SECTION_REGEX = /^\*\*Acceptance Criteria:\*\*$|^#### Acceptance Criteria$/m;

/** Matches a bullet point line */
const BULLET_REGEX = /^[-*]\s+(.+)$/;

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Given text between two requirement headers (or end of file),
 * extract the body text and acceptance criteria.
 */
function extractBodyAndCriteria(block: string): { text: string; acceptance_criteria: string[] } {
  const criteriaMatch = CRITERIA_SECTION_REGEX.exec(block);

  let bodySection: string;
  let criteriaSection: string;

  if (criteriaMatch !== null) {
    bodySection = block.slice(0, criteriaMatch.index);
    criteriaSection = block.slice(criteriaMatch.index + criteriaMatch[0].length);
  } else {
    bodySection = block;
    criteriaSection = '';
  }

  // Clean body text: trim, remove blank lines, join
  const text = bodySection
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join(' ')
    .trim();

  // Extract bullet points from criteria section
  const acceptance_criteria: string[] = [];
  if (criteriaSection.length > 0) {
    for (const line of criteriaSection.split('\n')) {
      const match = BULLET_REGEX.exec(line.trim());
      if (match !== null && match[1] !== undefined) {
        acceptance_criteria.push(match[1].trim());
      }
    }
  }

  return { text, acceptance_criteria };
}

/**
 * Parse a markdown string for requirements. Returns all valid ParsedRequirement objects.
 * Malformed entries (unknown ASIL, empty text) are silently skipped.
 */
function parseFile(content: string, filePath: string): ParsedRequirement[] {
  const results: ParsedRequirement[] = [];

  // Collect all header match positions
  const headerMatches: Array<{ id: string; asil: string; index: number; lineNumber: number }> = [];

  let match: RegExpExecArray | null;
  // Reset lastIndex before using global regex
  HEADER_REGEX_GLOBAL.lastIndex = 0;

  while ((match = HEADER_REGEX_GLOBAL.exec(content)) !== null) {
    const id: string | undefined = match[1];
    const asil: string | undefined = match[2];
    if (id === undefined || asil === undefined) {
      continue;
    }
    // Compute line number (1-based) by counting newlines before match.index
    const textBefore = content.slice(0, match.index);
    const lineNumber = textBefore.split('\n').length;

    headerMatches.push({ id, asil, index: match.index, lineNumber });
  }

  // For each header, extract the block up to the next header
  for (let i = 0; i < headerMatches.length; i++) {
    const current = headerMatches[i];
    if (current === undefined) {
      continue;
    }
    const next = headerMatches[i + 1];

    // Validate ASIL level
    if (!VALID_ASIL.has(current.asil)) {
      continue;
    }

    // The block starts after the header line
    const headerEndIndex = content.indexOf('\n', current.index);
    if (headerEndIndex === -1) {
      // Header is the last line, no body
      continue;
    }

    const blockStart = headerEndIndex + 1;
    const blockEnd = next !== undefined ? next.index : content.length;
    const block = content.slice(blockStart, blockEnd);

    let bodyAndCriteria: { text: string; acceptance_criteria: string[] };
    try {
      bodyAndCriteria = extractBodyAndCriteria(block);
    } catch {
      // Skip malformed blocks
      continue;
    }

    if (bodyAndCriteria.text.length === 0) {
      // Skip requirements with no body text
      continue;
    }

    results.push({
      id: current.id,
      text: bodyAndCriteria.text,
      asil_level: current.asil as AsilLevel,
      acceptance_criteria: bodyAndCriteria.acceptance_criteria,
      source_file: filePath,
      line_number: current.lineNumber,
    });
  }

  return results;
}

/**
 * Parse all .md files in a directory. Uses readdirSync + readFileSync.
 * Non-markdown files are ignored. Read errors are silently skipped.
 */
function parseDirectory(dirPath: string): ParsedRequirement[] {
  const results: ParsedRequirement[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.md')) {
      continue;
    }

    const filePath = join(dirPath, entry);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    try {
      const parsed = parseFile(content, filePath);
      results.push(...parsed);
    } catch {
      // Skip malformed files
    }
  }

  return results;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRequirementParser(): RequirementParser {
  return {
    parseFile,
    parseDirectory,
  };
}
