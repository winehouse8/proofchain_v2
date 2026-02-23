// Clock Tree Engine — Node, Connection, and Analysis API tests
// Covers REQ-CT-002, REQ-CT-003, REQ-CT-004, REQ-CT-006, REQ-CT-009,
//         REQ-CT-010, REQ-CT-011, REQ-CT-016, REQ-CT-017, REQ-CT-018

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { createTestApp, closeDb } from './test-app.js';
import { getDb } from '../../../src/server/db.js';
import type { Express } from 'express';

let app: Express;
let projectId: string;

beforeEach(async () => {
  app = createTestApp();
  // Each test gets a fresh project
  const res = await request(app)
    .post('/api/projects')
    .send({ name: 'CT Test Project' });
  projectId = res.body.id as string;
});

afterEach(() => {
  closeDb();
});

// ============================================================
// NODES
// ============================================================

// ==================== TC-CC-CT-002 — POST nodes for all 6 types → 201 with unique IDs ====================

describe('TC-CC-CT-002 — POST nodes for all 6 component types', () => {
  // @tc TC-CC-CT-002
  // @req REQ-CT-002
  it('should create all 6 node types and return unique IDs', async () => {
    const types = [
      { type: 'PLL', properties: { output_freq: 100 } },
      { type: 'Divider', properties: { ratio: 2 } },
      { type: 'Mux', properties: { select_index: 0 } },
      { type: 'ClockGate', properties: {} },
      { type: 'IPBlock', properties: {} },
      { type: 'ClockDomain', properties: {} },
    ];

    const ids: string[] = [];
    for (const payload of types) {
      const res = await request(app)
        .post(`/api/projects/${projectId}/nodes`)
        .send(payload);
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(typeof res.body.id).toBe('string');
      ids.push(res.body.id as string);
    }

    // All IDs must be unique
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(6);
  });
});

// ==================== TC-CC-CT-003 — POST node with unknown type → 400 ====================

describe('TC-CC-CT-003 — POST node with unknown type', () => {
  // @tc TC-CC-CT-003
  // @req REQ-CT-003
  it('should return 400 for an unknown component type', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'FlipFlop', properties: {} });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ==================== TC-CC-CT-004 — POST node with missing required props → 400 ====================

describe('TC-CC-CT-004 — POST node with missing required properties', () => {
  // @tc TC-CC-CT-004
  // @req REQ-CT-003
  it('should return 400 for PLL missing output_freq', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: {} });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // @tc TC-CC-CT-004
  // @req REQ-CT-003
  it('should return 400 for Divider missing ratio', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Divider', properties: {} });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // @tc TC-CC-CT-004
  // @req REQ-CT-003
  it('should return 400 for Mux missing select_index', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Mux', properties: {} });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ==================== TC-CC-CT-020 — DELETE node → 204, cleans edges, downstream freq=null ====================

describe('TC-CC-CT-020 — DELETE node cleans edges and nullifies downstream freq', () => {
  // @tc TC-CC-CT-020
  // @req REQ-CT-009
  it('should return 204 and null downstream computed_freq after node deletion', async () => {
    // Create PLL → Divider chain
    const pllRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 200 } });
    expect(pllRes.status).toBe(201);
    const pllId = pllRes.body.id as string;

    const divRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Divider', properties: { ratio: 2 } });
    expect(divRes.status).toBe(201);
    const divId = divRes.body.id as string;

    // Connect PLL:out → Divider:in
    const connRes = await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pllId}:out`, target: `${divId}:in` });
    expect(connRes.status).toBe(201);

    // Verify divider has computed_freq = 100
    const beforeGet = await request(app).get(`/api/projects/${projectId}`);
    const divNode = (beforeGet.body.nodes as Array<{ id: string; computed_freq: number | null }>)
      .find(n => n.id === divId);
    expect(divNode?.computed_freq).toBe(100);

    // Delete the PLL
    const delRes = await request(app)
      .delete(`/api/projects/${projectId}/nodes/${pllId}`);
    expect(delRes.status).toBe(204);

    // After deletion, edges should be gone and divider freq should be null
    const afterGet = await request(app).get(`/api/projects/${projectId}`);
    expect(afterGet.body.edges).toHaveLength(0);
    const divAfter = (afterGet.body.nodes as Array<{ id: string; computed_freq: number | null }>)
      .find(n => n.id === divId);
    expect(divAfter?.computed_freq).toBeNull();
  });
});

// ==================== TC-CC-CT-029 — PATCH node property recalculates downstream freq ====================

describe('TC-CC-CT-029 — PATCH node property recalculates downstream frequency', () => {
  // @tc TC-CC-CT-029
  // @req REQ-CT-016
  it('should update computed_freq when output_freq is patched on PLL', async () => {
    // Create PLL
    const pllRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 100 } });
    expect(pllRes.status).toBe(201);
    const pllId = pllRes.body.id as string;

    // Create Divider and connect
    const divRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Divider', properties: { ratio: 4 } });
    expect(divRes.status).toBe(201);
    const divId = divRes.body.id as string;

    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pllId}:out`, target: `${divId}:in` });

    // Divider freq should be 25 (100/4)
    const before = await request(app).get(`/api/projects/${projectId}`);
    const divBefore = (before.body.nodes as Array<{ id: string; computed_freq: number | null }>)
      .find(n => n.id === divId);
    expect(divBefore?.computed_freq).toBe(25);

    // Patch PLL output_freq to 800
    const patchRes = await request(app)
      .patch(`/api/projects/${projectId}/nodes/${pllId}`)
      .send({ properties: { output_freq: 800 } });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.computed_freq).toBe(800);

    // Divider should now be 200 (800/4)
    const after = await request(app).get(`/api/projects/${projectId}`);
    const divAfter = (after.body.nodes as Array<{ id: string; computed_freq: number | null }>)
      .find(n => n.id === divId);
    expect(divAfter?.computed_freq).toBe(200);
  });
});

