// Clock Canvas Web - Shared Types
// Derived from SPEC-CC-CT, SPEC-CC-CG, SPEC-CC-CV

// ==================== Component Types ====================

export type ComponentType = 'PLL' | 'Divider' | 'Mux' | 'ClockGate' | 'IPBlock' | 'ClockDomain';

export const VALID_DIVIDER_RATIOS = [2, 4, 8, 16, 32, 64, 128] as const;
export type DividerRatio = typeof VALID_DIVIDER_RATIOS[number];

export const MAX_NODES_PER_PROJECT = 200;
export const MAX_PLL_FREQ = 10000; // MHz
export const FREQ_PRECISION = 3; // decimal places

// ==================== Port Definitions ====================

export interface PortDefinition {
  name: string;
  direction: 'input' | 'output' | 'control';
}

export const PORT_DEFINITIONS: Record<ComponentType, PortDefinition[]> = {
  PLL: [
    { name: 'out', direction: 'output' },
  ],
  Divider: [
    { name: 'in', direction: 'input' },
    { name: 'out', direction: 'output' },
  ],
  Mux: [
    // in_0, in_1, ..., in_n are dynamic; sel is control; out is output
    { name: 'sel', direction: 'control' },
    { name: 'out', direction: 'output' },
  ],
  ClockGate: [
    { name: 'in', direction: 'input' },
    { name: 'out', direction: 'output' },
    { name: 'en', direction: 'control' },
  ],
  IPBlock: [
    { name: 'in', direction: 'input' },
  ],
  ClockDomain: [
    { name: 'in', direction: 'input' },
    // out_0, out_1, ..., out_n are dynamic
  ],
};

// ==================== Node ====================

export interface NodeProperties {
  name?: string;
  // PLL
  output_freq?: number;
  input_freq?: number;
  // Divider
  ratio?: DividerRatio;
  // Mux
  select_index?: number;
  // IPBlock
  power_mw?: number;
  // ClockDomain
  domain_name?: string;
  color?: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface ClockNode {
  id: string;
  type: ComponentType;
  properties: NodeProperties;
  position: Position;
  computed_freq: number | null; // MHz, calculated by frequency propagation
}

// ==================== Edge ====================

export interface ClockEdge {
  id: string;
  source: string; // "nodeId:portName"
  target: string; // "nodeId:portName"
}

// ==================== Project ====================

export interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectData extends Project {
  nodes: ClockNode[];
  edges: ClockEdge[];
}

export interface ProjectListItem extends Project {
  node_count: number;
}

// ==================== API Request/Response Types ====================

export interface CreateNodeRequest {
  type: ComponentType;
  properties: NodeProperties;
  position?: Position;
}

export interface UpdateNodeRequest {
  properties?: Partial<NodeProperties>;
  position?: Position;
}

export interface CreateConnectionRequest {
  source: string; // "nodeId:portName"
  target: string; // "nodeId:portName"
}

export interface CreateProjectRequest {
  name: string;
}

// ==================== Analysis Types ====================

export interface CDCCrossing {
  source_domain: string;
  target_domain: string;
  source_node: string;
  target_node: string;
  edge_id: string;
}

export interface GatingAnalysis {
  gated_count: number;
  ungated_count: number;
  total_count: number;
  power_reduction_pct: number;
}

// ==================== Code Generation Types ====================

export interface CodePreview {
  rtl: string;
  sdc: string;
}

export interface IncompleteItem {
  node_id: string;
  node_type: ComponentType;
  reason: string;
}

export interface ValidationResult {
  valid: boolean;
  incomplete_items: IncompleteItem[];
}

// ==================== Export/Import Schema ====================

export interface ExportSchema {
  schema_version: string;
  project_name: string;
  exported_at: string;
  nodes: Array<{
    id: string;
    type: ComponentType;
    properties: NodeProperties;
    position: Position;
  }>;
  edges: Array<{
    source: string;
    target: string;
  }>;
}

export const SCHEMA_VERSION = '1.0';

// ==================== Error Types ====================

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export interface ValidationError {
  errors: Array<{
    field: string;
    message: string;
  }>;
}

// ==================== Required Properties per Type ====================

export const REQUIRED_PROPERTIES: Record<ComponentType, string[]> = {
  PLL: ['output_freq'],
  Divider: ['ratio'],
  Mux: ['select_index'],
  ClockGate: [],
  IPBlock: [],
  ClockDomain: [],
};

// ==================== Default Properties per Type ====================

export const DEFAULT_PROPERTIES: Record<ComponentType, NodeProperties> = {
  PLL: { output_freq: 100, input_freq: 0, name: 'PLL' },
  Divider: { ratio: 2, name: 'Divider' },
  Mux: { select_index: 0, name: 'Mux' },
  ClockGate: { name: 'ClockGate' },
  IPBlock: { power_mw: 0, name: 'IPBlock' },
  ClockDomain: { domain_name: 'domain', color: '#4A90D9', name: 'ClockDomain' },
};

// ==================== Helpers ====================

export function parsePort(portRef: string): { nodeId: string; portName: string } {
  const colonIdx = portRef.indexOf(':');
  if (colonIdx === -1) throw new Error(`Invalid port reference: ${portRef}`);
  return {
    nodeId: portRef.substring(0, colonIdx),
    portName: portRef.substring(colonIdx + 1),
  };
}

export function hasInputPort(type: ComponentType): boolean {
  return type !== 'PLL';
}

export function hasOutputPort(type: ComponentType): boolean {
  return type !== 'IPBlock';
}
