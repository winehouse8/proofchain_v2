// Code Generation — Unit Tests (direct function calls)
// Covers TC-CC-CG-013 (Verilog syntax), TC-CC-CG-014 (SDC syntax), TC-CC-CG-018 (timestamps)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { initMemoryDb, closeDb, getDb } from '../../../src/server/db.js';
import { generateRTL, generateSDC } from '../../../src/server/services/codegen.js';
import type Database from 'better-sqlite3';

let db: Database.Database;
let projectId: string;

function createMinimalDesign(pName: string): string {
  const pid = uuidv4();
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(pid, pName);

  const pllId = uuidv4();
  const ipId = uuidv4();

  db.prepare(
    'INSERT INTO nodes (id, project_id, type, properties, position_x, position_y, computed_freq) VALUES (?, ?, ?, ?, 0, 0, ?)'
  ).run(pllId, pid, 'PLL', JSON.stringify({ output_freq: 100, name: 'PLL1' }), 100);

  db.prepare(
    'INSERT INTO nodes (id, project_id, type, properties, position_x, position_y) VALUES (?, ?, ?, ?, 0, 0)'
  ).run(ipId, pid, 'IPBlock', JSON.stringify({ name: 'IP1' }));

  const edgeId = uuidv4();
  db.prepare(
    'INSERT INTO edges (id, project_id, source, target) VALUES (?, ?, ?, ?)'
  ).run(edgeId, pid, `${pllId}:out`, `${ipId}:in`);

  return pid;
}

function createCDCDesign(pName: string): string {
  // CDC design with two domains feeding into a shared Mux via intermediate Dividers.
  // BFS from DomainA visits Div2 (∈A) → Mux (∈A)
  // BFS from DomainB visits Div3 (∈B) → Mux (∈B)
  // Edge Div2→Mux: src∈{A}, tgt∈{A,B} → crossing detected
  const pid = uuidv4();
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(pid, pName);

  const pll1Id = uuidv4();
  const pll2Id = uuidv4();
  const div1Id = uuidv4();
  const domAId = uuidv4();
  const domBId = uuidv4();
  const div2Id = uuidv4(); // intermediary in DomainA
  const div3Id = uuidv4(); // intermediary in DomainB
  const mux1Id = uuidv4();
  const ip1Id = uuidv4();

  const nodes = [
    { id: pll1Id, type: 'PLL', props: { output_freq: 100, name: 'PLL1' }, freq: 100 },
    { id: pll2Id, type: 'PLL', props: { output_freq: 200, name: 'PLL2' }, freq: 200 },
    { id: div1Id, type: 'Divider', props: { ratio: 2, name: 'Div1' }, freq: 50 },
    { id: domAId, type: 'ClockDomain', props: { domain_name: 'DomainA', name: 'DomainA' }, freq: 50 },
    { id: domBId, type: 'ClockDomain', props: { domain_name: 'DomainB', name: 'DomainB' }, freq: 200 },
    { id: div2Id, type: 'Divider', props: { ratio: 2, name: 'Div2' }, freq: 25 },
    { id: div3Id, type: 'Divider', props: { ratio: 4, name: 'Div3' }, freq: 50 },
    { id: mux1Id, type: 'Mux', props: { select_index: 0, name: 'Mux1' }, freq: 25 },
    { id: ip1Id, type: 'IPBlock', props: { name: 'IP1' }, freq: 25 },
  ];

  const insertNode = db.prepare(
    'INSERT INTO nodes (id, project_id, type, properties, position_x, position_y, computed_freq) VALUES (?, ?, ?, ?, 0, 0, ?)'
  );
  for (const n of nodes) {
    insertNode.run(n.id, pid, n.type, JSON.stringify(n.props), n.freq);
  }

  const edges = [
    { src: `${pll1Id}:out`, tgt: `${div1Id}:in` },      // PLL1 → Div1
    { src: `${div1Id}:out`, tgt: `${domAId}:in` },       // Div1 → DomainA
    { src: `${pll2Id}:out`, tgt: `${domBId}:in` },       // PLL2 → DomainB
    { src: `${domAId}:out_0`, tgt: `${div2Id}:in` },     // DomainA → Div2 (Div2 ∈ A)
    { src: `${domBId}:out_0`, tgt: `${div3Id}:in` },     // DomainB → Div3 (Div3 ∈ B)
    { src: `${div2Id}:out`, tgt: `${mux1Id}:in_0` },     // Div2 → Mux:in_0 (Mux ∈ A)
    { src: `${div3Id}:out`, tgt: `${mux1Id}:in_1` },     // Div3 → Mux:in_1 (Mux ∈ B too → crossing)
    { src: `${mux1Id}:out`, tgt: `${ip1Id}:in` },        // Mux → IP1
  ];

  const insertEdge = db.prepare(
    'INSERT INTO edges (id, project_id, source, target) VALUES (?, ?, ?, ?)'
  );
  for (const e of edges) {
    insertEdge.run(uuidv4(), pid, e.src, e.tgt);
  }

  return pid;
}

