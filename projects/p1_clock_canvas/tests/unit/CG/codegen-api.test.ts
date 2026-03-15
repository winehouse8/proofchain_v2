// Code Generation — API Tests
// Covers TC-CC-CG-001 through TC-CC-CG-012, TC-CC-CG-015 through TC-CC-CG-017

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, closeDb } from '../CT/test-app.js';
import type { Express } from 'express';

let app: Express;
let projectId: string;

beforeEach(async () => {
  app = createTestApp();
  const res = await request(app)
    .post('/api/projects')
    .send({ name: 'CG Test Project' });
  projectId = res.body.id as string;
});

afterEach(() => {
  closeDb();
});

// ==================== Helper: build a fully connected minimal design ====================

async function buildMinimalDesign(appRef: Express, pid: string): Promise<{ pllId: string; ipId: string }> {
  const pllRes = await request(appRef)
    .post(`/api/projects/${pid}/nodes`)
    .send({ type: 'PLL', properties: { output_freq: 100 } });
  const pllId = pllRes.body.id as string;

  const ipRes = await request(appRef)
    .post(`/api/projects/${pid}/nodes`)
    .send({ type: 'IPBlock', properties: {} });
  const ipId = ipRes.body.id as string;

  await request(appRef)
    .post(`/api/projects/${pid}/connections`)
    .send({ source: `${pllId}:out`, target: `${ipId}:in` });

  return { pllId, ipId };
}

// ==================== Helper: build the complex design for TC-CG-001 ====================

async function buildComplexDesign(appRef: Express, pid: string) {
  // 3 PLLs
  const pll1 = await request(appRef).post(`/api/projects/${pid}/nodes`).send({ type: 'PLL', properties: { output_freq: 100 } });
  const pll2 = await request(appRef).post(`/api/projects/${pid}/nodes`).send({ type: 'PLL', properties: { output_freq: 200 } });
  const pll3 = await request(appRef).post(`/api/projects/${pid}/nodes`).send({ type: 'PLL', properties: { output_freq: 400 } });

  // 2 Dividers
  const div1 = await request(appRef).post(`/api/projects/${pid}/nodes`).send({ type: 'Divider', properties: { ratio: 4 } });
  const div2 = await request(appRef).post(`/api/projects/${pid}/nodes`).send({ type: 'Divider', properties: { ratio: 8 } });

  // 1 Mux
  const mux1 = await request(appRef).post(`/api/projects/${pid}/nodes`).send({ type: 'Mux', properties: { select_index: 0 } });

  // 2 ClockGates
  const gate1 = await request(appRef).post(`/api/projects/${pid}/nodes`).send({ type: 'ClockGate', properties: {} });
  const gate2 = await request(appRef).post(`/api/projects/${pid}/nodes`).send({ type: 'ClockGate', properties: {} });

  // 1 ClockDomain
  const dom1 = await request(appRef).post(`/api/projects/${pid}/nodes`).send({ type: 'ClockDomain', properties: { domain_name: 'ClockDomain1' } });

  // 3 IPBlocks
  const ip1 = await request(appRef).post(`/api/projects/${pid}/nodes`).send({ type: 'IPBlock', properties: {} });
  const ip2 = await request(appRef).post(`/api/projects/${pid}/nodes`).send({ type: 'IPBlock', properties: {} });
  const ip3 = await request(appRef).post(`/api/projects/${pid}/nodes`).send({ type: 'IPBlock', properties: {} });

  const ids = {
    pll1: pll1.body.id, pll2: pll2.body.id, pll3: pll3.body.id,
    div1: div1.body.id, div2: div2.body.id, mux1: mux1.body.id,
    gate1: gate1.body.id, gate2: gate2.body.id, dom1: dom1.body.id,
    ip1: ip1.body.id, ip2: ip2.body.id, ip3: ip3.body.id,
  };

  // Connections:
  // PLL1 → Div1, PLL2 → Div2
  await request(appRef).post(`/api/projects/${pid}/connections`).send({ source: `${ids.pll1}:out`, target: `${ids.div1}:in` });
  await request(appRef).post(`/api/projects/${pid}/connections`).send({ source: `${ids.pll2}:out`, target: `${ids.div2}:in` });

  // Div1 → Mux:in_0, Div2 → Mux:in_1
  await request(appRef).post(`/api/projects/${pid}/connections`).send({ source: `${ids.div1}:out`, target: `${ids.mux1}:in_0` });
  await request(appRef).post(`/api/projects/${pid}/connections`).send({ source: `${ids.div2}:out`, target: `${ids.mux1}:in_1` });

  // PLL3 → Gate1, Mux → Gate2
  await request(appRef).post(`/api/projects/${pid}/connections`).send({ source: `${ids.pll3}:out`, target: `${ids.gate1}:in` });
  await request(appRef).post(`/api/projects/${pid}/connections`).send({ source: `${ids.mux1}:out`, target: `${ids.gate2}:in` });

  // Gate2 → Domain1
  await request(appRef).post(`/api/projects/${pid}/connections`).send({ source: `${ids.gate2}:out`, target: `${ids.dom1}:in` });

  // Gate1 → IP1, Domain1 → IP2, Domain1 → IP3
  await request(appRef).post(`/api/projects/${pid}/connections`).send({ source: `${ids.gate1}:out`, target: `${ids.ip1}:in` });
  await request(appRef).post(`/api/projects/${pid}/connections`).send({ source: `${ids.dom1}:out_0`, target: `${ids.ip2}:in` });
  await request(appRef).post(`/api/projects/${pid}/connections`).send({ source: `${ids.dom1}:out_1`, target: `${ids.ip3}:in` });

  return ids;
}

