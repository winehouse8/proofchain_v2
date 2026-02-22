/**
 * MISRA Recursion Rules
 *
 * MISRA-C:2012 rules governing recursive function calls and return values.
 */

import type { MisraRule } from '../../core/types.js';

export function getRecursionRules(): MisraRule[] {
  return [
    {
      rule_id: 'MISRA-17.2',
      category: 'recursion',
      severity: 'mandatory',
      asil_min: 'A',
      description: 'Functions shall not call themselves, either directly or indirectly.',
      pattern: '\\b(\\w+)\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\b\\1\\s*\\(',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Convert the recursive algorithm to an iterative one using an explicit stack or loop.',
      rationale: 'Recursive calls make stack depth analysis impossible, violating the bounded stack usage requirement of ISO 26262.',
    },
    {
      rule_id: 'MISRA-17.7',
      category: 'recursion',
      severity: 'required',
      asil_min: 'B',
      description: 'The value returned by a function having non-void return type shall be used.',
      pattern: '^\\s*(?!return\\b)(?!if\\b)(?!while\\b)(?!for\\b)(?!switch\\b)(?:[a-zA-Z_]\\w*(?:::[a-zA-Z_]\\w*)*)\\s*\\([^)]*\\)\\s*;',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Assign the return value to a variable or cast it to (void) explicitly to document intentional discard.',
      rationale: 'Ignoring return values can miss error conditions that should be handled for safe operation.',
    },
  ];
}
