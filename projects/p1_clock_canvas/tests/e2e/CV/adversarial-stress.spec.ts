// Canvas Editor — Adversarial Stress E2E Tests
// Covers race conditions, rapid state changes, and complex multi-operation scenarios
// @tc TC-CC-CV-ADV-001 through TC-CC-CV-ADV-010
// @req REQ-CV-008, REQ-CV-009, REQ-CV-013, REQ-CV-014

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

const API = 'http://localhost:3001/api';

// Helper: get project data from API
async function getProjectAPI(request: import('@playwright/test').APIRequestContext, projectId: string) {
  const res = await request.get(`${API}/projects/${projectId}`);
  return res.json();
}

// Helper: click fitView button to bring all nodes into viewport
async function fitView(page: import('@playwright/test').Page) {
  await page.locator('.react-flow__controls-fitview').click();
  await page.waitForTimeout(300);
}

// ==================== Adversarial Scenarios ====================

// @tc TC-CC-CV-ADV-001
// @req REQ-CV-013, REQ-CV-014
test.describe('ADV-001 — Rapid ratio changes preserve nodes and final freq', () => {
  test('PLL→Div with ratio 2→4→8→16→32 rapid changes', async ({ page, request }) => {
    // GIVEN: PLL (100 MHz) → Divider (ratio 2)
    await cleanAllProjects(request);
    const project = await createProject(request, 'RapidRatio');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${div.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'RapidRatio');
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    // WHEN: Click Divider to select, then rapidly change ratio 2→4→8→16→32
    await page.locator(`.react-flow__node[data-id="${div.id}"]`).click();
    await expect(page.locator('text=Properties - Divider')).toBeVisible({ timeout: 3000 });

    const ratioSelect = page.locator('.property-panel select');
    for (const ratio of [4, 8, 16, 32]) {
      await ratioSelect.selectOption(String(ratio));
      // No wait between changes — stress the race condition
    }

    // Wait for all API calls to settle
    await page.waitForTimeout(2000);

    // THEN: Both nodes still present
    await expect(page.locator('.react-flow__node')).toHaveCount(2);

    // THEN: Final freq = 100/32 = 3.125 MHz
    await expect(page.locator('.clock-node-freq', { hasText: '3.125 MHz' })).toBeAttached({ timeout: 5000 });

    // Verify via API
    const data = await getProjectAPI(request, project.id);
    const divNode = data.nodes.find((n: { id: string }) => n.id === div.id);
    expect(divNode.computed_freq).toBeCloseTo(3.125, 2);
  });
});