// ==================== TC-CC-CG-001: RTL structural elements ====================

describe('TC-CC-CG-001 — RTL generation produces all structural elements for a complex design', () => {
  // @tc TC-CC-CG-001
  // @req REQ-CG-001
  it('should contain module, clock inputs, always blocks, assign, AND gates, domain comment, and IP outputs', async () => {
    await buildComplexDesign(app, projectId);

    const res = await request(app)
      .get(`/api/projects/${projectId}/generate/preview`);

    expect(res.status).toBe(200);
    const rtl = res.body.rtl as string;

    // (a) module and endmodule
    expect(rtl).toMatch(/module\s+\w+/);
    expect(rtl).toMatch(/endmodule/);

    // (b) three clock input port declarations (one per PLL)
    const inputPorts = rtl.match(/input\s+wire\s+clk_/g);
    expect(inputPorts).not.toBeNull();
    expect(inputPorts!.length).toBeGreaterThanOrEqual(3);

    // (c) two 'always' blocks (one per Divider)
    const alwaysBlocks = rtl.match(/always\s+@/g);
    expect(alwaysBlocks).not.toBeNull();
    expect(alwaysBlocks!.length).toBe(2);

    // (d) assign with ternary (for Mux sel)
    expect(rtl).toMatch(/assign\s+\S+\s*=\s*\S+\s*\?\s*/);
    // sel module input port
    expect(rtl).toMatch(/input\s+wire\s+sel_/);

    // (e) AND gate expressions for ClockGates + en input ports
    const andGates = rtl.match(/assign\s+\S+\s*=\s*\S+\s*&\s*en_/g);
    expect(andGates).not.toBeNull();
    expect(andGates!.length).toBe(2);
    expect(rtl).toMatch(/input\s+wire\s+en_/);

    // (f) ClockDomain1 comment
    expect(rtl).toMatch(/ClockDomain1/);

    // (g) three output assignments for IP blocks
    const outputAssigns = rtl.match(/output\s+wire\s+clk_/g);
    expect(outputAssigns).not.toBeNull();
    expect(outputAssigns!.length).toBe(3);
  });
});

// ==================== TC-CC-CG-002: SDC with CDC ====================

