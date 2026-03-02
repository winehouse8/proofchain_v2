/**
 * TC Trace Handler Tests
 *
 * Covers:
 *   - extractTcIds: tag extraction from content
 *   - extractReqIds: tag extraction from content
 *   - checkTcTrace: ASIL-adaptive traceability enforcement
 *     - QM: info (allow) with and without tags
 *     - A: warning (allow) without tags
 *     - B+: block without tags, allow with tags
 *     - Non-src files: always allow
 *     - Non-test phase: always allow
 */

import { describe, it, expect } from 'vitest';
import {
  extractTcIds,
  extractReqIds,
  checkTcTrace,
} from './tc-trace-handler.js';
import type { TcTraceInput } from './tc-trace-handler.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeTraceInput(overrides: Partial<TcTraceInput> = {}): TcTraceInput {
  return {
    tool_name: 'Edit',
    tool_input: {
      file_path: 'src/client/components/Canvas.tsx',
      new_string: '// some code change',
    },
    hitl_phase: 'test',
    area: 'CV',
    asil_level: 'QM',
    ...overrides,
  };
}

// ─── extractTcIds ────────────────────────────────────────────────────────────

describe('extractTcIds', () => {
  it('extracts a single TC ID', () => {
    expect(extractTcIds('// @tc TC-CV-001')).toEqual(['TC-CV-001']);
  });

  it('extracts multiple TC IDs', () => {
    const content = '// @tc TC-CV-001\n// @tc TC-CV-002\n// @tc TC-CT-037';
    const ids = extractTcIds(content);
    expect(ids).toContain('TC-CV-001');
    expect(ids).toContain('TC-CV-002');
    expect(ids).toContain('TC-CT-037');
    expect(ids).toHaveLength(3);
  });

  it('deduplicates repeated TC IDs', () => {
    const content = '// @tc TC-CV-001\n// @tc TC-CV-001';
    expect(extractTcIds(content)).toEqual(['TC-CV-001']);
  });

  it('returns empty array when no TC tags found', () => {
    expect(extractTcIds('// just a comment')).toEqual([]);
  });

  it('does not match partial patterns', () => {
    expect(extractTcIds('// @tcase TC-CV-001')).toEqual([]);
    expect(extractTcIds('// tc TC-CV-001')).toEqual([]);
  });

  it('handles multi-character area codes', () => {
    expect(extractTcIds('// @tc TC-ABCD-123')).toEqual(['TC-ABCD-123']);
  });
});

// ─── extractReqIds ───────────────────────────────────────────────────────────

describe('extractReqIds', () => {
  it('extracts a single REQ ID', () => {
    expect(extractReqIds('// @req REQ-CV-001')).toEqual(['REQ-CV-001']);
  });

  it('extracts multiple REQ IDs', () => {
    const content = '// @req REQ-CV-001\n// @req REQ-CT-019';
    const ids = extractReqIds(content);
    expect(ids).toContain('REQ-CV-001');
    expect(ids).toContain('REQ-CT-019');
  });

  it('deduplicates repeated REQ IDs', () => {
    const content = '// @req REQ-CV-001\n// @req REQ-CV-001';
    expect(extractReqIds(content)).toEqual(['REQ-CV-001']);
  });

  it('returns empty array when no REQ tags found', () => {
    expect(extractReqIds('// no tags here')).toEqual([]);
  });
});

// ─── checkTcTrace: phase/path filtering ──────────────────────────────────────

describe('checkTcTrace — filtering', () => {
  it('skips non-src files (allows without check)', () => {
    const input = makeTraceInput({
      tool_input: { file_path: 'tests/e2e/canvas.test.ts', new_string: '// no tags' },
    });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('allow');
    expect(result.message).toContain('not under src/');
  });

  it('skips when phase is not test', () => {
    const input = makeTraceInput({ hitl_phase: 'code' });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('allow');
    expect(result.message).toContain("not 'test'");
  });

  it('handles absolute paths under src/', () => {
    const input = makeTraceInput({
      tool_input: {
        file_path: '/Users/dev/project/src/components/App.tsx',
        new_string: '// @tc TC-CV-001',
      },
    });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('allow');
    expect(result.tc_ids).toContain('TC-CV-001');
  });
});