// ==================== TC-CC-CT-030 — PATCH with invalid ratio → 400 ====================

describe('TC-CC-CT-030 — PATCH with invalid Divider ratio', () => {
  // @tc TC-CC-CT-030
  // @req REQ-CT-016
  it('should return 400 when patching Divider with a non-allowed ratio', async () => {
    const divRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Divider', properties: { ratio: 2 } });
    expect(divRes.status).toBe(201);
    const divId = divRes.body.id as string;

    const patchRes = await request(app)
      .patch(`/api/projects/${projectId}/nodes/${divId}`)
      .send({ properties: { ratio: 3 } }); // 3 is not in [2,4,8,16,32,64,128]

    expect(patchRes.status).toBe(400);
    expect(patchRes.body).toHaveProperty('error');
  });
});

// ==================== TC-CC-CT-033 — 200 nodes limit → 201st node → 400 ====================

describe('TC-CC-CT-033 — Node count limit of 200', () => {
  // @tc TC-CC-CT-033
  // @req REQ-CT-018
  it('should return 400 when attempting to add the 201st node', async () => {
    // Insert 200 nodes directly via DB to avoid HTTP overhead + frequency propagation
    const db = getDb();
    const insertStmt = db.prepare(
      'INSERT INTO nodes (id, project_id, type, properties, position_x, position_y) VALUES (?, ?, ?, ?, 0, 0)'
    );
    const insertAll = db.transaction(() => {
      for (let i = 0; i < 200; i++) {
        insertStmt.run(uuidv4(), projectId, 'ClockGate', '{}');
      }
    });
    insertAll();

    // Verify 200 nodes exist
    const count = (db.prepare('SELECT COUNT(*) as c FROM nodes WHERE project_id = ?').get(projectId) as { c: number }).c;
    expect(count).toBe(200);

    // 201st node via HTTP must be rejected
    const res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'ClockGate', properties: {} });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ============================================================
// CONNECTIONS
// ============================================================

// ==================== TC-CC-CT-005 — POST connection PLL→Divider → 201 ====================

describe('TC-CC-CT-005 — POST connection PLL to Divider', () => {
  // @tc TC-CC-CT-005
  // @req REQ-CT-004
  it('should create a valid PLL→Divider connection and return 201', async () => {
    const pllRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 500 } });
    expect(pllRes.status).toBe(201);
    const pllId = pllRes.body.id as string;

    const divRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Divider', properties: { ratio: 8 } });
    expect(divRes.status).toBe(201);
    const divId = divRes.body.id as string;

    const connRes = await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pllId}:out`, target: `${divId}:in` });

    expect(connRes.status).toBe(201);
    expect(connRes.body).toHaveProperty('id');
    expect(connRes.body.source).toBe(`${pllId}:out`);
    expect(connRes.body.target).toBe(`${divId}:in`);
  });
});

// ==================== TC-CC-CT-006 — POST connection with IPBlock as source → 400 ====================

describe('TC-CC-CT-006 — POST connection with IPBlock as source', () => {
  // @tc TC-CC-CT-006
  // @req REQ-CT-004
  it('should return 400 because IPBlock has no output port', async () => {
    const ipRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'IPBlock', properties: {} });
    expect(ipRes.status).toBe(201);
    const ipId = ipRes.body.id as string;

    const divRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Divider', properties: { ratio: 2 } });
    expect(divRes.status).toBe(201);
    const divId = divRes.body.id as string;

    const connRes = await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${ipId}:out`, target: `${divId}:in` });

    expect(connRes.status).toBe(400);
    expect(connRes.body).toHaveProperty('error');
  });
});

