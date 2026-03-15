// Canvas Editor — E2E Tests (Canvas Interactions)
// Covers: TC-CC-CV-002, 003, 007, 008, 009, 010, 011, 012, 013, 014, 015, 022, 026

import { test, expect } from '@playwright/test';
import {
  cleanAllProjects,
  createProject,
  addNode,
  connectPorts,
  loadProjectInUI,
  dropNodeOnCanvas,
  connectHandles,
} from '../helpers.js';

// ==================== Drag & Drop ====================

// @tc TC-CC-CV-002
// @req REQ-CV-002
test.describe('TC-CC-CV-002 — DnD from palette creates nodes for all 6 types', () => {
  test('should create 6 nodes by dragging each palette item to canvas', async ({ page, request }) => {
    // GIVEN: Empty project loaded
    await cleanAllProjects(request);
    await createProject(request, 'DnD Test');
    await page.goto('/');
    await loadProjectInUI(page, 'DnD Test');

    const nodeTypes = ['PLL', 'Divider', 'Mux', 'ClockGate', 'IPBlock', 'ClockDomain'];

    // WHEN: Drag each component type to the canvas at distinct positions
    for (let i = 0; i < nodeTypes.length; i++) {
      const canvasBox = await page.locator('.react-flow').boundingBox();
      const x = canvasBox!.x + 200 + i * 80;
      const y = canvasBox!.y + canvasBox!.height / 2;

      await dropNodeOnCanvas(page, nodeTypes[i], x, y);

      // THEN: Node count increases by 1 after each drop
      await expect(page.locator('.react-flow__node')).toHaveCount(i + 1, { timeout: 5000 });
    }

    // THEN: Status bar shows correct count
    await expect(page.locator('text=Nodes: 6')).toBeVisible();
  });
});

// @tc TC-CC-CV-003
// @req REQ-CV-003
test.describe('TC-CC-CV-003 — Drop outside canvas does not create a node', () => {
  test('should not create nodes when dropped on non-canvas areas', async ({ page, request }) => {
    // GIVEN: Empty project loaded with 0 nodes
    await cleanAllProjects(request);
    await createProject(request, 'No Drop');
    await page.goto('/');
    await loadProjectInUI(page, 'No Drop');

    // Helper: dispatch DnD drop event on a specific non-canvas element
    async function dropOnArea(selector: string) {
      await page.evaluate(
        ({ sel, type }) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error(`Element not found: ${sel}`);
          const rect = el.getBoundingClientRect();
          const dt = new DataTransfer();
          dt.setData('application/clock-canvas-type', type);
          el.dispatchEvent(
            new DragEvent('drop', {
              dataTransfer: dt,
              bubbles: true,
              cancelable: true,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
            }),
          );
        },
        { sel: selector, type: 'Divider' },
      );
    }

    // WHEN: Drop on toolbar area
    await dropOnArea('.toolbar');
    await page.waitForTimeout(500);

    // THEN: No nodes created
    expect(await page.locator('.react-flow__node').count()).toBe(0);

    // WHEN: Drop on palette area
    await dropOnArea('.palette');
    await page.waitForTimeout(500);

    // THEN: Still no nodes
    expect(await page.locator('.react-flow__node').count()).toBe(0);

    // WHEN: Drop on property panel area
    await dropOnArea('.property-panel');
    await page.waitForTimeout(500);

    // THEN: Still no nodes
    expect(await page.locator('.react-flow__node').count()).toBe(0);
  });
});

// ==================== Connections ====================

// @tc TC-CC-CV-009
// @req REQ-CV-009
test.describe('TC-CC-CV-009 — Dragging from output to input creates wire', () => {
  test('should create a connection between PLL output and Divider input', async ({ page, request }) => {
    // GIVEN: PLL and Divider on canvas, not connected
    await cleanAllProjects(request);
    const project = await createProject(request, 'Connect');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });
    await page.goto('/');
    await loadProjectInUI(page, 'Connect');
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
    expect(await page.locator('.react-flow__edge').count()).toBe(0);

    // WHEN: Drag from PLL output to Divider input
    await connectHandles(page, pll.id, 'out', div.id, 'in');

    // THEN: Wire appears
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 });
  });
});

// @tc TC-CC-CV-010
// @req REQ-CV-010
test.describe('TC-CC-CV-010 — Preview wire shows during connection drag', () => {
  test('should show a connection line while dragging from output port', async ({ page, request }) => {
    // GIVEN: PLL node on canvas
    await cleanAllProjects(request);
    const project = await createProject(request, 'Preview');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 200, y: 200 });
    await page.goto('/');
    await loadProjectInUI(page, 'Preview');
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });

    // WHEN: Start dragging from PLL output handle without releasing
    const handleSelector = `.react-flow__node[data-id="${pll.id}"] .react-flow__handle[data-handleid="out"]`;
    const handleBox = await page.locator(handleSelector).first().boundingBox();
    if (!handleBox) throw new Error('Handle not found');

    const sx = handleBox.x + handleBox.width / 2;
    const sy = handleBox.y + handleBox.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 100, sy + 50, { steps: 5 });

    // THEN: Connection line preview is visible
    await expect(page.locator('.react-flow__connectionline')).toBeVisible({ timeout: 2000 });

    // Cleanup
    await page.mouse.up();
  });
});

