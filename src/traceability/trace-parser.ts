/**
 * ProofChain Trace Parser
 *
 * Parses @trace and @defensive_check tags from C/C++ source code.
 */

import type { TraceTag } from '../core/types.js';

// ─── Public Interface ─────────────────────────────────────────────────────────

export interface TraceParser {
  parseFile(code: string, filePath: string): TraceTag[];
  parseFunction(code: string, filePath: string, functionName: string): TraceTag | null;
}

// ─── Internal Patterns ────────────────────────────────────────────────────────

// Matches REQ-CATEGORY-NUMBER, e.g. REQ-SSR-042
const REQ_PATTERN = /REQ-[A-Z]+-\d+/g;

// Matches ARCH-CATEGORY-NUMBER, e.g. ARCH-SW-001
const ARCH_PATTERN = /ARCH-[A-Z]+-\d+/g;

// Block comment: /* @trace ... */ or /* @defensive_check ... */
const BLOCK_TAG_RE = /\/\*\s*@(trace|defensive_check)\s+([\s\S]*?)\*\//g;

// Line comment: // @trace ... or // @defensive_check ...
const LINE_TAG_RE = /\/\/\s*@(trace|defensive_check)\s+(.+)/g;

// C/C++ function definition pattern: return_type name(params) {
// Matches lines like: `void foo(int x) {` or `static int bar(void) {`
const FUNC_DEF_RE = /^[\w\s*&:~<>[\],]+\b(\w+)\s*\([^;]*\)\s*(?:const\s*)?\{?\s*$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractRequirements(text: string): string[] {
  const matches = text.match(REQ_PATTERN);
  return matches !== null ? [...new Set(matches)] : [];
}

function extractArchitecture(text: string): string[] {
  const matches = text.match(ARCH_PATTERN);
  return matches !== null ? [...new Set(matches)] : [];
}

/**
 * Given the full source code split into lines, find the nearest enclosing
 * function name by scanning backward from `tagLineIndex` (0-based).
 */
function findEnclosingFunction(lines: readonly string[], tagLineIndex: number): string {
  for (let i = tagLineIndex; i >= 0; i--) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();
    const m = FUNC_DEF_RE.exec(trimmed);
    if (m !== null && m[1] !== undefined) {
      return m[1];
    }
  }
  return '<unknown>';
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createTraceParser(): TraceParser {
  return {
    parseFile(code: string, filePath: string): TraceTag[] {
      const tags: TraceTag[] = [];
      const lines = code.split('\n');

      // Helper: push a tag if it has at least one requirement or architecture ref,
      // or if it is a defensive_check (which may have neither).
      function pushTag(
        tagType: 'trace' | 'defensive_check',
        tagText: string,
        lineNumber: number,         // 1-based
        functionName: string,
      ): void {
        const reqs = extractRequirements(tagText);
        const archs = extractArchitecture(tagText);
        // For @trace tags we require at least one REQ or ARCH reference.
        // For @defensive_check we always emit.
        if (tagType === 'trace' && reqs.length === 0 && archs.length === 0) {
          return;
        }
        tags.push({
          file: filePath,
          function_name: functionName,
          line: lineNumber,
          traced_requirements: reqs,
          traced_architecture: archs,
          tag_type: tagType,
        });
      }

      // ── Block comments ────────────────────────────────────────────────────
      BLOCK_TAG_RE.lastIndex = 0;
      let blockMatch: RegExpExecArray | null;
      while ((blockMatch = BLOCK_TAG_RE.exec(code)) !== null) {
        try {
          const rawType = blockMatch[1];
          const rawText = blockMatch[2];
          if (rawType === undefined || rawText === undefined) continue;
          const tagType: 'trace' | 'defensive_check' =
            rawType === 'defensive_check' ? 'defensive_check' : 'trace';

          // Compute 1-based line number of the match start
          const before = code.slice(0, blockMatch.index);
          const lineNumber = before.split('\n').length;
          const lineIndex = lineNumber - 1; // 0-based

          const functionName = findEnclosingFunction(lines, lineIndex);
          pushTag(tagType, rawText, lineNumber, functionName);
        } catch {
          // Malformed tag — skip silently
        }
      }

      // ── Line comments ─────────────────────────────────────────────────────
      LINE_TAG_RE.lastIndex = 0;
      let lineMatch: RegExpExecArray | null;
      while ((lineMatch = LINE_TAG_RE.exec(code)) !== null) {
        try {
          const rawType = lineMatch[1];
          const rawText = lineMatch[2];
          if (rawType === undefined || rawText === undefined) continue;
          const tagType: 'trace' | 'defensive_check' =
            rawType === 'defensive_check' ? 'defensive_check' : 'trace';

          const before = code.slice(0, lineMatch.index);
          const lineNumber = before.split('\n').length;
          const lineIndex = lineNumber - 1;

          const functionName = findEnclosingFunction(lines, lineIndex);
          pushTag(tagType, rawText, lineNumber, functionName);
        } catch {
          // Malformed tag — skip silently
        }
      }

      return tags;
    },

    parseFunction(code: string, filePath: string, functionName: string): TraceTag | null {
      const all = createTraceParser().parseFile(code, filePath);
      // Return the first tag whose function_name matches, or null.
      return all.find(t => t.function_name === functionName) ?? null;
    },
  };
}