// ─── checkTcTrace: tags found (all ASIL levels allow) ────────────────────────

describe('checkTcTrace — tags found', () => {
  it('allows with info when tags found at QM', () => {
    const input = makeTraceInput({
      asil_level: 'QM',
      tool_input: {
        file_path: 'src/client/Canvas.tsx',
        new_string: '// @tc TC-CV-001 @req REQ-CV-003',
      },
    });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('allow');
    expect(result.tc_ids).toEqual(['TC-CV-001']);
    expect(result.req_ids).toEqual(['REQ-CV-003']);
    expect(result.severity).toBe('info');
  });

  it('allows with info when tags found at ASIL B', () => {
    const input = makeTraceInput({
      asil_level: 'B',
      tool_input: {
        file_path: 'src/client/Canvas.tsx',
        new_string: '// @tc TC-CV-001',
      },
    });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('allow');
    expect(result.tc_ids).toEqual(['TC-CV-001']);
  });

  it('allows with info when tags found at ASIL D', () => {
    const input = makeTraceInput({
      asil_level: 'D',
      tool_input: {
        file_path: 'src/client/Canvas.tsx',
        new_string: '// @tc TC-CV-001 @req REQ-CV-001',
      },
    });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('allow');
  });
});

// ─── checkTcTrace: no tags (ASIL-adaptive) ───────────────────────────────────

describe('checkTcTrace — no tags, ASIL-adaptive', () => {
  it('QM: allows with info severity', () => {
    const input = makeTraceInput({ asil_level: 'QM' });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('allow');
    expect(result.severity).toBe('info');
    expect(result.tc_ids).toEqual([]);
  });

  it('ASIL A: allows with warning severity', () => {
    const input = makeTraceInput({ asil_level: 'A' });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('allow');
    expect(result.severity).toBe('warning');
    expect(result.message).toContain('WARNING');
  });

  it('ASIL B: blocks with error severity', () => {
    const input = makeTraceInput({ asil_level: 'B' });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('block');
    expect(result.severity).toBe('error');
    expect(result.reason).toContain('@tc/@req');
  });

  it('ASIL C: blocks with error severity', () => {
    const input = makeTraceInput({ asil_level: 'C' });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('block');
    expect(result.severity).toBe('error');
  });

  it('ASIL D: blocks with error severity', () => {
    const input = makeTraceInput({ asil_level: 'D' });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('block');
    expect(result.severity).toBe('error');
  });
});

// ─── checkTcTrace: Write tool support ────────────────────────────────────────

describe('checkTcTrace — Write tool', () => {
  it('extracts tags from Write tool content field', () => {
    const input = makeTraceInput({
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/client/Canvas.tsx',
        content: '// @tc TC-CV-005\nexport function render() {}',
      },
    });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('allow');
    expect(result.tc_ids).toEqual(['TC-CV-005']);
  });
});

// ─── checkTcTrace: edge cases ────────────────────────────────────────────────

describe('checkTcTrace — edge cases', () => {
  it('handles empty content gracefully', () => {
    const input = makeTraceInput({
      asil_level: 'QM',
      tool_input: { file_path: 'src/index.ts', new_string: '' },
    });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('allow');
    expect(result.tc_ids).toEqual([]);
  });

  it('handles missing asil_level (defaults to QM behavior)', () => {
    const input = makeTraceInput({ asil_level: '' });
    const result = checkTcTrace(input);
    // Empty string falls through to QM behavior (info)
    expect(result.decision).toBe('allow');
  });

  it('extracts tags from both @tc and @req in same content', () => {
    const input = makeTraceInput({
      asil_level: 'B',
      tool_input: {
        file_path: 'src/engine/clock.ts',
        new_string: '// @tc TC-CT-001 @req REQ-CT-003\nfunction tick() {}',
      },
    });
    const result = checkTcTrace(input);
    expect(result.decision).toBe('allow');
    expect(result.tc_ids).toEqual(['TC-CT-001']);
    expect(result.req_ids).toEqual(['REQ-CT-003']);
  });
});
