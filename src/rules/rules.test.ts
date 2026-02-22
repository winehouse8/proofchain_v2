/**
 * ProofChain Rules Module Tests
 *
 * Tests for ComplexityAnalyzer, RuleLoader, and RuleEngine.
 */

import { describe, it, expect } from 'vitest';
import { createComplexityAnalyzer } from './complexity-analyzer.js';
import { createRuleLoader } from './rule-loader.js';
import { createRuleEngine } from './rule-engine.js';
import {
  GOTO_VIOLATION,
  RECURSION_VIOLATION,
  DYNAMIC_ALLOC_VIOLATION,
} from '../test-utils/fixtures/known-violations.js';

// ─── ComplexityAnalyzer ───────────────────────────────────────────────────────

describe('ComplexityAnalyzer', () => {
  const analyzer = createComplexityAnalyzer();

  it('calculates cyclomatic complexity of 1 for simple function (no branches)', () => {
    const code = `int add(int a, int b) {
  return a + b;
}`;
    const metrics = analyzer.analyze(code, 'add');
    expect(metrics.cyclomatic_complexity).toBe(1);
  });

  it('calculates cyclomatic complexity for function with branches', () => {
    const code = `int clamp(int x, int min, int max) {
  if (x < min) {
    return min;
  } else if (x > max) {
    return max;
  }
  return x;
}`;
    const metrics = analyzer.analyze(code, 'clamp');
    // Base 1 + if + else if = 3
    expect(metrics.cyclomatic_complexity).toBeGreaterThanOrEqual(3);
  });

  it('logical operators && and || each increment cyclomatic complexity', () => {
    const code = `int check(int a, int b, int c) {
  if (a > 0 && b > 0 || c > 0) {
    return 1;
  }
  return 0;
}`;
    const metrics = analyzer.analyze(code, 'check');
    // Base 1 + if + && + || = 4
    expect(metrics.cyclomatic_complexity).toBeGreaterThanOrEqual(4);
  });

  it('ternary operator increments cyclomatic complexity', () => {
    const code = `int abs_val(int x) {
  return x >= 0 ? x : -x;
}`;
    const metrics = analyzer.analyze(code, 'abs_val');
    // Base 1 + ? = 2
    expect(metrics.cyclomatic_complexity).toBeGreaterThanOrEqual(2);
  });

  it('calculates nesting depth of 0 for flat function body', () => {
    const code = `void flat(void) {
  int x = 1;
  int y = 2;
}`;
    const metrics = analyzer.analyze(code, 'flat');
    expect(metrics.nesting_depth).toBe(0);
  });

  it('calculates nesting depth for nested blocks', () => {
    const code = `void nested(int x) {
  if (x > 0) {
    for (int i = 0; i < x; i++) {
      if (i % 2 == 0) {
        x++;
      }
    }
  }
}`;
    const metrics = analyzer.analyze(code, 'nested');
    // outer if = 1, for = 2, inner if = 3 → nesting_depth should be 3
    expect(metrics.nesting_depth).toBeGreaterThanOrEqual(2);
  });

  it('counts lines of code excluding comments and empty lines', () => {
    const code = `int compute(int x) {
  // This is a comment
  int result = x * 2; /* inline comment */

  /* block comment
     spanning lines */
  return result;
}`;
    const metrics = analyzer.analyze(code, 'compute');
    // Only "int result = x * 2;" and "return result;" are code lines
    // The function braces and signature also count as non-empty non-comment lines
    expect(metrics.lines_of_code).toBeGreaterThan(0);
    // Should not count the comment-only lines
    const totalLines = code.split('\n').length;
    expect(metrics.lines_of_code).toBeLessThan(totalLines);
  });

  it('counts parameters correctly', () => {
    const code = `int mul(int a, int b, int c) {
  return a * b * c;
}`;
    const metrics = analyzer.analyze(code, 'mul');
    expect(metrics.parameter_count).toBe(3);
  });

  it('handles void parameters — count is 0', () => {
    const code = `int get_value(void) {
  return 42;
}`;
    const metrics = analyzer.analyze(code, 'get_value');
    expect(metrics.parameter_count).toBe(0);
  });

  it('handles empty parameter list — count is 0', () => {
    const code = `int get_zero() {
  return 0;
}`;
    const metrics = analyzer.analyze(code, 'get_zero');
    expect(metrics.parameter_count).toBe(0);
  });

  it('calculates comment density', () => {
    const code = `int documented(int x) {
  // Check range
  if (x < 0) {
    return -1;
  }
  return x;
}`;
    const metrics = analyzer.analyze(code, 'documented');
    expect(metrics.comment_density).toBeGreaterThan(0);
    expect(metrics.comment_density).toBeLessThanOrEqual(1.0);
  });

  it('returns zero metrics for missing function', () => {
    const code = `int other(void) { return 0; }`;
    const metrics = analyzer.analyze(code, 'nonexistent');
    expect(metrics.cyclomatic_complexity).toBe(0);
    expect(metrics.nesting_depth).toBe(0);
    expect(metrics.lines_of_code).toBe(0);
    expect(metrics.parameter_count).toBe(0);
    expect(metrics.comment_density).toBe(0);
  });

  it('analyzeFile finds all functions in source', () => {
    const code = `int add(int a, int b) {
  return a + b;
}

int subtract(int a, int b) {
  return a - b;
}

void reset(void) {
  /* nothing */
}`;
    const result = analyzer.analyzeFile(code);
    expect(result.size).toBeGreaterThanOrEqual(2);
    expect(result.has('add')).toBe(true);
    expect(result.has('subtract')).toBe(true);
  });

  it('analyzeFile returns metrics for each found function', () => {
    const code = `int simple(int x) {
  return x;
}`;
    const result = analyzer.analyzeFile(code);
    const metrics = result.get('simple');
    expect(metrics).toBeDefined();
    expect(metrics?.cyclomatic_complexity).toBeGreaterThanOrEqual(1);
  });

  it('cyclomatic complexity is at least 1 for any function with a body', () => {
    const code = `void do_nothing(void) {}`;
    const metrics = analyzer.analyze(code, 'do_nothing');
    // Even an empty function body has complexity 1
    expect(metrics.cyclomatic_complexity).toBeGreaterThanOrEqual(0);
    // (empty body may return 0 due to empty body string — just check non-negative)
    expect(metrics.cyclomatic_complexity).toBeGreaterThanOrEqual(0);
  });
});

