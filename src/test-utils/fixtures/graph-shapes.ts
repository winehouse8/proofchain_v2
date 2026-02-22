/**
 * ProofChain Test Fixtures: Dependency Graph Shapes
 *
 * Reusable graph topologies for seeding the test database.
 * Each fixture defines nodes and edges that represent a specific
 * structural pattern useful for testing graph traversal, blast-radius
 * computation, and staleness propagation.
 */

import type { ArtifactType, DependencyEdgeType } from '../../core/types.js';

// ─── Fixture Interfaces ──────────────────────────────────────────────────────

export interface GraphFixtureNode {
  id: string;
  type: ArtifactType;
  file_path: string | null;
  content_hash: string;
  interface_hash: string | null;
}

export interface GraphFixtureEdge {
  from: string;
  to: string;
  edge_type: DependencyEdgeType;
}

export interface GraphFixture {
  name: string;
  description: string;
  nodes: readonly GraphFixtureNode[];
  edges: readonly GraphFixtureEdge[];
  expected_node_count: number;
  expected_edge_count: number;
}

// ─── Shape: LINEAR (A→B→C) ───────────────────────────────────────────────────

export const LINEAR: GraphFixture = {
  name: 'LINEAR',
  description: 'Three functions calling each other in a straight chain: A→B→C.',
  nodes: [
    {
      id: 'src/brake.c::calc_force',
      type: 'function',
      file_path: 'src/brake.c',
      content_hash: 'sha256:aabb01',
      interface_hash: 'sha256:if0001',
    },
    {
      id: 'src/brake.c::apply_pressure',
      type: 'function',
      file_path: 'src/brake.c',
      content_hash: 'sha256:aabb02',
      interface_hash: 'sha256:if0002',
    },
    {
      id: 'src/brake.c::engage_piston',
      type: 'function',
      file_path: 'src/brake.c',
      content_hash: 'sha256:aabb03',
      interface_hash: 'sha256:if0003',
    },
  ],
  edges: [
    { from: 'src/brake.c::calc_force',    to: 'src/brake.c::apply_pressure', edge_type: 'calls' },
    { from: 'src/brake.c::apply_pressure', to: 'src/brake.c::engage_piston',  edge_type: 'calls' },
  ],
  expected_node_count: 3,
  expected_edge_count: 2,
};

// ─── Shape: DIAMOND (A→B, A→C, B→D, C→D) ────────────────────────────────────

export const DIAMOND: GraphFixture = {
  name: 'DIAMOND',
  description:
    'Classic diamond dependency: A depends on B and C, both B and C depend on D.',
  nodes: [
    {
      id: 'src/abs.c::abs_control',
      type: 'function',
      file_path: 'src/abs.c',
      content_hash: 'sha256:ccdd01',
      interface_hash: 'sha256:if0011',
    },
    {
      id: 'src/abs.c::wheel_speed_left',
      type: 'function',
      file_path: 'src/abs.c',
      content_hash: 'sha256:ccdd02',
      interface_hash: 'sha256:if0012',
    },
    {
      id: 'src/abs.c::wheel_speed_right',
      type: 'function',
      file_path: 'src/abs.c',
      content_hash: 'sha256:ccdd03',
      interface_hash: 'sha256:if0013',
    },
    {
      id: 'src/abs.c::read_sensor',
      type: 'function',
      file_path: 'src/abs.c',
      content_hash: 'sha256:ccdd04',
      interface_hash: 'sha256:if0014',
    },
  ],
  edges: [
    { from: 'src/abs.c::abs_control',       to: 'src/abs.c::wheel_speed_left',  edge_type: 'calls' },
    { from: 'src/abs.c::abs_control',       to: 'src/abs.c::wheel_speed_right', edge_type: 'calls' },
    { from: 'src/abs.c::wheel_speed_left',  to: 'src/abs.c::read_sensor',       edge_type: 'calls' },
    { from: 'src/abs.c::wheel_speed_right', to: 'src/abs.c::read_sensor',       edge_type: 'calls' },
  ],
  expected_node_count: 4,
  expected_edge_count: 4,
};

// ─── Shape: CIRCULAR (A→B→C→A) ───────────────────────────────────────────────

