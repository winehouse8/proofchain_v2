// Clock Tree Engine - Core Service
// Implements REQ-CT-001 (graph model), REQ-CT-005 (cycle detection),
// REQ-CT-007/008 (frequency propagation), REQ-CT-010 (CDC), REQ-CT-011 (gating)

import type Database from 'better-sqlite3';
import type {
  ClockNode,
  ClockEdge,
  ComponentType,
  CDCCrossing,
  GatingAnalysis,
  NodeProperties,
} from '../models/types.js';
import { parsePort, FREQ_PRECISION } from '../models/types.js';

// ==================== In-Memory Graph ====================

interface AdjacencyEntry {
  targetNodeId: string;
  edgeId: string;
}

export interface ClockTreeGraph {
  nodes: Map<string, ClockNode>;
  edges: Map<string, ClockEdge>;
  /** nodeId -> list of outgoing adjacency entries */
  adjOut: Map<string, AdjacencyEntry[]>;
  /** nodeId -> list of incoming adjacency entries */
  adjIn: Map<string, AdjacencyEntry[]>;
}

// ==================== Graph Construction ====================

export function buildGraph(db: Database.Database, projectId: string): ClockTreeGraph {
  const graph: ClockTreeGraph = {
    nodes: new Map(),
    edges: new Map(),
    adjOut: new Map(),
    adjIn: new Map(),
  };

  const nodeRows = db.prepare(
    'SELECT id, type, properties, position_x, position_y, computed_freq FROM nodes WHERE project_id = ?'
  ).all(projectId) as Array<{
    id: string;
    type: ComponentType;
    properties: string;
    position_x: number;
    position_y: number;
    computed_freq: number | null;
  }>;

  for (const row of nodeRows) {
    const node: ClockNode = {
      id: row.id,
      type: row.type,
      properties: JSON.parse(row.properties) as NodeProperties,
      position: { x: row.position_x, y: row.position_y },
      computed_freq: row.computed_freq,
    };
    graph.nodes.set(node.id, node);
    graph.adjOut.set(node.id, []);
    graph.adjIn.set(node.id, []);
  }

  const edgeRows = db.prepare(
    'SELECT id, source, target FROM edges WHERE project_id = ?'
  ).all(projectId) as Array<{ id: string; source: string; target: string }>;

  for (const row of edgeRows) {
    const edge: ClockEdge = { id: row.id, source: row.source, target: row.target };
    graph.edges.set(edge.id, edge);

    const srcNodeId = parsePort(edge.source).nodeId;
    const tgtNodeId = parsePort(edge.target).nodeId;

    const outList = graph.adjOut.get(srcNodeId);
    if (outList) outList.push({ targetNodeId: tgtNodeId, edgeId: edge.id });

    const inList = graph.adjIn.get(tgtNodeId);
    if (inList) inList.push({ targetNodeId: srcNodeId, edgeId: edge.id });
  }

  return graph;
}

// ==================== Cycle Detection (REQ-CT-005) ====================
// DFS-based, O(V+E). Returns null if no cycle, or the cycle path if found.

export function detectCycle(
  graph: ClockTreeGraph,
  newSourceNodeId: string,
  newTargetNodeId: string,
): string[] | null {
  // Self-loop check
  if (newSourceNodeId === newTargetNodeId) {
    return [newSourceNodeId];
  }

  // Check if adding edge newSourceNodeId -> newTargetNodeId creates a cycle.
  // A cycle exists if there is already a path from newTargetNodeId to newSourceNodeId.
  // We do DFS from newTargetNodeId and see if we can reach newSourceNodeId.
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(current: string): boolean {
    if (current === newSourceNodeId) {
      path.push(current);
      return true;
    }
    if (visited.has(current)) return false;
    visited.add(current);
    path.push(current);

    const neighbors = graph.adjOut.get(current) || [];
    for (const neighbor of neighbors) {
      if (dfs(neighbor.targetNodeId)) {
        return true;
      }
    }

    path.pop();
    return false;
  }

  if (dfs(newTargetNodeId)) {
    return path;
  }

  return null;
}

// ==================== Topological Sort ====================

