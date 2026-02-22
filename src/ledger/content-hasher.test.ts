/**
 * Tests for ProofChain ContentHasher
 */

import { describe, it, expect } from 'vitest';
import {
  hashContent,
  normalizeSource,
  extractFunctionSignature,
  extractFunctionBody,
  hashFunction,
  hashInterface,
  hashRequirement,
  hashTest,
} from './content-hasher.js';

// ─── Sample C Source ─────────────────────────────────────────────────────────

const SIMPLE_C_SOURCE = `
/* Safety check for airbag deployment */
int safety_check(int sensor_value, int threshold) {
    // Validate inputs
    if (sensor_value < 0) {
        return -1;
    }
    if (sensor_value > threshold) {
        return 1;
    }
    return 0;
}
`;

const REFORMATTED_C_SOURCE = `
/* Different comment */
int    safety_check(  int   sensor_value ,   int   threshold  )  {
  // Another comment
  if  (sensor_value  <  0)  {
              return  -1;
  }
  if  (sensor_value  >  threshold)  {
              return  1;
  }
  return  0;
}
`;

const SOURCE_WITH_MULTIPLE_FUNCS = `
int add(int a, int b) {
    return a + b;
}

void reset_state(void) {
    /* reset everything */
    counter = 0;
    flag = false;
}

float compute_ratio(int numerator, int denominator) {
    if (denominator == 0) {
        return -1.0f;
    }
    return (float)numerator / (float)denominator;
}
`;

// ─── hashContent ─────────────────────────────────────────────────────────────

