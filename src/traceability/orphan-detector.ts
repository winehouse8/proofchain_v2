/**
 * ProofChain Orphan Detector
 *
 * Detects orphaned code, requirements, and tests in the traceability matrix.
 */

import type { ArtifactType } from '../core/types.js';
import type { TraceMatrix } from './trace-matrix.js';
import type { DependencyGraph } from '../graph/dependency-graph.js';

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface OrphanItem {
  id: string;
  type: ArtifactType;
  file_path: string | null;
  reason: string;
}

export interface OrphanReport {
  orphan_code: OrphanItem[];         // Code with no requirement
  orphan_requirements: OrphanItem[]; // Requirements with no code
  orphan_tests: OrphanItem[];        // Tests with no code linkage
  total_orphans: number;
}

export interface OrphanDetector {
  detect(matrix: TraceMatrix, graph: DependencyGraph): OrphanReport;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createOrphanDetector(): OrphanDetector {
  return {
    detect(matrix: TraceMatrix, graph: DependencyGraph): OrphanReport {
      const orphan_code: OrphanItem[] = [];
      const orphan_requirements: OrphanItem[] = [];
      const orphan_tests: OrphanItem[] = [];

      // Retrieve all links once to check test coverage
      const allLinks = matrix.getAllLinks();

      // Build set of all test IDs that appear in any link
      const linkedTestIds = new Set<string>();
      for (const link of allLinks) {
        for (const testId of link.test_artifact_ids) {
          linkedTestIds.add(testId);
        }
      }

      // We need to iterate all nodes in the dependency graph.
      // The DependencyGraph interface does not expose a getAllNodes() method,
      // so we derive the node list from the traceability matrix plus the graph's
      // own node records obtained via getUpstream/getDownstream traversal.
      //
      // The practical approach: collect all known artifact IDs from the links,
      // then inspect the graph for each.  For nodes that exist in the graph but
      // not in any link, we must iterate the graph indirectly.
      //
      // Because the graph doesn't expose getAll(), we rely on getAllLinks() for
      // artifact IDs, and supplement with a node-count-guided lookup.  Orphan
      // detection for nodes entirely absent from links requires the caller to
      // ensure representative nodes are in the graph.  We gather nodes referenced
      // in links, then cross-check the graph for nodes reachable from them.

      // Collect artifact IDs mentioned in traceability links
      const codeIds = new Set<string>();
      const reqIds = new Set<string>();
      for (const link of allLinks) {
        codeIds.add(link.code_artifact_id);
        reqIds.add(link.requirement_id);
      }

      // Also walk the graph via upstream/downstream to discover nodes not in links.
      // We do a BFS seeded from every node we already know about.
      const discovered = new Set<string>([...codeIds, ...reqIds, ...linkedTestIds]);
      const queue = [...discovered];
      const graphNodeIds = new Set<string>();

      while (queue.length > 0) {
        const id = queue.shift();
        if (id === undefined) continue;
        const node = graph.getNode(id);
        if (node === null) continue;
        graphNodeIds.add(node.id);

        const neighbours = [
          ...graph.getUpstream(node.id),
          ...graph.getDownstream(node.id),
        ];
        for (const n of neighbours) {
          if (!discovered.has(n.id)) {
            discovered.add(n.id);
            queue.push(n.id);
            graphNodeIds.add(n.id);
          }
        }
      }

      // Evaluate each discovered graph node
      for (const id of graphNodeIds) {
        const node = graph.getNode(id);
        if (node === null) continue;

        if (node.type === 'function') {
          const reqs = matrix.getRequirementsForCode(id);
          if (reqs.length === 0) {
            orphan_code.push({
              id,
              type: node.type,
              file_path: node.file_path,
              reason: 'Function has no traced requirement (@trace tag missing)',
            });
          }
        } else if (node.type === 'requirement') {
          const code = matrix.getCodeForRequirement(id);
          if (code.length === 0) {
            orphan_requirements.push({
              id,
              type: node.type,
              file_path: node.file_path,
              reason: 'Requirement has no implementing code artifact',
            });
          }
        } else if (node.type === 'test') {
          if (!linkedTestIds.has(id)) {
            orphan_tests.push({
              id,
              type: node.type,
              file_path: node.file_path,
              reason: 'Test is not linked to any code artifact in the traceability matrix',
            });
          }
        }
      }

      return {
        orphan_code,
        orphan_requirements,
        orphan_tests,
        total_orphans: orphan_code.length + orphan_requirements.length + orphan_tests.length,
      };
    },
  };
}