function topologicalSort(graph: ClockTreeGraph): string[] {
  const inDegree = new Map<string, number>();
  for (const nodeId of graph.nodes.keys()) {
    inDegree.set(nodeId, 0);
  }

  for (const edge of graph.edges.values()) {
    const tgtNodeId = parsePort(edge.target).nodeId;
    inDegree.set(tgtNodeId, (inDegree.get(tgtNodeId) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [nodeId, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(nodeId);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    const neighbors = graph.adjOut.get(current) || [];
    for (const neighbor of neighbors) {
      const newDeg = (inDegree.get(neighbor.targetNodeId) || 1) - 1;
      inDegree.set(neighbor.targetNodeId, newDeg);
      if (newDeg === 0) {
        queue.push(neighbor.targetNodeId);
      }
    }
  }

  return sorted;
}

// ==================== Frequency Propagation (REQ-CT-007, REQ-CT-008) ====================

function roundFreq(freq: number): number {
  const factor = Math.pow(10, FREQ_PRECISION);
  return Math.round(freq * factor) / factor;
}

/**
 * Get the input frequency for a node from its incoming edges.
 * For Mux nodes, returns the frequency of the selected input.
 * For other nodes with a single input port, returns the frequency from the connected source.
 */
function getInputFrequency(
  graph: ClockTreeGraph,
  nodeId: string,
  node: ClockNode,
): number | null {
  if (node.type === 'PLL') {
    // PLL generates its own frequency
    return node.properties.output_freq ?? null;
  }

  if (node.type === 'Mux') {
    return getMuxInputFrequency(graph, nodeId, node);
  }

  // For Divider, ClockGate, IPBlock, ClockDomain: single 'in' port
  // Find the edge targeting nodeId:in
  for (const edge of graph.edges.values()) {
    const tgt = parsePort(edge.target);
    if (tgt.nodeId === nodeId && tgt.portName === 'in') {
      const srcNodeId = parsePort(edge.source).nodeId;
      const srcNode = graph.nodes.get(srcNodeId);
      return srcNode?.computed_freq ?? null;
    }
  }

  // No incoming connection
  return null;
}

function getMuxInputFrequency(
  graph: ClockTreeGraph,
  nodeId: string,
  node: ClockNode,
): number | null {
  const selectIndex = node.properties.select_index ?? 0;

  // Collect all connected mux input ports (in_0, in_1, ...)
  // Build a map of index -> source frequency
  const inputFreqs = new Map<number, number | null>();
  let maxIndex = -1;

  for (const edge of graph.edges.values()) {
    const tgt = parsePort(edge.target);
    if (tgt.nodeId === nodeId && tgt.portName.startsWith('in_')) {
      const idxStr = tgt.portName.substring(3);
      const idx = parseInt(idxStr, 10);
      if (!isNaN(idx)) {
        const srcNodeId = parsePort(edge.source).nodeId;
        const srcNode = graph.nodes.get(srcNodeId);
        inputFreqs.set(idx, srcNode?.computed_freq ?? null);
        if (idx > maxIndex) maxIndex = idx;
      }
    }
  }

  // If select_index is out of range of connected inputs, return null
  if (!inputFreqs.has(selectIndex)) {
    return null;
  }

  return inputFreqs.get(selectIndex) ?? null;
}

export function propagateFrequencies(graph: ClockTreeGraph): void {
  const sorted = topologicalSort(graph);

  for (const nodeId of sorted) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;

    let freq: number | null = null;

    switch (node.type) {
      case 'PLL': {
        const outputFreq = node.properties.output_freq;
        freq = (outputFreq != null && outputFreq > 0) ? roundFreq(outputFreq) : null;
        break;
      }
      case 'Divider': {
        const inputFreq = getInputFrequency(graph, nodeId, node);
        const ratio = node.properties.ratio;
        if (inputFreq != null && ratio != null && ratio > 0) {
          freq = roundFreq(inputFreq / ratio);
        } else {
          freq = null;
        }
        break;
      }
      case 'Mux': {
        freq = getMuxInputFrequency(graph, nodeId, node);
        if (freq != null) freq = roundFreq(freq);
        break;
      }
      case 'ClockGate':
      case 'ClockDomain': {
        // Pass-through
        freq = getInputFrequency(graph, nodeId, node);
        if (freq != null) freq = roundFreq(freq);
        break;
      }
      case 'IPBlock': {
        // Receives input frequency
        freq = getInputFrequency(graph, nodeId, node);
        if (freq != null) freq = roundFreq(freq);
        break;
      }
    }

    node.computed_freq = freq;
  }
}

/**
 * Propagate frequencies and persist results to DB.
 */
export function propagateAndPersist(db: Database.Database, projectId: string): ClockTreeGraph {
  const graph = buildGraph(db, projectId);
  propagateFrequencies(graph);

  const updateStmt = db.prepare(
    'UPDATE nodes SET computed_freq = ? WHERE id = ? AND project_id = ?'
  );

  const updateAll = db.transaction(() => {
    for (const node of graph.nodes.values()) {
      updateStmt.run(node.computed_freq, node.id, projectId);
    }
  });

  updateAll();
  return graph;
}

// ==================== CDC Analysis (REQ-CT-010) ====================

/**
 * Determine domain membership for each node.
 * A node belongs to domain D if it is reachable from D's output ports via graph traversal.
 */
function computeDomainMembership(graph: ClockTreeGraph): Map<string, Set<string>> {
  // nodeId -> set of ClockDomain nodeIds it belongs to
  const membership = new Map<string, Set<string>>();

  // Find all ClockDomain nodes
  const clockDomains: string[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type === 'ClockDomain') {
      clockDomains.push(node.id);
    }
  }

  // For each domain, BFS from its output ports
  for (const domainId of clockDomains) {
    const visited = new Set<string>();
    const queue: string[] = [];

    // Find edges where source is domainId:out_*
    for (const edge of graph.edges.values()) {
      const src = parsePort(edge.source);
      if (src.nodeId === domainId && src.portName.startsWith('out')) {
        const tgtNodeId = parsePort(edge.target).nodeId;
        if (!visited.has(tgtNodeId)) {
          visited.add(tgtNodeId);
          queue.push(tgtNodeId);
        }
      }
    }

    // BFS through the graph
    while (queue.length > 0) {
      const current = queue.shift()!;

      // Add to membership
      if (!membership.has(current)) {
        membership.set(current, new Set());
      }
      membership.get(current)!.add(domainId);

      // Follow outgoing edges
      const neighbors = graph.adjOut.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.targetNodeId)) {
          visited.add(neighbor.targetNodeId);
          queue.push(neighbor.targetNodeId);
        }
      }
    }
  }

  return membership;
}

