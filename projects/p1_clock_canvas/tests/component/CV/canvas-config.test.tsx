// @vitest-environment jsdom
// Canvas Editor — Component Tests (Canvas configuration)
// Covers TC-CC-CV-024 (max zoom 400%), TC-CC-CV-025 (min zoom 25%)
// Stubs: TC-CC-CV-008, TC-CC-CV-010, TC-CC-CV-026 (need full e2e)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// vi.hoisted ensures the mock fn is available when vi.mock factory runs
const { mockReactFlow } = vi.hoisted(() => ({
  mockReactFlow: vi.fn(() => null),
}));

vi.mock('@xyflow/react', () => ({
  ReactFlow: mockReactFlow,
  Background: () => null,
  Controls: () => null,
  BackgroundVariant: { Dots: 'dots' },
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  useReactFlow: () => ({ screenToFlowPosition: vi.fn((pos: any) => pos) }),
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

vi.mock('../../../src/client/api.js', () => ({
  createNode: vi.fn(),
  deleteNode: vi.fn(),
  createConnection: vi.fn(),
  deleteConnection: vi.fn(),
  updateNode: vi.fn(),
}));

import Canvas from '../../../src/client/components/Canvas.js';
import { AppProvider } from '../../../src/client/store.js';

beforeEach(() => {
  mockReactFlow.mockClear();
});

// @tc TC-CC-CV-024
// @req REQ-CV-016
describe('TC-CC-CV-024 — Scroll-up zoom does not exceed 400% maximum', () => {
  it('should configure ReactFlow with maxZoom=4 (400%)', () => {
    render(
      <AppProvider>
        <Canvas />
      </AppProvider>,
    );

    expect(mockReactFlow).toHaveBeenCalled();
    const props = mockReactFlow.mock.calls[0][0] as Record<string, unknown>;
    expect(props.maxZoom).toBe(4);
  });
});

// @tc TC-CC-CV-025
// @req REQ-CV-016
describe('TC-CC-CV-025 — Scroll-down zoom does not go below 25% minimum', () => {
  it('should configure ReactFlow with minZoom=0.25 (25%)', () => {
    render(
      <AppProvider>
        <Canvas />
      </AppProvider>,
    );

    expect(mockReactFlow).toHaveBeenCalled();
    const props = mockReactFlow.mock.calls[0][0] as Record<string, unknown>;
    expect(props.minZoom).toBe(0.25);
  });
});

// @tc TC-CC-CV-008
// @req REQ-CV-008
describe('TC-CC-CV-008 — Dragging a node updates its position and connected wires follow', () => {
  it.todo('requires ReactFlow drag interaction — covered by e2e tests');
});

// @tc TC-CC-CV-010
// @req REQ-CV-010
describe('TC-CC-CV-010 — Dragging from output port shows preview wire', () => {
  it.todo('requires ReactFlow connection system — covered by e2e tests');
});

// @tc TC-CC-CV-026
// @req REQ-CV-017
describe('TC-CC-CV-026 — Dragging on empty canvas area pans the viewport', () => {
  it.todo('requires ReactFlow viewport interaction — covered by e2e tests');
});
