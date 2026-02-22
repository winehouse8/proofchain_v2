/**
 * Tests for ProofChain Traceability modules:
 * TraceParser, TraceMatrix, TraceValidator, OrphanDetector, GapAnalyzer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../test-utils/in-memory-db.js';
import { createTraceParser } from './trace-parser.js';
import type { TraceParser } from './trace-parser.js';
import { createTraceMatrix } from './trace-matrix.js';
import type { TraceMatrix } from './trace-matrix.js';
import { createTraceValidator } from './trace-validator.js';
import { createOrphanDetector } from './orphan-detector.js';
import { createGapAnalyzer } from './gap-analyzer.js';
import { createDependencyGraph } from '../graph/dependency-graph.js';
import type Database from 'better-sqlite3';

// ─── TraceParser ──────────────────────────────────────────────────────────────

describe('TraceParser', () => {
  let parser: TraceParser;

  beforeEach(() => {
    parser = createTraceParser();
  });

  it('parses @trace block comment with single requirement', () => {
    const code = `/* @trace REQ-SSR-042 */
int safety_check(int sensor_value, int threshold) {
    if (sensor_value < 0) return -1;
    return 0;
}`;
    const tags = parser.parseFile(code, 'src/safety.c');
    expect(tags).toHaveLength(1);
    expect(tags[0].traced_requirements).toContain('REQ-SSR-042');
    expect(tags[0].tag_type).toBe('trace');
    expect(tags[0].file).toBe('src/safety.c');
  });

  it('parses @trace block comment with multiple requirements', () => {
    const code = `/* @trace REQ-SSR-001 REQ-SSR-002 REQ-BRK-010 */
int multi_check(void) {
    return 0;
}`;
    const tags = parser.parseFile(code, 'src/multi.c');
    expect(tags).toHaveLength(1);
    expect(tags[0].traced_requirements).toContain('REQ-SSR-001');
    expect(tags[0].traced_requirements).toContain('REQ-SSR-002');
    expect(tags[0].traced_requirements).toContain('REQ-BRK-010');
    expect(tags[0].traced_requirements).toHaveLength(3);
  });

  it('parses @trace line comment', () => {
    const code = `int safety_check(int sensor_value, int threshold) {
    // @trace REQ-SSR-042
    if (sensor_value < 0) return -1;
    return 0;
}`;
    const tags = parser.parseFile(code, 'src/safety.c');
    expect(tags).toHaveLength(1);
    expect(tags[0].traced_requirements).toContain('REQ-SSR-042');
    expect(tags[0].tag_type).toBe('trace');
  });

  it('parses @defensive_check tags', () => {
    const code = `int validate_input(int x) {
    /* @defensive_check input must be non-negative */
    if (x < 0) return -1;
    return x;
}`;
    const tags = parser.parseFile(code, 'src/validate.c');
    expect(tags).toHaveLength(1);
    expect(tags[0].tag_type).toBe('defensive_check');
  });

  it('parses mixed requirement and architecture refs', () => {
    const code = `/* @trace REQ-SSR-042 ARCH-SW-001 */
int braking_control(void) {
    return 0;
}`;
    const tags = parser.parseFile(code, 'src/braking.c');
    expect(tags).toHaveLength(1);
    expect(tags[0].traced_requirements).toContain('REQ-SSR-042');
    expect(tags[0].traced_architecture).toContain('ARCH-SW-001');
  });

  it('associates tag with correct function name', () => {
    // Tag is inside the function body so findEnclosingFunction scans backward
    // and finds the function definition line above the tag.
    const code = `int safety_check(int sensor_value, int threshold) {
    /* @trace REQ-SSR-042 */
    if (sensor_value < 0) return -1;
    if (sensor_value > threshold) return 1;
    return 0;
}`;
    const tags = parser.parseFile(code, 'src/safety.c');
    expect(tags).toHaveLength(1);
    expect(tags[0].function_name).toBe('safety_check');
  });

  it('handles malformed tags gracefully (no crash)', () => {
    // A block comment that contains @trace but no valid REQ/ARCH refs
    const code = `/* @trace no-valid-refs-here */