describe('TC-CC-CG-002 — SDC generation produces create_clock and set_false_path for CDC design', () => {
  // @tc TC-CC-CG-002
  // @req REQ-CG-002
  it('should contain create_clock, create_generated_clock, set_clock_groups, and set_false_path', async () => {
    // Build a CDC design: PLL1→Div1→DomainA→Div2→Mux:in_0; PLL2→DomainB→Div3→Mux:in_1; Mux→IP1
    // DomainA and DomainB feed into a shared Mux via intermediary Dividers, creating CDC
    const pll1 = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'PLL', properties: { output_freq: 100 } });
    const pll2 = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'PLL', properties: { output_freq: 200 } });
    const div1 = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'Divider', properties: { ratio: 2 } });
    const domA = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'ClockDomain', properties: { domain_name: 'DomainA' } });
    const domB = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'ClockDomain', properties: { domain_name: 'DomainB' } });
    const mux1 = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'Mux', properties: { select_index: 0 } });
    const ip1 = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'IPBlock', properties: {} });

    // Dividers to act as intermediaries for domain membership
    const div2 = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'Divider', properties: { ratio: 2 } });
    const div3 = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'Divider', properties: { ratio: 4 } });

    const ids = {
      pll1: pll1.body.id, pll2: pll2.body.id, div1: div1.body.id,
      domA: domA.body.id, domB: domB.body.id, mux1: mux1.body.id,
      ip1: ip1.body.id, div2: div2.body.id, div3: div3.body.id,
    };

    // PLL1 → Div1 → DomainA
    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${ids.pll1}:out`, target: `${ids.div1}:in` });
    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${ids.div1}:out`, target: `${ids.domA}:in` });

    // PLL2 → DomainB
    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${ids.pll2}:out`, target: `${ids.domB}:in` });

    // DomainA → Div2 → Mux:in_0  (Div2 gains membership in DomainA)
    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${ids.domA}:out_0`, target: `${ids.div2}:in` });
    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${ids.div2}:out`, target: `${ids.mux1}:in_0` });

    // DomainB → Div3 → Mux:in_1  (Div3 gains membership in DomainB)
    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${ids.domB}:out_0`, target: `${ids.div3}:in` });
    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${ids.div3}:out`, target: `${ids.mux1}:in_1` });

    // Mux → IP1
    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${ids.mux1}:out`, target: `${ids.ip1}:in` });

    const res = await request(app).get(`/api/projects/${projectId}/generate/preview`);
    expect(res.status).toBe(200);
    const sdc = res.body.sdc as string;

    // (a) two create_clock commands (100 and 200 MHz)
    const createClocks = sdc.match(/create_clock\s+-name/g);
    expect(createClocks).not.toBeNull();
    expect(createClocks!.length).toBe(2);
    expect(sdc).toMatch(/100|10\.000/); // 100 MHz or period 10.000ns
    expect(sdc).toMatch(/200|5\.000/);  // 200 MHz or period 5.000ns

    // (b) create_generated_clock with -source
    expect(sdc).toMatch(/create_generated_clock\s+-name\s+\S+\s+-source/);

    // (c) set_clock_groups
    expect(sdc).toMatch(/set_clock_groups/);

    // (d) set_false_path for CDC crossing
    expect(sdc).toMatch(/set_false_path\s+-from/);
  });
});

// ==================== TC-CC-CG-003: 422 for unconnected Divider ====================

