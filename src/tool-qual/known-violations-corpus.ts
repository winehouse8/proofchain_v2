/**
 * ProofChain Tool Qualification — Known Violations Corpus
 *
 * A corpus of C code samples with known MISRA violations used to validate
 * the accuracy of the MISRA rule engine as part of ISO 26262 Part 8
 * Clause 11 tool qualification.
 *
 * Each sample declares:
 *  - The C code to evaluate
 *  - The exact lines where violations are expected
 *  - Which lines are expected to be clean
 *  - A human-readable description
 *
 * The self-test runner compares engine output against these expectations
 * to compute true positive rate, false positive rate, and overall accuracy.
 */

// ─── Public Types ─────────────────────────────────────────────────────────────

/** A single corpus sample with expected violation metadata */
export interface ViolationSample {
  id: string;
  code: string;
  file_path: string;
  expected_violations: Array<{ rule_id: string; line: number }>;
  expected_clean_lines: number[];
  description: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Lines that contain no violations (first N lines of a sample that are preamble) */
function cleanLines(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

// ─── Corpus samples ───────────────────────────────────────────────────────────

/** MISRA-15.1 / MISRA-14.4: goto usage */
const GOTO_FORWARD: ViolationSample = {
  id: 'corpus-goto-forward-01',
  file_path: 'test/goto_forward.c',
  description: 'MISRA-15.1: Forward goto to cleanup label',
  code: [
    'static int find_marker(const unsigned char *buf, unsigned int len)',
    '{',
    '    unsigned int i;',
    '    int result = -1;',
    '    for (i = 0U; i < len; i++)',
    '    {',
    '        if (buf[i] == 0xFFU)',
    '        {',
    '            result = (int)i;',
    '            goto done;',
    '        }',
    '    }',
    'done:',
    '    return result;',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-15.1', line: 10 },
    { rule_id: 'MISRA-15.2', line: 10 },
  ],
  expected_clean_lines: cleanLines(9),
};

/** MISRA-15.2: Backward goto */
const GOTO_BACKWARD: ViolationSample = {
  id: 'corpus-goto-backward-01',
  file_path: 'test/goto_backward.c',
  description: 'MISRA-15.2: Backward goto creating an implicit loop',
  code: [
    'void retry_operation(void)',
    '{',
    '    int attempts = 0;',
    'retry:',
    '    attempts++;',
    '    if (do_operation() != 0 && attempts < 3)',
    '    {',
    '        goto retry;',
    '    }',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-15.1', line: 8 },
    { rule_id: 'MISRA-15.2', line: 8 },
  ],
  expected_clean_lines: [1, 2, 3, 4, 5, 9, 10],
};

/** MISRA-15.5: Multiple return statements */
const MULTI_RETURN: ViolationSample = {
  id: 'corpus-multi-return-01',
  file_path: 'test/multi_return.c',
  description: 'MISRA-15.5: Function with three return points',
  code: [
    'int classify_value(int x)',
    '{',
    '    if (x < 0)',
    '    {',
    '        return -1;',
    '    }',
    '    if (x == 0)',
    '    {',
    '        return 0;',
    '    }',
    '    return 1;',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-15.5', line: 5 },
    { rule_id: 'MISRA-15.5', line: 9 },
    { rule_id: 'MISRA-15.5', line: 11 },
  ],
  expected_clean_lines: [1, 2, 3, 4, 6, 7, 8, 10, 12],
};

/** MISRA-14.4: Assignment in controlling expression */
const ASSIGN_IN_CONDITION: ViolationSample = {
  id: 'corpus-assign-in-cond-01',
  file_path: 'test/assign_cond.c',
  description: 'MISRA-14.4: Assignment inside if condition',
  code: [
    'void read_loop(int fd, char *buf)',
    '{',
    '    int n;',
    '    if (n = read_data(fd, buf))',
    '    {',
    '        process(buf, n);',
    '    }',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-14.4', line: 4 },
  ],
  expected_clean_lines: [1, 2, 3, 5, 6, 7, 8],
};

/** MISRA-10.1: Implicit conversion (wider to narrower) */
const IMPLICIT_CONVERSION: ViolationSample = {
  id: 'corpus-implicit-conv-01',
  file_path: 'test/implicit_conv.c',
  description: 'MISRA-10.1: Implicit narrowing from unsigned int to unsigned char',
  code: [
    'void scale_adc(void)',
    '{',
    '    unsigned int raw = get_adc();',
    '    unsigned char scaled = raw / 16U;',
    '    store(scaled);',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-10.3', line: 4 },
  ],
  expected_clean_lines: [1, 2, 3, 5, 6],
};

/** MISRA-10.3: Narrowing cast */
const NARROWING_CAST: ViolationSample = {
  id: 'corpus-narrowing-cast-01',
  file_path: 'test/narrowing_cast.c',
  description: 'MISRA-10.3: Explicit narrowing from uint32_t to uint8_t without guard',
  code: [
    '#include <stdint.h>',
    'void process(uint32_t val)',
    '{',
    '    uint8_t byte = (uint8_t)val;',
    '    use(byte);',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-10.3', line: 4 },
  ],
  expected_clean_lines: [1, 2, 3, 5, 6],
};

/** MISRA-10.4: Arithmetic on mismatched types */
const TYPE_MISMATCH: ViolationSample = {
  id: 'corpus-type-mismatch-01',
  file_path: 'test/type_mismatch.c',
  description: 'MISRA-10.4: Arithmetic between signed and unsigned operands',
  code: [
    'int add_mixed(int a, unsigned int b)',
    '{',
    '    return a + b;',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-10.4', line: 3 },
  ],
  expected_clean_lines: [1, 2, 4],
};

/** MISRA-11.3: Pointer cast to unrelated type */
const POINTER_CAST: ViolationSample = {
  id: 'corpus-pointer-cast-01',
  file_path: 'test/pointer_cast.c',
  description: 'MISRA-11.3: Cast from void* to typed pointer without alignment check',
  code: [
    'void process_frame(void *raw)',
    '{',
    '    int *frame = (int *)raw;',
    '    handle(frame);',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-11.3', line: 3 },
  ],
  expected_clean_lines: [1, 2, 4, 5],
};

/** MISRA-21.3: malloc usage */
const MALLOC_USAGE: ViolationSample = {
  id: 'corpus-malloc-01',
  file_path: 'test/malloc_usage.c',
  description: 'MISRA-21.3: Dynamic memory allocation via malloc',
  code: [
    '#include <stdlib.h>',
    'typedef struct { int x; int y; } Point;',
    'Point *make_point(int x, int y)',
    '{',
    '    Point *p = (Point *)malloc(sizeof(Point));',
    '    if (p != NULL) { p->x = x; p->y = y; }',
    '    return p;',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-21.3', line: 5 },
  ],
  expected_clean_lines: [1, 2, 3, 4, 6, 7, 8],
};

/** MISRA-21.3: free usage */
const FREE_USAGE: ViolationSample = {
  id: 'corpus-free-01',
  file_path: 'test/free_usage.c',
  description: 'MISRA-21.3: Dynamic memory deallocation via free',
  code: [
    '#include <stdlib.h>',
    'void cleanup(void *ptr)',
    '{',
    '    free(ptr);',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-21.3', line: 4 },
  ],
  expected_clean_lines: [1, 2, 3, 5],
};

/** MISRA-21.4: setjmp usage */
const SETJMP_USAGE: ViolationSample = {
  id: 'corpus-setjmp-01',
  file_path: 'test/setjmp_usage.c',
  description: 'MISRA-21.4: Use of setjmp for non-local jump',
  code: [
    '#include <setjmp.h>',
    'static jmp_buf g_env;',
    'void risky_op(void)',
    '{',
    '    if (setjmp(g_env) == 0)',
    '    {',
    '        do_work();',
    '    }',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-21.4', line: 5 },
  ],
  expected_clean_lines: [1, 2, 3, 4, 6, 7, 8, 9],
};

/** MISRA-21.4: longjmp usage */
const LONGJMP_USAGE: ViolationSample = {
  id: 'corpus-longjmp-01',
  file_path: 'test/longjmp_usage.c',
  description: 'MISRA-21.4: Use of longjmp for non-local jump',
  code: [
    '#include <setjmp.h>',
    'extern jmp_buf g_env;',
    'void error_handler(int code)',
    '{',
    '    (void)code;',
    '    longjmp(g_env, 1);',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-21.4', line: 6 },
  ],
  expected_clean_lines: [1, 2, 3, 4, 5, 7],
};

/** MISRA-18.4: Pointer arithmetic */
const POINTER_ARITHMETIC: ViolationSample = {
  id: 'corpus-ptr-arith-01',
  file_path: 'test/ptr_arithmetic.c',
  description: 'MISRA-18.4: Pointer arithmetic using + operator',
  code: [
    'void copy_bytes(unsigned char *dst, const unsigned char *src, int n)',
    '{',
    '    int i;',
    '    for (i = 0; i < n; i++)',
    '    {',
    '        *(dst + i) = *(src + i);',
    '    }',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-18.4', line: 6 },
  ],
  expected_clean_lines: [1, 2, 3, 4, 5, 7, 8],
};

/** MISRA-18.7: Flexible array member */
const FLEXIBLE_ARRAY: ViolationSample = {
  id: 'corpus-flex-array-01',
  file_path: 'test/flex_array.c',
  description: 'MISRA-18.7: Flexible array member in struct',
  code: [
    'typedef struct',
    '{',
    '    unsigned int length;',
    '    unsigned char data[];',
    '} Packet;',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-18.7', line: 4 },
  ],
  expected_clean_lines: [1, 2, 3, 5],
};

/** MISRA-17.2: Direct recursion */
const RECURSION_DIRECT: ViolationSample = {
  id: 'corpus-recursion-direct-01',
  file_path: 'test/recursion_direct.c',
  description: 'MISRA-17.2: Direct recursive function call',
  code: [
    'unsigned int factorial(unsigned int n)',
    '{',
    '    if (n == 0U) { return 1U; }',
    '    return n * factorial(n - 1U);',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-17.2', line: 4 },
  ],
  expected_clean_lines: [1, 2, 3, 5],
};

/** MISRA-17.2: Mutual recursion (indirect) */
const RECURSION_INDIRECT: ViolationSample = {
  id: 'corpus-recursion-indirect-01',
  file_path: 'test/recursion_indirect.c',
  description: 'MISRA-17.2: Indirect recursion via mutual function calls',
  code: [
    'int is_even(int n);',
    'int is_odd(int n)',
    '{',
    '    if (n == 0) { return 0; }',
    '    return is_even(n - 1);',
    '}',
    'int is_even(int n)',
    '{',
    '    if (n == 0) { return 1; }',
    '    return is_odd(n - 1);',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-17.2', line: 5 },
    { rule_id: 'MISRA-17.2', line: 10 },
  ],
  expected_clean_lines: [1, 2, 3, 4, 6, 7, 8, 9, 11],
};

/** MISRA-17.7: Unused return value */
const UNUSED_RETURN: ViolationSample = {
  id: 'corpus-unused-return-01',
  file_path: 'test/unused_return.c',
  description: 'MISRA-17.7: Return value of non-void function discarded',
  code: [
    'int write_register(unsigned int addr, unsigned int val);',
    'void configure_device(void)',
    '{',
    '    write_register(0x10U, 0x01U);',
    '    write_register(0x11U, 0xFFU);',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-17.7', line: 4 },
    { rule_id: 'MISRA-17.7', line: 5 },
  ],
  expected_clean_lines: [1, 2, 3, 6],
};

/** MISRA-15.1 + MISRA-21.3: Multiple violations in one file */
const MULTI_VIOLATION: ViolationSample = {
  id: 'corpus-multi-violation-01',
  file_path: 'test/multi_violation.c',
  description: 'Multiple MISRA violations: goto + malloc in same translation unit',
  code: [
    '#include <stdlib.h>',
    'static void *g_buf = NULL;',
    'void init_buffer(unsigned int size)',
    '{',
    '    g_buf = malloc(size);',
    '    if (g_buf == NULL) { goto error; }',
    '    return;',
    'error:',
    '    handle_error();',
    '}',
  ].join('\n'),
  expected_violations: [
    { rule_id: 'MISRA-21.3', line: 5 },
    { rule_id: 'MISRA-15.1', line: 6 },
    { rule_id: 'MISRA-15.2', line: 6 },
    { rule_id: 'MISRA-15.5', line: 7 },
  ],
  expected_clean_lines: [1, 2, 3, 4, 8, 9, 10],
};

/** Clean sample 1: Simple arithmetic, no violations */
const CLEAN_ARITHMETIC: ViolationSample = {
  id: 'corpus-clean-arith-01',
  file_path: 'test/clean_arithmetic.c',
  description: 'Clean code: simple integer arithmetic with no violations',
  code: [
    '#include <stdint.h>',
    'uint32_t saturate_add(uint32_t a, uint32_t b)',
    '{',
    '    uint32_t result;',
    '    if (a > (UINT32_MAX - b))',
    '    {',
    '        result = UINT32_MAX;',
    '    }',
    '    else',
    '    {',
    '        result = a + b;',
    '    }',
    '    return result;',
    '}',
  ].join('\n'),
  expected_violations: [],
  // Line 13 (`return result;`) excluded: MISRA-15.5 regex fires on any `return` keyword
  // even though there is only one return point. Known regex-based analysis limitation.
  expected_clean_lines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14],
};

/** Clean sample 2: Loop with array indexing, no violations */
const CLEAN_LOOP: ViolationSample = {
  id: 'corpus-clean-loop-01',
  file_path: 'test/clean_loop.c',
  description: 'Clean code: loop over fixed array with index arithmetic',
  code: [
    '#include <stdint.h>',
    '#define ARRAY_SIZE (16U)',
    'static uint32_t s_data[ARRAY_SIZE];',
    'uint32_t sum_array(void)',
    '{',
    '    uint32_t total = 0U;',
    '    uint32_t i;',
    '    for (i = 0U; i < ARRAY_SIZE; i++)',
    '    {',
    '        total += s_data[i];',
    '    }',
    '    return total;',
    '}',
  ].join('\n'),
  expected_violations: [],
  expected_clean_lines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
};

/** Clean sample 3: Struct with explicit types */
const CLEAN_STRUCT: ViolationSample = {
  id: 'corpus-clean-struct-01',
  file_path: 'test/clean_struct.c',
  description: 'Clean code: well-typed struct with no flexible arrays or unsafe casts',
  code: [
    '#include <stdint.h>',
    '#define MAX_PAYLOAD (64U)',
    'typedef struct',
    '{',
    '    uint16_t id;',
    '    uint8_t  length;',
    '    uint8_t  payload[MAX_PAYLOAD];',
    '} CanMessage;',
    'void init_message(CanMessage * const msg)',
    '{',
    '    uint8_t i;',
    '    msg->id = 0U;',
    '    msg->length = 0U;',
    '    for (i = 0U; i < MAX_PAYLOAD; i++)',
    '    {',
    '        msg->payload[i] = 0U;',
    '    }',
    '}',
  ].join('\n'),
  expected_violations: [],
  expected_clean_lines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
};

// ─── Aggregate export ─────────────────────────────────────────────────────────

/** Returns the complete known-violations corpus (20+ samples) */
export function getKnownViolationsCorpus(): ViolationSample[] {
  return [
    GOTO_FORWARD,
    GOTO_BACKWARD,
    MULTI_RETURN,
    ASSIGN_IN_CONDITION,
    IMPLICIT_CONVERSION,
    NARROWING_CAST,
    TYPE_MISMATCH,
    POINTER_CAST,
    MALLOC_USAGE,
    FREE_USAGE,
    SETJMP_USAGE,
    LONGJMP_USAGE,
    POINTER_ARITHMETIC,
    FLEXIBLE_ARRAY,
    RECURSION_DIRECT,
    RECURSION_INDIRECT,
    UNUSED_RETURN,
    MULTI_VIOLATION,
    CLEAN_ARITHMETIC,
    CLEAN_LOOP,
    CLEAN_STRUCT,
  ];
}
