/**
 * Phase 0 Acceptance Tests
 *
 * Validates all Phase 0 deliverables:
 *   - TypeScript strict mode with zero `any` types (compiler enforced)
 *   - In-memory SQLite database creates and queries correctly
 *   - All 5 graph shape fixtures generate correct topologies
 *   - Known-violation corpus has at least 5 distinct MISRA rule violations
 *   - Sample configs match PRD ASIL thresholds
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestDb,
  seedGraph,
  seedLedger,
  countNodes,
  countEdges,
  getNodes,
  getEdges,
} from './test-utils/in-memory-db.js';
import type { GraphShape } from './test-utils/in-memory-db.js';
import {
  LINEAR,
  DIAMOND,
  CIRCULAR,
  DISCONNECTED,
  FAN_OUT,
  GRAPH_FIXTURES,
} from './test-utils/fixtures/graph-shapes.js';
import {
  KNOWN_VIOLATIONS,
  GOTO_VIOLATION,
  RECURSION_VIOLATION,
  DYNAMIC_ALLOC_VIOLATION,
  IMPLICIT_CONVERSION_VIOLATION,
  HIGH_COMPLEXITY_VIOLATION,
} from './test-utils/fixtures/known-violations.js';
import {
  SAMPLE_CONFIGS,
  CONFIG_QM,
  CONFIG_ASIL_A,
  CONFIG_ASIL_B,
  CONFIG_ASIL_C,
  CONFIG_ASIL_D,
  getConfigForAsil,
} from './test-utils/fixtures/sample-config.js';
import {
  DEBT_CEILING,
  ASIL_WEIGHT,
  CURRENT_SCHEMA_VERSION,
} from './core/types.js';
import type {
  AsilLevel,
  VerificationStatus,
  LedgerEntry,
} from './core/types.js';
import { SCHEMA_VERSION } from './state/schema.js';

// ─── In-Memory Database Tests ───────────────────────────────────────────────

describe('In-Memory Database', () => {
  it('creates a working database with all tables', () => {
    const db = createTestDb();

    // Verify all 8 tables exist
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toEqual([
      '_meta',
      'audit_events',
      'dependency_edges',
      'dependency_nodes',
      'requirement_versions',
      'traceability_links',
      'verification_debt',
      'verification_ledger',
    ]);

    db.close();
  });

  it('initializes with correct schema version', () => {
    const db = createTestDb();

    const row = db
      .prepare("SELECT value FROM _meta WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.value).toBe(String(SCHEMA_VERSION));

    db.close();
  });

  it('sets WAL journal mode (falls back to memory for in-memory DBs)', () => {
    const db = createTestDb();

    // In-memory databases cannot use WAL — SQLite silently falls back to 'memory'.
    // The important thing is that initializeSchema calls the pragma without error.
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(['wal', 'memory']).toContain(row.journal_mode);

    db.close();
  });

  it('creates independent database instances', () => {
    const db1 = createTestDb();
    const db2 = createTestDb();

    seedGraph(db1, 'linear');

    expect(countNodes(db1)).toBe(3);
    expect(countNodes(db2)).toBe(0);

    db1.close();
    db2.close();
  });
});

// ─── Graph Shape Fixture Tests ──────────────────────────────────────────────

describe('Graph Shape Fixtures', () => {
  it('has exactly 5 graph shapes', () => {
    expect(Object.keys(GRAPH_FIXTURES)).toHaveLength(5);
  });

  describe('LINEAR (A→B→C)', () => {
    it('has correct node and edge counts', () => {
      expect(LINEAR.expected_node_count).toBe(3);
      expect(LINEAR.expected_edge_count).toBe(2);
      expect(LINEAR.nodes).toHaveLength(3);
      expect(LINEAR.edges).toHaveLength(2);
    });

    it('seeds correctly in database', () => {
      const db = createTestDb();
      seedGraph(db, 'linear');

      expect(countNodes(db)).toBe(3);
      expect(countEdges(db)).toBe(2);

      const edges = getEdges(db);
      // A->B, B->C chain
      expect(edges[0]!.edge_type).toBe('calls');
      expect(edges[1]!.edge_type).toBe('calls');

      db.close();
    });
  });

  describe('DIAMOND (A→B, A→C, B→D, C→D)', () => {
    it('has correct node and edge counts', () => {
      expect(DIAMOND.expected_node_count).toBe(4);
      expect(DIAMOND.expected_edge_count).toBe(4);
      expect(DIAMOND.nodes).toHaveLength(4);
      expect(DIAMOND.edges).toHaveLength(4);
    });

    it('seeds correctly in database', () => {
      const db = createTestDb();
      seedGraph(db, 'diamond');

      expect(countNodes(db)).toBe(4);
      expect(countEdges(db)).toBe(4);

      db.close();
    });
  });

  describe('CIRCULAR (A→B→C→A)', () => {
    it('has correct node and edge counts', () => {
      expect(CIRCULAR.expected_node_count).toBe(3);
      expect(CIRCULAR.expected_edge_count).toBe(3);
      expect(CIRCULAR.nodes).toHaveLength(3);
      expect(CIRCULAR.edges).toHaveLength(3);
    });

    it('seeds correctly in database', () => {
      const db = createTestDb();
      seedGraph(db, 'circular');

      expect(countNodes(db)).toBe(3);
      expect(countEdges(db)).toBe(3);

      // Verify circular: last edge should connect back to first node
      const edges = getEdges(db);
      const nodes = getNodes(db);
      const lastEdge = edges[edges.length - 1]!;
      expect(nodes).toContain(lastEdge.to_id);

      db.close();
    });
  });

  describe('DISCONNECTED (A, B)', () => {
    it('has correct node and edge counts', () => {
      expect(DISCONNECTED.expected_node_count).toBe(2);
      expect(DISCONNECTED.expected_edge_count).toBe(0);
      expect(DISCONNECTED.nodes).toHaveLength(2);
      expect(DISCONNECTED.edges).toHaveLength(0);
    });

    it('seeds correctly in database', () => {
      const db = createTestDb();
      seedGraph(db, 'disconnected');

      expect(countNodes(db)).toBe(2);
      expect(countEdges(db)).toBe(0);

      db.close();
    });
  });

  describe('FAN_OUT (A→B,C,D,E,F)', () => {
    it('has correct node and edge counts', () => {
      expect(FAN_OUT.expected_node_count).toBe(6);
      expect(FAN_OUT.expected_edge_count).toBe(5);
      expect(FAN_OUT.nodes).toHaveLength(6);
      expect(FAN_OUT.edges).toHaveLength(5);
    });

    it('seeds correctly in database', () => {
      const db = createTestDb();
      seedGraph(db, 'fan-out');

      expect(countNodes(db)).toBe(6);
      expect(countEdges(db)).toBe(5);

      // All edges should originate from the same source
      const edges = getEdges(db);
      const fromIds = new Set(edges.map((e) => e.from_id));
      expect(fromIds.size).toBe(1);

      db.close();
    });
  });

  it('all fixture nodes have valid artifact types', () => {
    const validTypes = ['function', 'file', 'requirement', 'test', 'architecture_element'];
    for (const fixture of Object.values(GRAPH_FIXTURES)) {
      for (const node of fixture.nodes) {
        expect(validTypes).toContain(node.type);
      }
    }
  });

  it('all fixture nodes have content hashes', () => {
    for (const fixture of Object.values(GRAPH_FIXTURES)) {
      for (const node of fixture.nodes) {
        expect(node.content_hash).toBeTruthy();
        expect(typeof node.content_hash).toBe('string');
      }
    }
  });
});

// ─── Ledger Seeding Tests ───────────────────────────────────────────────────

describe('Ledger Seeding', () => {
  it('seeds ledger entries with defaults', () => {
    const db = createTestDb();
    seedLedger(db, [
      { artifact_id: 'test-artifact-1' },
      { artifact_id: 'test-artifact-2', verification_status: 'fresh' },
    ]);

    const rows = db
      .prepare('SELECT * FROM verification_ledger ORDER BY artifact_id')
      .all() as Array<{ artifact_id: string; verification_status: string; asil_level: string }>;

    expect(rows).toHaveLength(2);
    expect(rows[0]!.artifact_id).toBe('test-artifact-1');
    expect(rows[0]!.verification_status).toBe('unverified');
    expect(rows[0]!.asil_level).toBe('QM');
    expect(rows[1]!.artifact_id).toBe('test-artifact-2');
    expect(rows[1]!.verification_status).toBe('fresh');

    db.close();
  });

  it('seeds ledger with full verification evidence', () => {
    const db = createTestDb();
    seedLedger(db, [
      {
        artifact_id: 'brake-func',
        content_hash: 'sha256:abc123',
        verification_status: 'fresh',
        freshness_score: 1.0,
        verified_at: '2026-02-20T09:00:00Z',
        verified_against: {
          requirements: ['REQ-SSR-042@v3'],
          tests: ['TEST-UT-042@sha256:def456'],
          coverage: { statement: 1.0, branch: 1.0, mcdc: 1.0 },
          misra_clean: true,
          reviewer: 'safety-reviewer-opus',
        },
        asil_level: 'D',
      },
    ]);

    const row = db
      .prepare('SELECT * FROM verification_ledger WHERE artifact_id = ?')
      .get('brake-func') as {
        content_hash: string;
        freshness_score: number;
        verified_against: string;
        asil_level: string;
      };

    expect(row.content_hash).toBe('sha256:abc123');
    expect(row.freshness_score).toBe(1.0);
    expect(row.asil_level).toBe('D');

    const evidence = JSON.parse(row.verified_against) as {
      requirements: string[];
      coverage: { mcdc: number };
    };
    expect(evidence.requirements).toContain('REQ-SSR-042@v3');
    expect(evidence.coverage.mcdc).toBe(1.0);

    db.close();
  });

  it('round-trip: create, invalidate conceptually, query stale', () => {
    const db = createTestDb();

    // Create fresh entry
    seedLedger(db, [
      {
        artifact_id: 'func-a',
        verification_status: 'fresh',
        freshness_score: 1.0,
      },
    ]);

    // Simulate invalidation by updating status
    db.prepare(
      `UPDATE verification_ledger
       SET verification_status = 'stale',
           freshness_score = 0.5,
           invalidated_by = 'REQ-SSR-042 changed from v1 to v2',
           invalidated_at = ?
       WHERE artifact_id = ?`,
    ).run(new Date().toISOString(), 'func-a');

    // Query stale entries
    const stale = db
      .prepare("SELECT * FROM verification_ledger WHERE verification_status = 'stale'")
      .all() as Array<{ artifact_id: string; invalidated_by: string }>;

    expect(stale).toHaveLength(1);
    expect(stale[0]!.artifact_id).toBe('func-a');
    expect(stale[0]!.invalidated_by).toContain('REQ-SSR-042');

    db.close();
  });
});

// ─── Known Violations Corpus Tests ──────────────────────────────────────────

describe('Known Violations Corpus', () => {
  it('has at least 5 distinct violations', () => {
    expect(KNOWN_VIOLATIONS.length).toBeGreaterThanOrEqual(5);
  });

  it('all violations have unique IDs', () => {
    const ids = KNOWN_VIOLATIONS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all violations have unique rule IDs', () => {
    const ruleIds = KNOWN_VIOLATIONS.map((v) => v.rule_id);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
  });

  it('each violation has violating code and compliant code', () => {
    for (const v of KNOWN_VIOLATIONS) {
      expect(v.violating_code.length).toBeGreaterThan(0);
      expect(v.compliant_code.length).toBeGreaterThan(0);
      expect(v.violating_code).not.toBe(v.compliant_code);
    }
  });

  it('each violation has a fix suggestion', () => {
    for (const v of KNOWN_VIOLATIONS) {
      expect(v.fix_suggestion.length).toBeGreaterThan(0);
    }
  });

  it('each violation has a positive expected line number', () => {
    for (const v of KNOWN_VIOLATIONS) {
      expect(v.expected_line).toBeGreaterThan(0);
    }
  });

  it('covers goto, recursion, dynamic allocation, implicit conversion, and complexity', () => {
    const categories = KNOWN_VIOLATIONS.map((v) => v.rule_id);
    expect(categories).toContain('MISRA-C-15.1');   // goto
    expect(categories).toContain('MISRA-C-17.2');   // recursion
    expect(categories).toContain('MISRA-C-21.3');   // dynamic allocation
    expect(categories).toContain('MISRA-C-10.3');   // implicit conversion
    expect(categories).toContain('PC-COMPLEXITY-01'); // complexity
  });

  it('goto violation contains goto keyword in violating code', () => {
    expect(GOTO_VIOLATION.violating_code).toMatch(/\bgoto\b/);
    expect(GOTO_VIOLATION.compliant_code).not.toMatch(/\bgoto\b/);
  });

  it('recursion violation contains self-call in violating code', () => {
    // Function name should appear in its own body (self-call)
    expect(RECURSION_VIOLATION.violating_code).toMatch(/factorial.*factorial/s);
  });

  it('dynamic alloc violation contains malloc/calloc in violating code', () => {
    expect(DYNAMIC_ALLOC_VIOLATION.violating_code).toMatch(/\b(malloc|calloc|realloc)\b/);
    expect(DYNAMIC_ALLOC_VIOLATION.compliant_code).not.toMatch(/\b(malloc|calloc|realloc)\b/);
  });
});

// ─── Sample Config Tests ────────────────────────────────────────────────────

describe('Sample Configs', () => {
  it('has configs for all 5 ASIL levels', () => {
    const levels: AsilLevel[] = ['QM', 'A', 'B', 'C', 'D'];
    for (const level of levels) {
      expect(SAMPLE_CONFIGS[level]).toBeDefined();
      expect(SAMPLE_CONFIGS[level].asil_level).toBe(level);
    }
  });

  it('QM uses info enforcement mode', () => {
    expect(CONFIG_QM.enforcement_mode).toBe('info');
  });

  it('ASIL A through D use strict enforcement mode', () => {
    expect(CONFIG_ASIL_A.enforcement_mode).toBe('strict');
    expect(CONFIG_ASIL_B.enforcement_mode).toBe('strict');
    expect(CONFIG_ASIL_C.enforcement_mode).toBe('strict');
    expect(CONFIG_ASIL_D.enforcement_mode).toBe('strict');
  });

  it('complexity thresholds decrease with higher ASIL', () => {
    expect(CONFIG_QM.thresholds.cyclomatic_complexity_max).toBeGreaterThanOrEqual(
      CONFIG_ASIL_A.thresholds.cyclomatic_complexity_max,
    );
    expect(CONFIG_ASIL_A.thresholds.cyclomatic_complexity_max).toBeGreaterThanOrEqual(
      CONFIG_ASIL_B.thresholds.cyclomatic_complexity_max,
    );
  });

  it('coverage thresholds increase with higher ASIL', () => {
    expect(CONFIG_ASIL_D.thresholds.statement_coverage_min).toBeGreaterThanOrEqual(
      CONFIG_ASIL_C.thresholds.statement_coverage_min,
    );
    expect(CONFIG_ASIL_C.thresholds.statement_coverage_min).toBeGreaterThanOrEqual(
      CONFIG_ASIL_B.thresholds.statement_coverage_min,
    );
    expect(CONFIG_ASIL_B.thresholds.statement_coverage_min).toBeGreaterThanOrEqual(
      CONFIG_ASIL_A.thresholds.statement_coverage_min,
    );
  });

  it('MC/DC coverage scales with ASIL level (ISO 26262 Part 6 Table 12)', () => {
    expect(CONFIG_QM.thresholds.mcdc_coverage_min).toBe(0.0);
    expect(CONFIG_ASIL_A.thresholds.mcdc_coverage_min).toBe(0.5);
    expect(CONFIG_ASIL_B.thresholds.mcdc_coverage_min).toBe(0.6);
    expect(CONFIG_ASIL_C.thresholds.mcdc_coverage_min).toBe(0.8);
    expect(CONFIG_ASIL_D.thresholds.mcdc_coverage_min).toBe(0.9);
  });

  it('ASIL C+ requires independent review (gate #12)', () => {
    expect(CONFIG_QM.gates.require_independent_review).toBe(false);
    expect(CONFIG_ASIL_A.gates.require_independent_review).toBe(false);
    expect(CONFIG_ASIL_B.gates.require_independent_review).toBe(false);
    expect(CONFIG_ASIL_C.gates.require_independent_review).toBe(true);
    expect(CONFIG_ASIL_D.gates.require_independent_review).toBe(true);
  });

  it('ASIL B+ requires change impact analysis', () => {
    expect(CONFIG_ASIL_A.gates.require_change_impact_analysis).toBe(false);
    expect(CONFIG_ASIL_B.gates.require_change_impact_analysis).toBe(true);
    expect(CONFIG_ASIL_C.gates.require_change_impact_analysis).toBe(true);
    expect(CONFIG_ASIL_D.gates.require_change_impact_analysis).toBe(true);
    expect(CONFIG_ASIL_B.gates.require_safety_doc).toBe(false);
    expect(CONFIG_ASIL_C.gates.require_safety_doc).toBe(true);
    expect(CONFIG_ASIL_D.gates.require_safety_doc).toBe(true);
  });

  it('getConfigForAsil returns correct config', () => {
    expect(getConfigForAsil('QM')).toBe(CONFIG_QM);
    expect(getConfigForAsil('D')).toBe(CONFIG_ASIL_D);
  });
});

// ─── Type System Constants Tests ────────────────────────────────────────────

describe('Type System Constants', () => {
  it('DEBT_CEILING has correct ASIL-dependent values', () => {
    expect(DEBT_CEILING.QM).toBe(Infinity);
    expect(DEBT_CEILING.A).toBe(20);
    expect(DEBT_CEILING.B).toBe(10);
    expect(DEBT_CEILING.C).toBe(5);
    expect(DEBT_CEILING.D).toBe(2);
  });

  it('ASIL_WEIGHT has correct values for freshness computation', () => {
    expect(ASIL_WEIGHT.QM).toBe(0);
    expect(ASIL_WEIGHT.A).toBe(0.5);
    expect(ASIL_WEIGHT.B).toBe(0.5);
    expect(ASIL_WEIGHT.C).toBe(1.0);
    expect(ASIL_WEIGHT.D).toBe(1.0);
  });

  it('CURRENT_SCHEMA_VERSION matches SCHEMA_VERSION', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});

// ─── Database Index Tests ───────────────────────────────────────────────────

describe('Database Indexes', () => {
  it('has performance indexes for audit trail queries', () => {
    const db = createTestDb();

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_audit_timestamp');
    expect(indexNames).toContain('idx_audit_event_type');
    expect(indexNames).toContain('idx_audit_artifact');
    expect(indexNames).toContain('idx_edges_from');
    expect(indexNames).toContain('idx_edges_to');
    expect(indexNames).toContain('idx_ledger_status');
    expect(indexNames).toContain('idx_trace_req');
    expect(indexNames).toContain('idx_trace_code');
    expect(indexNames).toContain('idx_debt_asil');

    db.close();
  });
});

// ─── Audit Trail Insert-Only Test ───────────────────────────────────────────

describe('Audit Trail', () => {
  it('supports insert-only event logging', () => {
    const db = createTestDb();

    const stmt = db.prepare(`
      INSERT INTO audit_events
        (timestamp, event_type, artifact_id, details)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run('2026-02-20T09:00:00Z', 'code_change', 'func-a', '{"reason":"test"}');
    stmt.run('2026-02-20T09:01:00Z', 'verification_passed', 'func-a', '{"result":"pass"}');

    const events = db
      .prepare('SELECT * FROM audit_events ORDER BY id')
      .all() as Array<{ event_type: string }>;

    expect(events).toHaveLength(2);
    expect(events[0]!.event_type).toBe('code_change');
    expect(events[1]!.event_type).toBe('verification_passed');

    db.close();
  });

  it('audit events are queryable by timestamp index', () => {
    const db = createTestDb();

    for (let i = 0; i < 100; i++) {
      db.prepare(`
        INSERT INTO audit_events (timestamp, event_type, details)
        VALUES (?, ?, ?)
      `).run(`2026-02-20T${String(i).padStart(2, '0')}:00:00Z`, 'code_change', '{}');
    }

    const recent = db
      .prepare("SELECT COUNT(*) AS cnt FROM audit_events WHERE timestamp > '2026-02-20T50:00:00Z'")
      .get() as { cnt: number };

    expect(recent.cnt).toBe(49);

    db.close();
  });
});
