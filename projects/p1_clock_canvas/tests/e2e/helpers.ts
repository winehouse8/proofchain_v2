// Clock Canvas E2E — Shared test helpers
// API-level setup + UI interaction utilities

import { type Page, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3001/api';

export interface TestProject { id: string; name: string }
export interface TestNode {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  position: { x: number; y: number };
  computed_freq: number | null;
}
export interface TestEdge { id: string; source: string; target: string }

// ==================== API Helpers ====================

export async function cleanAllProjects(request: APIRequestContext): Promise<void> {
  const res = await request.get(`${API}/projects`);
  if (!res.ok()) return;
  const projects = (await res.json()) as TestProject[];
  for (const p of projects) {
    await request.delete(`${API}/projects/${p.id}`);
  }
}

export async function createProject(
  request: APIRequestContext,
  name: string,
): Promise<TestProject> {
  const res = await request.post(`${API}/projects`, { data: { name } });
  return (await res.json()) as TestProject;
}

export async function addNode(
  request: APIRequestContext,
  projectId: string,
  type: string,
  properties: Record<string, unknown>,
  position = { x: 200, y: 200 },
): Promise<TestNode> {
  const res = await request.post(`${API}/projects/${projectId}/nodes`, {
    data: { type, properties, position },
  });
  return (await res.json()) as TestNode;
}

export async function connectPorts(
  request: APIRequestContext,
  projectId: string,
  source: string,
  target: string,
): Promise<TestEdge> {
  const res = await request.post(`${API}/projects/${projectId}/connections`, {
    data: { source, target },
  });
  return (await res.json()) as TestEdge;
}

// ==================== UI Helpers ====================

/** Load project via the Load button and project dialog */
export async function loadProjectInUI(page: Page, projectName: string): Promise<void> {
  await page.click('button:has-text("Load")');
  await page.waitForSelector('.project-list-item', { timeout: 5000 });
  await page.click(`.project-list-item:has-text("${projectName}")`);
  await page.waitForSelector('.dialog-overlay', { state: 'hidden', timeout: 5000 }).catch(() => {});
  // Allow ReactFlow time to render
  await page.waitForTimeout(500);
}

/** Drop a component onto the canvas by directly setting dataTransfer with the node type */
export async function dropNodeOnCanvas(
  page: Page,
  nodeType: string,
  targetX?: number,
  targetY?: number,
): Promise<void> {
  const canvasBox = await page.locator('.react-flow').boundingBox();
  if (!canvasBox) throw new Error('Canvas not found');
  const x = targetX ?? (canvasBox.x + canvasBox.width / 2);
  const y = targetY ?? (canvasBox.y + canvasBox.height / 2);

  await page.evaluate(
    ({ type, dropX, dropY }) => {
      const flowEl = document.querySelector('.react-flow');
      if (!flowEl) throw new Error('React Flow container not found');

      const dt = new DataTransfer();
      dt.setData('application/clock-canvas-type', type);

      flowEl.dispatchEvent(
        new DragEvent('dragover', {
          dataTransfer: dt, bubbles: true, cancelable: true, clientX: dropX, clientY: dropY,
        }),
      );
      flowEl.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt, bubbles: true, cancelable: true, clientX: dropX, clientY: dropY,
        }),
      );
    },
    { type: nodeType, dropX: x, dropY: y },
  );
}

/** Connect two ReactFlow handles using mouse drag operations */
export async function connectHandles(
  page: Page,
  srcNodeId: string,
  srcHandleId: string,
  tgtNodeId: string,
  tgtHandleId: string,
): Promise<void> {
  const srcSelector = `.react-flow__node[data-id="${srcNodeId}"] .react-flow__handle[data-handleid="${srcHandleId}"]`;
  const tgtSelector = `.react-flow__node[data-id="${tgtNodeId}"] .react-flow__handle[data-handleid="${tgtHandleId}"]`;

  const srcBox = await page.locator(srcSelector).first().boundingBox();
  const tgtBox = await page.locator(tgtSelector).first().boundingBox();
  if (!srcBox || !tgtBox) throw new Error(`Handle not found: src=${srcHandleId} tgt=${tgtHandleId}`);

  const sx = srcBox.x + srcBox.width / 2;
  const sy = srcBox.y + srcBox.height / 2;
  const tx = tgtBox.x + tgtBox.width / 2;
  const ty = tgtBox.y + tgtBox.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      sx + (tx - sx) * (i / steps),
      sy + (ty - sy) * (i / steps),
    );
  }
  await page.mouse.up();
}
