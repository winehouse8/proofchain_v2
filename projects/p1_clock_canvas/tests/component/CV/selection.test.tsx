// @vitest-environment jsdom
// Canvas Editor — Component Tests (Selection)
// Covers TC-CC-CV-004, TC-CC-CV-005, TC-CC-CV-006

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useEffect, type Dispatch } from 'react';
import { AppProvider, useAppDispatch } from '../../../src/client/store.js';
import PropertyPanel from '../../../src/client/components/PropertyPanel.js';
import type { ClockNode, AppAction } from '../../../src/client/types.js';

vi.mock('../../../src/client/api.js', () => ({
  updateNode: vi.fn(),
}));

// Helper: sets up project state and exposes dispatch via ref
function StateSetup({
  nodes,
  dispatchRef,
}: {
  nodes: ClockNode[];
  dispatchRef: { current: Dispatch<AppAction> | null };
}) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatchRef.current = dispatch;
    dispatch({
      type: 'SET_PROJECT',
      projectId: 'test-proj',
      projectName: 'Test',
      nodes,
      edges: [],
    });
  }, []);
  return null;
}

const pllNode: ClockNode = {
  id: 'node-1',
  type: 'PLL',
  properties: { name: 'PLL1', output_freq: 400 },
  position: { x: 100, y: 100 },
  computed_freq: 400,
};

const divNode: ClockNode = {
  id: 'node-2',
  type: 'Divider',
  properties: { name: 'Div1', ratio: 2 },
  position: { x: 300, y: 100 },
  computed_freq: 200,
};

// @tc TC-CC-CV-004
// @req REQ-CV-004
describe('TC-CC-CV-004 — Clicking a node highlights it and updates the property panel', () => {
  it('should display PLL properties in the panel after node selection', async () => {
    const dispatchRef: { current: Dispatch<AppAction> | null } = { current: null };

    render(
      <AppProvider>
        <StateSetup nodes={[pllNode]} dispatchRef={dispatchRef} />
        <PropertyPanel />
      </AppProvider>,
    );

    // GIVEN: PropertyPanel shows no content initially
    await waitFor(() => {
      expect(screen.getByText('Select a node to edit its properties')).toBeInTheDocument();
    });

    // WHEN: The user clicks on the PLL node (simulated via dispatch)
    act(() => {
      dispatchRef.current!({ type: 'SELECT_NODE', nodeId: 'node-1', multi: false });
    });

    // THEN: The property panel displays PLL node properties
    await waitFor(() => {
      expect(screen.getByText('Properties - PLL')).toBeInTheDocument();
      expect(screen.getByDisplayValue('PLL1')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('400')).toBeInTheDocument();
  });
});

// @tc TC-CC-CV-005
// @req REQ-CV-005
describe('TC-CC-CV-005 — Shift-click adds nodes to existing selection', () => {
  it('should show multi-selection message when two nodes are selected', async () => {
    const dispatchRef: { current: Dispatch<AppAction> | null } = { current: null };

    render(
      <AppProvider>
        <StateSetup nodes={[pllNode, divNode]} dispatchRef={dispatchRef} />
        <PropertyPanel />
      </AppProvider>,
    );

    // GIVEN: node-1 is selected
    await waitFor(() => {
      expect(dispatchRef.current).not.toBeNull();
    });
    act(() => {
      dispatchRef.current!({ type: 'SELECT_NODE', nodeId: 'node-1', multi: false });
    });
    await waitFor(() => {
      expect(screen.getByText('Properties - PLL')).toBeInTheDocument();
    });

    // WHEN: Shift-click on node-2 (multi: true)
    act(() => {
      dispatchRef.current!({ type: 'SELECT_NODE', nodeId: 'node-2', multi: true });
    });

    // THEN: Both nodes selected, PropertyPanel shows multi-select message
    await waitFor(() => {
      expect(screen.getByText('2 nodes selected')).toBeInTheDocument();
    });
  });
});

// @tc TC-CC-CV-006
// @req REQ-CV-006
describe('TC-CC-CV-006 — Clicking empty canvas area deselects all nodes', () => {
  it('should clear property panel when all nodes are deselected', async () => {
    const dispatchRef: { current: Dispatch<AppAction> | null } = { current: null };

    render(
      <AppProvider>
        <StateSetup nodes={[pllNode]} dispatchRef={dispatchRef} />
        <PropertyPanel />
      </AppProvider>,
    );

    // GIVEN: node-1 is selected and PropertyPanel shows its properties
    await waitFor(() => {
      expect(dispatchRef.current).not.toBeNull();
    });
    act(() => {
      dispatchRef.current!({ type: 'SELECT_NODE', nodeId: 'node-1', multi: false });
    });
    await waitFor(() => {
      expect(screen.getByText('Properties - PLL')).toBeInTheDocument();
    });

    // WHEN: The user clicks on empty canvas area (simulated via DESELECT_ALL)
    act(() => {
      dispatchRef.current!({ type: 'DESELECT_ALL' });
    });

    // THEN: Property panel shows empty state
    await waitFor(() => {
      expect(screen.getByText('Select a node to edit its properties')).toBeInTheDocument();
    });
  });
});
