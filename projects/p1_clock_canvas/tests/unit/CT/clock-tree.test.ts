// Clock Tree Engine Unit Tests
// @tc TC-CC-CT-001, TC-CC-CT-011..013, TC-CC-CT-015..019, TC-CC-CT-036..037
// @req REQ-CT-001, REQ-CT-005, REQ-CT-007, REQ-CT-008

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { initMemoryDb } from '../../../src/server/db.js';
import {
  buildGraph,
  detectCycle,
  propagateFrequencies,
} from '../../../src/server/services/clock-tree.js';

// ==================== Helpers ====================

const PROJECT_ID = 'test-project';

function insertProject(db: Database.Database): void {
  db.prepare(
    'INSERT INTO projects (id, name) VALUES (?, ?)'
  ).run(PROJECT_ID, 'Test Project');
}

function insertNode(
  db: Database.Database,
  id: string,
  type: string,
  properties: Record<string, unknown> = {},
  computedFreq: number | null = null,
): void {
  db.prepare(
    'INSERT INTO nodes (id, project_id, type, properties, position_x, position_y, computed_freq) VALUES (?, ?, ?, ?, 0, 0, ?)'
  ).run(id, PROJECT_ID, type, JSON.stringify(properties), computedFreq);
}

function insertEdge(
  db: Database.Database,
  id: string,
  source: string,
  target: string,
): void {
  db.prepare(
    'INSERT INTO edges (id, project_id, source, target) VALUES (?, ?, ?, ?)'
  ).run(id, PROJECT_ID, source, target);
}

// ==================== Tests ====================