export const CIRCULAR: GraphFixture = {
  name: 'CIRCULAR',
  description:
    'Circular dependency: A calls B, B calls C, C calls back to A. ' +
    'Should be handled gracefully without infinite loops.',
  nodes: [
    {
      id: 'src/fsm.c::state_idle',
      type: 'function',
      file_path: 'src/fsm.c',
      content_hash: 'sha256:eeff01',
      interface_hash: 'sha256:if0021',
    },
    {
      id: 'src/fsm.c::state_active',
      type: 'function',
      file_path: 'src/fsm.c',
      content_hash: 'sha256:eeff02',
      interface_hash: 'sha256:if0022',
    },
    {
      id: 'src/fsm.c::state_error',
      type: 'function',
      file_path: 'src/fsm.c',
      content_hash: 'sha256:eeff03',
      interface_hash: 'sha256:if0023',
    },
  ],
  edges: [
    { from: 'src/fsm.c::state_idle',   to: 'src/fsm.c::state_active', edge_type: 'calls' },
    { from: 'src/fsm.c::state_active', to: 'src/fsm.c::state_error',  edge_type: 'calls' },
    { from: 'src/fsm.c::state_error',  to: 'src/fsm.c::state_idle',   edge_type: 'calls' },
  ],
  expected_node_count: 3,
  expected_edge_count: 3,
};

// ─── Shape: DISCONNECTED (A, B — no edges) ───────────────────────────────────

export const DISCONNECTED: GraphFixture = {
  name: 'DISCONNECTED',
  description:
    'Two completely unrelated functions with no dependency edges between them.',
  nodes: [
    {
      id: 'src/engine.c::ignite',
      type: 'function',
      file_path: 'src/engine.c',
      content_hash: 'sha256:1122aa',
      interface_hash: 'sha256:if0031',
    },
    {
      id: 'src/hvac.c::set_temperature',
      type: 'function',
      file_path: 'src/hvac.c',
      content_hash: 'sha256:1122bb',
      interface_hash: null,
    },
  ],
  edges: [],
  expected_node_count: 2,
  expected_edge_count: 0,
};

// ─── Shape: FAN_OUT (A→B, A→C, A→D, A→E, A→F) ───────────────────────────────

export const FAN_OUT: GraphFixture = {
  name: 'FAN_OUT',
  description:
    'One function calls five downstream functions — tests wide blast-radius propagation.',
  nodes: [
    {
      id: 'src/safety_monitor.c::run_checks',
      type: 'function',
      file_path: 'src/safety_monitor.c',
      content_hash: 'sha256:ff0001',
      interface_hash: 'sha256:if0041',
    },
    {
      id: 'src/safety_monitor.c::check_voltage',
      type: 'function',
      file_path: 'src/safety_monitor.c',
      content_hash: 'sha256:ff0002',
      interface_hash: 'sha256:if0042',
    },
    {
      id: 'src/safety_monitor.c::check_temperature',
      type: 'function',
      file_path: 'src/safety_monitor.c',
      content_hash: 'sha256:ff0003',
      interface_hash: 'sha256:if0043',
    },
    {
      id: 'src/safety_monitor.c::check_pressure',
      type: 'function',
      file_path: 'src/safety_monitor.c',
      content_hash: 'sha256:ff0004',
      interface_hash: 'sha256:if0044',
    },
    {
      id: 'src/safety_monitor.c::check_rpm',
      type: 'function',
      file_path: 'src/safety_monitor.c',
      content_hash: 'sha256:ff0005',
      interface_hash: 'sha256:if0045',
    },
    {
      id: 'src/safety_monitor.c::check_torque',
      type: 'function',
      file_path: 'src/safety_monitor.c',
      content_hash: 'sha256:ff0006',
      interface_hash: 'sha256:if0046',
    },
  ],
  edges: [
    { from: 'src/safety_monitor.c::run_checks', to: 'src/safety_monitor.c::check_voltage',     edge_type: 'calls' },
    { from: 'src/safety_monitor.c::run_checks', to: 'src/safety_monitor.c::check_temperature', edge_type: 'calls' },
    { from: 'src/safety_monitor.c::run_checks', to: 'src/safety_monitor.c::check_pressure',    edge_type: 'calls' },
    { from: 'src/safety_monitor.c::run_checks', to: 'src/safety_monitor.c::check_rpm',         edge_type: 'calls' },
    { from: 'src/safety_monitor.c::run_checks', to: 'src/safety_monitor.c::check_torque',      edge_type: 'calls' },
  ],
  expected_node_count: 6,
  expected_edge_count: 5,
};

// ─── Aggregate Export ────────────────────────────────────────────────────────

export const GRAPH_FIXTURES: Readonly<Record<string, GraphFixture>> = {
  LINEAR,
  DIAMOND,
  CIRCULAR,
  DISCONNECTED,
  FAN_OUT,
};
