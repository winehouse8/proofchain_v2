// @vitest-environment jsdom
// Canvas Editor — Component Tests (PropertyPanel)
// Covers TC-CC-CV-016 through TC-CC-CV-021 (type-specific property fields)

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useEffect } from 'react';
import { AppProvider, useAppDispatch } from '../../../src/client/store.js';
import PropertyPanel from '../../../src/client/components/PropertyPanel.js';
import type { ClockNode } from '../../../src/client/types.js';

// Mock the API module to prevent actual fetch calls
vi.mock('../../../src/client/api.js', () => ({
  updateNode: vi.fn(),
}));

// Helper: injects state into the AppProvider context
function StateInjector({ nodes, selectedNodeId }: { nodes: ClockNode[]; selectedNodeId?: string }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({
      type: 'SET_PROJECT',
      projectId: 'test-proj',
      projectName: 'Test',
      nodes,
      edges: [],
    });
    if (selectedNodeId) {
      dispatch({ type: 'SELECT_NODE', nodeId: selectedNodeId, multi: false });
    }
  }, []);
  return null;
}

function renderPanel(node: ClockNode) {
  return render(
    <AppProvider>
      <StateInjector nodes={[node]} selectedNodeId={node.id} />
      <PropertyPanel />
    </AppProvider>,
  );
}

// @tc TC-CC-CV-016
// @req REQ-CV-013
describe('TC-CC-CV-016 — PLL property panel fields', () => {
  it('should display name, output_freq, and input_freq fields', async () => {
    const pll: ClockNode = {
      id: 'node-pll',
      type: 'PLL',
      properties: { name: 'PLL1', output_freq: 400, input_freq: 0 },
      position: { x: 0, y: 0 },
      computed_freq: 400,
    };
    renderPanel(pll);

    await waitFor(() => {
      expect(screen.getByText('Properties - PLL')).toBeInTheDocument();
      expect(screen.getByDisplayValue('PLL1')).toBeInTheDocument();
    });

    // Output Freq field showing 400
    expect(screen.getByDisplayValue('400')).toBeInTheDocument();
    // Input Freq read-only showing "0 MHz"
    expect(screen.getByDisplayValue('0 MHz')).toBeInTheDocument();
  });
});

// @tc TC-CC-CV-017
// @req REQ-CV-013
describe('TC-CC-CV-017 — Divider property panel fields', () => {
  it('should display name and ratio fields', async () => {
    const div: ClockNode = {
      id: 'node-div',
      type: 'Divider',
      properties: { name: 'Div1', ratio: 2 },
      position: { x: 0, y: 0 },
      computed_freq: 50,
    };
    const { container } = renderPanel(div);

    await waitFor(() => {
      expect(screen.getByText('Properties - Divider')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Div1')).toBeInTheDocument();
    });

    // Ratio select showing value 2 with 7 valid options {2,4,8,16,32,64,128}
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe('2');
    expect(select.querySelectorAll('option')).toHaveLength(7);
  });
});

// @tc TC-CC-CV-018
// @req REQ-CV-013
describe('TC-CC-CV-018 — Mux property panel fields', () => {
  it('should display name and select_index fields', async () => {
    const mux: ClockNode = {
      id: 'node-mux',
      type: 'Mux',
      properties: { name: 'Mux1', select_index: 0 },
      position: { x: 0, y: 0 },
      computed_freq: null,
    };
    renderPanel(mux);

    await waitFor(() => {
      expect(screen.getByText('Properties - Mux')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Mux1')).toBeInTheDocument();
    });

    // select_index numeric input showing 0
    expect(screen.getByDisplayValue('0')).toBeInTheDocument();
  });
});

// @tc TC-CC-CV-019
// @req REQ-CV-013
describe('TC-CC-CV-019 — Clock Gate property panel fields', () => {
  it('should display only name field with no additional type-specific fields', async () => {
    const gate: ClockNode = {
      id: 'node-gate',
      type: 'ClockGate',
      properties: { name: 'Gate1' },
      position: { x: 0, y: 0 },
      computed_freq: null,
    };
    renderPanel(gate);

    await waitFor(() => {
      expect(screen.getByText('Properties - ClockGate')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Gate1')).toBeInTheDocument();
    });

    // No type-specific labels beyond Name, Type, ID, Frequency
    expect(screen.queryByText('Output Freq (MHz)')).not.toBeInTheDocument();
    expect(screen.queryByText('Input Freq (MHz)')).not.toBeInTheDocument();
    expect(screen.queryByText('Ratio')).not.toBeInTheDocument();
    expect(screen.queryByText('Select Index')).not.toBeInTheDocument();
    expect(screen.queryByText('Power (mW)')).not.toBeInTheDocument();
    expect(screen.queryByText('Domain Name')).not.toBeInTheDocument();
  });
});

// @tc TC-CC-CV-020
// @req REQ-CV-013
describe('TC-CC-CV-020 — IP Block property panel fields', () => {
  it('should display name and power_mw fields', async () => {
    const ip: ClockNode = {
      id: 'node-ip',
      type: 'IPBlock',
      properties: { name: 'IP1', power_mw: 50 },
      position: { x: 0, y: 0 },
      computed_freq: null,
    };
    renderPanel(ip);

    await waitFor(() => {
      expect(screen.getByText('Properties - IPBlock')).toBeInTheDocument();
      expect(screen.getByDisplayValue('IP1')).toBeInTheDocument();
    });

    // Power field showing 50
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });
});

// @tc TC-CC-CV-021
// @req REQ-CV-013
describe('TC-CC-CV-021 — Clock Domain property panel fields', () => {
  it('should display name, domain_name, and color fields', async () => {
    const cd: ClockNode = {
      id: 'node-cd',
      type: 'ClockDomain',
      properties: { name: 'CD1', domain_name: 'fast_clk', color: '#FF0000' },
      position: { x: 0, y: 0 },
      computed_freq: null,
    };
    const { container } = renderPanel(cd);

    await waitFor(() => {
      expect(screen.getByText('Properties - ClockDomain')).toBeInTheDocument();
      expect(screen.getByDisplayValue('CD1')).toBeInTheDocument();
    });

    // Domain name field
    expect(screen.getByDisplayValue('fast_clk')).toBeInTheDocument();
    // Color picker
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    expect(colorInput).toBeTruthy();
    expect(colorInput.value.toLowerCase()).toBe('#ff0000');
  });
});
