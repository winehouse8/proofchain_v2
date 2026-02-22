/**
 * ProofChain Rule Engine
 *
 * Main rule evaluation engine for MISRA C/C++ compliance checking.
 * Applies regex-based rules line-by-line and generates structured violations.
 */

import type {
  AsilLevel,
  AsilThresholds,
  RuleViolation,
} from '../core/types.js';
import { extractFunctionBody } from '../ledger/content-hasher.js';
import type { ComplexityAnalyzer } from './complexity-analyzer.js';
import type { RuleLoader } from './rule-loader.js';

// ─── Public interface ─────────────────────────────────────────────────────────

export interface RuleEngine {
  evaluate(code: string, filePath: string, asilLevel: AsilLevel): RuleViolation[];
  evaluateFunction(
    code: string,
    filePath: string,
    functionName: string,
    asilLevel: AsilLevel,
  ): RuleViolation[];
  checkComplexity(
    code: string,
    functionName: string,
    thresholds: AsilThresholds,
  ): RuleViolation[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Returns true if a regex pattern requires multi-line evaluation (spans lines). */
function isMultilinePattern(pattern: string): boolean {
  return pattern.includes('[\\s\\S]') || pattern.includes('[\\S\\s]');
}

/**
 * Scan source as a single block with a multi-line regex pattern.
 * Used for rules like recursion detection that span multiple lines.
 */
function scanMultiline(
  code: string,
  ruleId: string,
  severity: RuleViolation['severity'],
  pattern: string,
  filePath: string,
  fixSuggestion: string,
  lineOffset: number,
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  let regex: RegExp;

  try {
    regex = new RegExp(pattern, 'g');
  } catch {
    return violations;
  }

  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    // Compute line number from match index
    const lineNumber = code.slice(0, match.index).split('\n').length;
    // Extract the line containing the end of the match for the snippet
    const lines = code.split('\n');
    const matchEndLineNum = code.slice(0, match.index + match[0].length).split('\n').length;
    const snippetLine = lines[matchEndLineNum - 1] ?? '';

    violations.push({
      rule_id: ruleId,
      severity,
      file: filePath,
      line: lineNumber + lineOffset,
      column: 1,
      message: `Violation of ${ruleId}: pattern matched across lines.`,
      fix_suggestion: fixSuggestion,
      code_snippet: snippetLine.trim(),
    });
  }

  return violations;
}

/**
 * Scan source lines with a regex pattern and produce violations.
 * lineOffset is added to line numbers (for function-scoped evaluation).
 */
function scanLines(
  lines: readonly string[],
  ruleId: string,
  severity: RuleViolation['severity'],
  pattern: string,
  filePath: string,
  fixSuggestion: string,
  lineOffset: number,
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  let regex: RegExp;

  try {
    regex = new RegExp(pattern);
  } catch {
    // If the pattern is invalid, skip rather than crash
    return violations;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = regex.exec(line);
    if (match !== null) {
      violations.push({
        rule_id: ruleId,
        severity,
        file: filePath,
        line: i + 1 + lineOffset,
        column: match.index + 1,
        message: `Violation of ${ruleId}: pattern matched in line.`,
        fix_suggestion: fixSuggestion,
        code_snippet: line.trim(),
      });
    }
  }

  return violations;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRuleEngine(
  loader: RuleLoader,
  analyzer: ComplexityAnalyzer,
): RuleEngine {
  return {
    evaluate(
      code: string,
      filePath: string,
      asilLevel: AsilLevel,
    ): RuleViolation[] {
      const activeRules = loader.getActiveRules(asilLevel);
      const lines = code.split('\n');
      const violations: RuleViolation[] = [];

      for (const rule of activeRules) {
        if (rule.pattern_type !== 'regex') continue;

        const ruleViolations = isMultilinePattern(rule.pattern)
          ? scanMultiline(code, rule.rule_id, rule.severity, rule.pattern, filePath, rule.fix_suggestion, 0)
          : scanLines(lines, rule.rule_id, rule.severity, rule.pattern, filePath, rule.fix_suggestion, 0);
        violations.push(...ruleViolations);
      }

      return violations;
    },

    evaluateFunction(
      code: string,
      filePath: string,
      functionName: string,
      asilLevel: AsilLevel,
    ): RuleViolation[] {
      const body = extractFunctionBody(code, functionName);
      if (body === null) return [];

      // Find what line the function body starts on in the original file
      const bodyStart = code.indexOf(body);
      const lineOffset = bodyStart === -1
        ? 0
        : code.slice(0, bodyStart).split('\n').length - 1;

      const activeRules = loader.getActiveRules(asilLevel);
      const lines = body.split('\n');
      const violations: RuleViolation[] = [];

      for (const rule of activeRules) {
        if (rule.pattern_type !== 'regex') continue;

        const ruleViolations = isMultilinePattern(rule.pattern)
          ? scanMultiline(body, rule.rule_id, rule.severity, rule.pattern, filePath, rule.fix_suggestion, lineOffset)
          : scanLines(lines, rule.rule_id, rule.severity, rule.pattern, filePath, rule.fix_suggestion, lineOffset);
        violations.push(...ruleViolations);
      }

      return violations;
    },

    checkComplexity(
      code: string,
      functionName: string,
      thresholds: AsilThresholds,
    ): RuleViolation[] {
      const metrics = analyzer.analyze(code, functionName);
      const violations: RuleViolation[] = [];

      // Synthetic file path for complexity violations — no real file here
      const syntheticFile = `<complexity:${functionName}>`;

      if (metrics.cyclomatic_complexity > thresholds.cyclomatic_complexity_max) {
        violations.push({
          rule_id: 'COMPLEXITY-CC',
          severity: 'required',
          file: syntheticFile,
          line: 1,
          column: 1,
          message: `Cyclomatic complexity ${metrics.cyclomatic_complexity} exceeds threshold ${thresholds.cyclomatic_complexity_max} for function '${functionName}'.`,
          fix_suggestion: `Refactor '${functionName}' to reduce decision points. Extract sub-functions or simplify conditionals.`,
          code_snippet: null,
        });
      }

      if (metrics.nesting_depth > thresholds.nesting_depth_max) {
        violations.push({
          rule_id: 'COMPLEXITY-ND',
          severity: 'required',
          file: syntheticFile,
          line: 1,
          column: 1,
          message: `Nesting depth ${metrics.nesting_depth} exceeds threshold ${thresholds.nesting_depth_max} for function '${functionName}'.`,
          fix_suggestion: `Reduce nesting in '${functionName}' by extracting inner blocks into helper functions or using early returns.`,
          code_snippet: null,
        });
      }

      if (metrics.lines_of_code > thresholds.function_lines_max) {
        violations.push({
          rule_id: 'COMPLEXITY-LOC',
          severity: 'advisory',
          file: syntheticFile,
          line: 1,
          column: 1,
          message: `Function '${functionName}' has ${metrics.lines_of_code} lines, exceeding threshold ${thresholds.function_lines_max}.`,
          fix_suggestion: `Split '${functionName}' into smaller functions with single responsibilities.`,
          code_snippet: null,
        });
      }

      if (metrics.parameter_count > thresholds.function_params_max) {
        violations.push({
          rule_id: 'COMPLEXITY-PC',
          severity: 'advisory',
          file: syntheticFile,
          line: 1,
          column: 1,
          message: `Function '${functionName}' has ${metrics.parameter_count} parameters, exceeding threshold ${thresholds.function_params_max}.`,
          fix_suggestion: `Group related parameters into a struct or split '${functionName}' into functions with fewer responsibilities.`,
          code_snippet: null,
        });
      }

      if (metrics.comment_density < thresholds.comment_density_min) {
        violations.push({
          rule_id: 'COMPLEXITY-CD',
          severity: 'advisory',
          file: syntheticFile,
          line: 1,
          column: 1,
          message: `Comment density ${metrics.comment_density.toFixed(2)} is below minimum ${thresholds.comment_density_min} for function '${functionName}'.`,
          fix_suggestion: `Add inline comments to '${functionName}' explaining non-obvious logic, safety rationale, and assumptions.`,
          code_snippet: null,
        });
      }

      return violations;
    },
  };
}
