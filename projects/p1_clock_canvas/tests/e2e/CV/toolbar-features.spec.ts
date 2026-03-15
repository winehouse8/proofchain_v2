// Canvas Editor — E2E Tests (Toolbar Features)
// Covers: TC-CC-CV-028, 029, 030, 031, 032, 033, 034, 035, 036

import { test, expect } from '@playwright/test';
import {
  cleanAllProjects,
  createProject,
  addNode,
  connectPorts,
  loadProjectInUI,
  dropNodeOnCanvas,
} from '../helpers.js';

// @tc TC-CC-CV-028
// @req REQ-CV-019
test.describe('TC-CC-CV-028 — Save existing project shows success toast', () => {
  test('should send PUT request and show success notification', async ({ page, request }) => {
    // GIVEN: Project loaded with 2 nodes and 1 connection
    await cleanAllProjects(request);
    const project = await createProject(request, 'Save Test');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${div.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'Save Test');
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });

    // WHEN: Click Save button
    await page.click('button:has-text("Save")');

    // THEN: Success toast with 'saved' appears (filter to ignore any prior load toast)
    await expect(page.locator('.toast--success', { hasText: /saved/i })).toBeVisible({ timeout: 5000 });
  });
});

// @tc TC-CC-CV-029
// @req REQ-CV-020
test.describe('TC-CC-CV-029 — Load button shows dialog and loads selected project', () => {
  test('should show project list dialog and load selected project', async ({ page, request }) => {
    // GIVEN: Backend has a saved project "My Design" with 2 nodes
    await cleanAllProjects(request);
    const project = await createProject(request, 'My Design');
    await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 200, y: 200 });
    await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });

    await page.goto('/');

    // WHEN: Click Load button
    await page.click('button:has-text("Load")');

    // THEN: Dialog appears with "My Design" listed
    await expect(page.locator('.dialog')).toBeVisible();
    await expect(page.locator('.project-list-item:has-text("My Design")')).toBeVisible();

    // WHEN: Click the project to load it
    await page.click('.project-list-item:has-text("My Design")');

    // THEN: Dialog closes and canvas shows 2 nodes
    await expect(page.locator('.dialog-overlay')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
  });
});

// @tc TC-CC-CV-030
// @req REQ-CV-021
test.describe('TC-CC-CV-030 — Export button triggers JSON file download', () => {
  test('should download a JSON file when Export is clicked', async ({ page, request }) => {
    // GIVEN: Project loaded with 1 PLL node
    await cleanAllProjects(request);
    const project = await createProject(request, 'Export Test');
    await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 200, y: 200 });

    await page.goto('/');
    await loadProjectInUI(page, 'Export Test');

    // WHEN: Click Export button
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export")'),
    ]);

    // THEN: JSON file is downloaded
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });
});

// @tc TC-CC-CV-031
// @req REQ-CV-022
test.describe('TC-CC-CV-031 — Import uploads JSON file and loads design', () => {
  test('should import a valid JSON design file and populate the canvas', async ({ page, request }) => {
    // GIVEN: Canvas is empty, valid design JSON is available
    await cleanAllProjects(request);
    await page.goto('/');

    const exportData = {
      schema_version: '1.0',
      project_name: 'Imported Design',
      exported_at: new Date().toISOString(),
      nodes: [
        { id: 'n1', type: 'PLL', properties: { name: 'PLL1', output_freq: 100, input_freq: 0 }, position: { x: 200, y: 200 } },
        { id: 'n2', type: 'Divider', properties: { name: 'Div1', ratio: 2 }, position: { x: 400, y: 200 } },
      ],
      edges: [
        { source: 'n1:out', target: 'n2:in' },
      ],
    };

    // WHEN: Click Import and select file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Import")');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'design.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exportData)),
    });

    // THEN: Design is loaded with nodes and connection
    await expect(page.locator('.toast--success')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 5000 });
  });
});

// @tc TC-CC-CV-032
// @req REQ-CV-023
test.describe('TC-CC-CV-032 — Generate shows code preview dialog and downloads ZIP', () => {
  test('should display code preview with RTL/SDC tabs and download ZIP', async ({ page, request }) => {
    // GIVEN: Design with PLL connected to IPBlock
    await cleanAllProjects(request);
    const project = await createProject(request, 'GenCode');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const ip = await addNode(request, project.id, 'IPBlock',
      { name: 'IP1', power_mw: 50 }, { x: 400, y: 200 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${ip.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'GenCode');

    // WHEN: Click Generate button
    await page.click('button:has-text("Generate")');

    // THEN: Code preview dialog appears with RTL and SDC tabs
    await expect(page.getByText('Code Preview')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('RTL (Verilog)')).toBeVisible();
    await expect(page.getByText('SDC (Constraints)')).toBeVisible();

    // Verify code content exists
    await expect(page.locator('.code-preview-content')).toBeVisible();
    const codeText = await page.locator('.code-preview-content').textContent();
    expect(codeText!.length).toBeGreaterThan(0);

    // WHEN: Click Download ZIP
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Download ZIP")'),
    ]);

    // THEN: ZIP file is downloaded
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });
});

