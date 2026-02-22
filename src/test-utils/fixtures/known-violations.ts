/**
 * ProofChain Test Fixtures: Known MISRA C Violations
 *
 * A corpus of well-defined MISRA C rule violations with realistic C code
 * snippets, expected detection metadata, and compliant rewrites.
 * Use these to verify that the rule engine fires on exactly the right line
 * and produces the expected diagnostic output.
 */

import type { RuleSeverity, AsilLevel } from '../../core/types.js';

// ─── Fixture Interface ───────────────────────────────────────────────────────

export interface KnownViolation {
  id: string;
  rule_id: string;
  category: string;
  severity: RuleSeverity;
  asil_min: AsilLevel;
  description: string;
  violating_code: string;
  expected_line: number;
  fix_suggestion: string;
  compliant_code: string;
}

// ─── Violation 1: GOTO (MISRA-C-15.1) ────────────────────────────────────────

export const GOTO_VIOLATION: KnownViolation = {
  id: 'violation-goto-01',
  rule_id: 'MISRA-C-15.1',
  category: 'Control Flow',
  severity: 'required',
  asil_min: 'QM',
  description:
    'The goto statement shall not be used. Unstructured jumps make control ' +
    'flow unpredictable and defeat static analysis.',
  violating_code: `static int16_t find_error_code(const uint8_t * const buf, uint16_t len)
{
    uint16_t i;
    int16_t  result = -1;

    for (i = 0U; i < len; i++)
    {
        if (buf[i] == ERROR_MARKER)
        {
            result = (int16_t)i;
            goto done;          /* MISRA-C-15.1 violation — line 11 */
        }
    }

done:
    return result;
}`,
  expected_line: 11,
  fix_suggestion:
    'Replace goto with a structured early-exit using a boolean flag or ' +
    'by breaking out of the loop with break.',
  compliant_code: `static int16_t find_error_code(const uint8_t * const buf, uint16_t len)
{
    uint16_t i;
    int16_t  result = -1;

    for (i = 0U; (i < len) && (result < 0); i++)
    {
        if (buf[i] == ERROR_MARKER)
        {
            result = (int16_t)i;
        }
    }

    return result;
}`,
};

// ─── Violation 2: RECURSION (MISRA-C-17.2) ────────────────────────────────────

export const RECURSION_VIOLATION: KnownViolation = {
  id: 'violation-recursion-01',
  rule_id: 'MISRA-C-17.2',
  category: 'Functions',
  severity: 'required',
  asil_min: 'QM',
  description:
    'Functions shall not call themselves, either directly or indirectly. ' +
    'Recursion makes stack depth analysis impossible at compile time.',
  violating_code: `uint32_t factorial(uint32_t n)
{
    if (n == 0U)
    {
        return 1U;
    }
    return n * factorial(n - 1U);   /* MISRA-C-17.2 violation — line 7 */
}`,
  expected_line: 7,
  fix_suggestion:
    'Replace the recursive implementation with an iterative loop. ' +
    'Use a local accumulator variable and a for/while construct.',
  compliant_code: `uint32_t factorial(uint32_t n)
{
    uint32_t result = 1U;
    uint32_t i;

    for (i = 2U; i <= n; i++)
    {
        result *= i;
    }

    return result;
}`,
};

// ─── Violation 3: DYNAMIC_ALLOC (MISRA-C-21.3) ───────────────────────────────

