// Clock Canvas - React Flow Canvas Wrapper
// REQ-CV-002 (drag&drop), REQ-CV-004-008 (selection, move),
// REQ-CV-009-012 (connections), REQ-CV-016-017 (zoom, pan)

import {
  useCallback,
  useMemo,
  type DragEvent,
} from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeTypes,
  type NodeChange,
  type EdgeChange,
  type IsValidConnection,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useAppState, useAppDispatch, useToast } from '../store.js';
import * as api from '../api.js';
import {
  DEFAULT_PROPERTIES,
  MAX_NODES_PER_PROJECT,
  parsePort,
  hasInputPort,
  hasOutputPort,
} from '../types.js';
import type { ComponentType, ClockNode, ClockEdge } from '../types.js';
import ClockNodeComponent, { type ClockNodeData } from './nodes/ClockNode.js';

// ==================== Node type registry ====================

const nodeTypes = {
  clockNode: ClockNodeComponent,
} as NodeTypes;

// ==================== Helpers ====================

function toFlowNodes(
  nodes: ClockNode[],
  selectedIds: Set<string>,
  cdcNodeIds: Set<string>,
): Node<ClockNodeData>[] {
  return nodes.map(n => ({
    id: n.id,
    type: 'clockNode',
    position: n.position,
    selected: selectedIds.has(n.id),
    data: {
      label: n.properties.name ?? n.type,
      componentType: n.type,
      properties: n.properties,
      computedFreq: n.computed_freq,
      selected: selectedIds.has(n.id),
      cdcHighlight: cdcNodeIds.has(n.id),
    },
  }));
}

function toFlowEdges(edges: ClockEdge[], selectedEdgeIds: Set<string>): Edge[] {
  return edges.map(e => {
    const srcParts = parsePort(e.source);
    const tgtParts = parsePort(e.target);
    return {
      id: e.id,
      source: srcParts.nodeId,
      sourceHandle: srcParts.portName,
      target: tgtParts.nodeId,
      targetHandle: tgtParts.portName,
      selected: selectedEdgeIds.has(e.id),
      animated: false,
    };
  });
}

// ==================== Canvas Component ====================