// @tc TC-CC-CV-033
// @req REQ-CV-024
test.describe('TC-CC-CV-033 — CDC Check highlights crossings and shows summary', () => {
  test('should call CDC analysis API and show results toast', async ({ page, request }) => {
    // GIVEN: Design with PLL → Divider connection
    await cleanAllProjects(request);
    const project = await createProject(request, 'CDCTest');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 200, y: 200 });
    const div = await addNode(request, project.id, 'Divider',
      { name: 'Div1', ratio: 2 }, { x: 400, y: 200 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${div.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'CDCTest');

    // WHEN: Click CDC Check button
    await page.click('button:has-text("CDC Check")');

    // THEN: Toast appears with CDC results
    await expect(page.locator('.toast')).toBeVisible({ timeout: 5000 });
    const text = await page.locator('.toast').first().textContent();
    expect(text).toMatch(/CDC|crossing/i);
  });
});

// @tc TC-CC-CV-034
// @req REQ-CV-025
test.describe('TC-CC-CV-034 — Gating Analysis shows summary with power reduction', () => {
  test('should call gating analysis API and show results toast', async ({ page, request }) => {
    // GIVEN: Design with PLL → ClockGate → IPBlock
    await cleanAllProjects(request);
    const project = await createProject(request, 'GateTest');
    const pll = await addNode(request, project.id, 'PLL',
      { name: 'PLL1', output_freq: 100 }, { x: 100, y: 200 });
    const gate = await addNode(request, project.id, 'ClockGate',
      { name: 'Gate1' }, { x: 300, y: 200 });
    const ip = await addNode(request, project.id, 'IPBlock',
      { name: 'IP1', power_mw: 50 }, { x: 500, y: 200 });
    await connectPorts(request, project.id, `${pll.id}:out`, `${gate.id}:in`);
    await connectPorts(request, project.id, `${gate.id}:out`, `${ip.id}:in`);

    await page.goto('/');
    await loadProjectInUI(page, 'GateTest');

    // WHEN: Click Gating button
    await page.click('button:has-text("Gating")');

    // THEN: Toast appears with gating summary (filter to ignore prior load toast)
    await expect(page.locator('.toast', { hasText: /Gated|Ungated|Power|reduction/i })).toBeVisible({ timeout: 5000 });
  });
});

// @tc TC-CC-CV-035
// @req REQ-CV-026
test.describe('TC-CC-CV-035 — Network error shows error toast', () => {
  test('should show error toast when API call fails', async ({ page, request }) => {
    // GIVEN: Project loaded, then network is blocked
    await cleanAllProjects(request);
    const project = await createProject(request, 'ErrorTest');
    await page.goto('/');
    await loadProjectInUI(page, 'ErrorTest');

    // Block all node creation API calls
    await page.route('**/api/projects/*/nodes', route => route.abort('failed'));

    // WHEN: Try to drag a PLL node onto the canvas
    await dropNodeOnCanvas(page, 'PLL');

    // THEN: Error toast appears and no node on canvas
    await expect(page.locator('.toast--error')).toBeVisible({ timeout: 5000 });
    expect(await page.locator('.react-flow__node').count()).toBe(0);
  });
});

// @tc TC-CC-CV-036
// @req REQ-CV-027
test.describe('TC-CC-CV-036 — Save on new canvas prompts for name and creates project', () => {
  test('should prompt for project name and create via POST', async ({ page, request }) => {
    // GIVEN: New unsaved canvas with no project
    await cleanAllProjects(request);
    await page.goto('/');

    // Verify unsaved state
    await expect(page.getByText('(unsaved)')).toBeVisible();

    // Handle the prompt dialog
    page.on('dialog', async dialog => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('My New Design');
      }
    });

    // WHEN: Click Save button
    await page.click('button:has-text("Save")');

    // THEN: Success toast appears with project name
    await expect(page.locator('.toast--success')).toBeVisible({ timeout: 5000 });
    const toastText = await page.locator('.toast--success').first().textContent();
    expect(toastText).toContain('My New Design');

    // Project is no longer unsaved
    await expect(page.getByText('(unsaved)')).toBeHidden({ timeout: 3000 });
  });
});