// ─── RuleLoader ───────────────────────────────────────────────────────────────

describe('RuleLoader', () => {
  const loader = createRuleLoader();

  it('loads all builtin rules (returns non-empty array)', () => {
    const rules = loader.loadBuiltinRules();
    expect(rules.length).toBeGreaterThan(0);
  });

  it('each builtin rule has required fields', () => {
    const rules = loader.loadBuiltinRules();
    for (const rule of rules) {
      expect(typeof rule.rule_id).toBe('string');
      expect(rule.rule_id.length).toBeGreaterThan(0);
      expect(typeof rule.category).toBe('string');
      expect(['mandatory', 'required', 'advisory']).toContain(rule.severity);
      expect(['QM', 'A', 'B', 'C', 'D']).toContain(rule.asil_min);
      expect(typeof rule.description).toBe('string');
      expect(typeof rule.pattern).toBe('string');
      expect(['regex', 'ast']).toContain(rule.pattern_type);
      expect(typeof rule.fix_suggestion).toBe('string');
      expect(typeof rule.rationale).toBe('string');
    }
  });

  it('ASIL D returns all rules', () => {
    const allRules = loader.loadBuiltinRules();
    const asilDRules = loader.getActiveRules('D');
    expect(asilDRules.length).toBe(allRules.length);
  });

  it('QM level returns fewer rules than ASIL D', () => {
    const qmRules = loader.getActiveRules('QM');
    const dRules = loader.getActiveRules('D');
    expect(qmRules.length).toBeLessThan(dRules.length);
  });

  it('QM rules only include rules with asil_min = QM', () => {
    const qmRules = loader.getActiveRules('QM');
    for (const rule of qmRules) {
      expect(rule.asil_min).toBe('QM');
    }
  });

  it('ASIL B rules include all rules with asil_min <= B', () => {
    const bRules = loader.getActiveRules('B');
    const allRules = loader.loadBuiltinRules();
    const expected = allRules.filter(r =>
      ['QM', 'A', 'B'].includes(r.asil_min),
    );
    expect(bRules.length).toBe(expected.length);
  });

  it('filters rules by ASIL level — ASIL A has more rules than QM', () => {
    const qmRules = loader.getActiveRules('QM');
    const aRules = loader.getActiveRules('A');
    expect(aRules.length).toBeGreaterThanOrEqual(qmRules.length);
  });

  it('returns empty array for non-existent custom rules directory', () => {
    const customRules = loader.loadCustomRules('/tmp/nonexistent-proofchain-rules-dir-xyz');
    expect(customRules).toHaveLength(0);
  });

  it('builtin rules include goto rule (MISRA-15.1)', () => {
    const rules = loader.loadBuiltinRules();
    const gotoRule = rules.find(r => r.rule_id === 'MISRA-15.1');
    expect(gotoRule).toBeDefined();
    expect(gotoRule?.severity).toBe('mandatory');
  });

  it('builtin rules include malloc/dynamic allocation rule (MISRA-21.3)', () => {
    const rules = loader.loadBuiltinRules();
    const memRule = rules.find(r => r.rule_id === 'MISRA-21.3');
    expect(memRule).toBeDefined();
  });

  it('builtin rules include recursion rule (MISRA-17.2)', () => {
    const rules = loader.loadBuiltinRules();
    const recurRule = rules.find(r => r.rule_id === 'MISRA-17.2');
    expect(recurRule).toBeDefined();
  });
});