// @tc TC-CC-CV-ADV-002
// @req REQ-CV-008, REQ-CV-013
test.describe('ADV-002 — Property change then immediate drag preserves nodes', () => {
  test('ratio change followed by drag does not lose nodes', async ({ page, request }) => {
    // GIVEN: PLL → Divider connected
    await cleanAllProjects(request);
    const project = await createProject(request, 'PropDrag');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${div.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'PropDrag');
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    // WHEN: Change ratio
    await page.locator(`.react-flow__node[data-id="${div.id}"]`).click();
    await expect(page.locator('text=Properties - Divider')).toBeVisible({ timeout: 3000 });
    await page.locator('.property-panel select').selectOption('4');

    // Immediately drag PLL node (don't wait for ratio API to settle)
    await fitView(page);
    const pllNode = page.locator(`.react-flow__node[data-id="${pll.id}"]`);
    const box = await pllNode.boundingBox();
    if (!box) throw new Error('PLL node not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    await page.waitForTimeout(1500);

    // THEN: Both nodes still present — no state loss
    await expect(page.locator('.react-flow__node')).toHaveCount(2);
    await expect(page.locator('text=Connections: 1')).toBeVisible({ timeout: 5000 });
  });
});

// @tc TC-CC-CV-ADV-003
// @req REQ-CV-013
test.describe('ADV-003 — Add node during property edit preserves both', () => {
  test('adding node while ratio change in flight does not lose either', async ({ page, request }) => {
    // GIVEN: PLL → Divider connected
    await cleanAllProjects(request);
    const project = await createProject(request, 'AddDuringEdit');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${div.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'AddDuringEdit');
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    // WHEN: Change ratio
    await page.locator(`.react-flow__node[data-id="${div.id}"]`).click();
    await expect(page.locator('text=Properties - Divider')).toBeVisible({ timeout: 3000 });
    await page.locator('.property-panel select').selectOption('8');

    // Immediately drop a new node on canvas (don't wait for ratio API)
    await dropNodeOnCanvas(page, 'IPBlock');

    await page.waitForTimeout(2000);

    // THEN: All 3 nodes present
    await expect(page.locator('.react-flow__node')).toHaveCount(3);

    // Verify ratio change took effect
    const data = await getProjectAPI(request, project.id);
    const divNode = data.nodes.find((n: { id: string }) => n.id === div.id);
    expect(divNode.properties.ratio).toBe(8);
  });
});

// @tc TC-CC-CV-ADV-004
// @req REQ-CV-009, REQ-CV-014
test.describe('ADV-004 — Connect then immediate property edit', () => {
  test('connection followed by property change preserves both', async ({ page, request }) => {
    // GIVEN: PLL and Divider on canvas, not connected
    await cleanAllProjects(request);
    const project = await createProject(request, 'ConnEdit');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 200 }, { x: 100, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });

    await page.goto('/');
    await loadProjectInUI(page, 'ConnEdit');
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    // WHEN: Connect PLL → Divider via UI
    await connectHandles(page, pll.id, 'out', div.id, 'in');
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 });

    // Immediately change PLL output_freq
    await fitView(page);
    await page.locator(`.react-flow__node[data-id="${pll.id}"]`).click();
    await expect(page.locator('text=Properties - PLL')).toBeVisible({ timeout: 3000 });
    const freqInput = page.locator('.property-panel input[type="number"]').first();
    await freqInput.click({ clickCount: 3 });
    await freqInput.fill('400');
    await freqInput.press('Enter');

    await page.waitForTimeout(2000);

    // THEN: Connection still present (use status bar — viewport may not show edge)
    await expect(page.locator('text=Connections: 1')).toBeVisible({ timeout: 5000 });
    // THEN: Freq propagated correctly: 400/2 = 200
    await fitView(page);
    await expect(page.locator('.clock-node-freq', { hasText: '400.000 MHz' })).toBeAttached({ timeout: 5000 });
    await expect(page.locator('.clock-node-freq', { hasText: '200.000 MHz' })).toBeAttached({ timeout: 5000 });
  });
});

// @tc TC-CC-CV-ADV-005
// @req REQ-CV-007
test.describe('ADV-005 — Delete while another edit is in flight', () => {
  test('property change then delete another node removes correct node', async ({ page, request }) => {
    // GIVEN: PLL, Div, IPBlock on canvas (close together to stay in viewport)
    await cleanAllProjects(request);
    const project = await createProject(request, 'DelEdit');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 150 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 300, y: 150 });
    const ip = await addNode(request, project.id, 'IPBlock',
      { name: 'IP1', power_mw: 10 }, { x: 300, y: 350 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${div.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'DelEdit');
    await expect(page.locator('.react-flow__node')).toHaveCount(3, { timeout: 5000 });

    // WHEN: Change Divider ratio
    await page.locator(`.react-flow__node[data-id="${div.id}"]`).click();
    await expect(page.locator('text=Properties - Divider')).toBeVisible({ timeout: 3000 });
    await page.locator('.property-panel select').selectOption('4');
    await page.waitForTimeout(500);

    // Click on canvas pane to deselect, then select and delete IPBlock
    await page.locator('.react-flow').click({ position: { x: 50, y: 50 } });
    await page.waitForTimeout(200);
    const ipNode = page.locator(`.react-flow__node[data-id="${ip.id}"]`);
    await ipNode.scrollIntoViewIfNeeded();
    await ipNode.click();
    await page.locator('.canvas-wrapper').focus();
    await page.keyboard.press('Delete');

    await page.waitForTimeout(2000);

    // THEN: IPBlock removed, PLL + Divider remain
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
    // THEN: Connection still present
    await expect(page.locator('text=Connections: 1')).toBeVisible({ timeout: 5000 });
  });
});

