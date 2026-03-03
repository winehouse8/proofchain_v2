// Clock Canvas - Property Panel (Right Sidebar)
// REQ-CV-013: Type-specific property fields
// REQ-CV-014: Edit property -> blur/Enter -> PATCH to backend

import { useState, useEffect, useCallback, type ChangeEvent, type KeyboardEvent } from 'react';
import { useAppState, useAppDispatch, useToast, useSelectedNodes } from '../store.js';
import { updateNode as apiUpdateNode, getProject } from '../api.js';
import type { NodeProperties, DividerRatio, ComponentType } from '../types.js';
import { VALID_DIVIDER_RATIOS } from '../types.js';

export default function PropertyPanel() {
  const { projectId } = useAppState();
  const dispatch = useAppDispatch();
  const showToast = useToast();
  const selectedNodes = useSelectedNodes();

  const node = selectedNodes.length === 1 ? selectedNodes[0] : null;

  const [localProps, setLocalProps] = useState<NodeProperties>({});
  const [dirty, setDirty] = useState(false);

  // Sync local state when selection changes
  useEffect(() => {
    if (node) {
      setLocalProps({ ...node.properties });
      setDirty(false);
    }
  }, [node?.id, node?.properties]);

  const commitChange = useCallback(async () => {
    if (!node || !projectId || !dirty) return;

    const prevProps = { ...node.properties };

    // Optimistic update
    dispatch({
      type: 'UPDATE_NODE',
      nodeId: node.id,
      updates: { properties: { ...localProps } },
    });

    try {
      const updated = await apiUpdateNode(projectId, node.id, { properties: localProps });
      dispatch({
        type: 'UPDATE_NODE',
        nodeId: node.id,
        updates: {
          properties: updated.properties,
          computed_freq: updated.computed_freq,
        },
      });
      // Reload computed_freq only — preserve client state (positions, selections)
      const project = await getProject(projectId);
      dispatch({ type: 'SYNC_FREQ', serverNodes: project.nodes });
      setDirty(false);
    } catch (err) {
      // Revert on error (REQ-CV-026)
      dispatch({
        type: 'UPDATE_NODE',
        nodeId: node.id,
        updates: { properties: prevProps },
      });
      setLocalProps(prevProps);
      showToast(err instanceof Error ? err.message : 'Failed to update property', 'error');
    }
  }, [node, projectId, dirty, localProps, dispatch, showToast]);

  const handleChange = useCallback((field: keyof NodeProperties, value: string | number) => {
    setLocalProps(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  }, []);

  // Immediate commit with a specific value — avoids stale closure from setTimeout
  const handleChangeAndCommit = useCallback(async (field: keyof NodeProperties, value: string | number) => {
    if (!node || !projectId) return;
    const newProps = { ...localProps, [field]: value };
    setLocalProps(newProps);
    setDirty(false);

    const prevProps = { ...node.properties };
    dispatch({
      type: 'UPDATE_NODE',
      nodeId: node.id,
      updates: { properties: { ...newProps } },
    });

    try {
      const updated = await apiUpdateNode(projectId, node.id, { properties: newProps });
      dispatch({
        type: 'UPDATE_NODE',
        nodeId: node.id,
        updates: { properties: updated.properties, computed_freq: updated.computed_freq },
      });
      // Reload computed_freq only — preserve client state (positions, selections)
      const project = await getProject(projectId);
      dispatch({ type: 'SYNC_FREQ', serverNodes: project.nodes });
    } catch (err) {
      dispatch({ type: 'UPDATE_NODE', nodeId: node.id, updates: { properties: prevProps } });
      setLocalProps(prevProps);
      showToast(err instanceof Error ? err.message : 'Failed to update property', 'error');
    }
  }, [node, projectId, localProps, dispatch, showToast]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      void commitChange();
    }
  }, [commitChange]);

  if (!node) {
    if (selectedNodes.length > 1) {
      return (
        <div className="property-panel">
          <div className="property-panel-header">Properties</div>
          <div className="property-panel-empty">
            {selectedNodes.length} nodes selected
          </div>
        </div>
      );
    }
    return (
      <div className="property-panel">
        <div className="property-panel-header">Properties</div>
        <div className="property-panel-empty">
          Select a node to edit its properties
        </div>
      </div>
    );
  }

  const ctype: ComponentType = node.type;

  return (
    <div className="property-panel">
      <div className="property-panel-header">Properties - {ctype}</div>

      {/* Type (read-only) */}
      <div className="property-field">
        <label>Type</label>
        <input type="text" value={ctype} readOnly />
      </div>

      {/* ID (read-only) */}
      <div className="property-field">
        <label>ID</label>
        <input type="text" value={node.id.slice(0, 8)} readOnly title={node.id} />
      </div>

      {/* Name (all types) */}
      <div className="property-field">
        <label>Name</label>
        <input
          type="text"
          value={localProps.name ?? ''}
          onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('name', e.target.value)}
          onBlur={() => void commitChange()}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Computed frequency (read-only) */}
      <div className="property-field">
        <label>Frequency</label>
        <input
          type="text"
          value={node.computed_freq !== null ? `${node.computed_freq} MHz` : 'N/A'}
          readOnly
        />
      </div>

      {/* PLL-specific */}
      {ctype === 'PLL' && (
        <>
          <div className="property-field">
            <label>Output Freq (MHz)</label>
            <input
              type="number"
              min={0}
              step={0.001}
              value={localProps.output_freq ?? ''}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                handleChange('output_freq', parseFloat(e.target.value) || 0)
              }
              onBlur={() => void commitChange()}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="property-field">
            <label>Input Freq (MHz)</label>
            <input
              type="text"
              value={localProps.input_freq !== undefined ? `${localProps.input_freq} MHz` : 'N/A'}
              readOnly
            />
          </div>
        </>
      )}

      {/* Divider-specific */}
      {ctype === 'Divider' && (
        <div className="property-field">
          <label>Ratio</label>
          <select
            value={localProps.ratio ?? 2}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              void handleChangeAndCommit('ratio', parseInt(e.target.value, 10) as DividerRatio);
            }}
          >
            {VALID_DIVIDER_RATIOS.map(r => (
              <option key={r} value={r}>
                /{r}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Mux-specific */}
      {ctype === 'Mux' && (
        <div className="property-field">
          <label>Select Index</label>
          <input
            type="number"
            min={0}
            value={localProps.select_index ?? 0}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              handleChange('select_index', parseInt(e.target.value, 10) || 0)
            }
            onBlur={() => void commitChange()}
            onKeyDown={handleKeyDown}
          />
        </div>
      )}

      {/* IPBlock-specific */}
      {ctype === 'IPBlock' && (
        <div className="property-field">
          <label>Power (mW)</label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={localProps.power_mw ?? 0}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              handleChange('power_mw', parseFloat(e.target.value) || 0)
            }
            onBlur={() => void commitChange()}
            onKeyDown={handleKeyDown}
          />
        </div>
      )}

      {/* ClockDomain-specific */}
      {ctype === 'ClockDomain' && (
        <>
          <div className="property-field">
            <label>Domain Name</label>
            <input
              type="text"
              value={localProps.domain_name ?? ''}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                handleChange('domain_name', e.target.value)
              }
              onBlur={() => void commitChange()}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="property-field">
            <label>Color</label>
            <input
              type="color"
              value={localProps.color ?? '#4A90D9'}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                void handleChangeAndCommit('color', e.target.value);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
