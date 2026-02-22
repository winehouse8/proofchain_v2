/**
 * Tests for ProofChain DependencyGraph
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../test-utils/in-memory-db.js';
import { createDependencyGraph } from './dependency-graph.js';
import type { DependencyGraph } from './dependency-graph.js';
import type Database from 'better-sqlite3';

describe('DependencyGraph', () => {
  let db: Database.Database;
  let graph: DependencyGraph;

  beforeEach(() => {
    db = createTestDb();
    graph = createDependencyGraph(db);
  });

  // ── addNode / getNode ──────────────────────────────────────────────────────

  describe('addNode', () => {
    it('adds a node to the graph', () => {
      graph.addNode({ id: 'fn:foo', type: 'function', content_hash: 'abc123' });
      expect(graph.nodeCount()).toBe(1);
    });

    it('is idempotent (INSERT OR REPLACE)', () => {
      graph.addNode({ id: 'fn:foo', type: 'function', content_hash: 'abc123' });
      graph.addNode({ id: 'fn:foo', type: 'function', content_hash: 'def456' });
      expect(graph.nodeCount()).toBe(1);
      expect(graph.getNode('fn:foo')?.content_hash).toBe('def456');
    });
  });

  describe('getNode', () => {
    it('returns null for a non-existent node', () => {
      expect(graph.getNode('missing')).toBeNull();
    });

    it('returns the correct node with parsed JSON fields', () => {
      graph.addNode({
        id: 'fn:bar',
        type: 'function',
        file_path: 'src/bar.c',
        content_hash: 'hash1',
        interface_hash: 'ihash1',
        traced_requirements: ['REQ-001', 'REQ-002'],
        tested_by: ['test:bar_test'],
      });

      const node = graph.getNode('fn:bar');
      expect(node).not.toBeNull();
      expect(node!.id).toBe('fn:bar');
      expect(node!.type).toBe('function');
      expect(node!.file_path).toBe('src/bar.c');
      expect(node!.content_hash).toBe('hash1');
      expect(node!.interface_hash).toBe('ihash1');
      expect(node!.traced_requirements).toEqual(['REQ-001', 'REQ-002']);
      expect(node!.tested_by).toEqual(['test:bar_test']);
    });

    it('returns empty arrays when JSON fields are null', () => {
      graph.addNode({ id: 'fn:minimal', type: 'file', content_hash: 'x' });
      const node = graph.getNode('fn:minimal');
      expect(node!.traced_requirements).toEqual([]);
      expect(node!.tested_by).toEqual([]);
      expect(node!.interface_hash).toBeNull();
    });
  });

  // ── removeNode ─────────────────────────────────────────────────────────────

  describe('removeNode', () => {
    it('removes the node and all its edges', () => {
      graph.addNode({ id: 'A', type: 'function', content_hash: 'ha' });
      graph.addNode({ id: 'B', type: 'function', content_hash: 'hb' });
      graph.addNode({ id: 'C', type: 'function', content_hash: 'hc' });
      graph.addEdge('A', 'B', 'calls');
      graph.addEdge('B', 'C', 'calls');

      graph.removeNode('B');

      expect(graph.getNode('B')).toBeNull();
      expect(graph.nodeCount()).toBe(2);
      expect(graph.edgeCount()).toBe(0);
    });
  });

  // ── addEdge / removeEdge ───────────────────────────────────────────────────

  describe('addEdge', () => {
    it('creates an edge between two nodes', () => {
      graph.addNode({ id: 'X', type: 'function', content_hash: 'hx' });
      graph.addNode({ id: 'Y', type: 'function', content_hash: 'hy' });
      graph.addEdge('X', 'Y', 'calls');
      expect(graph.edgeCount()).toBe(1);
    });

    it('is idempotent (INSERT OR IGNORE)', () => {
      graph.addNode({ id: 'X', type: 'function', content_hash: 'hx' });
      graph.addNode({ id: 'Y', type: 'function', content_hash: 'hy' });
      graph.addEdge('X', 'Y', 'calls');
      graph.addEdge('X', 'Y', 'calls');
      expect(graph.edgeCount()).toBe(1);
    });
  });

  describe('removeEdge', () => {
    it('removes only the specified edge', () => {
      graph.addNode({ id: 'A', type: 'function', content_hash: 'ha' });
      graph.addNode({ id: 'B', type: 'function', content_hash: 'hb' });
      graph.addNode({ id: 'C', type: 'function', content_hash: 'hc' });
      graph.addEdge('A', 'B', 'calls');
      graph.addEdge('A', 'C', 'calls');

      graph.removeEdge('A', 'B', 'calls');

      expect(graph.edgeCount()).toBe(1);
      expect(graph.getDownstream('A').map(n => n.id)).toEqual(['C']);
    });
  });

  // ── getUpstream / getDownstream ────────────────────────────────────────────

  describe('getUpstream', () => {
    it('returns callers of an artifact', () => {
      // A -> B, C -> B  =>  upstream of B = [A, C]
      graph.addNode({ id: 'A', type: 'function', content_hash: 'ha' });
      graph.addNode({ id: 'B', type: 'function', content_hash: 'hb' });
      graph.addNode({ id: 'C', type: 'function', content_hash: 'hc' });
      graph.addEdge('A', 'B', 'calls');
      graph.addEdge('C', 'B', 'calls');

      const upstream = graph.getUpstream('B').map(n => n.id).sort();
      expect(upstream).toEqual(['A', 'C']);
    });

    it('returns empty array when nothing depends on the artifact', () => {
      graph.addNode({ id: 'Z', type: 'function', content_hash: 'hz' });
      expect(graph.getUpstream('Z')).toEqual([]);
    });
  });

  describe('getDownstream', () => {
    it('returns callees of an artifact', () => {
      // A -> B, A -> C  =>  downstream of A = [B, C]
      graph.addNode({ id: 'A', type: 'function', content_hash: 'ha' });
      graph.addNode({ id: 'B', type: 'function', content_hash: 'hb' });
      graph.addNode({ id: 'C', type: 'function', content_hash: 'hc' });
      graph.addEdge('A', 'B', 'calls');
      graph.addEdge('A', 'C', 'calls');

      const downstream = graph.getDownstream('A').map(n => n.id).sort();
      expect(downstream).toEqual(['B', 'C']);
    });

    it('returns empty array when artifact calls nothing', () => {
      graph.addNode({ id: 'Z', type: 'function', content_hash: 'hz' });
      expect(graph.getDownstream('Z')).toEqual([]);
    });
  });

  // ── updateNodeHash ─────────────────────────────────────────────────────────

  describe('updateNodeHash', () => {
    beforeEach(() => {
      graph.addNode({
        id: 'fn:target',
        type: 'function',
        content_hash: 'old-content',
        interface_hash: 'old-iface',
      });
    });

    it('updates content hash', () => {
      graph.updateNodeHash('fn:target', 'new-content');
      expect(graph.getNode('fn:target')!.content_hash).toBe('new-content');
    });

    it('updates interface hash when provided', () => {
      graph.updateNodeHash('fn:target', 'new-content', 'new-iface');
      const node = graph.getNode('fn:target')!;
      expect(node.content_hash).toBe('new-content');
      expect(node.interface_hash).toBe('new-iface');
    });

    it('clears interface hash when null is passed', () => {
      graph.updateNodeHash('fn:target', 'new-content', null);
      expect(graph.getNode('fn:target')!.interface_hash).toBeNull();
    });
  });

  // ── nodeCount / edgeCount ──────────────────────────────────────────────────

  describe('nodeCount and edgeCount', () => {
    it('returns 0 for empty graph', () => {
      expect(graph.nodeCount()).toBe(0);
      expect(graph.edgeCount()).toBe(0);
    });

    it('counts nodes and edges correctly', () => {
      graph.addNode({ id: 'A', type: 'function', content_hash: 'ha' });
      graph.addNode({ id: 'B', type: 'function', content_hash: 'hb' });
      graph.addNode({ id: 'C', type: 'function', content_hash: 'hc' });
      graph.addEdge('A', 'B', 'calls');
      graph.addEdge('B', 'C', 'calls');

      expect(graph.nodeCount()).toBe(3);
      expect(graph.edgeCount()).toBe(2);
    });
  });

  // ── getBlastRadius ─────────────────────────────────────────────────────────

  describe('getBlastRadius', () => {
    describe('interface change', () => {
      it('linear A->B->C: changing C interface marks B (dist 1) and A (dist 2)', () => {
        // A -> B -> C  means A calls B, B calls C
        graph.addNode({ id: 'A', type: 'function', content_hash: 'ha' });
        graph.addNode({ id: 'B', type: 'function', content_hash: 'hb' });
        graph.addNode({ id: 'C', type: 'function', content_hash: 'hc' });
        graph.addEdge('A', 'B', 'calls');
        graph.addEdge('B', 'C', 'calls');

        const result = graph.getBlastRadius('C', true);

        const ids = result.affected.map(a => a.artifact_id);
        expect(ids).toContain('B');
        expect(ids).toContain('A');
        expect(result.total).toBe(2);

        const b = result.affected.find(a => a.artifact_id === 'B')!;
        const a = result.affected.find(a => a.artifact_id === 'A')!;
        expect(b.distance).toBe(1);
        expect(a.distance).toBe(2);
      });

      it('diamond A->B, A->C, B->D, C->D: changing D interface marks B, C (dist 1) and A (dist 2)', () => {
        graph.addNode({ id: 'A', type: 'function', content_hash: 'ha' });
        graph.addNode({ id: 'B', type: 'function', content_hash: 'hb' });
        graph.addNode({ id: 'C', type: 'function', content_hash: 'hc' });
        graph.addNode({ id: 'D', type: 'function', content_hash: 'hd' });
        graph.addEdge('A', 'B', 'calls');
        graph.addEdge('A', 'C', 'calls');
        graph.addEdge('B', 'D', 'calls');
        graph.addEdge('C', 'D', 'calls');

        const result = graph.getBlastRadius('D', true);

        const ids = result.affected.map(a => a.artifact_id).sort();
        expect(ids).toContain('B');
        expect(ids).toContain('C');
        expect(ids).toContain('A');
        expect(result.total).toBe(3);

        // A should appear only once (visited set prevents duplicates)
        const aCount = result.affected.filter(a => a.artifact_id === 'A').length;
        expect(aCount).toBe(1);
      });

      it('circular A->B->C->A: blast radius terminates without infinite loop', () => {
        graph.addNode({ id: 'A', type: 'function', content_hash: 'ha' });
        graph.addNode({ id: 'B', type: 'function', content_hash: 'hb' });
        graph.addNode({ id: 'C', type: 'function', content_hash: 'hc' });
        graph.addEdge('A', 'B', 'calls');
        graph.addEdge('B', 'C', 'calls');
        graph.addEdge('C', 'A', 'calls');

        // Should not hang or throw
        const result = graph.getBlastRadius('A', true);
        expect(result.total).toBeGreaterThanOrEqual(0);
        // All three are in a cycle, changing A's interface affects B and C
        const ids = result.affected.map(a => a.artifact_id);
        expect(ids).toContain('C'); // C -> A, so C is upstream of A
        expect(ids).toContain('B'); // B -> C -> A transitively
      });

      it('disconnected A, B: changing A has empty blast radius', () => {
        graph.addNode({ id: 'A', type: 'function', content_hash: 'ha' });
        graph.addNode({ id: 'B', type: 'function', content_hash: 'hb' });

        const result = graph.getBlastRadius('A', true);

        expect(result.affected).toEqual([]);
        expect(result.total).toBe(0);
      });
    });

    describe('implementation change', () => {
      it('linear A->B->C: changing C implementation marks only B (1 hop), A stays unaffected', () => {
        graph.addNode({ id: 'A', type: 'function', content_hash: 'ha' });
        graph.addNode({ id: 'B', type: 'function', content_hash: 'hb' });
        graph.addNode({ id: 'C', type: 'function', content_hash: 'hc' });
        graph.addEdge('A', 'B', 'calls');
        graph.addEdge('B', 'C', 'calls');

        const result = graph.getBlastRadius('C', false);

        const ids = result.affected.map(a => a.artifact_id);
        expect(ids).toContain('B');
        expect(ids).not.toContain('A');
        expect(result.total).toBe(1);
        expect(result.affected[0].distance).toBe(1);
      });

      it('disconnected A, B: changing A has empty blast radius', () => {
        graph.addNode({ id: 'A', type: 'function', content_hash: 'ha' });
        graph.addNode({ id: 'B', type: 'function', content_hash: 'hb' });

        const result = graph.getBlastRadius('A', false);

        expect(result.affected).toEqual([]);
        expect(result.total).toBe(0);
      });
    });
  });
});