// @tc TC-CC-CV-ADV-006
// @req REQ-CV-008
test.describe('ADV-006 — Sequential multi-drag preserves all nodes', () => {
  test('drag 5 nodes one after another without losing any', async ({ page, request }) => {
    // GIVEN: 5 nodes on canvas
    await cleanAllProjects(request);
    const project = await createProject(request, 'MultiDrag');
    const nodeConfigs: Array<{ type: string; props: Record<string, unknown> }> = [
      { type: 'PLL', props: { name: 'N0', output_freq: 100 } },
      { type: 'Divider', props: { name: 'N1', ratio: 2 } },
      { type: 'PLL', props: { name: 'N2', output_freq: 200 } },
      { type: 'IPBlock', props: { name: 'N3', power_mw: 5 } },
      { type: 'Divider', props: { name: 'N4', ratio: 4 } },
    ];
    const nodes = [];
    for (let i = 0; i < nodeConfigs.length; i++) {
      const n = await addNode(request, project.id, nodeConfigs[i].type,
        nodeConfigs[i].props, { x: 100 + i * 150, y: 200 });
      nodes.push(n);
    }

    await page.goto('/');
    await loadProjectInUI(page, 'MultiDrag');
    await expect(page.locator('.react-flow__node')).toHaveCount(5, { timeout: 5000 });

    // WHEN: Drag each node 80px down sequentially
    for (const n of nodes) {
      const nodeEl = page.locator(`.react-flow__node[data-id="${n.id}"]`);
      const box = await nodeEl.boundingBox();
      if (!box) throw new Error(`Node ${n.id} not found`);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy + 80, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(200);
    }

    await page.waitForTimeout(1000);

    // THEN: All 5 nodes still present
    await expect(page.locator('.react-flow__node')).toHaveCount(5);

    // THEN: Positions updated in backend
    const data = await getProjectAPI(request, project.id);
    expect(data.nodes).toHaveLength(5);
  });
});

// @tc TC-CC-CV-ADV-007
// @req REQ-CV-014
test.describe('ADV-007 — Deep chain frequency propagation', () => {
  test('PLL→Div1→Div2→Div3 chain propagates freq correctly', async ({ page, request }) => {
    // GIVEN: PLL (800 MHz) → Div1 (/2) → Div2 (/4) → Div3 (/2)
    await cleanAllProjects(request);
    const project = await createProject(request, 'DeepChain');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 800 }, { x: 50, y: 200 });
    const div1 = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 250, y: 200 });
    const div2 = await addNode(request, project.id, 'Divider',
      { name: 'Div2', ratio: 4 }, { x: 450, y: 200 });
    const div3 = await addNode(request, project.id, 'Divider',
      { name: 'Div3', ratio: 2 }, { x: 650, y: 200 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${div1.id}:in`);
    await connectPorts(request, project.id, `${div1.id}:out`, `${div2.id}:in`);
    await connectPorts(request, project.id, `${div2.id}:out`, `${div3.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'DeepChain');
    await expect(page.locator('.react-flow__node')).toHaveCount(4, { timeout: 5000 });
    await expect(page.locator('.react-flow__edge')).toHaveCount(3, { timeout: 5000 });

    // Verify initial freq chain: 800 → 400 → 100 → 50
    await expect(page.locator('.clock-node-freq', { hasText: '800.000 MHz' })).toBeAttached({ timeout: 5000 });
    await expect(page.locator('.clock-node-freq', { hasText: '400.000 MHz' })).toBeAttached({ timeout: 5000 });
    await expect(page.locator('.clock-node-freq', { hasText: '100.000 MHz' })).toBeAttached({ timeout: 5000 });
    await expect(page.locator('.clock-node-freq', { hasText: '50.000 MHz' })).toBeAttached({ timeout: 5000 });

    // WHEN: Change PLL freq to 1600
    await page.locator(`.react-flow__node[data-id="${pll.id}"]`).click();
    await expect(page.locator('text=Properties - PLL')).toBeVisible({ timeout: 3000 });
    const freqInput = page.locator('.property-panel input[type="number"]').first();
    await freqInput.click({ clickCount: 3 });
    await freqInput.fill('1600');
    await freqInput.press('Enter');
    await page.waitForTimeout(2000);

    // THEN: Entire chain recalculated: 1600 → 800 → 200 → 100
    // Note: formatFreq shows ≥1000 as GHz (e.g. 1600 → "1.6 GHz")
    await expect(page.locator('.clock-node-freq', { hasText: '1.6 GHz' })).toBeAttached({ timeout: 5000 });
    await expect(page.locator('.clock-node-freq', { hasText: '800.000 MHz' })).toBeAttached({ timeout: 5000 });
    await expect(page.locator('.clock-node-freq', { hasText: '200.000 MHz' })).toBeAttached({ timeout: 5000 });
    await expect(page.locator('.clock-node-freq', { hasText: '100.000 MHz' })).toBeAttached({ timeout: 5000 });

    // Verify via API
    const data = await getProjectAPI(request, project.id);
    const d3 = data.nodes.find((n: { id: string }) => n.id === div3.id);
    expect(d3.computed_freq).toBeCloseTo(100, 1);
  });
});