// @tc TC-CC-CV-011
// @req REQ-CV-011
test.describe('TC-CC-CV-011 — Output-to-output connection is rejected', () => {
  test('should not create a wire when connecting two output ports', async ({ page, request }) => {
    // GIVEN: PLL and Divider on canvas (both have output ports)
    await cleanAllProjects(request);
    const project = await createProject(request, 'OutOut');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });
    await page.goto('/');
    await loadProjectInUI(page, 'OutOut');
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    // WHEN: Drag from PLL output to Divider output
    await connectHandles(page, pll.id, 'out', div.id, 'out');
    await page.waitForTimeout(500);

    // THEN: No wire is created (ReactFlow rejects source→source connections)
    expect(await page.locator('.react-flow__edge').count()).toBe(0);
  });
});

// @tc TC-CC-CV-012
// @req REQ-CV-011
test.describe('TC-CC-CV-012 — Input-to-input connection is rejected', () => {
  test('should not create a wire when connecting two input ports', async ({ page, request }) => {
    // GIVEN: Two Dividers on canvas (both have input ports)
    await cleanAllProjects(request);
    const project = await createProject(request, 'InIn');
    const div1 = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 100, y: 200 });
    const div2 = await addNode(request, project.id, 'Divider',
      { name: 'Div2', ratio: 2 }, { x: 400, y: 200 });
    await page.goto('/');
    await loadProjectInUI(page, 'InIn');
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    // WHEN: Drag from Div1 input to Div2 input
    await connectHandles(page, div1.id, 'in', div2.id, 'in');
    await page.waitForTimeout(500);

    // THEN: No wire is created (ReactFlow rejects target→target connections)
    expect(await page.locator('.react-flow__edge').count()).toBe(0);
  });
});

