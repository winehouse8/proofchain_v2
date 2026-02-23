// @vitest-environment jsdom
// Canvas Editor — Component Test (StatusBar)
// Covers TC-CC-CV-027 (status bar counts)

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useEffect } from 'react';
import { AppProvider, useAppDispatch } from '../../../src/client/store.js';
import StatusBar from '../../../src/client/components/StatusBar.js';
import type { ClockNode, ClockEdge } from '../../../src/client/types.js';

function StateInjector({ nodes, edges }: { nodes: ClockNode[]; edges: ClockEdge[] }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({
      type: 'SET_PROJECT',
      projectId: 'test-proj',
      projectName: 'Test',
      nodes,
      edges,
    });
  }, []);
  return null;
}

// @tc TC-CC-CV-027
// @req REQ-CV-018
describe('TC-CC-CV-027 — Status bar counts update when nodes and connections change', () => {
  it('should show correct node, connection, and CDC warning counts', async () => {
    const nodes: ClockNode[] = [
      {
        id: 'n1',
        type: 'PLL',
        properties: { name: 'PLL1', output_freq: 100 },
        position: { x: 0, y: 0 },
        computed_freq: 100,
      },
      {
        id: 'n2',
        type: 'Divider',
        properties: { name: 'Div1', ratio: 2 },
        position: { x: 200, y: 0 },
        computed_freq: 50,
      },
    ];
    const edges: ClockEdge[] = [
      { id: 'e1', source: 'n1:out', target: 'n2:in' },
    ];

    render(
      <AppProvider>
        <StateInjector nodes={nodes} edges={edges} />
        <StatusBar />
      </AppProvider>,
    );

    // THEN: Status bar shows Nodes: 2, Connections: 1, CDC Warnings: 0
    await waitFor(() => {
      expect(screen.getByText('Nodes: 2')).toBeInTheDocument();
    });
    expect(screen.getByText('Connections: 1')).toBeInTheDocument();
    expect(screen.getByText('CDC Warnings: 0')).toBeInTheDocument();
  });
});
