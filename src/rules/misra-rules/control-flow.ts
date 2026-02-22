/**
 * MISRA Control Flow Rules
 *
 * MISRA-C:2012 rules governing control flow constructs.
 */

import type { MisraRule } from '../../core/types.js';

export function getControlFlowRules(): MisraRule[] {
  return [
    {
      rule_id: 'MISRA-15.1',
      category: 'control-flow',
      severity: 'mandatory',
      asil_min: 'A',
      description: 'The goto statement shall not be used.',
      pattern: '\\bgoto\\b',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Replace goto with structured control flow (if/else, loops, or early return).',
      rationale: 'goto statements make control flow difficult to follow and can lead to safety hazards in safety-critical code.',
    },
    {
      rule_id: 'MISRA-15.2',
      category: 'control-flow',
      severity: 'mandatory',
      asil_min: 'A',
      description: 'The goto statement shall jump to a label declared later in the same function (no backward goto).',
      pattern: '\\bgoto\\s+\\w+',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Remove backward goto. Use loops or restructure the logic to avoid jumping to an earlier label.',
      rationale: 'Backward goto creates implicit loops that obscure control flow and complicate verification.',
    },
    {
      rule_id: 'MISRA-15.5',
      category: 'control-flow',
      severity: 'advisory',
      asil_min: 'B',
      description: 'A function should have a single point of exit at the end.',
      pattern: '\\breturn\\b',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Consolidate multiple return statements into a single exit point at the end of the function.',
      rationale: 'Multiple return points make it harder to reason about function post-conditions and resource cleanup.',
    },
    {
      rule_id: 'MISRA-14.4',
      category: 'control-flow',
      severity: 'required',
      asil_min: 'A',
      description: 'The controlling expression of an if/while statement shall be essentially Boolean (no assignment in condition).',
      pattern: '\\b(?:if|while)\\s*\\([^)]*[^=!<>]=[^=][^)]*\\)',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Move the assignment outside the condition. Use == for comparison, not =.',
      rationale: 'Assignment in a controlling expression is likely a typo for ==, and always produces a non-boolean result.',
    },
  ];
}