export function analyzeCDC(graph: ClockTreeGraph): CDCCrossing[] {
  const membership = computeDomainMembership(graph);
  const crossings: CDCCrossing[] = [];

  for (const edge of graph.edges.values()) {
    const srcNodeId = parsePort(edge.source).nodeId;
    const tgtNodeId = parsePort(edge.target).nodeId;

    const srcDomains = membership.get(srcNodeId);
    const tgtDomains = membership.get(tgtNodeId);

    // Skip nodes not belonging to any domain
    if (!srcDomains || srcDomains.size === 0) continue;
    if (!tgtDomains || tgtDomains.size === 0) continue;

    // Check if they belong to different domains
    for (const srcDomain of srcDomains) {
      for (const tgtDomain of tgtDomains) {
        if (srcDomain !== tgtDomain) {
          crossings.push({
            source_domain: srcDomain,
            target_domain: tgtDomain,
            source_node: srcNodeId,
            target_node: tgtNodeId,
            edge_id: edge.id,
          });
        }
      }
    }
  }

  return crossings;
}

// ==================== Gating Analysis (REQ-CT-011) ====================

export function analyzeGating(graph: ClockTreeGraph): GatingAnalysis {
  // Find all IPBlock nodes
  const ipBlocks: string[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type === 'IPBlock') {
      ipBlocks.push(node.id);
    }
  }

  const totalCount = ipBlocks.length;
  if (totalCount === 0) {
    return { gated_count: 0, ungated_count: 0, total_count: 0, power_reduction_pct: 0 };
  }

  // Find all ClockGate nodes
  const clockGates = new Set<string>();
  for (const node of graph.nodes.values()) {
    if (node.type === 'ClockGate') {
      clockGates.add(node.id);
    }
  }

  // For each ClockGate, find all IPBlock nodes downstream via BFS
  const gatedIpBlocks = new Set<string>();

  for (const gateId of clockGates) {
    const visited = new Set<string>();
    const queue: string[] = [gateId];
    visited.add(gateId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentNode = graph.nodes.get(current);

      if (currentNode && currentNode.type === 'IPBlock') {
        gatedIpBlocks.add(current);
      }

      const neighbors = graph.adjOut.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.targetNodeId)) {
          visited.add(neighbor.targetNodeId);
          queue.push(neighbor.targetNodeId);
        }
      }
    }
  }

  const gatedCount = gatedIpBlocks.size;
  const ungatedCount = totalCount - gatedCount;
  const powerReductionPct = roundFreq((gatedCount / totalCount) * 100);

  return {
    gated_count: gatedCount,
    ungated_count: ungatedCount,
    total_count: totalCount,
    power_reduction_pct: powerReductionPct,
  };
}
