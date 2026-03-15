// Clock Tree Engine — Project CRUD API tests
// Covers REQ-CT-012, REQ-CT-013, REQ-CT-014, REQ-CT-015, REQ-CT-019

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, closeDb } from './test-app.js';
import type { Express } from 'express';

let app: Express;

beforeEach(() => {
  app = createTestApp();
});

afterEach(() => {
  closeDb();
});

// ==================== TC-CC-CT-024 — POST /api/projects returns 201 with ID ====================

describe('TC-CC-CT-024 — POST /api/projects creates project', () => {
  // @tc TC-CC-CT-024
  // @req REQ-CT-012
  it('should return 201 with an id when a valid name is provided', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ name: 'Test Project Alpha' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id.length).toBeGreaterThan(0);
    expect(res.body.name).toBe('Test Project Alpha');
    expect(res.body).toHaveProperty('created_at');
    expect(res.body).toHaveProperty('updated_at');
  });
});

// ==================== TC-CC-CT-025 — POST /api/projects without name → 400 ====================

describe('TC-CC-CT-025 — POST /api/projects without name', () => {
  // @tc TC-CC-CT-025
  // @req REQ-CT-012
  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // @tc TC-CC-CT-025
  // @req REQ-CT-012
  it('should return 400 when name is an empty string', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ==================== TC-CC-CT-026 — PUT /api/projects/:id saves state, updates timestamp ====================

describe('TC-CC-CT-026 — PUT /api/projects/:id updates project', () => {
  // @tc TC-CC-CT-026
  // @req REQ-CT-013
  it('should save state and update the updated_at timestamp', async () => {
    // Create project
    const createRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Original Name' });
    expect(createRes.status).toBe(201);
    const projectId = createRes.body.id as string;
    const originalUpdatedAt = createRes.body.updated_at as string;

    // Small delay to ensure timestamp differs
    await new Promise(r => setTimeout(r, 10));

    // Update
    const updateRes = await request(app)
      .put(`/api/projects/${projectId}`)
      .send({ name: 'Updated Name' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Updated Name');
    expect(updateRes.body.id).toBe(projectId);
    // updated_at must be >= original (may equal if same second)
    expect(new Date(updateRes.body.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(originalUpdatedAt).getTime(),
    );
  });
});

// ==================== TC-CC-CT-027 — GET /api/projects/:id returns full graph (round-trip) ====================

describe('TC-CC-CT-027 — GET /api/projects/:id returns full graph', () => {
  // @tc TC-CC-CT-027
  // @req REQ-CT-014
  it('should return the project with nodes and edges arrays (round-trip)', async () => {
    // Create project
    const createRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Graph Project' });
    expect(createRes.status).toBe(201);
    const projectId = createRes.body.id as string;

    // Add a PLL node
    const nodeRes = await request(app)
      .post(`/api/projects/${projectId}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 400 } });
    expect(nodeRes.status).toBe(201);

    // Load full graph
    const getRes = await request(app).get(`/api/projects/${projectId}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(projectId);
    expect(getRes.body.name).toBe('Graph Project');
    expect(Array.isArray(getRes.body.nodes)).toBe(true);
    expect(Array.isArray(getRes.body.edges)).toBe(true);
    expect(getRes.body.nodes).toHaveLength(1);
    expect(getRes.body.nodes[0].type).toBe('PLL');
    expect(getRes.body.nodes[0].properties.output_freq).toBe(400);
    expect(getRes.body.nodes[0].computed_freq).toBe(400);
  });
});

// ==================== TC-CC-CT-028 — GET /api/projects returns list with node_count ====================

describe('TC-CC-CT-028 — GET /api/projects returns list with node_count', () => {
  // @tc TC-CC-CT-028
  // @req REQ-CT-015
  it('should return a list of projects each with a node_count field', async () => {
    // Create two projects
    const p1Res = await request(app)
      .post('/api/projects')
      .send({ name: 'Project One' });
    expect(p1Res.status).toBe(201);
    const p1Id = p1Res.body.id as string;

    const p2Res = await request(app)
      .post('/api/projects')
      .send({ name: 'Project Two' });
    expect(p2Res.status).toBe(201);

    // Add a node to project one
    await request(app)
      .post(`/api/projects/${p1Id}/nodes`)
      .send({ type: 'PLL', properties: { output_freq: 200 } });

    const listRes = await request(app).get('/api/projects');

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThanOrEqual(2);

    const p1 = (listRes.body as Array<{ id: string; node_count: number }>)
      .find(p => p.id === p1Id);
    expect(p1).toBeDefined();
    expect(p1!.node_count).toBe(1);
  });
});

// ==================== TC-CC-CT-034 — DELETE /api/projects/:id → 200, subsequent GET → 404 ====================

describe('TC-CC-CT-034 — DELETE /api/projects/:id deletes project', () => {
  // @tc TC-CC-CT-034
  // @req REQ-CT-019
  it('should return 200 on delete and 404 on subsequent GET', async () => {
    const createRes = await request(app)
      .post('/api/projects')
      .send({ name: 'To Be Deleted' });
    expect(createRes.status).toBe(201);
    const projectId = createRes.body.id as string;

    const delRes = await request(app).delete(`/api/projects/${projectId}`);
    expect(delRes.status).toBe(200);

    const getRes = await request(app).get(`/api/projects/${projectId}`);
    expect(getRes.status).toBe(404);
  });
});

// ==================== TC-CC-CT-035 — Deleted project not in list ====================

describe('TC-CC-CT-035 — Deleted project not in list', () => {
  // @tc TC-CC-CT-035
  // @req REQ-CT-019
  it('should not appear in GET /api/projects after deletion', async () => {
    const createRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Gone Project' });
    expect(createRes.status).toBe(201);
    const projectId = createRes.body.id as string;

    await request(app).delete(`/api/projects/${projectId}`);

    const listRes = await request(app).get('/api/projects');
    expect(listRes.status).toBe(200);
    const ids = (listRes.body as Array<{ id: string }>).map(p => p.id);
    expect(ids).not.toContain(projectId);
  });
});
