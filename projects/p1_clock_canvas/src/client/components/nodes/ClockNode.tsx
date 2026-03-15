// Clock Canvas - Custom React Flow Node Component
// REQ-CV-004 (select), REQ-CV-015 (freq label), REQ-CV-010 (port handles)

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ComponentType, NodeProperties } from '../../types.js';

export interface ClockNodeData extends Record<string, unknown> {
  label: string;
  componentType: ComponentType;
  properties: NodeProperties;
  computedFreq: number | null;
  selected: boolean;
  cdcHighlight: boolean;
}

type ClockNodeType = Node<ClockNodeData, 'clockNode'>;

const TYPE_COLORS: Record<ComponentType, string> = {
  PLL: 'var(--color-pll)',
  Divider: 'var(--color-divider)',
  Mux: 'var(--color-mux)',
  ClockGate: 'var(--color-clockgate)',
  IPBlock: 'var(--color-ipblock)',
  ClockDomain: 'var(--color-clockdomain)',
};

function formatFreq(freq: number | null): string {
  if (freq === null || freq === undefined) return '';
  if (freq >= 1000) return `${(freq / 1000).toFixed(1)} GHz`;
  if (freq >= 1) return `${freq.toFixed(3)} MHz`;
  return `${(freq * 1000).toFixed(1)} kHz`;
}

function ClockNodeComponent({ data }: NodeProps<ClockNodeType>) {
  const color = TYPE_COLORS[data.componentType];
  const ctype = data.componentType;
  const name = data.properties.name ?? ctype;

  const classNames = ['clock-node'];
  if (data.selected) classNames.push('selected');
  if (data.cdcHighlight) classNames.push('cdc-highlight');

  return (
    <div className={classNames.join(' ')}>
      {/* Input handles (left side) */}
      {ctype !== 'PLL' && ctype !== 'Mux' && ctype !== 'ClockDomain' && (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          style={{ top: '50%' }}
        />
      )}

      {/* Mux input handles */}
      {ctype === 'Mux' && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="in_0"
            style={{ top: '30%' }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="in_1"
            style={{ top: '55%' }}
          />
          {/* Control port (sel) at bottom */}
          <Handle
            type="target"
            position={Position.Bottom}
            id="sel"
            style={{ left: '50%' }}
          />
        </>
      )}

      {/* ClockDomain input handle */}
      {ctype === 'ClockDomain' && (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          style={{ top: '50%' }}
        />
      )}

      {/* ClockGate enable (control) port at bottom */}
      {ctype === 'ClockGate' && (
        <Handle
          type="target"
          position={Position.Bottom}
          id="en"
          style={{ left: '50%' }}
        />
      )}

      {/* Node body */}
      <div className="clock-node-header" style={{ color }}>
        {ctype}
      </div>
      <div className="clock-node-name">{name}</div>
      {data.computedFreq !== null && (
        <div className="clock-node-freq">{formatFreq(data.computedFreq)}</div>
      )}

      {/* Output handles (right side) */}
      {ctype !== 'IPBlock' && ctype !== 'ClockDomain' && (
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          style={{ top: '50%' }}
        />
      )}

      {/* ClockDomain output handles */}
      {ctype === 'ClockDomain' && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="out_0"
            style={{ top: '35%' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="out_1"
            style={{ top: '65%' }}
          />
        </>
      )}
    </div>
  );
}

export default memo(ClockNodeComponent);
