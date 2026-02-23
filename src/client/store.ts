// Clock Canvas - State Management (React Context + useReducer)

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type Dispatch,
  type ReactNode,
  createElement,
} from 'react';
import type { AppState, AppAction, Toast, ClockNode, ClockEdge, CDCCrossing } from './types.js';

// ==================== Initial State ====================

const initialState: AppState = {
  projectId: null,
  projectName: 'Untitled',
  nodes: [],
  edges: [],
  selectedNodeIds: new Set(),
  selectedEdgeIds: new Set(),
  toasts: [],
  cdcCrossings: [],
  loading: false,
};

// ==================== Reducer ====================

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECT':
      return {
        ...state,
        projectId: action.projectId,
        projectName: action.projectName,
        nodes: action.nodes,
        edges: action.edges,
        selectedNodeIds: new Set(),
        selectedEdgeIds: new Set(),
        cdcCrossings: [],
      };

    case 'CLEAR_PROJECT':
      return {
        ...initialState,
        toasts: state.toasts,
      };

    case 'SET_PROJECT_NAME':
      return { ...state, projectName: action.name };

    case 'ADD_NODE':
      return { ...state, nodes: [...state.nodes, action.node] };

    case 'UPDATE_NODE':
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === action.nodeId ? { ...n, ...action.updates } : n,
        ),
      };

    case 'REMOVE_NODE': {
      const newSelected = new Set(state.selectedNodeIds);
      newSelected.delete(action.nodeId);
      return {
        ...state,
        nodes: state.nodes.filter(n => n.id !== action.nodeId),
        edges: state.edges.filter(e => {
          const srcNodeId = e.source.split(':')[0];
          const tgtNodeId = e.target.split(':')[0];
          return srcNodeId !== action.nodeId && tgtNodeId !== action.nodeId;
        }),
        selectedNodeIds: newSelected,
      };
    }

    case 'SET_NODES':
      return { ...state, nodes: action.nodes };

    case 'ADD_EDGE':
      return { ...state, edges: [...state.edges, action.edge] };

    case 'REMOVE_EDGE': {
      const newSelectedEdges = new Set(state.selectedEdgeIds);
      newSelectedEdges.delete(action.edgeId);
      return {
        ...state,
        edges: state.edges.filter(e => e.id !== action.edgeId),
        selectedEdgeIds: newSelectedEdges,
      };
    }

    case 'SET_EDGES':
      return { ...state, edges: action.edges };

    case 'SELECT_NODE': {
      const next = new Set(action.multi ? state.selectedNodeIds : []);
      if (next.has(action.nodeId)) {
        next.delete(action.nodeId);
      } else {
        next.add(action.nodeId);
      }
      return { ...state, selectedNodeIds: next, selectedEdgeIds: new Set() };
    }

    case 'SELECT_EDGE':
      return {
        ...state,
        selectedNodeIds: new Set(),
        selectedEdgeIds: new Set([action.edgeId]),
      };

    case 'DESELECT_ALL':
      return { ...state, selectedNodeIds: new Set(), selectedEdgeIds: new Set() };

    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.toast] };

    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };

    case 'SET_CDC_CROSSINGS':
      return { ...state, cdcCrossings: action.crossings };

    case 'SET_LOADING':
      return { ...state, loading: action.loading };

    default:
      return state;
  }
}

// ==================== Context ====================

const AppStateContext = createContext<AppState>(initialState);
const AppDispatchContext = createContext<Dispatch<AppAction>>(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return createElement(
    AppStateContext.Provider,
    { value: state },
    createElement(AppDispatchContext.Provider, { value: dispatch }, children),
  );
}

export function useAppState(): AppState {
  return useContext(AppStateContext);
}

export function useAppDispatch(): Dispatch<AppAction> {
  return useContext(AppDispatchContext);
}

// ==================== Toast Helpers ====================

let toastCounter = 0;

export function useToast() {
  const dispatch = useAppDispatch();

  const showToast = useCallback(
    (message: string, type: Toast['type'] = 'info') => {
      const id = `toast-${++toastCounter}`;
      dispatch({ type: 'ADD_TOAST', toast: { id, message, type } });
      setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), 4000);
    },
    [dispatch],
  );

  return showToast;
}

// ==================== Selector Hooks ====================

export function useSelectedNodes(): ClockNode[] {
  const { nodes, selectedNodeIds } = useAppState();
  return nodes.filter(n => selectedNodeIds.has(n.id));
}

export function useNodeById(nodeId: string | null): ClockNode | undefined {
  const { nodes } = useAppState();
  if (!nodeId) return undefined;
  return nodes.find(n => n.id === nodeId);
}

export function useCdcCrossings(): CDCCrossing[] {
  const { cdcCrossings } = useAppState();
  return cdcCrossings;
}

export function useEdges(): ClockEdge[] {
  const { edges } = useAppState();
  return edges;
}
