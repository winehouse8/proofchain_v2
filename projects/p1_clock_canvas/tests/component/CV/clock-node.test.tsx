// @vitest-environment jsdom
// Canvas Editor — Component Tests (ClockNode)
// Covers TC-CC-CV-023 (frequency label), TC-CC-CV-037 (Mux sel + ClockGate en ports)

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentType } from '../../../src/client/types.js';

// Mock @xyflow/react — ClockNode imports Handle and Position
vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return {
    Handle: (props: any) =>
      React.createElement('div', {
        'data-testid': `handle-${props.id}`,
        'data-handle-type': props.type,
        'data-position': props.position,
      }),
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  };
});

import ClockNode from '../../../src/client/components/nodes/ClockNode.js';
import type { FC } from 'react';

// Cast to bypass NodeProps type requirement — we only pass data in tests
const TestNode = ClockNode as unknown as FC<{ data: any }>;

function makeNodeData(overrides: Record<string, unknown>) {
  return {
    label: '',
    componentType: 'PLL' as ComponentType,
    properties: {},
    computedFreq: null,
    selected: false,
    cdcHighlight: false,
    ...overrides,
  };
}

// @tc TC-CC-CV-023
// @req REQ-CV-015
describe('TC-CC-CV-023 — Divider node displays computed frequency label', () => {
  it('should show "200.000 MHz" when computedFreq is 200', () => {
    const data = makeNodeData({
      label: 'Div1',
      componentType: 'Divider',
      properties: { name: 'Div1', ratio: 2 },
      computedFreq: 200,
    });

    const { container } = render(<TestNode data={data} />);

    const freqEl = container.querySelector('.clock-node-freq');
    expect(freqEl).toBeTruthy();
    expect(freqEl!.textContent).toBe('200.000 MHz');
  });
});

// @tc TC-CC-CV-037
// @req REQ-CV-013
describe('TC-CC-CV-037 — Mux sel port and Clock Gate en port render as connectable handles', () => {
  it('should render a sel port handle on Mux node', () => {
    const data = makeNodeData({
      label: 'Mux1',
      componentType: 'Mux',
      properties: { name: 'Mux1', select_index: 0 },
    });

    const { container } = render(<TestNode data={data} />);

    // Mux should have: in_0, in_1, sel (target), out (source)
    expect(container.querySelector('[data-testid="handle-in_0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="handle-in_1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="handle-sel"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="handle-out"]')).toBeTruthy();
  });

  it('should render an en port handle on ClockGate node', () => {
    const data = makeNodeData({
      label: 'Gate1',
      componentType: 'ClockGate',
      properties: { name: 'Gate1' },
    });

    const { container } = render(<TestNode data={data} />);

    // ClockGate should have: in (target), en (target/control), out (source)
    expect(container.querySelector('[data-testid="handle-in"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="handle-en"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="handle-out"]')).toBeTruthy();
  });
});