export const DYNAMIC_ALLOC_VIOLATION: KnownViolation = {
  id: 'violation-dynalloc-01',
  rule_id: 'MISRA-C-21.3',
  category: 'Standard Libraries',
  severity: 'required',
  asil_min: 'QM',
  description:
    'The memory allocation and deallocation functions of <stdlib.h> shall not ' +
    'be used. Dynamic allocation can fail unpredictably and leads to heap ' +
    'fragmentation in long-running safety-critical systems.',
  violating_code: `#include <stdlib.h>

typedef struct { uint8_t data[128]; } SensorFrame;

SensorFrame * create_frame(void)
{
    SensorFrame *frame = (SensorFrame *)malloc(sizeof(SensorFrame)); /* MISRA-C-21.3 — line 7 */
    if (frame == NULL)
    {
        return NULL;
    }
    (void)memset(frame, 0, sizeof(SensorFrame));
    return frame;
}`,
  expected_line: 7,
  fix_suggestion:
    'Use a statically allocated pool or a stack-allocated variable. ' +
    'Declare a fixed-size array of SensorFrame objects at module scope ' +
    'and return a pointer into that pool.',
  compliant_code: `#define MAX_FRAMES  (8U)

typedef struct { uint8_t data[128]; } SensorFrame;

static SensorFrame s_frame_pool[MAX_FRAMES];
static uint8_t     s_pool_used[MAX_FRAMES];

SensorFrame * create_frame(void)
{
    uint8_t i;
    SensorFrame *frame = NULL;

    for (i = 0U; i < MAX_FRAMES; i++)
    {
        if (s_pool_used[i] == 0U)
        {
            s_pool_used[i] = 1U;
            (void)memset(&s_frame_pool[i], 0, sizeof(SensorFrame));
            frame = &s_frame_pool[i];
            break;
        }
    }

    return frame;
}`,
};

// ─── Violation 4: IMPLICIT_CONVERSION (MISRA-C-10.3) ─────────────────────────

export const IMPLICIT_CONVERSION_VIOLATION: KnownViolation = {
  id: 'violation-implicit-conv-01',
  rule_id: 'MISRA-C-10.3',
  category: 'Type Conversions',
  severity: 'required',
  asil_min: 'QM',
  description:
    'The value of an expression shall not be assigned to an object with a ' +
    'narrower essential type. Implicit narrowing truncates data silently.',
  violating_code: `void process_adc_reading(void)
{
    uint32_t raw_adc = read_adc_channel(ADC_CHANNEL_0);
    uint8_t  scaled;

    scaled = raw_adc / 16U;   /* MISRA-C-10.3 violation — line 6: uint32_t → uint8_t */

    store_sample(scaled);
}`,
  expected_line: 6,
  fix_suggestion:
    'Add an explicit cast and, where possible, add a range assertion ' +
    'or saturation guard before the narrowing assignment.',
  compliant_code: `void process_adc_reading(void)
{
    uint32_t raw_adc = read_adc_channel(ADC_CHANNEL_0);
    uint32_t scaled32;
    uint8_t  scaled;

    scaled32 = raw_adc / 16U;
    if (scaled32 > (uint32_t)UINT8_MAX)
    {
        scaled32 = (uint32_t)UINT8_MAX;   /* saturate */
    }
    scaled = (uint8_t)scaled32;

    store_sample(scaled);
}`,
};

// ─── Violation 5: HIGH_COMPLEXITY (custom rule) ───────────────────────────────

