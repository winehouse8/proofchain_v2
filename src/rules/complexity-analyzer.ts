/**
 * ProofChain Complexity Analyzer
 *
 * Analyzes C/C++ code complexity using regex-based heuristics.
 * No external AST parser required.
 */

import type { ComplexityMetrics } from '../core/types.js';
import {
  extractFunctionBody,
  extractFunctionSignature,
} from '../ledger/content-hasher.js';

export interface ComplexityAnalyzer {
  analyze(code: string, functionName: string): ComplexityMetrics;
  analyzeFile(code: string): Map<string, ComplexityMetrics>;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Count decision points in a function body for cyclomatic complexity.
 * Starts at 1 (the function itself is one path).
 */
function countCyclomaticComplexity(body: string): number {
  let count = 1; // baseline

  // Keywords that each introduce one new path
  const decisionKeywords = /\b(if|else\s+if|while|for|case)\b/g;
  const kwMatches = body.match(decisionKeywords);
  if (kwMatches !== null) {
    count += kwMatches.length;
  }

  // Logical operators &&, || each add a path
  const logicalOps = /&&|\|\|/g;
  const logMatches = body.match(logicalOps);
  if (logMatches !== null) {
    count += logMatches.length;
  }

  // Ternary operator ?
  const ternary = /\?/g;
  const ternaryMatches = body.match(ternary);
  if (ternaryMatches !== null) {
    count += ternaryMatches.length;
  }

  return count;
}

/**
 * Find the maximum brace nesting depth within a function body.
 * The body includes the outer braces, so we start depth tracking from 0
 * and skip the very first '{'.
 */
function countNestingDepth(body: string): number {
  let depth = 0;
  let maxDepth = 0;
  let inString = false;
  let inChar = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const next = i + 1 < body.length ? body[i + 1] : '';

    // Handle comment entry/exit
    if (!inString && !inChar && !inLineComment && !inBlockComment) {
      if (ch === '/' && next === '/') {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
    }

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    // Handle string/char literals
    if (!inChar && ch === '"' && (i === 0 || body[i - 1] !== '\\')) {
      inString = !inString;
      continue;
    }
    if (!inString && ch === '\'' && (i === 0 || body[i - 1] !== '\\')) {
      inChar = !inChar;
      continue;
    }

    if (inString || inChar) continue;

    if (ch === '{') {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (ch === '}') {
      depth--;
    }
  }

  // The outer braces of the function body count as depth 1;
  // nesting_depth is the maximum depth of nested blocks INSIDE the function,
  // so subtract 1 (the function's own opening brace).
  return Math.max(0, maxDepth - 1);
}

/**
 * Count non-empty, non-comment lines in a function body.
 */
function countLinesOfCode(body: string): number {
  // Remove block comments
  const noBlock = body.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments
  const noComments = noBlock.replace(/\/\/[^\n]*/g, '');

  return noComments
    .split('\n')
    .filter(line => line.trim().length > 0)
    .length;
}

/**
 * Count parameters from a function signature string.
 * Returns 0 for void or empty parameter list.
 */
function countParameters(signature: string | null): number {
  if (signature === null) return 0;

  const parenMatch = /\(([^)]*)\)/.exec(signature);
  if (parenMatch === null) return 0;

  const params = (parenMatch[1] ?? '').trim();
  if (params.length === 0 || params === 'void') return 0;

  // Count commas + 1
  return params.split(',').length;
}

/**
 * Calculate comment density: comment_lines / total_lines.
 * Returns 0 if no lines.
 */
function countCommentDensity(body: string): number {
  const lines = body.split('\n');
  if (lines.length === 0) return 0;

  let commentLines = 0;
  let inBlockComment = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (inBlockComment) {
      commentLines++;
      if (line.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    if (line.startsWith('//')) {
      commentLines++;
      continue;
    }

    if (line.includes('/*')) {
      commentLines++;
      if (!line.includes('*/')) {
        inBlockComment = true;
      }
      continue;
    }
  }

  const nonEmptyLines = lines.filter(l => l.trim().length > 0).length;
  if (nonEmptyLines === 0) return 0;

  return commentLines / nonEmptyLines;
}

// ─── Public factory ───────────────────────────────────────────────────────────

export function createComplexityAnalyzer(): ComplexityAnalyzer {
  return {
    analyze(code: string, functionName: string): ComplexityMetrics {
      const body = extractFunctionBody(code, functionName);
      const signature = extractFunctionSignature(code, functionName);

      if (body === null) {
        // Return zeroed metrics when function is not found
        return {
          cyclomatic_complexity: 0,
          nesting_depth: 0,
          lines_of_code: 0,
          parameter_count: 0,
          comment_density: 0,
        };
      }

      return {
        cyclomatic_complexity: countCyclomaticComplexity(body),
        nesting_depth: countNestingDepth(body),
        lines_of_code: countLinesOfCode(body),
        parameter_count: countParameters(signature),
        comment_density: countCommentDensity(body),
      };
    },

    analyzeFile(code: string): Map<string, ComplexityMetrics> {
      const results = new Map<string, ComplexityMetrics>();

      // Match C/C++ function definitions: return_type name(params) {
      // We look for lines that look like function signatures ending with a '{'
      const fnDefPattern = /\b([A-Za-z_]\w*)\s*\([^)]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?(?:final\s*)?\{/g;

      let match: RegExpExecArray | null;
      while ((match = fnDefPattern.exec(code)) !== null) {
        const candidateName = match[1];
        if (candidateName === undefined) continue;

        // Skip C keywords that look like function calls
        const keywords = new Set([
          'if', 'else', 'while', 'for', 'switch', 'do',
          'return', 'sizeof', 'alignof', 'typeof',
        ]);
        if (keywords.has(candidateName)) continue;

        // Avoid duplicate analysis of the same function name
        if (results.has(candidateName)) continue;

        const metrics = this.analyze(code, candidateName);
        // Only store if the function was actually found (non-zero loc or complexity)
        if (metrics.lines_of_code > 0 || metrics.cyclomatic_complexity > 0) {
          results.set(candidateName, metrics);
        }
      }

      return results;
    },
  };
}