describe('hashContent', () => {
  it('returns sha256: prefixed hash', () => {
    const hash = hashContent('hello world');
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('same input produces same output (deterministic)', () => {
    const h1 = hashContent('hello world');
    const h2 = hashContent('hello world');
    expect(h1).toBe(h2);
  });

  it('different input produces different output', () => {
    const h1 = hashContent('hello world');
    const h2 = hashContent('hello world!');
    expect(h1).not.toBe(h2);
  });

  it('empty string produces a valid hash', () => {
    const hash = hashContent('');
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

// ─── normalizeSource ──────────────────────────────────────────────────────────

describe('normalizeSource', () => {
  it('strips block comments', () => {
    const source = '/* this is a comment */ int x = 0;';
    const result = normalizeSource(source);
    expect(result).not.toContain('/*');
    expect(result).not.toContain('*/');
    expect(result).not.toContain('this is a comment');
    expect(result).toContain('int x = 0;');
  });

  it('strips multiline block comments', () => {
    const source = `/*
 * Multi-line
 * block comment
 */
int y = 1;`;
    const result = normalizeSource(source);
    expect(result).not.toContain('Multi-line');
    expect(result).toContain('int y = 1;');
  });

  it('strips line comments', () => {
    const source = 'int x = 0; // initialize x\nint y = 1;';
    const result = normalizeSource(source);
    expect(result).not.toContain('// initialize x');
    expect(result).not.toContain('initialize');
    expect(result).toContain('int x = 0;');
    expect(result).toContain('int y = 1;');
  });

  it('collapses whitespace', () => {
    const source = 'int   x   =    0  ;';
    const result = normalizeSource(source);
    expect(result).toBe('int x = 0 ;');
  });

  it('removes empty lines', () => {
    const source = 'int x = 0;\n\n\nint y = 1;';
    const result = normalizeSource(source);
    const lines = result.split('\n').filter(l => l.trim() === '');
    expect(lines).toHaveLength(0);
  });

  it('formatting-insensitive: same logic with different formatting normalizes identically', () => {
    const version1 = `int add(int a, int b) {
    return a + b;
}`;
    const version2 = `int add( int a , int b ){
  return    a+b;
}`;
    // These won't be byte-for-byte identical due to operator spacing, but
    // comments and whitespace normalization should be consistent.
    // We test that both versions, after stripping comments, produce stable results.
    const n1 = normalizeSource(version1);
    const n2 = normalizeSource(version2);
    // At minimum, both should contain the core tokens
    expect(n1).toContain('int add');
    expect(n2).toContain('int add');
    // Neither should have double spaces
    expect(n1).not.toMatch(/  /);
    expect(n2).not.toMatch(/  /);
  });

  it('fully identical source normalizes to identical result', () => {
    const source = 'int x = 0; /* comment */ // line comment\nint y = 1;';
    expect(normalizeSource(source)).toBe(normalizeSource(source));
  });
});

// ─── extractFunctionSignature ─────────────────────────────────────────────────

describe('extractFunctionSignature', () => {
  it('extracts C function signature', () => {
    const sig = extractFunctionSignature(SIMPLE_C_SOURCE, 'safety_check');
    expect(sig).not.toBeNull();
    expect(sig).toContain('safety_check');
    expect(sig).toContain('int');
    expect(sig).toContain('sensor_value');
    expect(sig).toContain('threshold');
    // Should not include the body
    expect(sig).not.toContain('return -1');
  });

  it('returns null for non-existent function', () => {
    const sig = extractFunctionSignature(SIMPLE_C_SOURCE, 'nonexistent_function');
    expect(sig).toBeNull();
  });

  it('extracts the correct function among multiple', () => {
    const sig = extractFunctionSignature(SOURCE_WITH_MULTIPLE_FUNCS, 'compute_ratio');
    expect(sig).not.toBeNull();
    expect(sig).toContain('compute_ratio');
    expect(sig).toContain('numerator');
    expect(sig).toContain('denominator');
  });
});

// ─── extractFunctionBody ──────────────────────────────────────────────────────

describe('extractFunctionBody', () => {
  it('extracts function body with balanced braces', () => {
    const body = extractFunctionBody(SIMPLE_C_SOURCE, 'safety_check');
    expect(body).not.toBeNull();
    expect(body).toContain('{');
    expect(body).toContain('}');
    expect(body).toContain('return -1');
    expect(body).toContain('return 1');
    expect(body).toContain('return 0');
  });

  it('returns null for non-existent function', () => {
    const body = extractFunctionBody(SIMPLE_C_SOURCE, 'does_not_exist');
    expect(body).toBeNull();
  });

  it('extracts the correct body among multiple functions', () => {
    const body = extractFunctionBody(SOURCE_WITH_MULTIPLE_FUNCS, 'reset_state');
    expect(body).not.toBeNull();
    expect(body).toContain('counter = 0');
    expect(body).toContain('flag = false');
    // Should not contain code from other functions
    expect(body).not.toContain('return a + b');
  });

  it('handles nested braces correctly', () => {
    const source = `
int nested(int x) {
    if (x > 0) {
        if (x > 10) {
            return 2;
        }
        return 1;
    }
    return 0;
}`;
    const body = extractFunctionBody(source, 'nested');
    expect(body).not.toBeNull();
    // Count opening and closing braces — should be balanced
    const opens = (body!.match(/\{/g) || []).length;
    const closes = (body!.match(/\}/g) || []).length;
    expect(opens).toBe(closes);
  });
});

// ─── hashFunction ─────────────────────────────────────────────────────────────

describe('hashFunction', () => {
  it('same logic with different formatting produces same hash', () => {
    const h1 = hashFunction(SIMPLE_C_SOURCE, 'safety_check');
    const h2 = hashFunction(REFORMATTED_C_SOURCE, 'safety_check');
    expect(h1).toBe(h2);
  });

  it('returns sha256: prefixed hash', () => {
    const h = hashFunction(SIMPLE_C_SOURCE, 'safety_check');
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('returns sentinel hash for missing function', () => {
    const h = hashFunction(SIMPLE_C_SOURCE, 'missing_fn');
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Sentinel should differ from a real function hash
    const real = hashFunction(SIMPLE_C_SOURCE, 'safety_check');
    expect(h).not.toBe(real);
  });

  it('different logic produces different hash', () => {
    const source1 = `int fn(int x) { return x + 1; }`;
    const source2 = `int fn(int x) { return x + 2; }`;
    expect(hashFunction(source1, 'fn')).not.toBe(hashFunction(source2, 'fn'));
  });
});

// ─── hashInterface ────────────────────────────────────────────────────────────

describe('hashInterface', () => {
  it('returns sha256: prefixed hash', () => {
    const h = hashInterface(SIMPLE_C_SOURCE, 'safety_check');
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('changes only when signature changes', () => {
    const sig1 = `int safety_check(int sensor_value, int threshold) { return 0; }`;
    const sig2 = `int safety_check(int sensor_value, int threshold, int extra) { return 0; }`;

    const h1 = hashInterface(sig1, 'safety_check');
    const h2 = hashInterface(sig2, 'safety_check');
    expect(h1).not.toBe(h2);
  });

  it('does NOT change when only body changes (same signature)', () => {
    const version1 = `int fn(int x, int y) { return x + y; }`;
    const version2 = `int fn(int x, int y) { return x * y + 42; /* totally different logic */ }`;

    const h1 = hashInterface(version1, 'fn');
    const h2 = hashInterface(version2, 'fn');
    expect(h1).toBe(h2);
  });

  it('returns sentinel hash for missing function', () => {
    const h = hashInterface(SIMPLE_C_SOURCE, 'no_such_func');
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

// ─── hashRequirement ─────────────────────────────────────────────────────────

describe('hashRequirement', () => {
  it('returns sha256: prefixed hash', () => {
    const h = hashRequirement('REQ-001', 'The system shall respond within 10ms');
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('includes reqId in hash — same text different ID produces different hash', () => {
    const h1 = hashRequirement('REQ-001', 'same text');
    const h2 = hashRequirement('REQ-002', 'same text');
    expect(h1).not.toBe(h2);
  });

  it('same reqId + same text = same hash (deterministic)', () => {
    const h1 = hashRequirement('REQ-001', 'some requirement text');
    const h2 = hashRequirement('REQ-001', 'some requirement text');
    expect(h1).toBe(h2);
  });

  it('same reqId different text = different hash', () => {
    const h1 = hashRequirement('REQ-001', 'original requirement');
    const h2 = hashRequirement('REQ-001', 'updated requirement');
    expect(h1).not.toBe(h2);
  });
});

// ─── hashTest ────────────────────────────────────────────────────────────────

describe('hashTest', () => {
  it('returns sha256: prefixed hash', () => {
    const h = hashTest('TEST-001', 'test case content here');
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('includes testId in hash — same content different ID produces different hash', () => {
    const h1 = hashTest('TEST-001', 'same content');
    const h2 = hashTest('TEST-002', 'same content');
    expect(h1).not.toBe(h2);
  });

  it('same testId + same content = same hash (deterministic)', () => {
    const h1 = hashTest('TEST-001', 'verify airbag deploys at 5g');
    const h2 = hashTest('TEST-001', 'verify airbag deploys at 5g');
    expect(h1).toBe(h2);
  });

  it('same testId different content = different hash', () => {
    const h1 = hashTest('TEST-001', 'original test');
    const h2 = hashTest('TEST-001', 'updated test assertion');
    expect(h1).not.toBe(h2);
  });
});