export const HIGH_COMPLEXITY_VIOLATION: KnownViolation = {
  id: 'violation-complexity-01',
  rule_id: 'PC-COMPLEXITY-01',
  category: 'Complexity',
  severity: 'advisory',
  asil_min: 'A',
  description:
    'Function cyclomatic complexity exceeds the configured threshold of 10. ' +
    'High complexity functions are hard to test exhaustively and increase ' +
    'the risk of undetected defects.',
  violating_code: `/* Cyclomatic complexity = 14 (11 decision points + 1 base) */
ErrorCode handle_can_frame(const CanFrame * const frame)
{
    ErrorCode err = ERR_NONE;

    if (frame == NULL)                          /* +1 */
    {
        return ERR_NULL_PTR;
    }

    if (frame->dlc > CAN_MAX_DLC)              /* +1 */
    {
        err = ERR_INVALID_DLC;
    }
    else if (frame->id == CAN_ID_BRAKE_CMD)    /* +1 */
    {
        if (frame->dlc < 4U)                   /* +1 */
        {
            err = ERR_SHORT_FRAME;
        }
        else if (parse_brake_cmd(frame) != 0)  /* +1 */
        {
            err = ERR_PARSE_BRAKE;
        }
        else
        {
            /* nothing */
        }
    }
    else if (frame->id == CAN_ID_THROTTLE_CMD) /* +1 */
    {
        if (frame->dlc < 3U)                   /* +1 */
        {
            err = ERR_SHORT_FRAME;
        }
        else if (parse_throttle_cmd(frame) != 0) /* +1 */
        {
            err = ERR_PARSE_THROTTLE;
        }
        else
        {
            /* nothing */
        }
    }
    else if (frame->id == CAN_ID_HEARTBEAT)    /* +1 */
    {
        update_heartbeat_timer();
    }
    else if (frame->id == CAN_ID_DIAG_REQ)     /* +1 */
    {
        if (diag_mode_active())                /* +1 */
        {
            handle_diag_request(frame);
        }
    }
    else if (frame->id == CAN_ID_RESET)        /* +1 */
    {
        trigger_soft_reset();
    }
    else
    {
        err = ERR_UNKNOWN_ID;
    }

    return err;   /* violation detected at function entry — line 2 */
}`,
  expected_line: 2,
  fix_suggestion:
    'Decompose the function by extracting each CAN ID handler into its own ' +
    'dedicated function. Use a dispatch table (function pointer array) indexed ' +
    'by CAN ID to eliminate the long if-else chain.',
  compliant_code: `typedef ErrorCode (*CanHandler)(const CanFrame * const);

static ErrorCode handle_brake_cmd(const CanFrame * const frame)
{
    if (frame->dlc < 4U) { return ERR_SHORT_FRAME; }
    return (parse_brake_cmd(frame) != 0) ? ERR_PARSE_BRAKE : ERR_NONE;
}

static ErrorCode handle_throttle_cmd(const CanFrame * const frame)
{
    if (frame->dlc < 3U) { return ERR_SHORT_FRAME; }
    return (parse_throttle_cmd(frame) != 0) ? ERR_PARSE_THROTTLE : ERR_NONE;
}

static ErrorCode handle_heartbeat(const CanFrame * const frame)
{
    (void)frame;
    update_heartbeat_timer();
    return ERR_NONE;
}

static ErrorCode handle_diag_req(const CanFrame * const frame)
{
    if (diag_mode_active()) { handle_diag_request(frame); }
    return ERR_NONE;
}

static ErrorCode handle_reset(const CanFrame * const frame)
{
    (void)frame;
    trigger_soft_reset();
    return ERR_NONE;
}

ErrorCode handle_can_frame(const CanFrame * const frame)
{
    static const struct { uint32_t id; CanHandler fn; } dispatch[] = {
        { CAN_ID_BRAKE_CMD,    handle_brake_cmd    },
        { CAN_ID_THROTTLE_CMD, handle_throttle_cmd },
        { CAN_ID_HEARTBEAT,    handle_heartbeat    },
        { CAN_ID_DIAG_REQ,     handle_diag_req     },
        { CAN_ID_RESET,        handle_reset        },
    };
    uint8_t i;

    if (frame == NULL)          { return ERR_NULL_PTR;     }
    if (frame->dlc > CAN_MAX_DLC) { return ERR_INVALID_DLC; }

    for (i = 0U; i < (uint8_t)(sizeof(dispatch) / sizeof(dispatch[0])); i++)
    {
        if (frame->id == dispatch[i].id)
        {
            return dispatch[i].fn(frame);
        }
    }

    return ERR_UNKNOWN_ID;
}`,
};

// ─── Aggregate Export ────────────────────────────────────────────────────────

export const KNOWN_VIOLATIONS: readonly KnownViolation[] = [
  GOTO_VIOLATION,
  RECURSION_VIOLATION,
  DYNAMIC_ALLOC_VIOLATION,
  IMPLICIT_CONVERSION_VIOLATION,
  HIGH_COMPLEXITY_VIOLATION,
];