describe('Clock Tree Engine', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initMemoryDb();
    insertProject(db);
  });

  // ------------------------------------------------------------------
  // TC-CC-CT-001: Graph integrity after node/edge add/delete cycle
  // ------------------------------------------------------------------
  it('TC-CC-CT-001: graph integrity after add/delete cycle', () => {
    // @tc TC-CC-CT-001
    // @req REQ-CT-001

    // Given: add PLL + Divider + edge
    insertNode(db, 'pll-1', 'PLL', { output_freq: 400 });
    insertNode(db, 'div-1', 'Divider', { ratio: 4 });
    insertEdge(db, 'e-1', 'pll-1:out', 'div-1:in');

    // When: delete edge and Divider
    db.prepare('DELETE FROM edges WHERE id = ? AND project_id = ?').run('e-1', PROJECT_ID);
    db.prepare('DELETE FROM nodes WHERE id = ? AND project_id = ?').run('div-1', PROJECT_ID);

    const graph = buildGraph(db, PROJECT_ID);

    // Then: 1 node, 0 edges, no orphan edges
    expect(graph.nodes.size).toBe(1);
    expect(graph.edges.size).toBe(0);
    expect(graph.nodes.has('pll-1')).toBe(true);
    expect(graph.nodes.has('div-1')).toBe(false);
  });

  // ------------------------------------------------------------------
  // TC-CC-CT-011: Self-loop cycle detection
  // ------------------------------------------------------------------
  it('TC-CC-CT-011: self-loop cycle detection', () => {
    // @tc TC-CC-CT-011
    // @req REQ-CT-005

    // Given: single Divider
    insertNode(db, 'div-1', 'Divider', { ratio: 2 });

    const graph = buildGraph(db, PROJECT_ID);

    // When: check if adding div-1 -> div-1 detects cycle
    const result = detectCycle(graph, 'div-1', 'div-1');

    // Then: returns cycle path including div-1
    expect(result).not.toBeNull();
    expect(result).toContain('div-1');
  });

  // ------------------------------------------------------------------
  // TC-CC-CT-012: 2-node cycle detection
  // ------------------------------------------------------------------
  it('TC-CC-CT-012: 2-node cycle detection', () => {
    // @tc TC-CC-CT-012
    // @req REQ-CT-005

    // Given: Divider -> ClockGate edge already exists
    insertNode(db, 'div-1', 'Divider', { ratio: 2 });
    insertNode(db, 'gate-1', 'ClockGate', {});
    insertEdge(db, 'e-1', 'div-1:out', 'gate-1:in');

    const graph = buildGraph(db, PROJECT_ID);

    // When: check if adding ClockGate -> Divider creates a cycle
    const result = detectCycle(graph, 'gate-1', 'div-1');

    // Then: cycle detected with both nodes in path
    expect(result).not.toBeNull();
    expect(result).toContain('div-1');
    expect(result).toContain('gate-1');
  });

  // ------------------------------------------------------------------
  // TC-CC-CT-013: 3-node cycle detection
  // ------------------------------------------------------------------
  it('TC-CC-CT-013: 3-node cycle detection', () => {
    // @tc TC-CC-CT-013
    // @req REQ-CT-005

    // Given: A -> B -> C
    insertNode(db, 'node-a', 'PLL', { output_freq: 100 });
    insertNode(db, 'node-b', 'Divider', { ratio: 2 });
    insertNode(db, 'node-c', 'ClockGate', {});
    insertEdge(db, 'e-ab', 'node-a:out', 'node-b:in');
    insertEdge(db, 'e-bc', 'node-b:out', 'node-c:in');

    const graph = buildGraph(db, PROJECT_ID);

    // When: check if adding C -> A creates a cycle
    const result = detectCycle(graph, 'node-c', 'node-a');

    // Then: cycle detected with all 3 nodes
    expect(result).not.toBeNull();
    expect(result).toContain('node-a');
    expect(result).toContain('node-b');
    expect(result).toContain('node-c');
  });

  // ------------------------------------------------------------------
  // TC-CC-CT-015: Freq propagation PLL -> Divider -> IPBlock
  // ------------------------------------------------------------------
  it('TC-CC-CT-015: frequency propagation PLL->Divider->IPBlock', () => {
    // @tc TC-CC-CT-015
    // @req REQ-CT-007

    // Given: PLL(400MHz) -> Divider(ratio=4) -> IPBlock
    insertNode(db, 'pll-1', 'PLL', { output_freq: 400 });
    insertNode(db, 'div-1', 'Divider', { ratio: 4 });
    insertNode(db, 'ip-1', 'IPBlock', {});
    insertEdge(db, 'e-1', 'pll-1:out', 'div-1:in');
    insertEdge(db, 'e-2', 'div-1:out', 'ip-1:in');

    const graph = buildGraph(db, PROJECT_ID);
    propagateFrequencies(graph);

    // Then: Divider=100MHz, IPBlock=100MHz
    expect(graph.nodes.get('pll-1')?.computed_freq).toBe(400);
    expect(graph.nodes.get('div-1')?.computed_freq).toBe(100);
    expect(graph.nodes.get('ip-1')?.computed_freq).toBe(100);
  });

  // ------------------------------------------------------------------
  // TC-CC-CT-016: Freq recalculates when Divider ratio changes
  // ------------------------------------------------------------------
  it('TC-CC-CT-016: frequency recalculates when ratio changes 4->8', () => {
    // @tc TC-CC-CT-016
    // @req REQ-CT-007

    // Given: same chain, change ratio 4->8 in DB
    insertNode(db, 'pll-1', 'PLL', { output_freq: 400 });
    insertNode(db, 'div-1', 'Divider', { ratio: 8 });
    insertNode(db, 'ip-1', 'IPBlock', {});
    insertEdge(db, 'e-1', 'pll-1:out', 'div-1:in');
    insertEdge(db, 'e-2', 'div-1:out', 'ip-1:in');

    const graph = buildGraph(db, PROJECT_ID);
    propagateFrequencies(graph);

    // Then: Divider=50MHz, IPBlock=50MHz
    expect(graph.nodes.get('div-1')?.computed_freq).toBe(50);
    expect(graph.nodes.get('ip-1')?.computed_freq).toBe(50);
  });

  // ------------------------------------------------------------------
  // TC-CC-CT-017: Mux output null when select_index out of range
  // ------------------------------------------------------------------
  it('TC-CC-CT-017: Mux output null when select_index out of range', () => {
    // @tc TC-CC-CT-017
    // @req REQ-CT-007

    // Given: Mux with select_index=5, only 2 inputs connected (in_0, in_1)
    insertNode(db, 'pll-0', 'PLL', { output_freq: 100 });
    insertNode(db, 'pll-1', 'PLL', { output_freq: 200 });
    insertNode(db, 'mux-1', 'Mux', { select_index: 5 });
    insertNode(db, 'ip-1', 'IPBlock', {});
    insertEdge(db, 'e-0', 'pll-0:out', 'mux-1:in_0');
    insertEdge(db, 'e-1', 'pll-1:out', 'mux-1:in_1');
    insertEdge(db, 'e-2', 'mux-1:out', 'ip-1:in');

    const graph = buildGraph(db, PROJECT_ID);
    propagateFrequencies(graph);

    // Then: Mux output = null
    expect(graph.nodes.get('mux-1')?.computed_freq).toBeNull();
    expect(graph.nodes.get('ip-1')?.computed_freq).toBeNull();
  });

  // ------------------------------------------------------------------
  // TC-CC-CT-018: Unconnected Divider input -> null output freq
  // ------------------------------------------------------------------
  it('TC-CC-CT-018: unconnected Divider input yields null output', () => {
    // @tc TC-CC-CT-018
    // @req REQ-CT-008

    // Given: Divider with no incoming edge
    insertNode(db, 'div-1', 'Divider', { ratio: 4 });

    const graph = buildGraph(db, PROJECT_ID);
    propagateFrequencies(graph);

    // Then: computed_freq = null
    expect(graph.nodes.get('div-1')?.computed_freq).toBeNull();
  });

  // ------------------------------------------------------------------
  // TC-CC-CT-019: Null propagates from unconnected Divider to IPBlock
  // ------------------------------------------------------------------
  it('TC-CC-CT-019: null propagates from unconnected Divider to downstream IPBlock', () => {
    // @tc TC-CC-CT-019
    // @req REQ-CT-008

    // Given: Divider(no input) -> IPBlock
    insertNode(db, 'div-1', 'Divider', { ratio: 4 });
    insertNode(db, 'ip-1', 'IPBlock', {});
    insertEdge(db, 'e-1', 'div-1:out', 'ip-1:in');

    const graph = buildGraph(db, PROJECT_ID);
    propagateFrequencies(graph);

    // Then: both null
    expect(graph.nodes.get('div-1')?.computed_freq).toBeNull();
    expect(graph.nodes.get('ip-1')?.computed_freq).toBeNull();
  });

  // ------------------------------------------------------------------
  // TC-CC-CT-036: ClockGate passes through input frequency unchanged
  // ------------------------------------------------------------------
  it('TC-CC-CT-036: ClockGate passes through input frequency unchanged', () => {
    // @tc TC-CC-CT-036
    // @req REQ-CT-007

    // Given: PLL(300) -> ClockGate -> IPBlock
    insertNode(db, 'pll-1', 'PLL', { output_freq: 300 });
    insertNode(db, 'gate-1', 'ClockGate', {});
    insertNode(db, 'ip-1', 'IPBlock', {});
    insertEdge(db, 'e-1', 'pll-1:out', 'gate-1:in');
    insertEdge(db, 'e-2', 'gate-1:out', 'ip-1:in');

    const graph = buildGraph(db, PROJECT_ID);
    propagateFrequencies(graph);

    // Then: all = 300MHz
    expect(graph.nodes.get('pll-1')?.computed_freq).toBe(300);
    expect(graph.nodes.get('gate-1')?.computed_freq).toBe(300);
    expect(graph.nodes.get('ip-1')?.computed_freq).toBe(300);
  });

  // ------------------------------------------------------------------
  // TC-CC-CT-037: ClockDomain passes through input frequency
  // ------------------------------------------------------------------
  it('TC-CC-CT-037: ClockDomain passes through input frequency', () => {
    // @tc TC-CC-CT-037
    // @req REQ-CT-007

    // Given: PLL(250) -> ClockDomain -> IPBlock
    insertNode(db, 'pll-1', 'PLL', { output_freq: 250 });
    insertNode(db, 'domain-1', 'ClockDomain', { domain_name: 'core' });
    insertNode(db, 'ip-1', 'IPBlock', {});
    insertEdge(db, 'e-1', 'pll-1:out', 'domain-1:in');
    insertEdge(db, 'e-2', 'domain-1:out', 'ip-1:in');

    const graph = buildGraph(db, PROJECT_ID);
    propagateFrequencies(graph);

    // Then: all = 250MHz
    expect(graph.nodes.get('pll-1')?.computed_freq).toBe(250);
    expect(graph.nodes.get('domain-1')?.computed_freq).toBe(250);
    expect(graph.nodes.get('ip-1')?.computed_freq).toBe(250);
  });
});
