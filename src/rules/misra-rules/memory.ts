/**
 * MISRA Memory Management Rules
 *
 * MISRA-C:2012 rules governing dynamic memory and pointer usage.
 */

import type { MisraRule } from '../../core/types.js';

export function getMemoryRules(): MisraRule[] {
  return [
    {
      rule_id: 'MISRA-21.3',
      category: 'memory',
      severity: 'required',
      asil_min: 'A',
      description: 'The memory allocation and deallocation functions of <stdlib.h> shall not be used.',
      pattern: '\\b(malloc|calloc|realloc|free)\\s*\\(',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Use static or stack allocation instead. For variable-size needs, use a pre-allocated static pool.',
      rationale: 'Dynamic memory allocation is non-deterministic in both time and fragmentation behaviour, violating real-time guarantees.',
    },
    {
      rule_id: 'MISRA-21.4',
      category: 'memory',
      severity: 'required',
      asil_min: 'A',
      description: 'The standard header file <setjmp.h> shall not be used (no setjmp/longjmp).',
      pattern: '\\b(setjmp|longjmp|_setjmp|_longjmp)\\s*\\(',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Replace setjmp/longjmp with structured error-handling (return codes or error state flags).',
      rationale: 'setjmp/longjmp bypass normal stack unwinding and can leave resources in inconsistent states.',
    },
    {
      rule_id: 'MISRA-18.4',
      category: 'memory',
      severity: 'advisory',
      asil_min: 'B',
      description: 'The +, -, += and -= operators should not be applied to an expression of pointer type.',
      pattern: '\\b\\w+\\s*(?:\\+\\+|--|\\+=|-=|\\+\\s*\\d|\\-\\s*\\d)',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Use array indexing (ptr[n]) instead of pointer arithmetic (ptr + n) for clarity and bounds-checking.',
      rationale: 'Pointer arithmetic is error-prone and makes static analysis harder; array indexing is clearer and safer.',
    },
    {
      rule_id: 'MISRA-18.7',
      category: 'memory',
      severity: 'required',
      asil_min: 'B',
      description: 'Flexible array members shall not be declared.',
      pattern: '\\w+\\s+\\w+\\[\\s*\\]\\s*;',
      pattern_type: 'regex',
      ast_pattern: null,
      fix_suggestion: 'Replace flexible array member with a fixed-size array or a pointer with a separate size field.',
      rationale: 'Flexible array members complicate size calculations and static analysis, making bounds-checking unreliable.',
    },
  ];
}
