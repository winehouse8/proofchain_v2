// Clock Tree Engine - Input Validation Service
// Implements REQ-CT-003 (node validation), REQ-CT-004/005/006 (connection validation),
// REQ-CT-016 (property validation), REQ-CT-018 (node count limit)

import type Database from 'better-sqlite3';
import type {
  ComponentType,
  CreateNodeRequest,
  CreateConnectionRequest,
  NodeProperties,
} from '../models/types.js';
import {
  VALID_DIVIDER_RATIOS,
  MAX_NODES_PER_PROJECT,
  MAX_PLL_FREQ,
  REQUIRED_PROPERTIES,
  parsePort,
  hasInputPort,
  hasOutputPort,
} from '../models/types.js';
import { buildGraph, detectCycle } from './clock-tree.js';

// ==================== Validation Result ====================

export interface ValidationFailure {
  status: number;
  error: string;
  message: string;
}

function fail(status: number, message: string): ValidationFailure {
  return { status, error: 'validation_error', message };
}

// ==================== Node Validation (REQ-CT-003) ====================

const VALID_COMPONENT_TYPES: ComponentType[] = [
  'PLL', 'Divider', 'Mux', 'ClockGate', 'IPBlock', 'ClockDomain',
];

export function validateNodeCreation(
  body: CreateNodeRequest,
): ValidationFailure | null {
  // Check component type
  if (!body.type || !VALID_COMPONENT_TYPES.includes(body.type)) {
    return fail(400, `Unknown component type: '${body.type ?? 'undefined'}'. Valid types: ${VALID_COMPONENT_TYPES.join(', ')}`);
  }

  // Check required properties
  const required = REQUIRED_PROPERTIES[body.type];
  if (!required) return null;

  const props = body.properties || {};
  for (const prop of required) {
    if (props[prop as keyof NodeProperties] === undefined || props[prop as keyof NodeProperties] === null) {
      return fail(400, `Missing required property '${prop}' for component type '${body.type}'`);
    }
  }

  // Validate property values for typed components
  return validatePropertyValues(body.type, props);
}

// ==================== Property Validation (REQ-CT-016) ====================

export function validatePropertyValues(
  type: ComponentType,
  props: Partial<NodeProperties>,
): ValidationFailure | null {
  if (type === 'PLL' && props.output_freq !== undefined) {
    const freq = props.output_freq;
    if (typeof freq !== 'number' || freq <= 0) {
      return fail(400, `PLL output_freq must be a positive number, got: ${freq}`);
    }
    if (freq > MAX_PLL_FREQ) {
      return fail(400, `PLL output_freq must be <= ${MAX_PLL_FREQ}MHz, got: ${freq}`);
    }
  }

  if (type === 'Divider' && props.ratio !== undefined) {
    const ratio = props.ratio;
    if (!(VALID_DIVIDER_RATIOS as readonly number[]).includes(ratio as number)) {
      return fail(400, `Divider ratio must be one of {${VALID_DIVIDER_RATIOS.join(', ')}}, got: ${ratio}`);
    }
  }

  if (type === 'Mux' && props.select_index !== undefined) {
    const idx = props.select_index;
    if (typeof idx !== 'number' || idx < 0 || !Number.isInteger(idx)) {
      return fail(400, `Mux select_index must be a non-negative integer, got: ${idx}`);
    }
  }

  return null;
}

// ==================== Node Count Limit (REQ-CT-018) ====================

export function validateNodeCount(
  db: Database.Database,
  projectId: string,
): ValidationFailure | null {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM nodes WHERE project_id = ?'
  ).get(projectId) as { count: number } | undefined;

  const count = row?.count ?? 0;
  if (count >= MAX_NODES_PER_PROJECT) {
    return fail(400, `Maximum node limit of ${MAX_NODES_PER_PROJECT} has been reached for this project`);
  }
  return null;
}

// ==================== Connection Validation (REQ-CT-004, CT-005, CT-006) ====================

export function validateConnection(
  db: Database.Database,
  projectId: string,
  body: CreateConnectionRequest,
): ValidationFailure | null {
  if (!body.source || !body.target) {
    return fail(400, 'Both source and target port references are required');
  }

  // Parse port references
  let srcParsed: { nodeId: string; portName: string };
  let tgtParsed: { nodeId: string; portName: string };
  try {
    srcParsed = parsePort(body.source);
    tgtParsed = parsePort(body.target);
  } catch {
    return fail(400, 'Invalid port reference format. Expected "nodeId:portName"');
  }

  // (a) Both nodes must exist
  const srcNode = db.prepare(
    'SELECT id, type FROM nodes WHERE id = ? AND project_id = ?'
  ).get(srcParsed.nodeId, projectId) as { id: string; type: ComponentType } | undefined;

  const tgtNode = db.prepare(
    'SELECT id, type FROM nodes WHERE id = ? AND project_id = ?'
  ).get(tgtParsed.nodeId, projectId) as { id: string; type: ComponentType } | undefined;

  if (!srcNode || !tgtNode) {
    const missing = [];
    if (!srcNode) missing.push(srcParsed.nodeId);
    if (!tgtNode) missing.push(tgtParsed.nodeId);
    return fail(400, `Node(s) not found: ${missing.join(', ')}`);
  }

  // (e) Source node type must have an output port
  if (!hasOutputPort(srcNode.type)) {
    return fail(400, `${srcNode.type} does not have an output port`);
  }

  // (f) Target node type must have an input port
  if (!hasInputPort(tgtNode.type)) {
    return fail(400, `${tgtNode.type} does not have an input port`);
  }

  // (b) Source must be an output port, target must be an input port
  // Output ports: 'out', 'out_0', 'out_1', etc.
  // Input ports: 'in', 'in_0', 'in_1', etc.
  // Control ports (sel, en) are not clock signal connections for frequency propagation,
  // but we allow them as connections per SPEC constraint 10/11
  const isOutputPort = srcParsed.portName === 'out' || srcParsed.portName.startsWith('out_');
  if (!isOutputPort) {
    return fail(400, `Source port '${srcParsed.portName}' is not an output port`);
  }

  const isInputPort = tgtParsed.portName === 'in' || tgtParsed.portName.startsWith('in_');
  if (!isInputPort) {
    return fail(400, `Target port '${tgtParsed.portName}' is not an input port`);
  }

  // (c) Target input port must not already have a connection
  const existingConn = db.prepare(
    'SELECT id FROM edges WHERE project_id = ? AND target = ?'
  ).get(projectId, body.target) as { id: string } | undefined;

  if (existingConn) {
    return fail(400, `Target input port '${body.target}' is already occupied`);
  }

  // (d) Connection must not create a cycle (REQ-CT-005)
  const graph = buildGraph(db, projectId);
  const cyclePath = detectCycle(graph, srcParsed.nodeId, tgtParsed.nodeId);
  if (cyclePath) {
    return fail(400, `Connection would create a cycle: ${cyclePath.join(' → ')}`);
  }

  return null;
}
