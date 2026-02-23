// Clock Canvas Client Types
// Re-exports from server types + client-specific types

import type {
  ClockNode as _ClockNode,
  ClockEdge as _ClockEdge,
  CDCCrossing as _CDCCrossing,
} from '../server/models/types.js';

export type {
  ComponentType,
  DividerRatio,
  PortDefinition,
  NodeProperties,
  Position,
  ClockNode,
  ClockEdge,
  Project,
  ProjectData,
  ProjectListItem,
  CreateNodeRequest,
  UpdateNodeRequest,
  CreateConnectionRequest,
  CreateProjectRequest,
  CDCCrossing,
  GatingAnalysis,
  CodePreview,
  ExportSchema,
  ApiError,
} from '../server/models/types.js';

export {
  VALID_DIVIDER_RATIOS,
  PORT_DEFINITIONS,
  DEFAULT_PROPERTIES,
  MAX_NODES_PER_PROJECT,
  parsePort,
  hasInputPort,
  hasOutputPort,
} from '../server/models/types.js';

// Local type aliases for use within this file
type ClockNode = _ClockNode;
type ClockEdge = _ClockEdge;
type CDCCrossing = _CDCCrossing;

// ==================== Client-only types ====================

export type ToastType = 'error' | 'success' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export interface AppState {
  projectId: string | null;
  projectName: string;
  nodes: ClockNode[];
  edges: ClockEdge[];
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
  toasts: Toast[];
  cdcCrossings: CDCCrossing[];
  loading: boolean;
}

export type AppAction =
  | { type: 'SET_PROJECT'; projectId: string; projectName: string; nodes: ClockNode[]; edges: ClockEdge[] }
  | { type: 'CLEAR_PROJECT' }
  | { type: 'SET_PROJECT_NAME'; name: string }
  | { type: 'ADD_NODE'; node: ClockNode }
  | { type: 'UPDATE_NODE'; nodeId: string; updates: Partial<ClockNode> }
  | { type: 'REMOVE_NODE'; nodeId: string }
  | { type: 'SET_NODES'; nodes: ClockNode[] }
  | { type: 'ADD_EDGE'; edge: ClockEdge }
  | { type: 'REMOVE_EDGE'; edgeId: string }
  | { type: 'SET_EDGES'; edges: ClockEdge[] }
  | { type: 'SELECT_NODE'; nodeId: string; multi: boolean }
  | { type: 'SELECT_EDGE'; edgeId: string }
  | { type: 'DESELECT_ALL' }
  | { type: 'ADD_TOAST'; toast: Toast }
  | { type: 'REMOVE_TOAST'; id: string }
  | { type: 'SET_CDC_CROSSINGS'; crossings: CDCCrossing[] }
  | { type: 'SET_LOADING'; loading: boolean };