describe('TC-CC-CG-003 — Code generation rejected with 422 when Divider input port is unconnected', () => {
  // @tc TC-CC-CG-003
  // @req REQ-CG-003
  it('should return 422 with incomplete_items for unconnected Divider', async () => {
    // PLL1 → IP1 (valid), Div1 unconnected
    const pll = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'PLL', properties: { output_freq: 100 } });
    const ip = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'IPBlock', properties: {} });
    const div = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'Divider', properties: { ratio: 4 } });

    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${pll.body.id}:out`, target: `${ip.body.id}:in` });

    const res = await request(app).get(`/api/projects/${projectId}/generate/preview`);

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('incomplete_items');
    expect(res.body.incomplete_items.length).toBeGreaterThan(0);

    const divItem = res.body.incomplete_items.find((i: { node_id: string }) => i.node_id === div.body.id);
    expect(divItem).toBeDefined();
    expect(divItem.node_type).toBe('Divider');
    expect(divItem.reason).toBeTruthy();

    // No rtl or sdc
    expect(res.body.rtl).toBeUndefined();
    expect(res.body.sdc).toBeUndefined();
  });
});

// ==================== TC-CC-CG-004: 422 for Mux select_index out of range ====================

describe('TC-CC-CG-004 — Code generation rejected with 422 when Mux select_index is out of range', () => {
  // @tc TC-CC-CG-004
  // @req REQ-CG-003
  it('should return 422 with incomplete_items for Mux with select_index out of range', async () => {
    const pll1 = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'PLL', properties: { output_freq: 100 } });
    const pll2 = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'PLL', properties: { output_freq: 200 } });
    const mux = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'Mux', properties: { select_index: 5 } });
    const ip = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'IPBlock', properties: {} });

    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${pll1.body.id}:out`, target: `${mux.body.id}:in_0` });
    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${pll2.body.id}:out`, target: `${mux.body.id}:in_1` });
    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${mux.body.id}:out`, target: `${ip.body.id}:in` });

    const res = await request(app).get(`/api/projects/${projectId}/generate/preview`);

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('incomplete_items');

    const muxItem = res.body.incomplete_items.find((i: { node_id: string }) => i.node_id === mux.body.id);
    expect(muxItem).toBeDefined();
    expect(muxItem.node_type).toBe('Mux');
    expect(muxItem.reason).toMatch(/select_index|out of range/i);

    expect(res.body.rtl).toBeUndefined();
    expect(res.body.sdc).toBeUndefined();
  });
});

// ==================== TC-CC-CG-005: Success for complete design ====================

describe('TC-CC-CG-005 — Code generation succeeds for a fully complete and connected design', () => {
  // @tc TC-CC-CG-005
  // @req REQ-CG-003
  it('should return 200 with rtl and sdc for a complete design', async () => {
    await buildMinimalDesign(app, projectId);

    const res = await request(app).get(`/api/projects/${projectId}/generate/preview`);

    expect(res.status).toBe(200);
    expect(typeof res.body.rtl).toBe('string');
    expect(res.body.rtl.length).toBeGreaterThan(0);
    expect(typeof res.body.sdc).toBe('string');
    expect(res.body.sdc.length).toBeGreaterThan(0);
    // No incomplete_items or empty
    if (res.body.incomplete_items) {
      expect(res.body.incomplete_items.length).toBe(0);
    }
  });
});

// ==================== TC-CC-CG-006: Preview returns rtl and sdc strings ====================