// ==================== TC-CC-CT-007 — POST connection with PLL as target → 400 ====================

describe('TC-CC-CT-007 — POST connection with PLL as target', () => {
  // @tc TC-CC-CT-007
  // @req REQ-CT-004
  it('should return 400 because PLL has no input port', async () => {
    const pll1Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 100 } });
    expect(pll1Res.status).toBe(201);
    const pll1Id = pll1Res.body.id as string;

    const pll2Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 200 } });
    expect(pll2Res.status).toBe(201);
    const pll2Id = pll2Res.body.id as string;

    const connRes = await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pll1Id}:out`, target: `${pll2Id}:in` });

    expect(connRes.status).toBe(400);
    expect(connRes.body).toHaveProperty('error');
  });
});

// ==================== TC-CC-CT-008 — POST self-loop → 400 ====================

describe('TC-CC-CT-008 — POST self-loop connection', () => {
  // @tc TC-CC-CT-008
  // @req REQ-CT-004
  it('should return 400 for a self-loop connection', async () => {
    const divRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Divider', properties: { ratio: 4 } });
    expect(divRes.status).toBe(201);
    const divId = divRes.body.id as string;

    const connRes = await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${divId}:out`, target: `${divId}:in` });

    expect(connRes.status).toBe(400);
    expect(connRes.body).toHaveProperty('error');
  });
});

// ==================== TC-CC-CT-009 — POST to occupied input port → 400 ====================

describe('TC-CC-CT-009 — POST connection to occupied input port', () => {
  // @tc TC-CC-CT-009
  // @req REQ-CT-004
  it('should return 400 when the target input port is already occupied', async () => {
    const pll1Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 100 } });
    expect(pll1Res.status).toBe(201);
    const pll1Id = pll1Res.body.id as string;

    const pll2Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 200 } });
    expect(pll2Res.status).toBe(201);
    const pll2Id = pll2Res.body.id as string;

    const divRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Divider', properties: { ratio: 2 } });
    expect(divRes.status).toBe(201);
    const divId = divRes.body.id as string;

    // First connection: pll1 → divider:in
    const first = await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pll1Id}:out`, target: `${divId}:in` });
    expect(first.status).toBe(201);

    // Second connection to the same port: pll2 → divider:in → should fail
    const second = await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pll2Id}:out`, target: `${divId}:in` });

    expect(second.status).toBe(400);
    expect(second.body).toHaveProperty('error');
  });
});

// ==================== TC-CC-CT-010 — POST with nonexistent nodes → 400 ====================

describe('TC-CC-CT-010 — POST connection with nonexistent nodes', () => {
  // @tc TC-CC-CT-010
  // @req REQ-CT-004
  it('should return 400 when source or target node does not exist', async () => {
    const connRes = await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: 'nonexistent-node-id:out', target: 'another-fake-id:in' });

    expect(connRes.status).toBe(400);
    expect(connRes.body).toHaveProperty('error');
  });
});

// ==================== TC-CC-CT-014 — POST to occupied Mux in_0 → 400 ====================