int foo(void) { return 0; }`;
    // Should not throw, returns empty (trace tags without REQ/ARCH are skipped)
    expect(() => parser.parseFile(code, 'src/foo.c')).not.toThrow();
  });

  it('returns empty array for code with no tags', () => {
    const code = `int add(int a, int b) {
    return a + b;
}`;
    const tags = parser.parseFile(code, 'src/add.c');
    expect(tags).toEqual([]);
  });

  it('parseFunction returns null for function without trace tag', () => {
    const code = `int add(int a, int b) {
    return a + b;
}`;
    const tag = parser.parseFunction(code, 'src/add.c', 'add');
    expect(tag).toBeNull();
  });

  it('parseFunction returns tag for function with trace tag', () => {
    // Tag inside the function body so findEnclosingFunction resolves correctly.
    const code = `int safety_check(int sensor_value, int threshold) {
    /* @trace REQ-SSR-042 */
    if (sensor_value < 0) return -1;
    if (sensor_value > threshold) return 1;
    return 0;
}`;
    const tag = parser.parseFunction(code, 'src/safety.c', 'safety_check');
    expect(tag).not.toBeNull();
    expect(tag!.function_name).toBe('safety_check');
    expect(tag!.traced_requirements).toContain('REQ-SSR-042');
  });

  it('parseFunction returns null when function name does not match', () => {
    const code = `/* @trace REQ-SSR-042 */
int safety_check(int x) {
    return 0;
}`;
    const tag = parser.parseFunction(code, 'src/safety.c', 'other_function');
    expect(tag).toBeNull();
  });

  it('records correct line number for block tag', () => {
    const code = `/* @trace REQ-SSR-042 */
int safety_check(int x) {
    return 0;
}`;
    const tags = parser.parseFile(code, 'src/safety.c');
    expect(tags[0].line).toBe(1);
  });

  it('parses multiple tags from the same file', () => {
    const code = `/* @trace REQ-SSR-001 */
int func_one(void) { return 0; }

