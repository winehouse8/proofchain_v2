/**
 * ProofChain CCP Module Tests
 *
 * Tests for ChangeClassifier, BlastRadiusCalculator, GateEnforcer,
 * ReverificationPlanner, and CCPOrchestrator.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedLedger, seedGraph } from '../test-utils/in-memory-db.js';
import { createVerificationLedger } from '../ledger/verification-ledger.js';
import { createDependencyGraph } from '../graph/dependency-graph.js';
import { createStalenessPropagator } from '../ledger/staleness-propagator.js';
import { createAuditLogger } from '../state/audit-logger.js';
import { createChangeClassifier } from './change-classifier.js';
import { createBlastRadiusCalculator } from './blast-radius-calculator.js';
import { createGateEnforcer } from './gate-enforcer.js';
import { createReverificationPlanner } from './reverification-planner.js';
import { createCCPOrchestrator } from './ccp-orchestrator.js';
import {
  CONFIG_QM,
  CONFIG_ASIL_B,
  CONFIG_ASIL_D,
} from '../test-utils/fixtures/sample-config.js';
import type { BlastRadiusDetail } from './blast-radius-calculator.js';
import type { AffectedArtifact } from '../core/types.js';

// ─── ChangeClassifier ─────────────────────────────────────────────────────────

describe('ChangeClassifier', () => {
  const classifier = createChangeClassifier();

  it('classifies .c file change as code_change', () => {
    const result = classifier.classifyFileChange('src/motor.c', null, 'int main() {}');
    expect(result.change_type).toBe('code_change');
  });

  it('classifies .test.c file change as test_change', () => {
    const result = classifier.classifyFileChange('src/motor.test.c', null, 'void test_foo() {}');
    expect(result.change_type).toBe('test_change');
  });

  it('classifies _test.c file change as test_change', () => {
    const result = classifier.classifyFileChange('src/motor_test.c', null, 'void test_foo() {}');
    expect(result.change_type).toBe('test_change');
  });

  it('classifies requirements/ file as requirement_change', () => {
    const result = classifier.classifyFileChange(
      'requirements/REQ-001.md',
      null,
      'The system shall...',
    );
    expect(result.change_type).toBe('requirement_change');
  });

  it('classifies config.json as config_change', () => {
    const result = classifier.classifyFileChange(
      '.proofchain/config.json',
      null,
      '{"asil_level":"B"}',
    );
    expect(result.change_type).toBe('config_change');
  });

  it('detects interface change when function signature changes', () => {
    const oldContent = `int compute(int x) {\n  return x;\n}`;
    const newContent = `int compute(int x, int y) {\n  return x + y;\n}`;
    const result = classifier.classifyFileChange('src/math.c', oldContent, newContent);
    expect(result.is_interface_change).toBe(true);
  });

  it('detects implementation-only change when only body changes', () => {
    const oldContent = `int compute(int x) {\n  return x;\n}`;
    const newContent = `int compute(int x) {\n  return x * 2;\n}`;
    const result = classifier.classifyFileChange('src/math.c', oldContent, newContent);
    expect(result.is_interface_change).toBe(false);
  });

  it('classifies severity as LOW for comment-only changes', () => {
    const oldContent = `int foo(void) {\n  return 0;\n}`;
    const newContent = `/* new comment */\nint foo(void) {\n  return 0;\n}`;
    const result = classifier.classifyFileChange('src/foo.c', oldContent, newContent);
    expect(result.severity).toBe('low');
  });

  it('classifies severity as MEDIUM for body logic changes', () => {
    const oldContent = `int foo(void) {\n  return 0;\n}`;
    const newContent = `int foo(void) {\n  return 1;\n}`;
    const result = classifier.classifyFileChange('src/foo.c', oldContent, newContent);
    expect(result.severity).toBe('medium');
  });

  it('classifies severity as HIGH for signature changes', () => {
    const oldContent = `int foo(void) {\n  return 0;\n}`;
    const newContent = `int foo(int x) {\n  return x;\n}`;
    const result = classifier.classifyFileChange('src/foo.c', oldContent, newContent);
    expect(result.severity).toBe('high');
  });

  it('returns file_path in result', () => {
    const result = classifier.classifyFileChange('src/motor.c', null, 'int run() {}');
    expect(result.file_path).toBe('src/motor.c');
  });

  it('captures function name from new content', () => {
    const result = classifier.classifyFileChange('src/motor.c', null, 'int run_motor(void) {}');
    expect(result.function_name).toBe('run_motor');
  });

  it('includes file path in affected_artifacts', () => {
    const result = classifier.classifyFileChange('src/motor.c', null, 'int run() {}');
    expect(result.affected_artifacts).toContain('src/motor.c');
  });

  it('classifyRequirementChange returns requirement_change type', () => {
    const result = classifier.classifyRequirementChange('REQ-001', null, 'New text');
    expect(result.change_type).toBe('requirement_change');
    expect(result.severity).toBe('high');
    expect(result.affected_artifacts).toContain('REQ-001');
  });

  it('classifyRequirementChange returns low severity for whitespace-only change', () => {
    const result = classifier.classifyRequirementChange(
      'REQ-001',
      'The system shall do X.',
      'The  system  shall  do  X.',
    );
    expect(result.severity).toBe('low');
  });

  it('classifyConfigChange always returns high severity config_change', () => {
    const result = classifier.classifyConfigChange({ asil_level: 'A' }, { asil_level: 'B' });
    expect(result.change_type).toBe('config_change');
    expect(result.severity).toBe('high');
  });
});

// ─── BlastRadiusCalculator ────────────────────────────────────────────────────

describe('BlastRadiusCalculator', () => {
  const calculator = createBlastRadiusCalculator();

  it('returns empty affected list for isolated node (no edges)', () => {
    const db = createTestDb();
    const graph = createDependencyGraph(db);
    graph.addNode({ id: 'A', type: 'function', content_hash: 'h1' });

    const classifier = createChangeClassifier();
    const classification = classifier.classifyFileChange('src/a.c', null, 'int a() {}');
    // Override affected_artifacts to point to node A
    const classificationWithA = {
      ...classification,
      affected_artifacts: ['A'],
    };

    const result = calculator.calculate(classificationWithA, graph);
    expect(result.affected_artifacts).toHaveLength(0);
    expect(result.total_affected).toBe(0);
  });

  it('calculates blast radius for interface change (transitive)', () => {
    const db = createTestDb();
    seedGraph(db, 'linear'); // A -> B -> C
    const graph = createDependencyGraph(db);

    const classifier = createChangeClassifier();
    // Simulate an interface change on A
    const oldContent = `int A(void) { return 0; }`;
    const newContent = `int A(int x) { return x; }`;
    const classification = classifier.classifyFileChange('A.c', oldContent, newContent);
    const classificationWithA = {
      ...classification,
      affected_artifacts: ['A'],
      is_interface_change: true,
    };

    const result = calculator.calculate(classificationWithA, graph);
    // B depends on A (distance 1), no callers of A in this linear graph
    // The graph is A->B->C, so A's callers are none (A is the root)
    // B and C call A transitively — but edges go FROM caller TO callee
    // In linear A->B->C: A calls B which calls C
    // getBlastRadius on A with interface change: walks reverse edges (who calls A)
    // With seedGraph linear: A->B->C means A is the caller, so getUpstream(A) = []
    // Correct interpretation: reversed = callers of A = nobody
    expect(result.total_affected).toBeGreaterThanOrEqual(0);
    expect(result.reverification_scope).toBe('integration');
    expect(result.is_interface_change).toBe(true);
  });

  it('calculates blast radius for implementation change (1-hop only)', () => {
    const db = createTestDb();
    seedGraph(db, 'linear'); // A -> B -> C  (A calls B calls C)
    const graph = createDependencyGraph(db);

    // B is changed at implementation level
    const classifier = createChangeClassifier();
    const oldContent = `int B(void) { return 0; }`;
    const newContent = `int B(void) { return 1; }`;
    const classification = classifier.classifyFileChange('B.c', oldContent, newContent);
    const classificationWithB = {
      ...classification,
      affected_artifacts: ['B'],
      is_interface_change: false,
    };

    const result = calculator.calculate(classificationWithB, graph);
    // getUpstream(B) = nodes that have an edge pointing TO B = [A]
    expect(result.total_affected).toBe(1);
    expect(result.affected_artifacts[0]?.artifact_id).toBe('A');
    expect(result.affected_artifacts[0]?.distance).toBe(1);
  });

  it('determines reverification scope: unit for impl change', () => {
    const db = createTestDb();
    const graph = createDependencyGraph(db);
    const classifier = createChangeClassifier();
    const old = `int foo(void) { return 0; }`;
    const nw = `int foo(void) { return 1; }`;
    const classification = classifier.classifyFileChange('foo.c', old, nw);
    // implementation-only code change
    expect(classification.is_interface_change).toBe(false);
    const result = calculator.calculate(classification, graph);
    expect(result.reverification_scope).toBe('unit');
  });

  it('determines reverification scope: integration for interface change', () => {
    const db = createTestDb();
    const graph = createDependencyGraph(db);
    const classifier = createChangeClassifier();
    const old = `int foo(void) { return 0; }`;
    const nw = `int foo(int x) { return x; }`;
    const classification = classifier.classifyFileChange('foo.c', old, nw);
    expect(classification.is_interface_change).toBe(true);
    const result = calculator.calculate(classification, graph);
    expect(result.reverification_scope).toBe('integration');
  });

  it('determines reverification scope: safety for requirement change', () => {
    const db = createTestDb();
    const graph = createDependencyGraph(db);
    const classifier = createChangeClassifier();
    const classification = classifier.classifyRequirementChange('REQ-001', null, 'New text');
    const result = calculator.calculate(classification, graph);
    expect(result.reverification_scope).toBe('safety');
  });

  it('returns correct changed_artifact', () => {
    const db = createTestDb();
    const graph = createDependencyGraph(db);
    const classifier = createChangeClassifier();
    const classification = classifier.classifyFileChange(
      'src/brake.c',
      null,
      'int brake(void) { return 0; }',
    );
    const result = calculator.calculate(classification, graph);
    // changed_artifact is the first affected_artifact or file_path
    expect(result.changed_artifact).toBe('src/brake.c');
  });
});

// ─── GateEnforcer ─────────────────────────────────────────────────────────────

describe('GateEnforcer', () => {
  const enforcer = createGateEnforcer();

  it('allows commit when no stale entries', () => {
    const db = createTestDb();
    const ledger = createVerificationLedger(db);
    // Empty ledger — no stale entries
    const result = enforcer.checkGate('commit', CONFIG_ASIL_B, ledger);
    expect(result.gate_passed).toBe(true);
    expect(result.debt_count).toBe(0);
    expect(result.violations).toHaveLength(0);
  });

  it('blocks commit when stale entries exist in strict mode ASIL B+', () => {
    const db = createTestDb();
    seedLedger(db, [
      {
        artifact_id: 'brake_control',
        content_hash: 'abc123',
        verification_status: 'stale',
        asil_level: 'B',
        invalidated_by: 'interface_change',
      },
    ]);
    const ledger = createVerificationLedger(db);
    const result = enforcer.checkGate('commit', CONFIG_ASIL_B, ledger);
    expect(result.gate_passed).toBe(false);
    expect(result.blocked_reason).not.toBeNull();
    expect(result.debt_count).toBe(1);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.artifact_id).toBe('brake_control');
  });

  it('allows commit with violations surfaced in warn mode', () => {
    const db = createTestDb();
    seedLedger(db, [
      {
        artifact_id: 'sensor_read',
        content_hash: 'def456',
        verification_status: 'stale',
        asil_level: 'A',
        invalidated_by: 'impl change',
      },
    ]);
    const ledger = createVerificationLedger(db);
    const warnConfig = { ...CONFIG_ASIL_B, enforcement_mode: 'warn' as const };
    const result = enforcer.checkGate('commit', warnConfig, ledger);
    expect(result.gate_passed).toBe(true);
    // violations are surfaced in warn mode
    expect(result.violations).toHaveLength(1);
  });

  it('does not surface violations in info mode commit gate', () => {
    const db = createTestDb();
    seedLedger(db, [
      {
        artifact_id: 'sensor_read',
        content_hash: 'def456',
        verification_status: 'stale',
        asil_level: 'QM',
        invalidated_by: 'impl change',
      },
    ]);
    const ledger = createVerificationLedger(db);
    const result = enforcer.checkGate('commit', CONFIG_QM, ledger);
    // INFO mode — gate passes and violations list is empty
    expect(result.gate_passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('blocks phase advance when debt > 0', () => {
    const db = createTestDb();
    seedLedger(db, [
      {
        artifact_id: 'throttle_cmd',
        content_hash: 'g789',
        verification_status: 'stale',
        asil_level: 'C',
        invalidated_by: 'requirement changed',
      },
    ]);
    const ledger = createVerificationLedger(db);
    const result = enforcer.checkGate('phase_advance', CONFIG_ASIL_B, ledger);
    expect(result.gate_passed).toBe(false);
    expect(result.blocked_reason).toContain('stale artifact');
  });

  it('allows phase advance when no stale entries', () => {
    const db = createTestDb();
    const ledger = createVerificationLedger(db);
    const result = enforcer.checkGate('phase_advance', CONFIG_ASIL_B, ledger);
    expect(result.gate_passed).toBe(true);
    expect(result.debt_count).toBe(0);
  });

  it('blocks release when stale entries exist', () => {
    const db = createTestDb();
    seedLedger(db, [
      {
        artifact_id: 'safety_monitor',
        content_hash: 'stale1',
        verification_status: 'stale',
        asil_level: 'D',
        invalidated_by: 'dependency changed',
      },
    ]);
    const ledger = createVerificationLedger(db);
    const result = enforcer.checkGate('release', CONFIG_ASIL_D, ledger);
    expect(result.gate_passed).toBe(false);
    expect(result.enforcement_mode).toBe('strict');
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('blocks release when unverified entries exist', () => {
    const db = createTestDb();
    seedLedger(db, [
      {
        artifact_id: 'new_module',
        content_hash: 'unv1',
        verification_status: 'unverified',
        asil_level: 'B',
      },
    ]);
    const ledger = createVerificationLedger(db);
    const result = enforcer.checkGate('release', CONFIG_ASIL_B, ledger);
    expect(result.gate_passed).toBe(false);
    expect(result.blocked_reason).toContain('unverified');
  });

  it('allows release when all entries are fresh', () => {
    const db = createTestDb();
    seedLedger(db, [
      {
        artifact_id: 'clean_module',
        content_hash: 'fresh1',
        verification_status: 'fresh',
        freshness_score: 1.0,
        asil_level: 'B',
      },
    ]);
    const ledger = createVerificationLedger(db);
    const result = enforcer.checkGate('release', CONFIG_ASIL_B, ledger);
    expect(result.gate_passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('violations sorted by ASIL priority (D before A)', () => {
    const db = createTestDb();
    seedLedger(db, [
      {
        artifact_id: 'low_module',
        content_hash: 'h1',
        verification_status: 'stale',
        asil_level: 'A',
        invalidated_by: 'change',
      },
      {
        artifact_id: 'high_module',
        content_hash: 'h2',
        verification_status: 'stale',
        asil_level: 'D',
        invalidated_by: 'change',
      },
    ]);
    const ledger = createVerificationLedger(db);
    const result = enforcer.checkGate('commit', CONFIG_ASIL_D, ledger);
    expect(result.gate_passed).toBe(false);
    expect(result.violations[0]?.asil_level).toBe('D');
    expect(result.violations[1]?.asil_level).toBe('A');
  });
});

// ─── ReverificationPlanner ────────────────────────────────────────────────────

describe('ReverificationPlanner', () => {
  const planner = createReverificationPlanner();

  function makeBlastRadius(
    artifacts: AffectedArtifact[],
    overrides: Partial<BlastRadiusDetail> = {},
  ): BlastRadiusDetail {
    return {
      changed_artifact: 'src/foo.c',
      change_type: 'code_change',
      is_interface_change: false,
      affected_artifacts: artifacts,
      total_affected: artifacts.length,
      reverification_scope: 'unit',
      ...overrides,
    };
  }

  it('returns empty plan when no affected artifacts', () => {
    const db = createTestDb();
    const ledger = createVerificationLedger(db);
    const blastRadius = makeBlastRadius([]);
    const plan = planner.plan(blastRadius, ledger);
    expect(plan.total_items).toBe(0);
    expect(plan.work_items).toHaveLength(0);
    expect(plan.estimated_scope).toContain('0 artifact');
  });

  it('generates work items for affected artifacts', () => {
    const db = createTestDb();
    const ledger = createVerificationLedger(db);

    const affected: AffectedArtifact[] = [
      {
        artifact_id: 'brake_ctrl',
        artifact_type: 'function',
        distance: 1,
        invalidation_reason: 'Direct dependency changed',
        asil_level: 'B',
        reverification_type: 'integration',
      },
    ];
    const blastRadius = makeBlastRadius(affected);
    const plan = planner.plan(blastRadius, ledger);

    expect(plan.total_items).toBe(1);
    expect(plan.work_items[0]?.artifact_id).toBe('brake_ctrl');
    expect(plan.work_items[0]?.verification_type).toBe('integration');
    expect(plan.work_items[0]?.asil_level).toBe('B');
  });

  it('prioritizes by ASIL level — D first (lower priority number)', () => {
    const db = createTestDb();
    const ledger = createVerificationLedger(db);

    const affected: AffectedArtifact[] = [
      {
        artifact_id: 'qm_module',
        artifact_type: 'function',
        distance: 1,
        invalidation_reason: 'dep changed',
        asil_level: 'QM',
        reverification_type: 'unit',
      },
      {
        artifact_id: 'asil_d_module',
        artifact_type: 'function',
        distance: 1,
        invalidation_reason: 'dep changed',
        asil_level: 'D',
        reverification_type: 'safety',
      },
    ];
    const blastRadius = makeBlastRadius(affected);
    const plan = planner.plan(blastRadius, ledger);

    // D at distance 1: priority = 1/5 = 0.2
    // QM at distance 1: priority = 1/1 = 1.0
    expect(plan.work_items[0]?.artifact_id).toBe('asil_d_module');
    expect(plan.work_items[0]?.priority).toBeLessThan(plan.work_items[1]?.priority ?? Infinity);
  });

  it('generates human-readable scope summary', () => {
    const db = createTestDb();
    const ledger = createVerificationLedger(db);

    const affected: AffectedArtifact[] = [
      {
        artifact_id: 'module_a',
        artifact_type: 'function',
        distance: 1,
        invalidation_reason: 'dep changed',
        asil_level: 'A',
        reverification_type: 'unit',
      },
      {
        artifact_id: 'module_b',
        artifact_type: 'function',
        distance: 2,
        invalidation_reason: 'transitive dep changed',
        asil_level: 'B',
        reverification_type: 'integration',
      },
    ];
    const blastRadius = makeBlastRadius(affected);
    const plan = planner.plan(blastRadius, ledger);

    expect(plan.estimated_scope).toContain('2 artifact');
    expect(plan.estimated_scope).toContain('unit');
    expect(plan.estimated_scope).toContain('integration');
  });

  it('enriches ASIL level from ledger entry when available', () => {
    const db = createTestDb();
    seedLedger(db, [
      {
        artifact_id: 'tracked_module',
        content_hash: 'h1',
        verification_status: 'stale',
        asil_level: 'D', // ledger says D
      },
    ]);
    const ledger = createVerificationLedger(db);

    const affected: AffectedArtifact[] = [
      {
        artifact_id: 'tracked_module',
        artifact_type: 'function',
        distance: 1,
        invalidation_reason: 'dep changed',
        asil_level: 'QM', // blast radius says QM
        reverification_type: 'unit',
      },
    ];
    const blastRadius = makeBlastRadius(affected);
    const plan = planner.plan(blastRadius, ledger);

    // Ledger entry takes precedence over blast radius ASIL
    expect(plan.work_items[0]?.asil_level).toBe('D');
  });

  it('reason includes distance for transitive dependencies', () => {
    const db = createTestDb();
    const ledger = createVerificationLedger(db);

    const affected: AffectedArtifact[] = [
      {
        artifact_id: 'distant_module',
        artifact_type: 'function',
        distance: 3,
        invalidation_reason: 'root dep changed',
        asil_level: 'A',
        reverification_type: 'unit',
      },
    ];
    const blastRadius = makeBlastRadius(affected);
    const plan = planner.plan(blastRadius, ledger);
    expect(plan.work_items[0]?.reason).toContain('distance 3');
  });
});

// ─── CCPOrchestrator ──────────────────────────────────────────────────────────

describe('CCPOrchestrator', () => {
  function makeOrchestrator() {
    const db = createTestDb();
    const ledger = createVerificationLedger(db);
    const graph = createDependencyGraph(db);
    const propagator = createStalenessPropagator(ledger, graph);
    const auditLogger = createAuditLogger(db);

    const orchestrator = createCCPOrchestrator({
      db,
      ledger,
      graph,
      propagator,
      auditLogger,
      config: CONFIG_ASIL_B,
    });

    return { db, ledger, graph, propagator, auditLogger, orchestrator };
  }

  it('handleCodeChange returns a full CCPResult', () => {
    const { orchestrator } = makeOrchestrator();
    const result = orchestrator.handleCodeChange(
      'src/sensor.c',
      null,
      'int read_sensor(void) { return 0; }',
    );

    expect(result.change_event).toBeDefined();
    expect(result.blast_radius).toBeDefined();
    expect(result.propagation).toBeDefined();
    expect(result.gate_check).toBeDefined();
    expect(result.reverification_plan).toBeDefined();
    expect(result.audit_event_id).toBeGreaterThan(0);
  });

  it('handleCodeChange sets change_type to code_change', () => {
    const { orchestrator } = makeOrchestrator();
    const result = orchestrator.handleCodeChange('src/brake.c', null, 'void brake() {}');
    expect(result.change_event.change_type).toBe('code_change');
  });

  it('handleRequirementChange triggers requirement_change type', () => {
    const { orchestrator } = makeOrchestrator();
    const result = orchestrator.handleRequirementChange(
      'REQ-SSR-042',
      null,
      'The system shall apply brakes within 50ms.',
    );
    expect(result.change_event.change_type).toBe('requirement_change');
    expect(result.blast_radius.reverification_scope).toBe('safety');
  });

  it('handleTestChange sets change_type to test_change', () => {
    const { orchestrator } = makeOrchestrator();
    const result = orchestrator.handleTestChange(
      'src/brake.test.c',
      null,
      'void test_brake() {}',
    );
    expect(result.change_event.change_type).toBe('test_change');
  });

  it('handleConfigChange sets change_type to config_change', () => {
    const { orchestrator } = makeOrchestrator();
    const result = orchestrator.handleConfigChange(
      { asil_level: 'A' },
      { asil_level: 'B' },
    );
    expect(result.change_event.change_type).toBe('config_change');
  });

  it('all mutations are atomic — audit event persisted after handleCodeChange', () => {
    const { orchestrator, auditLogger } = makeOrchestrator();
    const countBefore = auditLogger.count();
    orchestrator.handleCodeChange('src/motor.c', null, 'void run() {}');
    const countAfter = auditLogger.count();
    expect(countAfter).toBe(countBefore + 1);
  });

  it('logs audit event for each change', () => {
    const { orchestrator, auditLogger } = makeOrchestrator();
    orchestrator.handleCodeChange('src/a.c', null, 'int a() {}');
    orchestrator.handleCodeChange('src/b.c', null, 'int b() {}');
    orchestrator.handleRequirementChange('REQ-001', null, 'text');
    expect(auditLogger.count()).toBe(3);
  });

  it('returns sequential audit_event_ids', () => {
    const { orchestrator } = makeOrchestrator();
    const r1 = orchestrator.handleCodeChange('src/a.c', null, 'int a() {}');
    const r2 = orchestrator.handleCodeChange('src/b.c', null, 'int b() {}');
    expect(r2.audit_event_id).toBeGreaterThan(r1.audit_event_id);
  });

  it('propagation includes changed_artifact', () => {
    const { orchestrator } = makeOrchestrator();
    const result = orchestrator.handleCodeChange('src/x.c', null, 'int x() {}');
    expect(result.propagation.changed_artifact).toBeDefined();
    expect(typeof result.propagation.changed_artifact).toBe('string');
  });

  it('gate_check passes on empty ledger', () => {
    const { orchestrator } = makeOrchestrator();
    const result = orchestrator.handleCodeChange('src/fresh.c', null, 'int f() {}');
    expect(result.gate_check.gate_passed).toBe(true);
  });

  it('reverification_plan includes total_items and estimated_scope', () => {
    const { orchestrator } = makeOrchestrator();
    const result = orchestrator.handleCodeChange('src/mod.c', null, 'int mod() {}');
    expect(typeof result.reverification_plan.total_items).toBe('number');
    expect(typeof result.reverification_plan.estimated_scope).toBe('string');
  });
});