describe('TC-CC-CT-014 — POST connection to occupied Mux in_0', () => {
  // @tc TC-CC-CT-014
  // @req REQ-CT-006
  it('should return 400 when Mux in_0 port is already occupied', async () => {
    const pll1Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 100 } });
    expect(pll1Res.status).toBe(201);
    const pll1Id = pll1Res.body.id as string;

    const pll2Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 200 } });
    expect(pll2Res.status).toBe(201);
    const pll2Id = pll2Res.body.id as string;

    const muxRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Mux', properties: { select_index: 0 } });
    expect(muxRes.status).toBe(201);
    const muxId = muxRes.body.id as string;

    // First connection: pll1 → mux:in_0
    const first = await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pll1Id}:out`, target: `${muxId}:in_0` });
    expect(first.status).toBe(201);

    // Second connection to same Mux in_0 → should fail
    const second = await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pll2Id}:out`, target: `${muxId}:in_0` });

    expect(second.status).toBe(400);
    expect(second.body).toHaveProperty('error');
  });
});

// ==================== TC-CC-CT-031 — DELETE connection → 204, downstream freq=null ====================

describe('TC-CC-CT-031 — DELETE connection nullifies downstream freq', () => {
  // @tc TC-CC-CT-031
  // @req REQ-CT-017
  it('should return 204 and nullify downstream computed_freq', async () => {
    const pllRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 300 } });
    expect(pllRes.status).toBe(201);
    const pllId = pllRes.body.id as string;

    const divRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Divider', properties: { ratio: 2 } });
    expect(divRes.status).toBe(201);
    const divId = divRes.body.id as string;

    const connRes = await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pllId}:out`, target: `${divId}:in` });
    expect(connRes.status).toBe(201);
    const connId = connRes.body.id as string;

    // Verify divider has freq
    const before = await request(app).get(`/api/projects/${projectId}`);
    const divBefore = (before.body.nodes as Array<{ id: string; computed_freq: number | null }>)
      .find(n => n.id === divId);
    expect(divBefore?.computed_freq).toBe(150);

    // Delete connection
    const delRes = await request(app)
      .delete(`/api/projects/${projectId}/connections/${connId}`);
    expect(delRes.status).toBe(204);

    // Divider freq should be null
    const after = await request(app).get(`/api/projects/${projectId}`);
    const divAfter = (after.body.nodes as Array<{ id: string; computed_freq: number | null }>)
      .find(n => n.id === divId);
    expect(divAfter?.computed_freq).toBeNull();
  });
});

// ==================== TC-CC-CT-032 — DELETE nonexistent connection → 404 ====================

describe('TC-CC-CT-032 — DELETE nonexistent connection', () => {
  // @tc TC-CC-CT-032
  // @req REQ-CT-017
  it('should return 404 when deleting a connection that does not exist', async () => {
    const res = await request(app)
      .delete(`/api/projects/${projectId}/connections/nonexistent-conn-id`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// ============================================================
// ANALYSIS
// ============================================================

// ==================== TC-CC-CT-021 — GET cdc with cross-domain → non-empty crossings ====================

describe('TC-CC-CT-021 — CDC analysis with cross-domain connection', () => {
  // @tc TC-CC-CT-021
  // @req REQ-CT-010
  it('should return non-empty crossings when two clock domains connect to the same node', async () => {
    // CDC algorithm assigns domain membership via BFS from ClockDomain output ports.
    // ClockDomain nodes themselves are NOT members, so we need intermediate nodes
    // (Dividers) that gain membership, then connect them to a shared Mux.
    //
    // Graph:  PLL1 → DomainA → Div1 ──→ Mux:in_0
    //         PLL2 → DomainB → Div2 ──→ Mux:in_1
    //
    // BFS from DomainA visits: Div1 (∈A), Mux (∈A)
    // BFS from DomainB visits: Div2 (∈B), Mux (∈B)
    // Edge Div1→Mux: src={A}, tgt={A,B} → crossing (A→B)
    // Edge Div2→Mux: src={B}, tgt={A,B} → crossing (B→A)

    const pll1Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 100 } });
    expect(pll1Res.status).toBe(201);
    const pll1Id = pll1Res.body.id as string;

    const pll2Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 200 } });
    expect(pll2Res.status).toBe(201);
    const pll2Id = pll2Res.body.id as string;

    const domARes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'ClockDomain', properties: { domain_name: 'DomainA' } });
    expect(domARes.status).toBe(201);
    const domAId = domARes.body.id as string;

    const domBRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'ClockDomain', properties: { domain_name: 'DomainB' } });
    expect(domBRes.status).toBe(201);
    const domBId = domBRes.body.id as string;

    // Intermediate Dividers — these will gain domain membership via BFS
    const div1Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Divider', properties: { ratio: 2 } });
    expect(div1Res.status).toBe(201);
    const div1Id = div1Res.body.id as string;

    const div2Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Divider', properties: { ratio: 4 } });
    expect(div2Res.status).toBe(201);
    const div2Id = div2Res.body.id as string;

    // Shared Mux receives from both domains
    const muxRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Mux', properties: { select_index: 0 } });
    expect(muxRes.status).toBe(201);
    const muxId = muxRes.body.id as string;

    // PLL → ClockDomain
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pll1Id}:out`, target: `${domAId}:in` });
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pll2Id}:out`, target: `${domBId}:in` });

    // ClockDomain → Divider (Dividers gain domain membership)
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${domAId}:out_0`, target: `${div1Id}:in` });
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${domBId}:out_0`, target: `${div2Id}:in` });

    // Divider → Mux (cross-domain: Div1∈A → Mux∈{A,B} and Div2∈B → Mux∈{A,B})
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${div1Id}:out`, target: `${muxId}:in_0` });
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${div2Id}:out`, target: `${muxId}:in_1` });

    const cdcRes = await request(app)
      .get(`/api/projects/${projectId}/analysis/cdc`);

    expect(cdcRes.status).toBe(200);
    expect(cdcRes.body).toHaveProperty('crossings');
    expect(Array.isArray(cdcRes.body.crossings)).toBe(true);
    expect(cdcRes.body.crossings.length).toBeGreaterThan(0);
  });
});

// ==================== TC-CC-CT-022 — GET cdc single domain → empty crossings ====================

describe('TC-CC-CT-022 — CDC analysis with single domain', () => {
  // @tc TC-CC-CT-022
  // @req REQ-CT-010
  it('should return empty crossings array when all nodes belong to the same domain', async () => {
    // Single PLL → ClockDomain → IPBlock (no cross-domain)
    const pllRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 100 } });
    expect(pllRes.status).toBe(201);
    const pllId = pllRes.body.id as string;

    const domRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'ClockDomain', properties: { domain_name: 'OnlyDomain' } });
    expect(domRes.status).toBe(201);
    const domId = domRes.body.id as string;

    const ipRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'IPBlock', properties: {} });
    expect(ipRes.status).toBe(201);
    const ipId = ipRes.body.id as string;

    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pllId}:out`, target: `${domId}:in` });
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${domId}:out_0`, target: `${ipId}:in` });

    const cdcRes = await request(app)
      .get(`/api/projects/${projectId}/analysis/cdc`);

    expect(cdcRes.status).toBe(200);
    expect(cdcRes.body).toHaveProperty('crossings');
    expect(Array.isArray(cdcRes.body.crossings)).toBe(true);
    expect(cdcRes.body.crossings).toHaveLength(0);
  });
});

// ==================== TC-CC-CT-023 — GET gating → 3 gated, 1 ungated, 75% ====================

describe('TC-CC-CT-023 — Gating analysis: 3 gated, 1 ungated, 75%', () => {
  // @tc TC-CC-CT-023
  // @req REQ-CT-011
  it('should report 3 gated, 1 ungated, total 4, and 75% power reduction', async () => {
    // PLL → ClockGate → 3 IPBlocks (gated)
    // PLL → 1 IPBlock directly (ungated)

    const pllRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 100 } });
    expect(pllRes.status).toBe(201);
    const pllId = pllRes.body.id as string;

    const gateRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'ClockGate', properties: {} });
    expect(gateRes.status).toBe(201);
    const gateId = gateRes.body.id as string;

    // PLL → ClockGate
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pllId}:out`, target: `${gateId}:in` });

    // 3 gated IPBlocks downstream of ClockGate
    const gatedIpIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const ipRes = await request(app)
        .post(`/api/projects/${projectId}/nodes`)
        .send({ type: 'IPBlock', properties: {} });
      expect(ipRes.status).toBe(201);
      gatedIpIds.push(ipRes.body.id as string);
    }

    // Connect ClockGate → each gated IPBlock using unique out ports (ClockGate has single 'out')
    // ClockGate has one output port 'out'; use Mux to fan out to 3 IPBlocks
    const muxRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Mux', properties: { select_index: 0 } });
    expect(muxRes.status).toBe(201);
    const muxId = muxRes.body.id as string;

    // ClockGate:out → Mux:in_0
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${gateId}:out`, target: `${muxId}:in_0` });

    // Mux:out → gatedIPBlock[0]
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${muxId}:out`, target: `${gatedIpIds[0]}:in` });

    // Directly connect ClockGate downstream via Divider chain for the other two gated IPs
    const div1Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'Divider', properties: { ratio: 2 } });
    expect(div1Res.status).toBe(201);
    const div1Id = div1Res.body.id as string;

    // Need another PLL-like source for the gate's output to reach div1
    // Re-use the existing gate output: create a second Mux port path
    // Actually ClockGate only has one 'out' and it is already used. Use Dividers in chain.
    // Architecture: PLL → Gate → Div1 → ip_gated_1
    //                              Div1 → (not possible, Divider has one out)
    // Simplest: PLL → Gate → ip_gated_0, PLL → Gate? No, Gate:out is occupied.
    // Let's restructure: separate PLLs and Gates
    //
    // Restart with a cleaner topology for this project (fresh beforeEach gives clean DB):
    // We'll use one ClockGate feeding into one Divider feeding into 3 IPBlocks via separate paths.
    // But Divider has one output. Use Gate directly → each IPBlock via separate ClockGate copies.
    //
    // Actually the simplest correct topology that satisfies the test expectation:
    // 3 separate ClockGate → IPBlock pairs (3 gated), 1 PLL → IPBlock directly (1 ungated).
    // Since pllId and gateId already exist, let's build a fresh topology using what we have.
    // However we already inserted nodes in this test. We need to handle the connected gate:out→mux.
    //
    // Let's just use 2 more ClockGates (gate2, gate3) for the remaining 2 gated IPBlocks.

    const gate2Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'ClockGate', properties: {} });
    expect(gate2Res.status).toBe(201);
    const gate2Id = gate2Res.body.id as string;

    const gate3Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'ClockGate', properties: {} });
    expect(gate3Res.status).toBe(201);
    const gate3Id = gate3Res.body.id as string;

    // We need sources for gate2 and gate3 — connect Div1:out (Div1 is already inserted but unused)
    // Div1 is unconnected, use two more PLLs
    const pll2Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 100 } });
    expect(pll2Res.status).toBe(201);
    const pll2Id = pll2Res.body.id as string;

    const pll3Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 100 } });
    expect(pll3Res.status).toBe(201);
    const pll3Id = pll3Res.body.id as string;

    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pll2Id}:out`, target: `${gate2Id}:in` });
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pll3Id}:out`, target: `${gate3Id}:in` });

    // gate2 → gatedIpIds[1], gate3 → gatedIpIds[2]
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${gate2Id}:out`, target: `${gatedIpIds[1]}:in` });
    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${gate3Id}:out`, target: `${gatedIpIds[2]}:in` });

    // 1 ungated IPBlock: use a 4th PLL → IPBlock directly
    const pll4Res = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 50 } });
    expect(pll4Res.status).toBe(201);
    const pll4Id = pll4Res.body.id as string;

    const ungatedIpRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'IPBlock', properties: {} });
    expect(ungatedIpRes.status).toBe(201);
    const ungatedIpId = ungatedIpRes.body.id as string;

    await request(app)
      .post(`/api/projects/${projectId}/connections`)
      .send({ source: `${pll4Id}:out`, target: `${ungatedIpId}:in` });

    // Now the project has: 4 IPBlocks total, 3 downstream of ClockGates, 1 directly connected
    const gatingRes = await request(app)
      .get(`/api/projects/${projectId}/analysis/gating`);

    expect(gatingRes.status).toBe(200);
    expect(gatingRes.body.total_count).toBe(4);
    expect(gatingRes.body.gated_count).toBe(3);
    expect(gatingRes.body.ungated_count).toBe(1);
    expect(gatingRes.body.power_reduction_pct).toBe(75);
  });
});