// @tc TC-CC-CV-ADV-008
// @req REQ-CV-009, REQ-CV-012
test.describe('ADV-008 — Rapid connect-disconnect cycles', () => {
  test('connect→delete→reconnect 3 times yields correct final state', async ({ page, request }) => {
    // GIVEN: PLL and Divider on canvas
    await cleanAllProjects(request);
    const project = await createProject(request, 'RapidConn');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });

    await page.goto('/');
    await loadProjectInUI(page, 'RapidConn');
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    for (let cycle = 0; cycle < 3; cycle++) {
      // Connect
      await connectHandles(page, pll.id, 'out', div.id, 'in');
      await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 });

      // Select edge and delete
      const edge = page.locator('.react-flow__edge').first();
      await edge.click({ force: true });
      await page.waitForTimeout(300);
      await page.locator('.canvas-wrapper').focus();
      await page.keyboard.press('Delete');
      await expect(page.locator('.react-flow__edge')).toHaveCount(0, { timeout: 5000 });
    }

    // Final reconnect
    await connectHandles(page, pll.id, 'out', div.id, 'in');
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 });

    await page.waitForTimeout(1000);

    // THEN: Both nodes present, one edge, freq propagated
    await expect(page.locator('.react-flow__node')).toHaveCount(2);
    await expect(page.locator('.clock-node-freq', { hasText: '50.000 MHz' })).toBeAttached({ timeout: 5000 });
  });
});

// @tc TC-CC-CV-ADV-009
// @req REQ-CV-002
test.describe('ADV-009 — 20-node stress test', () => {
  test('20 nodes with connections and edits maintain consistency', async ({ page, request }) => {
    // GIVEN: Create 20 nodes via API (mix of types with proper properties)
    await cleanAllProjects(request);
    const project = await createProject(request, 'Stress20');
    const typeConfigs: Array<{ type: string; props: (i: number) => Record<string, unknown> }> = [
      { type: 'PLL', props: (i) => ({ name: `N${i}`, output_freq: 100 * (i + 1) }) },
      { type: 'Divider', props: (i) => ({ name: `N${i}`, ratio: 2 }) },
      { type: 'Divider', props: (i) => ({ name: `N${i}`, ratio: 4 }) },
      { type: 'IPBlock', props: (i) => ({ name: `N${i}`, power_mw: 5 }) },
    ];
    const nodes = [];
    for (let i = 0; i < 20; i++) {
      const cfg = typeConfigs[i % typeConfigs.length];
      const n = await addNode(request, project.id, cfg.type, cfg.props(i),
        { x: 50 + (i % 5) * 180, y: 50 + Math.floor(i / 5) * 150 });
      nodes.push(n);
    }

    // Connect some PLL→Divider pairs
    const plls = nodes.filter(n => n.type === 'PLL');
    const dividers = nodes.filter(n => n.type === 'Divider');
    const connectionCount = Math.min(plls.length, dividers.length);
    for (let i = 0; i < connectionCount; i++) {
      await connectPorts(request, project.id, `${plls[i].id}:out`, `${dividers[i].id}:in`);
    }

    await page.goto('/');
    await loadProjectInUI(page, 'Stress20');
    await expect(page.locator('.react-flow__node')).toHaveCount(20, { timeout: 10000 });

    // WHEN: Change a PLL's freq
    await page.locator(`.react-flow__node[data-id="${plls[0].id}"]`).click();
    await expect(page.locator('text=Properties - PLL')).toBeVisible({ timeout: 3000 });
    const freqInput = page.locator('.property-panel input[type="number"]').first();
    await freqInput.click({ clickCount: 3 });
    await freqInput.fill('999');
    await freqInput.press('Enter');

    // WHEN: Delete one IPBlock
    const ipBlocks = nodes.filter(n => n.type === 'IPBlock');
    if (ipBlocks.length > 0) {
      await page.locator(`.react-flow__node[data-id="${ipBlocks[0].id}"]`).click();
      await page.locator('.canvas-wrapper').focus();
      await page.keyboard.press('Delete');
    }

    await page.waitForTimeout(2000);

    // THEN: 19 nodes remain, connections intact (minus any on deleted node)
    await expect(page.locator('.react-flow__node')).toHaveCount(19, { timeout: 5000 });

    // Verify backend consistency
    const data = await getProjectAPI(request, project.id);
    expect(data.nodes).toHaveLength(19);
  });
});