beforeEach(() => {
  db = initMemoryDb();
  projectId = createMinimalDesign('TestProj');
});

afterEach(() => {
  closeDb();
});

// ==================== TC-CC-CG-013: Verilog IEEE 1364-2005 syntax ====================

describe('TC-CC-CG-013 — Generated Verilog passes IEEE 1364-2005 structural syntax checks', () => {
  // @tc TC-CC-CG-013
  // @req REQ-CG-009
  it('should match IEEE 1364-2005 structural syntax patterns', () => {
    const rtl = generateRTL(db, projectId, 'TestProj');

    // (a) module declaration
    expect(rtl).toMatch(/^module\s+\w+/m);

    // (b) endmodule
    expect(rtl).toMatch(/endmodule/m);

    // (c) valid signal declaration (wire or reg)
    expect(rtl).toMatch(/\b(wire|reg)\b/m);

    // (d) semicolon-terminated statements
    expect(rtl).toMatch(/;\s*$/m);

    // No syntax error markers
    expect(rtl).not.toMatch(/syntax error/i);
  });
});

// ==================== TC-CC-CG-014: SDC syntax checks ====================

describe('TC-CC-CG-014 — Generated SDC passes Synopsys Design Constraints syntax checks', () => {
  // @tc TC-CC-CG-014
  // @req REQ-CG-010
  it('should match SDC command syntax patterns', () => {
    // Need a CDC design for full SDC with set_clock_groups and set_false_path
    const cdcPid = createCDCDesign('CDCProj');
    const sdc = generateSDC(db, cdcPid, 'CDCProj');

    // (a) create_clock with -period
    expect(sdc).toMatch(/^create_clock\s+-name\s+\S+\s+-period\s+[\d.]+/m);

    // (b) create_generated_clock with -source
    expect(sdc).toMatch(/^create_generated_clock\s+-name\s+\S+\s+-source/m);

    // (c) set_clock_groups
    expect(sdc).toMatch(/^set_clock_groups\s+/m);

    // (d) set_false_path with -from
    expect(sdc).toMatch(/^set_false_path\s+-from/m);
  });
});

// ==================== TC-CC-CG-018: Timestamps and project name in comments ====================

describe('TC-CC-CG-018 — Generated code includes generation timestamp and project name in comments', () => {
  // @tc TC-CC-CG-018
  // @req REQ-CG-009
  // @req REQ-CG-010
  it('should include project name and timestamp in both RTL and SDC comments', () => {
    const rtl = generateRTL(db, projectId, 'TestProj');
    const sdc = generateSDC(db, projectId, 'TestProj');

    // RTL: comment with project name
    expect(rtl).toMatch(/\/\/.*TestProj/);
    // RTL: comment with timestamp (ISO 8601 format)
    expect(rtl).toMatch(/\/\/.*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // SDC: comment with project name
    expect(sdc).toMatch(/#.*TestProj/);
    // SDC: comment with timestamp
    expect(sdc).toMatch(/#.*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
