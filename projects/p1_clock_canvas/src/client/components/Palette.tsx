// Clock Canvas - Palette (Left Sidebar)
// REQ-CV-001: 6 component types in left sidebar
// REQ-CV-002: Drag from palette to canvas creates node

import { type DragEvent, useCallback } from 'react';
import type { ComponentType } from '../types.js';

interface PaletteEntry {
  type: ComponentType;
  label: string;
  description: string;
  color: string;
  abbr: string;
}

const PALETTE_ITEMS: PaletteEntry[] = [
  { type: 'PLL',         label: 'PLL',          description: 'Phase-Locked Loop',        color: 'var(--color-pll)',         abbr: 'PLL' },
  { type: 'Divider',     label: 'Divider',      description: 'Clock Divider',            color: 'var(--color-divider)',     abbr: 'DIV' },
  { type: 'Mux',         label: 'Mux',          description: 'Clock Multiplexer',        color: 'var(--color-mux)',         abbr: 'MUX' },
  { type: 'ClockGate',   label: 'Clock Gate',   description: 'Clock Gating Cell',        color: 'var(--color-clockgate)',   abbr: 'CG' },
  { type: 'IPBlock',     label: 'IP Block',     description: 'IP Consumer Block',        color: 'var(--color-ipblock)',     abbr: 'IP' },
  { type: 'ClockDomain', label: 'Clock Domain', description: 'Clock Domain Boundary',    color: 'var(--color-clockdomain)', abbr: 'CD' },
];

export default function Palette() {
  const onDragStart = useCallback((e: DragEvent<HTMLDivElement>, type: ComponentType) => {
    e.dataTransfer.setData('application/clock-canvas-type', type);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  return (
    <div className="palette">
      <div className="palette-header">Components</div>
      {PALETTE_ITEMS.map(item => (
        <div
          key={item.type}
          className="palette-item"
          draggable
          onDragStart={e => onDragStart(e, item.type)}
        >
          <div
            className="palette-item-icon"
            style={{ background: item.color }}
          >
            {item.abbr}
          </div>
          <div>
            <div className="palette-item-label">{item.label}</div>
            <div className="palette-item-desc">{item.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