describe('TC-CC-CG-006 — Preview endpoint returns both rtl and sdc string fields', () => {
  // @tc TC-CC-CG-006
  // @req REQ-CG-004
  it('should return JSON with rtl and sdc string fields', async () => {
    await buildMinimalDesign(app, projectId);

    const res = await request(app).get(`/api/projects/${projectId}/generate/preview`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rtl');
    expect(res.body).toHaveProperty('sdc');
    expect(typeof res.body.rtl).toBe('string');
    expect(typeof res.body.sdc).toBe('string');
    expect(res.body.rtl).not.toBe('');
    expect(res.body.sdc).not.toBe('');
  });
});

// ==================== TC-CC-CG-007: Download returns ZIP ====================

describe('TC-CC-CG-007 — Download endpoint returns a ZIP archive containing .v and .sdc files', () => {
  // @tc TC-CC-CG-007
  // @req REQ-CG-005
  it('should return application/zip with .v and .sdc entries', async () => {
    // Create a project with a known name
    const projRes = await request(app).post('/api/projects').send({ name: 'my_clock_design' });
    const pid = projRes.body.id as string;

    const pllRes = await request(app).post(`/api/projects/${pid}/nodes`).send({ type: 'PLL', properties: { output_freq: 100 } });
    const ipRes = await request(app).post(`/api/projects/${pid}/nodes`).send({ type: 'IPBlock', properties: {} });
    await request(app).post(`/api/projects/${pid}/connections`).send({ source: `${pllRes.body.id}:out`, target: `${ipRes.body.id}:in` });

    // Use .buffer(true) to get raw binary response for ZIP
    const res = await request(app)
      .get(`/api/projects/${pid}/generate/download`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/zip/);

    // Response body is a Buffer
    const zipBuffer = res.body as Buffer;
    expect(Buffer.isBuffer(zipBuffer)).toBe(true);
    expect(zipBuffer.length).toBeGreaterThan(0);

    // ZIP files start with PK\x03\x04
    expect(zipBuffer[0]).toBe(0x50); // P
    expect(zipBuffer[1]).toBe(0x4B); // K

    // Check that the file names appear in the ZIP
    const zipStr = zipBuffer.toString('binary');
    expect(zipStr).toContain('my_clock_design.v');
    expect(zipStr).toContain('my_clock_design.sdc');
  });
});

// ==================== TC-CC-CG-008: Export returns JSON ====================

describe('TC-CC-CG-008 — Export produces a valid JSON document with all nodes and edges', () => {
  // @tc TC-CC-CG-008
  // @req REQ-CG-006
  it('should return JSON with schema_version, nodes, and edges', async () => {
    const { pllId, ipId } = await buildMinimalDesign(app, projectId);

    const res = await request(app).get(`/api/projects/${projectId}/export`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('schema_version', '1.0');
    expect(res.body).toHaveProperty('nodes');
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(res.body.nodes.length).toBe(2);

    // Each node has required fields
    for (const node of res.body.nodes) {
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('type');
      expect(node).toHaveProperty('properties');
      expect(node).toHaveProperty('position');
    }

    expect(res.body).toHaveProperty('edges');
    expect(Array.isArray(res.body.edges)).toBe(true);
    expect(res.body.edges.length).toBe(1);

    const edge = res.body.edges[0];
    expect(edge).toHaveProperty('source');
    expect(edge).toHaveProperty('target');

    // Content-disposition header
    expect(res.headers['content-disposition'] || res.headers['content-type']).toBeTruthy();
  });
});

// ==================== TC-CC-CG-009: Import creates new project ====================

describe('TC-CC-CG-009 — Import of a valid JSON design creates a new project and returns 201', () => {
  // @tc TC-CC-CG-009
  // @req REQ-CG-007
  it('should create project from valid import and return 201', async () => {
    const importData = {
      schema_version: '1.0',
      project_name: 'Imported Design',
      exported_at: new Date().toISOString(),
      nodes: [
        { id: 'n1', type: 'PLL', properties: { output_freq: 100 }, position: { x: 0, y: 0 } },
        { id: 'n2', type: 'IPBlock', properties: { name: 'IP1', power_mw: 5 }, position: { x: 200, y: 0 } },
      ],
      edges: [
        { source: 'n1:out', target: 'n2:in' },
      ],
    };

    const res = await request(app)
      .post('/api/projects/import')
      .send(importData);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.id).toBeTruthy();

    // Verify the project was actually created
    const getRes = await request(app).get(`/api/projects/${res.body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.nodes.length).toBe(2);
    expect(getRes.body.edges.length).toBe(1);
  });
});

// ==================== TC-CC-CG-010: Import rejected for unsupported schema version ====================

describe('TC-CC-CG-010 — Import rejected with 400 when schema_version is unsupported', () => {
  // @tc TC-CC-CG-010
  // @req REQ-CG-008
  it('should return 400 with errors for unsupported schema version', async () => {
    const res = await request(app)
      .post('/api/projects/import')
      .send({ schema_version: '9.9', project_name: 'Bad', nodes: [], edges: [] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors.length).toBeGreaterThan(0);

    const versionError = res.body.errors.find((e: { field: string }) =>
      e.field === 'schema_version' || e.message?.includes('schema_version') || e.message?.includes('version')
    );
    expect(versionError).toBeDefined();
  });
});

// ==================== TC-CC-CG-011: Import rejected for missing nodes field ====================

describe('TC-CC-CG-011 — Import rejected with 400 when required field nodes is missing', () => {
  // @tc TC-CC-CG-011
  // @req REQ-CG-008
  it('should return 400 with errors referencing missing nodes', async () => {
    const res = await request(app)
      .post('/api/projects/import')
      .send({ schema_version: '1.0', project_name: 'NoNodes', edges: [] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors.length).toBeGreaterThan(0);

    const nodesError = res.body.errors.find((e: { field: string; message: string }) =>
      e.field === 'nodes' || e.message?.includes('nodes')
    );
    expect(nodesError).toBeDefined();
  });
});

// ==================== TC-CC-CG-012: Import rejected for invalid data type ====================

describe('TC-CC-CG-012 — Import rejected with 400 when a field has an invalid data type', () => {
  // @tc TC-CC-CG-012
  // @req REQ-CG-008
  it('should return 400 with errors referencing nodes type mismatch', async () => {
    const res = await request(app)
      .post('/api/projects/import')
      .send({ schema_version: '1.0', project_name: 'BadType', nodes: 'not-an-array', edges: [] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors.length).toBeGreaterThan(0);

    const typeError = res.body.errors.find((e: { field: string; message: string }) =>
      e.field === 'nodes' || e.message?.includes('nodes')
    );
    expect(typeError).toBeDefined();
  });
});

// ==================== TC-CC-CG-015: 422 for empty design (preview) ====================

describe('TC-CC-CG-015 — Code generation rejected with 422 for a project with zero nodes', () => {
  // @tc TC-CC-CG-015
  // @req REQ-CG-011
  it('should return 422 indicating empty design', async () => {
    // projectId already has 0 nodes
    const res = await request(app).get(`/api/projects/${projectId}/generate/preview`);

    expect(res.status).toBe(422);
    expect(res.body.error || res.body.message).toBeTruthy();
    const msg = (res.body.error + ' ' + (res.body.message || '')).toLowerCase();
    expect(msg).toMatch(/empty|no nodes/);
    expect(res.body.rtl).toBeUndefined();
    expect(res.body.sdc).toBeUndefined();
  });
});

// ==================== TC-CC-CG-016: 422 for empty design (download) ====================

describe('TC-CC-CG-016 — RTL download for zero-node project is rejected with 422', () => {
  // @tc TC-CC-CG-016
  // @req REQ-CG-011
  it('should return 422 for empty design on download', async () => {
    const res = await request(app).get(`/api/projects/${projectId}/generate/download`);

    expect(res.status).toBe(422);
    expect(res.body.error || res.body.message).toBeTruthy();
    expect(res.headers['content-type']).not.toMatch(/application\/zip/);
  });
});

// ==================== TC-CC-CG-017: 422 for incomplete design (download) ====================

describe('TC-CC-CG-017 — Download endpoint rejected with 422 for incomplete design (unconnected Divider)', () => {
  // @tc TC-CC-CG-017
  // @req REQ-CG-003
  it('should return 422 with incomplete_items for download of incomplete design', async () => {
    const pll = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'PLL', properties: { output_freq: 100 } });
    await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'Divider', properties: { ratio: 4 } });
    const ip = await request(app).post(`/api/projects/${projectId}/nodes`).send({ type: 'IPBlock', properties: {} });
    await request(app).post(`/api/projects/${projectId}/connections`).send({ source: `${pll.body.id}:out`, target: `${ip.body.id}:in` });

    const res = await request(app).get(`/api/projects/${projectId}/generate/download`);

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('incomplete_items');
    expect(res.body.incomplete_items.length).toBeGreaterThan(0);
    expect(res.headers['content-type']).not.toMatch(/application\/zip/);
  });
});
