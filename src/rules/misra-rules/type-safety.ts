/**
 * MISRA Type Safety Rules
 *
 * MISRA-C:2012 rules governing type conversions and type safety.
 */

import type { MisraRule } from '../../core/types.js';

export function getTypeSafetyRules(): MisraRule[] {
  return [
    {
      rule_id: 'MISRA-10.1',
      category: 'type-safety',
      severity: 'required',
      asil_min: 'A',
      description: 'Operands shall not be of an inappropriate essential type (no implicit signed/unsigned conversion).',
      pattern: '\\b(unsigned\\s+\\w+|uint\\w*)\\s*[+\\-\\*\\/]\\s*(int|long|short|signed)',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Add an explicit cast to ensure both operands have the same signedness before performing arithmetic.',
      rationale: 'Mixing signed and unsigned operands produces implementation-defined behaviour that can lead to unexpected results.',
    },
    {
      rule_id: 'MISRA-10.3',
      category: 'type-safety',
      severity: 'required',
      asil_min: 'B',
      description: 'The value of an expression shall not be assigned to an object of a narrower essential type.',
      pattern: '\\b(int8_t|int16_t|uint8_t|uint16_t|char|short)\\s+\\w+\\s*=\\s*(?:\\([^)]*\\))?\\s*(?:\\w+\\s*[+\\-\\*\\/]|\\w+)',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Add an explicit cast to the target type or use a wider type for the variable.',
      rationale: 'Narrowing conversions can silently truncate values, causing data loss and incorrect safety behaviour.',
    },
    {
      rule_id: 'MISRA-10.4',
      category: 'type-safety',
      severity: 'required',
      asil_min: 'B',
      description: 'Both operands of an arithmetic or bitwise operator shall be of the same essential type category.',
      pattern: '\\b(float|double)\\s*[+\\-\\*\\/]\\s*(int|long|short|unsigned|uint)',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Cast integer operand to floating-point type explicitly before performing mixed arithmetic.',
      rationale: 'Mixed-type arithmetic leads to implicit conversions that may cause precision loss or unexpected behaviour.',
    },
    {
      rule_id: 'MISRA-11.3',
      category: 'type-safety',
      severity: 'required',
      asil_min: 'A',
      description: 'A cast shall not be performed between a pointer to object type and an integral type.',
      pattern: '\\(\\s*(?:int|long|unsigned|uint\\w*|intptr_t|uintptr_t)\\s*\\)\\s*\\w+|\\(\\s*(?:void|\\w+)\\s*\\*\\s*\\)\\s*(?:\\d+|\\w*int\\w*)',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Use intptr_t / uintptr_t for pointer-to-integer conversions and add a comment justifying the exception.',
      rationale: 'Casting between pointers and integers is implementation-defined and may cause alignment or size mismatch issues.',
    },
  ];
}