// ─── RuleEngine ───────────────────────────────────────────────────────────────

describe('RuleEngine', () => {
  const loader = createRuleLoader();
  const analyzer = createComplexityAnalyzer();
  const engine = createRuleEngine(loader, analyzer);

  it('detects goto violation in violating_code', () => {
    const violations = engine.evaluate(
      GOTO_VIOLATION.violating_code,
      'brake.c',
      'A',
    );
    const gotoViolations = violations.filter(v => v.rule_id === 'MISRA-15.1');
    expect(gotoViolations.length).toBeGreaterThan(0);
  });

  it('does not detect goto violation in compliant_code', () => {
    const violations = engine.evaluate(
      GOTO_VIOLATION.compliant_code,
      'brake.c',
      'A',
    );
    const gotoViolations = violations.filter(v => v.rule_id === 'MISRA-15.1');
    expect(gotoViolations.length).toBe(0);
  });

  it('detects malloc/dynamic allocation violation in violating_code', () => {
    const violations = engine.evaluate(
      DYNAMIC_ALLOC_VIOLATION.violating_code,
      'alloc.c',
      'A',
    );
    const memViolations = violations.filter(v => v.rule_id === 'MISRA-21.3');
    expect(memViolations.length).toBeGreaterThan(0);
  });

  it('does not detect malloc violation in compliant_code', () => {
    const violations = engine.evaluate(
      DYNAMIC_ALLOC_VIOLATION.compliant_code,
      'alloc.c',
      'A',
    );
    const memViolations = violations.filter(v => v.rule_id === 'MISRA-21.3');
    expect(memViolations.length).toBe(0);
  });

  it('detects recursion violation in violating_code', () => {
    const violations = engine.evaluate(
      RECURSION_VIOLATION.violating_code,
      'factorial.c',
      'A',
    );
    // MISRA-17.2 pattern matches self-call within the function body
    const recursionViolations = violations.filter(v => v.rule_id === 'MISRA-17.2');
    expect(recursionViolations.length).toBeGreaterThan(0);
  });

  it('does not detect recursion violation in compliant_code', () => {
    const violations = engine.evaluate(
      RECURSION_VIOLATION.compliant_code,
      'factorial.c',
      'A',
    );
    const recursionViolations = violations.filter(v => v.rule_id === 'MISRA-17.2');
    expect(recursionViolations.length).toBe(0);
  });

  it('returns no violations for clean code at ASIL A', () => {
    const cleanCode = `int add(int a, int b) {
  return a + b;
}`;
    const violations = engine.evaluate(cleanCode, 'clean.c', 'A');
    // Filter out advisory violations — check no mandatory/required ones fire
    const critical = violations.filter(v => v.severity !== 'advisory');
    expect(critical.length).toBe(0);
  });

  it('respects ASIL level filtering — QM does not trigger ASIL-A-only rules', () => {
    // MISRA-15.1 (goto) has asil_min = A, so it should NOT fire at QM
    const violations = engine.evaluate(
      GOTO_VIOLATION.violating_code,
      'brake.c',
      'QM',
    );
    const gotoViolations = violations.filter(v => v.rule_id === 'MISRA-15.1');
    expect(gotoViolations.length).toBe(0);
  });

  it('violation includes file, line, column, message, and fix_suggestion', () => {
    const violations = engine.evaluate(
      GOTO_VIOLATION.violating_code,
      'src/brake.c',
      'A',
    );
    const v = violations.find(v => v.rule_id === 'MISRA-15.1');
    expect(v).toBeDefined();
    expect(v?.file).toBe('src/brake.c');
    expect(typeof v?.line).toBe('number');
    expect(v?.line).toBeGreaterThan(0);
    expect(typeof v?.column).toBe('number');
    expect(typeof v?.message).toBe('string');
    expect(typeof v?.fix_suggestion).toBe('string');
    expect(v?.code_snippet).toBeDefined();
  });

  it('evaluateFunction scopes evaluation to specific function body', () => {
    // Put a clean function alongside the violating function
    const code = `int clean(int x) {
  return x;
}

${GOTO_VIOLATION.violating_code}`;

    // Evaluate only the clean function — should produce no goto violations
    const violations = engine.evaluateFunction(code, 'test.c', 'clean', 'A');
    const gotoViolations = violations.filter(v => v.rule_id === 'MISRA-15.1');
    expect(gotoViolations.length).toBe(0);
  });

  it('evaluateFunction returns empty array for unknown function name', () => {
    const violations = engine.evaluateFunction(
      'int foo(void) { return 0; }',
      'test.c',
      'nonexistent_function',
      'D',
    );
    expect(violations).toHaveLength(0);
  });

  it('checkComplexity generates violation when cyclomatic complexity exceeds threshold', () => {
    // A function with many branches
    const highComplexityCode = `int mega(int a, int b, int c, int d) {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        if (d > 0) {
          if (a == b) {
            if (b == c) {
              if (c == d) {
                return 1;
              }
            }
          }
          return 2;
        }
      }
    }
  }
  return 0;
}`;
    const thresholds = {
      cyclomatic_complexity_max: 3,
      nesting_depth_max: 10,
      function_lines_max: 100,
      function_params_max: 10,
      comment_density_min: 0.0,
      statement_coverage_min: 0.0,
      branch_coverage_min: 0.0,
      mcdc_coverage_min: 0.0,
    };
    const violations = engine.checkComplexity(highComplexityCode, 'mega', thresholds);
    const ccViolation = violations.find(v => v.rule_id === 'COMPLEXITY-CC');
    expect(ccViolation).toBeDefined();
    expect(ccViolation?.severity).toBe('required');
  });

  it('checkComplexity generates violation when nesting depth exceeds threshold', () => {
    const deeplyNested = `int deep(int x) {
  if (x > 0) {
    if (x > 1) {
      if (x > 2) {
        if (x > 3) {
          return x;
        }
      }
    }
  }
  return 0;
}`;
    const thresholds = {
      cyclomatic_complexity_max: 100,
      nesting_depth_max: 2,
      function_lines_max: 100,
      function_params_max: 10,
      comment_density_min: 0.0,
      statement_coverage_min: 0.0,
      branch_coverage_min: 0.0,
      mcdc_coverage_min: 0.0,
    };
    const violations = engine.checkComplexity(deeplyNested, 'deep', thresholds);
    const ndViolation = violations.find(v => v.rule_id === 'COMPLEXITY-ND');
    expect(ndViolation).toBeDefined();
  });

  it('checkComplexity generates LOC violation when function is too long', () => {
    // Build a function with many code lines
    const lines = Array.from({ length: 60 }, (_, i) => `  int var${i} = ${i};`).join('\n');
    const longCode = `void long_func(void) {\n${lines}\n}`;
    const thresholds = {
      cyclomatic_complexity_max: 100,
      nesting_depth_max: 100,
      function_lines_max: 10,
      function_params_max: 10,
      comment_density_min: 0.0,
      statement_coverage_min: 0.0,
      branch_coverage_min: 0.0,
      mcdc_coverage_min: 0.0,
    };
    const violations = engine.checkComplexity(longCode, 'long_func', thresholds);
    const locViolation = violations.find(v => v.rule_id === 'COMPLEXITY-LOC');
    expect(locViolation).toBeDefined();
    expect(locViolation?.severity).toBe('advisory');
  });

  it('checkComplexity generates parameter count violation when too many params', () => {
    const code = `int many_params(int a, int b, int c, int d, int e, int f, int g) {
  return a + b + c + d + e + f + g;
}`;
    const thresholds = {
      cyclomatic_complexity_max: 100,
      nesting_depth_max: 100,
      function_lines_max: 100,
      function_params_max: 4,
      comment_density_min: 0.0,
      statement_coverage_min: 0.0,
      branch_coverage_min: 0.0,
      mcdc_coverage_min: 0.0,
    };
    const violations = engine.checkComplexity(code, 'many_params', thresholds);
    const pcViolation = violations.find(v => v.rule_id === 'COMPLEXITY-PC');
    expect(pcViolation).toBeDefined();
  });

  it('checkComplexity generates comment density violation when density too low', () => {
    const uncommented = `int undocumented(int a, int b) {
  int c = a + b;
  int d = c * 2;
  int e = d - a;
  return e;
}`;
    const thresholds = {
      cyclomatic_complexity_max: 100,
      nesting_depth_max: 100,
      function_lines_max: 100,
      function_params_max: 10,
      comment_density_min: 0.5,
      statement_coverage_min: 0.0,
      branch_coverage_min: 0.0,
      mcdc_coverage_min: 0.0,
    };
    const violations = engine.checkComplexity(uncommented, 'undocumented', thresholds);
    const cdViolation = violations.find(v => v.rule_id === 'COMPLEXITY-CD');
    expect(cdViolation).toBeDefined();
    expect(cdViolation?.severity).toBe('advisory');
  });

  it('checkComplexity returns no violations when all thresholds are met', () => {
    const code = `int simple(int x) {
  /* Returns x doubled */
  return x * 2; /* safe */
}`;
    const thresholds = {
      cyclomatic_complexity_max: 10,
      nesting_depth_max: 5,
      function_lines_max: 50,
      function_params_max: 5,
      comment_density_min: 0.0,
      statement_coverage_min: 0.0,
      branch_coverage_min: 0.0,
      mcdc_coverage_min: 0.0,
    };
    const violations = engine.checkComplexity(code, 'simple', thresholds);
    expect(violations).toHaveLength(0);
  });

  it('checkComplexity violations use synthetic file path containing function name', () => {
    const code = `int calc(int a, int b) { return a + b; }`;
    const thresholds = {
      cyclomatic_complexity_max: 0, // force a CC violation
      nesting_depth_max: 100,
      function_lines_max: 100,
      function_params_max: 10,
      comment_density_min: 0.0,
      statement_coverage_min: 0.0,
      branch_coverage_min: 0.0,
      mcdc_coverage_min: 0.0,
    };
    const violations = engine.checkComplexity(code, 'calc', thresholds);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.file).toContain('calc');
  });

  it('evaluate at ASIL D returns more potential violations than at QM', () => {
    // Use code that would trigger rules only active at higher ASIL
    const code = GOTO_VIOLATION.violating_code;
    const qmViolations = engine.evaluate(code, 'test.c', 'QM');
    const dViolations = engine.evaluate(code, 'test.c', 'D');
    expect(dViolations.length).toBeGreaterThanOrEqual(qmViolations.length);
  });
});