// @tc TC-CC-CV-013
// @req REQ-CV-011
test.describe('TC-CC-CV-013 — Occupied input port connection is rejected with toast', () => {
  test('should show error toast when connecting to already-occupied input', async ({ page, request }) => {
    // GIVEN: PLL1 → Divider connected, PLL2 also on canvas
    await cleanAllProjects(request);
    const project = await createProject(request, 'Occupied');
    const pll1 = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 100 });
    const pll2 = await addNode(request, project.id, 'PLL',
      { name: 'PLL2', output_freq: 200 }, { x: 100, y: 350 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });
    await connectPorts(request, project.id, `${pll1.id}:out`, `${div.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'Occupied');
    await expect(page.locator('.react-flow__node')).toHaveCount(3, { timeout: 5000 });
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 });

    // WHEN: Drag from PLL2 output to Divider input (already occupied)
    await connectHandles(page, pll2.id, 'out', div.id, 'in');

    // THEN: Error toast appears and no new edge created
    await expect(page.locator('.toast--error')).toBeVisible({ timeout: 5000 });
    expect(await page.locator('.react-flow__edge').count()).toBe(1);
  });
});

// @tc TC-CC-CV-014
// @req REQ-CV-011
test.describe('TC-CC-CV-014 — Cycle connection is rejected with toast', () => {
  test('should show error toast when creating a cycle', async ({ page, request }) => {
    // GIVEN: PLL → Div1 → Div2 connected
    await cleanAllProjects(request);
    const project = await createProject(request, 'Cycle');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 50, y: 200 });
    const div1 = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 250, y: 200 });
    const div2 = await addNode(request, project.id, 'Divider',
      { name: 'Div2', ratio: 2 }, { x: 450, y: 200 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${div1.id}:in`);
    await connectPorts(request, project.id, `${div1.id}:out`, `${div2.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'Cycle');
    await expect(page.locator('.react-flow__node')).toHaveCount(3, { timeout: 5000 });
    await expect(page.locator('.react-flow__edge')).toHaveCount(2, { timeout: 5000 });

    // WHEN: Drag from Div2 output to Div1 input (creates cycle)
    await connectHandles(page, div2.id, 'out', div1.id, 'in');

    // THEN: Error toast appears and no new edge
    await expect(page.locator('.toast--error')).toBeVisible({ timeout: 5000 });
    expect(await page.locator('.react-flow__edge').count()).toBe(2);
  });
});

// ==================== Node Operations ====================

// @tc TC-CC-CV-007
// @req REQ-CV-007
test.describe('TC-CC-CV-007 — Delete key removes selected node and connected wires', () => {
  test('should remove node and connected wire on Delete key', async ({ page, request }) => {
    // GIVEN: PLL → Divider connected, Divider selected
    await cleanAllProjects(request);
    const project = await createProject(request, 'Delete');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${div.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'Delete');
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 });

    // WHEN: Click Divider node to select it
    await page.locator(`.react-flow__node[data-id="${div.id}"]`).click();
    await page.waitForTimeout(300);

    // Focus canvas wrapper and press Delete
    await page.locator('.canvas-wrapper').focus();
    await page.keyboard.press('Delete');

    // THEN: Divider node and connected wire are removed
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.react-flow__edge')).toHaveCount(0, { timeout: 5000 });
  });
});

// @tc TC-CC-CV-008
// @req REQ-CV-008
test.describe('TC-CC-CV-008 — Dragging a node updates its position', () => {
  test('should change node position when dragged', async ({ page, request }) => {
    // GIVEN: PLL node on canvas
    await cleanAllProjects(request);
    const project = await createProject(request, 'Drag');
    await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    await page.goto('/');
    await loadProjectInUI(page, 'Drag');
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });

    // Get initial position
    const node = page.locator('.react-flow__node').first();
    const initialBox = await node.boundingBox();
    expect(initialBox).toBeTruthy();

    // WHEN: Drag node 150px right and 100px down
    const startX = initialBox!.x + initialBox!.width / 2;
    const startY = initialBox!.y + initialBox!.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 150, startY + 100, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // THEN: Node position has changed
    const finalBox = await node.boundingBox();
    expect(finalBox).toBeTruthy();
    expect(finalBox!.x).toBeGreaterThan(initialBox!.x + 100);
    expect(finalBox!.y).toBeGreaterThan(initialBox!.y + 50);
  });
});

// @tc TC-CC-CV-015
// @req REQ-CV-012
test.describe('TC-CC-CV-015 — Select wire + Delete removes it', () => {
  test('should remove wire when selected and Delete pressed', async ({ page, request }) => {
    // GIVEN: PLL → Divider connected
    await cleanAllProjects(request);
    const project = await createProject(request, 'WireDel');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${div.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'WireDel');
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 });

    // WHEN: Click on edge to select it (force needed for SVG edge elements)
    const edge = page.locator('.react-flow__edge').first();
    await edge.click({ force: true });
    await page.waitForTimeout(300);

    // Focus canvas wrapper and press Delete
    await page.locator('.canvas-wrapper').focus();
    await page.keyboard.press('Delete');

    // THEN: Edge is removed, nodes remain
    await expect(page.locator('.react-flow__edge')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(2);
  });
});

// @tc TC-CC-CV-022
// @req REQ-CV-014
test.describe('TC-CC-CV-022 — Edit PLL output_freq updates downstream frequency', () => {
  test('should update node label and downstream freq when editing output_freq', async ({ page, request }) => {
    // GIVEN: PLL (100 MHz) → Divider (ratio 2, freq = 50 MHz)
    await cleanAllProjects(request);
    const project = await createProject(request, 'EditFreq');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${div.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'EditFreq');
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    // Verify initial frequency labels on canvas
    await expect(page.locator('.clock-node-freq', { hasText: '100.000 MHz' })).toBeAttached();
    await expect(page.locator('.clock-node-freq', { hasText: '50.000 MHz' })).toBeAttached();

    // WHEN: Click PLL node to select it and edit output_freq
    await page.locator(`.react-flow__node[data-id="${pll.id}"]`).click();
    await expect(page.locator('text=Properties - PLL')).toBeVisible({ timeout: 3000 });

    // Find the Output Freq input and change to 400
    const freqInput = page.locator('.property-panel input[type="number"]').first();
    await freqInput.click({ clickCount: 3 });
    await freqInput.fill('400');
    await freqInput.press('Enter');
    await page.waitForTimeout(1000);

    // THEN: PLL shows 400 MHz, Divider shows 200 MHz (use toBeAttached — fitView may hide nodes)
    await expect(page.locator('.clock-node-freq', { hasText: '400.000 MHz' })).toBeAttached({ timeout: 5000 });
    await expect(page.locator('.clock-node-freq', { hasText: '200.000 MHz' })).toBeAttached({ timeout: 5000 });
  });
});

// @tc TC-CC-CV-026
// @req REQ-CV-017
test.describe('TC-CC-CV-026 — Dragging on empty canvas pans the viewport', () => {
  test('should pan viewport when dragging on empty canvas area', async ({ page, request }) => {
    // GIVEN: Canvas with one node
    await cleanAllProjects(request);
    const project = await createProject(request, 'Pan');
    await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 100 });
    await page.goto('/');
    await loadProjectInUI(page, 'Pan');
    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 5000 });

    // Get initial node screen position
    const initialBox = await page.locator('.react-flow__node').first().boundingBox();
    expect(initialBox).toBeTruthy();

    // WHEN: Drag on empty canvas area far from the node
    const canvasBox = await page.locator('.react-flow').boundingBox();
    const startX = canvasBox!.x + canvasBox!.width - 100;
    const startY = canvasBox!.y + canvasBox!.height - 100;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY + 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // THEN: Node screen position shifted (viewport panned)
    const finalBox = await page.locator('.react-flow__node').first().boundingBox();
    expect(finalBox).toBeTruthy();
    const deltaX = finalBox!.x - initialBox!.x;
    const deltaY = finalBox!.y - initialBox!.y;
    expect(Math.abs(deltaX - 100)).toBeLessThan(20);
    expect(Math.abs(deltaY - 50)).toBeLessThan(20);
  });
});