export default function Canvas() {
  const {
    projectId,
    nodes,
    edges,
    selectedNodeIds,
    selectedEdgeIds,
    cdcCrossings,
  } = useAppState();
  const dispatch = useAppDispatch();
  const showToast = useToast();
  const { screenToFlowPosition } = useReactFlow();

  // Build CDC highlight set
  const cdcNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of cdcCrossings) {
      ids.add(c.source_node);
      ids.add(c.target_node);
    }
    return ids;
  }, [cdcCrossings]);

  // Convert to React Flow nodes/edges
  const flowNodes = useMemo(
    () => toFlowNodes(nodes, selectedNodeIds, cdcNodeIds),
    [nodes, selectedNodeIds, cdcNodeIds],
  );

  const flowEdges = useMemo(
    () => toFlowEdges(edges, selectedEdgeIds),
    [edges, selectedEdgeIds],
  );

  // ==================== Node Changes ====================

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position && change.dragging === false) {
          // REQ-CV-008: Drag node = move, update position to backend
          if (!projectId) continue;
          const nodeId = change.id;
          const position = change.position;

          dispatch({
            type: 'UPDATE_NODE',
            nodeId,
            updates: { position },
          });

          void api.updateNode(projectId, nodeId, { position }).catch(err => {
            showToast(err instanceof Error ? err.message : 'Failed to move node', 'error');
          });
        } else if (change.type === 'position' && change.position) {
          // Live position update while dragging (no API call)
          dispatch({
            type: 'UPDATE_NODE',
            nodeId: change.id,
            updates: { position: change.position },
          });
        } else if (change.type === 'select') {
          // REQ-CV-004, REQ-CV-005, REQ-CV-006
          if (change.selected) {
            dispatch({ type: 'SELECT_NODE', nodeId: change.id, multi: false });
          }
          // Deselect is handled by pane click
        }
      }
    },
    [projectId, dispatch, showToast],
  );

  // ==================== Edge Changes ====================

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'select' && change.selected) {
          dispatch({ type: 'SELECT_EDGE', edgeId: change.id });
        }
      }
    },
    [dispatch],
  );

  // ==================== Connections (REQ-CV-009) ====================

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!projectId) {
        showToast('Save the project first', 'info');
        return;
      }
      if (!connection.source || !connection.target) return;

      const sourcePort = `${connection.source}:${connection.sourceHandle ?? 'out'}`;
      const targetPort = `${connection.target}:${connection.targetHandle ?? 'in'}`;

      try {
        const edge = await api.createConnection(projectId, {
          source: sourcePort,
          target: targetPort,
        });
        dispatch({ type: 'ADD_EDGE', edge });

        // Reload project to get updated computed_freq values
        const updated = await api.getProject(projectId);
        dispatch({ type: 'SET_NODES', nodes: updated.nodes });
      } catch (err) {
        // REQ-CV-011: Reject invalid connections with toast
        showToast(err instanceof Error ? err.message : 'Invalid connection', 'error');
      }
    },
    [projectId, dispatch, showToast],
  );

  // ==================== Connection validation ====================

  const isValidConnection: IsValidConnection = useCallback(
    (connection: Edge | Connection): boolean => {
      const src = 'source' in connection ? connection.source : null;
      const tgt = 'target' in connection ? connection.target : null;
      if (!src || !tgt) return false;
      if (src === tgt) return false;

      // Find source and target nodes
      const srcNode = nodes.find(n => n.id === src);
      const tgtNode = nodes.find(n => n.id === tgt);
      if (!srcNode || !tgtNode) return false;

      // Check port directions
      if (!hasOutputPort(srcNode.type)) return false;
      if (!hasInputPort(tgtNode.type)) return false;

      return true;
    },
    [nodes],
  );

  // ==================== Drag & Drop (REQ-CV-002, REQ-CV-003) ====================

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();

      const type = e.dataTransfer.getData('application/clock-canvas-type') as ComponentType;
      if (!type) return; // REQ-CV-003: No valid type = no node

      // Check max nodes
      if (nodes.length >= MAX_NODES_PER_PROJECT) {
        showToast(`Maximum ${MAX_NODES_PER_PROJECT} nodes reached`, 'error');
        return;
      }

      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      // If no project yet, create one first (REQ-CV-027)
      let pid = projectId;
      if (!pid) {
        const name = window.prompt('Project name:', 'Untitled');
        if (!name) return;
        try {
          const project = await api.createProject(name);
          pid = project.id;
          dispatch({
            type: 'SET_PROJECT',
            projectId: project.id,
            projectName: project.name,
            nodes: [],
            edges: [],
          });
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Failed to create project', 'error');
          return;
        }
      }

      try {
        const node = await api.createNode(pid, {
          type,
          properties: { ...DEFAULT_PROPERTIES[type] },
          position,
        });
        dispatch({ type: 'ADD_NODE', node });
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to create node', 'error');
      }
    },
    [projectId, nodes.length, dispatch, showToast, screenToFlowPosition],
  );

  // ==================== Keyboard (REQ-CV-007, REQ-CV-012) ====================

  const onKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!projectId) return;

        // Delete selected edges (REQ-CV-012)
        for (const edgeId of selectedEdgeIds) {
          try {
            await api.deleteConnection(projectId, edgeId);
            dispatch({ type: 'REMOVE_EDGE', edgeId });
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to delete connection', 'error');
          }
        }

        // Delete selected nodes (REQ-CV-007)
        for (const nodeId of selectedNodeIds) {
          try {
            await api.deleteNode(projectId, nodeId);
            dispatch({ type: 'REMOVE_NODE', nodeId });
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to delete node', 'error');
          }
        }

        // Refresh node frequencies after deletion
        if (selectedNodeIds.size > 0 || selectedEdgeIds.size > 0) {
          try {
            const updated = await api.getProject(projectId);
            dispatch({ type: 'SET_NODES', nodes: updated.nodes });
            dispatch({ type: 'SET_EDGES', edges: updated.edges });
          } catch {
            // non-critical refresh failure
          }
        }
      }
    },
    [projectId, selectedNodeIds, selectedEdgeIds, dispatch, showToast],
  );

  // ==================== Pane Click (REQ-CV-006) ====================

  const onPaneClick = useCallback(() => {
    dispatch({ type: 'DESELECT_ALL' });
  }, [dispatch]);

  return (
    <div
      className="canvas-wrapper"
      onKeyDown={e => void onKeyDown(e)}
      tabIndex={0}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={conn => void onConnect(conn)}
        onDrop={e => void onDrop(e)}
        onDragOver={onDragOver}
        onPaneClick={onPaneClick}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        minZoom={0.25}
        maxZoom={4}
        fitView
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        selectNodesOnDrag={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