/* @trace REQ-SSR-002 */
int func_two(void) { return 1; }`;
    const tags = parser.parseFile(code, 'src/multi.c');
    expect(tags).toHaveLength(2);
    const reqIds = tags.flatMap(t => t.traced_requirements);
    expect(reqIds).toContain('REQ-SSR-001');
    expect(reqIds).toContain('REQ-SSR-002');
  });
});

// ─── TraceMatrix ──────────────────────────────────────────────────────────────

describe('TraceMatrix', () => {
  let db: Database.Database;
  let matrix: TraceMatrix;

  beforeEach(() => {
    db = createTestDb();
    matrix = createTraceMatrix(db);
  });

  it('addLink and getCodeForRequirement round-trip', () => {
    matrix.addLink({
      requirement_id: 'REQ-SSR-042',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/safety.c::safety_check',
    });
    const code = matrix.getCodeForRequirement('REQ-SSR-042');
    expect(code).toContain('src/safety.c::safety_check');
  });

  it('addLink and getRequirementsForCode round-trip', () => {
    matrix.addLink({
      requirement_id: 'REQ-SSR-042',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/safety.c::safety_check',
    });
    const reqs = matrix.getRequirementsForCode('src/safety.c::safety_check');
    expect(reqs).toContain('REQ-SSR-042');
  });

  it('getTestsForCode returns test IDs from JSON', () => {
    matrix.addLink({
      requirement_id: 'REQ-SSR-042',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/safety.c::safety_check',
      test_artifact_ids: ['test::safety_check_basic', 'test::safety_check_edge'],
    });
    const tests = matrix.getTestsForCode('src/safety.c::safety_check');
    expect(tests).toContain('test::safety_check_basic');
    expect(tests).toContain('test::safety_check_edge');
  });

  it('removeLink actually removes', () => {
    matrix.addLink({
      requirement_id: 'REQ-SSR-042',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/safety.c::safety_check',
    });
    expect(matrix.count()).toBe(1);

    matrix.removeLink('REQ-SSR-042', 'src/safety.c::safety_check');

    expect(matrix.count()).toBe(0);
    expect(matrix.getCodeForRequirement('REQ-SSR-042')).toEqual([]);
  });

  it('updateFromTraceTags creates links from parsed tags', () => {
    const tags = [
      {
        file: 'src/safety.c',
        function_name: 'safety_check',
        line: 1,
        traced_requirements: ['REQ-SSR-042', 'REQ-SSR-043'],
        traced_architecture: [],
        tag_type: 'trace' as const,
      },
    ];
    matrix.updateFromTraceTags(tags, 1);

    expect(matrix.count()).toBe(2);
    expect(matrix.getCodeForRequirement('REQ-SSR-042')).toContain(
      'src/safety.c::safety_check',
    );
    expect(matrix.getCodeForRequirement('REQ-SSR-043')).toContain(
      'src/safety.c::safety_check',
    );
  });

  it('updateFromTraceTags stores architecture ref in first link', () => {
    const tags = [
      {
        file: 'src/braking.c',
        function_name: 'braking_control',
        line: 5,
        traced_requirements: ['REQ-BRK-001'],
        traced_architecture: ['ARCH-SW-001'],
        tag_type: 'trace' as const,
      },
    ];
    matrix.updateFromTraceTags(tags, 1);

    const links = matrix.getAllLinks();
    expect(links).toHaveLength(1);
    expect(links[0].architecture_id).toBe('ARCH-SW-001');
  });

  it('count returns correct number', () => {
    expect(matrix.count()).toBe(0);

    matrix.addLink({
      requirement_id: 'REQ-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/a.c::fn_a',
    });
    matrix.addLink({
      requirement_id: 'REQ-002',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/b.c::fn_b',
    });

    expect(matrix.count()).toBe(2);
  });

  it('getAllLinks returns all entries', () => {
    matrix.addLink({
      requirement_id: 'REQ-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/a.c::fn_a',
    });
    matrix.addLink({
      requirement_id: 'REQ-002',
      requirement_version: 2,
      architecture_id: 'ARCH-SW-001',
      code_artifact_id: 'src/b.c::fn_b',
    });

    const links = matrix.getAllLinks();
    expect(links).toHaveLength(2);
    const reqIds = links.map(l => l.requirement_id);
    expect(reqIds).toContain('REQ-001');
    expect(reqIds).toContain('REQ-002');
  });

  it('getAllLinks deserializes test_artifact_ids from JSON', () => {
    matrix.addLink({
      requirement_id: 'REQ-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/a.c::fn_a',
      test_artifact_ids: ['test::fn_a_unit'],
    });
    const links = matrix.getAllLinks();
    expect(links[0].test_artifact_ids).toEqual(['test::fn_a_unit']);
  });

  it('getRequirementsForTest finds requirements via code linkage', () => {
    matrix.addLink({
      requirement_id: 'REQ-SSR-042',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/safety.c::safety_check',
      test_artifact_ids: ['test::safety_check_basic'],
    });

    const reqs = matrix.getRequirementsForTest('test::safety_check_basic');
    expect(reqs).toContain('REQ-SSR-042');
  });

  it('getRequirementsForTest returns empty when test has no linkage', () => {
    const reqs = matrix.getRequirementsForTest('test::nonexistent');
    expect(reqs).toEqual([]);
  });

  it('getTestsForCode returns empty array when no tests linked', () => {
    matrix.addLink({
      requirement_id: 'REQ-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/a.c::fn_a',
    });
    const tests = matrix.getTestsForCode('src/a.c::fn_a');
    expect(tests).toEqual([]);
  });

  it('addLink is idempotent (INSERT OR REPLACE)', () => {
    matrix.addLink({
      requirement_id: 'REQ-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/a.c::fn_a',
    });
    matrix.addLink({
      requirement_id: 'REQ-001',
      requirement_version: 2,
      architecture_id: null,
      code_artifact_id: 'src/a.c::fn_a',
    });
    expect(matrix.count()).toBe(1);
    const links = matrix.getAllLinks();
    expect(links[0].requirement_version).toBe(2);
  });
});

// ─── TraceValidator ───────────────────────────────────────────────────────────

describe('TraceValidator', () => {
  let db: Database.Database;
  let matrix: TraceMatrix;

  beforeEach(() => {
    db = createTestDb();
    matrix = createTraceMatrix(db);
  });

  it('returns valid when all code and requirements traced', () => {
    matrix.addLink({
      requirement_id: 'REQ-SSR-042',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/safety.c::safety_check',
    });

    const validator = createTraceValidator();
    const result = validator.validate(
      matrix,
      ['REQ-SSR-042'],
      ['src/safety.c::safety_check'],
    );

    expect(result.is_valid).toBe(true);
    expect(result.untraced_code).toHaveLength(0);
    expect(result.unimplemented_requirements).toHaveLength(0);
  });

  it('detects untraced code', () => {
    // No links at all — code artifact has no requirement trace
    const validator = createTraceValidator();
    const result = validator.validate(
      matrix,
      ['REQ-SSR-042'],
      ['src/safety.c::safety_check'],
    );

    expect(result.untraced_code).toContain('src/safety.c::safety_check');
    expect(result.is_valid).toBe(false);
  });

  it('detects unimplemented requirements', () => {
    // REQ-SSR-042 has no code artifact
    const validator = createTraceValidator();
    const result = validator.validate(
      matrix,
      ['REQ-SSR-042'],
      [],
    );

    expect(result.unimplemented_requirements).toContain('REQ-SSR-042');
    expect(result.is_valid).toBe(false);
  });

  it('detects untested code', () => {
    matrix.addLink({
      requirement_id: 'REQ-SSR-042',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/safety.c::safety_check',
      // No test_artifact_ids
    });

    const validator = createTraceValidator();
    const result = validator.validate(
      matrix,
      ['REQ-SSR-042'],
      ['src/safety.c::safety_check'],
    );

    expect(result.untested_code).toContain('src/safety.c::safety_check');
  });

  it('does not flag code as untested when tests are linked', () => {
    matrix.addLink({
      requirement_id: 'REQ-SSR-042',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/safety.c::safety_check',
      test_artifact_ids: ['test::safety_check_basic'],
    });

    const validator = createTraceValidator();
    const result = validator.validate(
      matrix,
      ['REQ-SSR-042'],
      ['src/safety.c::safety_check'],
    );

    expect(result.untested_code).toHaveLength(0);
  });

  it('calculates correct coverage percentage', () => {
    matrix.addLink({
      requirement_id: 'REQ-SSR-042',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/safety.c::safety_check',
    });
    // fn_b has no requirement trace

    const validator = createTraceValidator();
    const result = validator.validate(
      matrix,
      ['REQ-SSR-042'],
      ['src/safety.c::safety_check', 'src/util.c::helper_fn'],
    );

    // 1 out of 2 code artifacts traced => 0.5
    expect(result.coverage_percentage).toBeCloseTo(0.5);
  });

  it('empty matrix with known artifacts reports all gaps', () => {
    const validator = createTraceValidator();
    const result = validator.validate(
      matrix,
      ['REQ-001', 'REQ-002'],
      ['src/a.c::fn_a', 'src/b.c::fn_b'],
    );

    expect(result.untraced_code).toHaveLength(2);
    expect(result.unimplemented_requirements).toHaveLength(2);
    expect(result.coverage_percentage).toBeCloseTo(0.0);
    expect(result.is_valid).toBe(false);
  });

  it('reports 100% coverage when all code is traced', () => {
    matrix.addLink({
      requirement_id: 'REQ-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/a.c::fn_a',
    });
    matrix.addLink({
      requirement_id: 'REQ-002',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/b.c::fn_b',
    });

    const validator = createTraceValidator();
    const result = validator.validate(
      matrix,
      ['REQ-001', 'REQ-002'],
      ['src/a.c::fn_a', 'src/b.c::fn_b'],
    );

    expect(result.coverage_percentage).toBeCloseTo(1.0);
  });

  it('total_links reflects matrix count', () => {
    matrix.addLink({
      requirement_id: 'REQ-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/a.c::fn_a',
    });

    const validator = createTraceValidator();
    const result = validator.validate(matrix, ['REQ-001'], ['src/a.c::fn_a']);
    expect(result.total_links).toBe(1);
  });
});

// ─── OrphanDetector ───────────────────────────────────────────────────────────

describe('OrphanDetector', () => {
  let db: Database.Database;
  let matrix: TraceMatrix;

  beforeEach(() => {
    db = createTestDb();
    matrix = createTraceMatrix(db);
  });

  it('detects orphan code (function with no requirement)', () => {
    // The BFS seeds from nodes referenced in matrix links, then expands via
    // graph edges.  We add a linked "seed" node and connect the orphan to it
    // so the BFS discovers the orphan but finds no requirement for it.
    const graph = createDependencyGraph(db);
    graph.addNode({
      id: 'src/safety.c::safety_check',
      type: 'function',
      file_path: 'src/safety.c',
      content_hash: 'hash1',
    });
    // seed node: referenced in a matrix link
    graph.addNode({
      id: 'src/safety.c::seed_fn',
      type: 'function',
      file_path: 'src/safety.c',
      content_hash: 'hashseed',
    });
    graph.addEdge('src/safety.c::seed_fn', 'src/safety.c::safety_check', 'calls');
    matrix.addLink({
      requirement_id: 'REQ-SEED-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/safety.c::seed_fn',
    });

    const detector = createOrphanDetector();
    const report = detector.detect(matrix, graph);

    const orphanIds = report.orphan_code.map(o => o.id);
    expect(orphanIds).toContain('src/safety.c::safety_check');
    expect(report.total_orphans).toBeGreaterThanOrEqual(1);
  });

  it('detects orphan requirements (requirement with no code)', () => {
    // REQ-SSR-042 is a requirement node with no code artifact in the matrix.
    // Connect it via a graph edge to a seed node that IS in the matrix so the
    // BFS discovers REQ-SSR-042 but finds no implementing code for it.
    const graph = createDependencyGraph(db);
    graph.addNode({
      id: 'REQ-SSR-042',
      type: 'requirement',
      file_path: 'requirements/safety.md',
      content_hash: 'req-hash',
    });
    graph.addNode({
      id: 'src/seed.c::seed_fn',
      type: 'function',
      file_path: 'src/seed.c',
      content_hash: 'hashseed',
    });
    graph.addEdge('src/seed.c::seed_fn', 'REQ-SSR-042', 'traces');
    matrix.addLink({
      requirement_id: 'REQ-SEED-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/seed.c::seed_fn',
    });

    const detector = createOrphanDetector();
    const report = detector.detect(matrix, graph);

    const orphanIds = report.orphan_requirements.map(o => o.id);
    expect(orphanIds).toContain('REQ-SSR-042');
  });

  it('detects orphan tests (test with no code linkage)', () => {
    // The test node is connected via a graph edge to a seed code artifact that
    // IS referenced in the matrix, so BFS discovers the test node.  The matrix
    // has no link whose test_artifact_ids include this test id, so it is orphan.
    const graph = createDependencyGraph(db);
    graph.addNode({
      id: 'test::safety_check_basic',
      type: 'test',
      file_path: 'tests/safety_test.c',
      content_hash: 'test-hash',
    });
    graph.addNode({
      id: 'src/seed.c::seed_fn',
      type: 'function',
      file_path: 'src/seed.c',
      content_hash: 'hashseed',
    });
    graph.addEdge('test::safety_check_basic', 'src/seed.c::seed_fn', 'tests');
    matrix.addLink({
      requirement_id: 'REQ-SEED-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/seed.c::seed_fn',
      // No test_artifact_ids — the test is NOT linked
    });

    const detector = createOrphanDetector();
    const report = detector.detect(matrix, graph);

    const orphanIds = report.orphan_tests.map(o => o.id);
    expect(orphanIds).toContain('test::safety_check_basic');
  });

  it('returns empty report when everything is linked', () => {
    const graph = createDependencyGraph(db);

    graph.addNode({
      id: 'src/safety.c::safety_check',
      type: 'function',
      file_path: 'src/safety.c',
      content_hash: 'hash1',
    });
    graph.addNode({
      id: 'REQ-SSR-042',
      type: 'requirement',
      file_path: 'requirements/safety.md',
      content_hash: 'req-hash',
    });
    graph.addNode({
      id: 'test::safety_check_basic',
      type: 'test',
      file_path: 'tests/safety_test.c',
      content_hash: 'test-hash',
    });

    matrix.addLink({
      requirement_id: 'REQ-SSR-042',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/safety.c::safety_check',
      test_artifact_ids: ['test::safety_check_basic'],
    });

    const detector = createOrphanDetector();
    const report = detector.detect(matrix, graph);

    expect(report.orphan_code).toHaveLength(0);
    expect(report.orphan_requirements).toHaveLength(0);
    expect(report.orphan_tests).toHaveLength(0);
    expect(report.total_orphans).toBe(0);
  });

  it('total_orphans is the sum of all orphan categories', () => {
    const graph = createDependencyGraph(db);

    graph.addNode({
      id: 'src/a.c::fn_a',
      type: 'function',
      file_path: 'src/a.c',
      content_hash: 'ha',
    });
    graph.addNode({
      id: 'REQ-001',
      type: 'requirement',
      file_path: 'req.md',
      content_hash: 'hr',
    });

    const detector = createOrphanDetector();
    const report = detector.detect(matrix, graph);

    expect(report.total_orphans).toBe(
      report.orphan_code.length +
      report.orphan_requirements.length +
      report.orphan_tests.length,
    );
  });
});

// ─── GapAnalyzer ──────────────────────────────────────────────────────────────

describe('GapAnalyzer', () => {
  let db: Database.Database;
  let matrix: TraceMatrix;

  beforeEach(() => {
    db = createTestDb();
    matrix = createTraceMatrix(db);
  });

  it('reports missing code traces', () => {
    // REQ-SSR-042 has no code artifact in matrix
    const analyzer = createGapAnalyzer();
    const report = analyzer.analyze(
      matrix,
      [{ id: 'REQ-SSR-042', asil_level: 'D' }],
      [],
      [],
    );

    const gap = report.gaps.find(g => g.artifact_id === 'REQ-SSR-042');
    expect(gap).toBeDefined();
    expect(gap!.type).toBe('missing_code_trace');
  });

  it('reports missing test traces', () => {
    matrix.addLink({
      requirement_id: 'REQ-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/a.c::fn_a',
      // no tests
    });

    const analyzer = createGapAnalyzer();
    const report = analyzer.analyze(
      matrix,
      [{ id: 'REQ-001', asil_level: 'B' }],
      ['src/a.c::fn_a'],
      [],
    );

    const gap = report.gaps.find(g => g.type === 'missing_test_trace');
    expect(gap).toBeDefined();
    expect(gap!.artifact_id).toBe('src/a.c::fn_a');
  });

  it('calculates coverage ratios correctly', () => {
    matrix.addLink({
      requirement_id: 'REQ-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/a.c::fn_a',
      test_artifact_ids: ['test::fn_a'],
    });

    const analyzer = createGapAnalyzer();
    const report = analyzer.analyze(
      matrix,
      [
        { id: 'REQ-001', asil_level: 'A' },
        { id: 'REQ-002', asil_level: 'B' },
      ],
      ['src/a.c::fn_a', 'src/b.c::fn_b'],
      ['test::fn_a'],
    );

    // REQ-001 has code, REQ-002 does not => 0.5 req->code coverage
    expect(report.requirement_to_code_coverage).toBeCloseTo(0.5);
    // fn_a has test, fn_b does not => 0.5 code->test coverage
    expect(report.code_to_test_coverage).toBeCloseTo(0.5);
  });

  it('sorts gaps by ASIL level (D first)', () => {
    // Two requirements with different ASIL, neither has code
    const analyzer = createGapAnalyzer();
    const report = analyzer.analyze(
      matrix,
      [
        { id: 'REQ-QM-001', asil_level: 'QM' },
        { id: 'REQ-D-001', asil_level: 'D' },
        { id: 'REQ-B-001', asil_level: 'B' },
      ],
      [],
      [],
    );

    const missingCode = report.gaps.filter(g => g.type === 'missing_code_trace');
    expect(missingCode[0].asil_level).toBe('D');
    expect(missingCode[1].asil_level).toBe('B');
    expect(missingCode[2].asil_level).toBe('QM');
  });

  it('generates human-readable summary', () => {
    const analyzer = createGapAnalyzer();
    const report = analyzer.analyze(matrix, [], [], []);
    expect(typeof report.summary).toBe('string');
    expect(report.summary.length).toBeGreaterThan(0);
    expect(report.summary).toContain('%');
  });

  it('returns 100% coverage ratios when all items are satisfied', () => {
    matrix.addLink({
      requirement_id: 'REQ-001',
      requirement_version: 1,
      architecture_id: null,
      code_artifact_id: 'src/a.c::fn_a',
      test_artifact_ids: ['test::fn_a'],
    });

    const analyzer = createGapAnalyzer();
    const report = analyzer.analyze(
      matrix,
      [{ id: 'REQ-001', asil_level: 'A' }],
      ['src/a.c::fn_a'],
      ['test::fn_a'],
    );

    expect(report.requirement_to_code_coverage).toBeCloseTo(1.0);
    expect(report.code_to_test_coverage).toBeCloseTo(1.0);
    expect(report.requirement_to_test_coverage).toBeCloseTo(1.0);
  });

  it('returns 1.0 for all coverages when inputs are empty', () => {
    const analyzer = createGapAnalyzer();
    const report = analyzer.analyze(matrix, [], [], []);

    expect(report.requirement_to_code_coverage).toBeCloseTo(1.0);
    expect(report.code_to_test_coverage).toBeCloseTo(1.0);
    expect(report.requirement_to_test_coverage).toBeCloseTo(1.0);
    expect(report.gaps).toHaveLength(0);
  });

  it('summary includes gap count', () => {
    const analyzer = createGapAnalyzer();
    const report = analyzer.analyze(
      matrix,
      [{ id: 'REQ-001', asil_level: 'D' }],
      ['src/a.c::fn_a'],
      [],
    );

    // There should be gaps: REQ-001 has no code, fn_a has no test and no req trace
    expect(report.gaps.length).toBeGreaterThan(0);
    expect(report.summary).toMatch(/\d+ gap/);
  });
});