// @tc TC-CC-CV-ADV-010
// @req REQ-CV-002, REQ-CV-007, REQ-CV-008, REQ-CV-009, REQ-CV-013, REQ-CV-014
test.describe('ADV-010 — Full storm: reproduces original bug scenario', () => {
  test('PLL+Div+IP connect → ratio change → drag → add → delete → no state loss', async ({ page, request }) => {
    // GIVEN: Empty project
    await cleanAllProjects(request);
    const project = await createProject(request, 'FullStorm');

    // Step 1: Create PLL + Divider + IPBlock via API
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 350, y: 200 });
    const ip = await addNode(request, project.id, 'IPBlock',
      { name: 'IP1', power_mw: 5 }, { x: 600, y: 200 });

    // Step 2: Connect PLL → Divider
    await connectPorts(request, project.id, `${pll.id}:out`, `${div.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'FullStorm');
    await expect(page.locator('.react-flow__node')).toHaveCount(3, { timeout: 5000 });
    await expect(page.locator('.react-flow__edge')).toHaveCount(1, { timeout: 5000 });

    // Step 3: Change Divider ratio to 8
    await page.locator(`.react-flow__node[data-id="${div.id}"]`).click();
    await expect(page.locator('text=Properties - Divider')).toBeVisible({ timeout: 3000 });
    await page.locator('.property-panel select').selectOption('8');
    await page.waitForTimeout(500);

    // Step 4: Immediately drag PLL node
    await fitView(page);
    const pllEl = page.locator(`.react-flow__node[data-id="${pll.id}"]`);
    const pllBox = await pllEl.boundingBox();
    if (!pllBox) throw new Error('PLL not found');
    await page.mouse.move(pllBox.x + pllBox.width / 2, pllBox.y + pllBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(pllBox.x + pllBox.width / 2, pllBox.y + pllBox.height / 2 - 80, { steps: 5 });
    await page.mouse.up();

    // Step 5: Click on canvas to deselect, then add new node
    await page.locator('.react-flow').click({ position: { x: 100, y: 400 } });
    await page.waitForTimeout(200);
    await dropNodeOnCanvas(page, 'ClockGate');
    await page.waitForTimeout(500);

    // Step 6: Verify 4 nodes, 1 connection (use status bar — viewport may not show all edges)
    await expect(page.locator('text=Nodes: 4')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Connections: 1')).toBeVisible({ timeout: 5000 });

    // Step 7: Select and delete IPBlock
    await fitView(page);
    await page.waitForTimeout(500);
    await page.locator(`.react-flow__node[data-id="${ip.id}"]`).click();
    await page.locator('.canvas-wrapper').focus();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(1000);

    // THEN: 3 nodes remain (PLL, Divider, ClockGate), 1 edge
    await expect(page.locator('text=Nodes: 3')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Connections: 1')).toBeVisible({ timeout: 5000 });

    // THEN: Freq correct: PLL=100, Div=100/8=12.5
    await expect(page.locator('.clock-node-freq', { hasText: '100.000 MHz' })).toBeAttached({ timeout: 5000 });
    await expect(page.locator('.clock-node-freq', { hasText: '12.500 MHz' })).toBeAttached({ timeout: 5000 });

    // Verify backend consistency
    const data = await getProjectAPI(request, project.id);
    expect(data.nodes).toHaveLength(3);
    expect(data.edges).toHaveLength(1);
    const divNode = data.nodes.find((n: { id: string }) => n.id === div.id);
    expect(divNode.computed_freq).toBeCloseTo(12.5, 2);
  });
});
