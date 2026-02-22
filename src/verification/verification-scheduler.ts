/**
 * ProofChain Verification Scheduler
 *
 * Schedules re-verification work items by ASIL-weighted priority and dependency
 * order. Ensures that dependencies are verified before their dependents.
 */

import type { AsilLevel, ReverificationType, ReverificationWorkItem } from '../core/types.js';
import type { DependencyGraph } from '../graph/dependency-graph.js';
import type { ReverificationPlan } from '../ccp/reverification-planner.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ScheduledItem {
  /** The original work item from the reverification plan */
  work_item: ReverificationWorkItem;
  /** 1-based order in which this item should be verified */
  scheduled_order: number;
  /** Artifact IDs that must be verified before this one */
  dependencies: string[];
  /** Human-readable duration estimate for this item */
  estimated_duration: string;
}

export interface VerificationSchedule {
  items: ScheduledItem[];
  total_items: number;
  /** Artifact IDs forming the longest dependency chain (critical path) */
  critical_path: string[];
  /** Human-readable summary of the schedule */
  summary: string;
}

export interface VerificationScheduler {
  schedule(plan: ReverificationPlan, graph: DependencyGraph): VerificationSchedule;
}

// ─── ASIL Weights ─────────────────────────────────────────────────────────────

const ASIL_WEIGHTS: Readonly<Record<AsilLevel, number>> = {
  D: 5,
  C: 4,
  B: 3,
  A: 2,
  QM: 1,
};

// Verification type priority order (lower = higher priority)
const VERIF_TYPE_ORDER: Readonly<Record<ReverificationType, number>> = {
  safety: 0,
  integration: 1,
  unit: 2,
  full: 3,
};

// Minutes per item per verification type
const MINUTES_PER_ITEM: Readonly<Record<ReverificationType, number>> = {
  unit: 2,
  integration: 5,
  safety: 10,
  full: 15,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute a sort score for a work item. Lower = higher priority.
 * Primary key: -(ASIL_weight / distance) — uses the plan's existing priority field.
 * Tie-break: verification type order.
 */
function sortScore(item: ReverificationWorkItem): number {
  // item.priority is already distance/ASIL_weight (lower = more urgent)
  return item.priority * 10 + VERIF_TYPE_ORDER[item.verification_type];
}

function estimateDuration(verificationType: ReverificationType): string {
  const minutes = MINUTES_PER_ITEM[verificationType];
  return `~${minutes}m`;
}

/**
 * Find the longest path in a DAG using iterative DFS.
 * Returns the node IDs along the longest path.
 */
function findCriticalPath(
  nodeIds: Set<string>,
  adjacency: Map<string, string[]>,
): string[] {
  // Memoized longest-path from each node
  const memo = new Map<string, string[]>();

  function longestFrom(id: string): string[] {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;

    const children = adjacency.get(id) ?? [];
    let best: string[] = [];
    for (const child of children) {
      if (!nodeIds.has(child)) continue;
      const sub = longestFrom(child);
      if (sub.length > best.length) best = sub;
    }
    const result = [id, ...best];
    memo.set(id, result);
    return result;
  }

  let criticalPath: string[] = [];
  for (const id of nodeIds) {
    const path = longestFrom(id);
    if (path.length > criticalPath.length) criticalPath = path;
  }
  return criticalPath;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createVerificationScheduler(): VerificationScheduler {
  return {
    schedule(plan: ReverificationPlan, graph: DependencyGraph): VerificationSchedule {
      const workItems = plan.work_items;

      if (workItems.length === 0) {
        return {
          items: [],
          total_items: 0,
          critical_path: [],
          summary: 'No work items to schedule.',
        };
      }

      // Build a set of artifact IDs in this plan for quick lookup
      const planArtifactIds = new Set<string>(workItems.map((wi) => wi.artifact_id));

      // For each work item, find its dependencies within the plan:
      // If artifact A depends on B (B is downstream of A), and both need
      // reverification, B should be verified first.
      const dependencyMap = new Map<string, string[]>();
      for (const wi of workItems) {
        const downstream = graph.getDownstream(wi.artifact_id);
        const deps = downstream
          .filter((node) => planArtifactIds.has(node.id))
          .map((node) => node.id);
        dependencyMap.set(wi.artifact_id, deps);
      }

      // Topological sort with ASIL-weighted priority tie-breaking.
      // We do a modified Kahn's algorithm: process nodes whose dependencies
      // have all been scheduled, picking the highest-priority available node next.
      const inDegree = new Map<string, number>();
      const reverseDeps = new Map<string, string[]>(); // dep -> items that need it
      for (const wi of workItems) {
        if (!inDegree.has(wi.artifact_id)) inDegree.set(wi.artifact_id, 0);
        const deps = dependencyMap.get(wi.artifact_id) ?? [];
        for (const dep of deps) {
          inDegree.set(wi.artifact_id, (inDegree.get(wi.artifact_id) ?? 0) + 1);
          if (!reverseDeps.has(dep)) reverseDeps.set(dep, []);
          reverseDeps.get(dep)!.push(wi.artifact_id);
        }
      }

      // Build item lookup by artifact_id
      const itemByArtifact = new Map<string, ReverificationWorkItem>();
      for (const wi of workItems) {
        itemByArtifact.set(wi.artifact_id, wi);
      }

      // Available queue: items with in-degree 0
      const available: ReverificationWorkItem[] = workItems.filter(
        (wi) => (inDegree.get(wi.artifact_id) ?? 0) === 0,
      );

      // Sort available by score (ascending)
      available.sort((a, b) => sortScore(a) - sortScore(b));

      const scheduled: ScheduledItem[] = [];
      let order = 1;

      while (available.length > 0) {
        // Pick the highest-priority item (lowest sort score)
        available.sort((a, b) => sortScore(a) - sortScore(b));
        const current = available.shift()!;

        const deps = dependencyMap.get(current.artifact_id) ?? [];
        scheduled.push({
          work_item: current,
          scheduled_order: order++,
          dependencies: deps,
          estimated_duration: estimateDuration(current.verification_type),
        });

        // Reduce in-degree of dependents
        const dependents = reverseDeps.get(current.artifact_id) ?? [];
        for (const depId of dependents) {
          const newDegree = (inDegree.get(depId) ?? 1) - 1;
          inDegree.set(depId, newDegree);
          if (newDegree === 0) {
            const depItem = itemByArtifact.get(depId);
            if (depItem) available.push(depItem);
          }
        }
      }

      // Handle any remaining items (cycles or items not reached) — append in priority order
      const scheduledIds = new Set(scheduled.map((s) => s.work_item.artifact_id));
      const remaining = workItems
        .filter((wi) => !scheduledIds.has(wi.artifact_id))
        .sort((a, b) => sortScore(a) - sortScore(b));

      for (const wi of remaining) {
        scheduled.push({
          work_item: wi,
          scheduled_order: order++,
          dependencies: dependencyMap.get(wi.artifact_id) ?? [],
          estimated_duration: estimateDuration(wi.verification_type),
        });
      }

      // Compute critical path using the dependency adjacency (within-plan deps)
      const criticalPath = findCriticalPath(planArtifactIds, dependencyMap);

      // Build summary
      const byType = new Map<ReverificationType, number>();
      for (const wi of workItems) {
        byType.set(wi.verification_type, (byType.get(wi.verification_type) ?? 0) + 1);
      }
      const typeParts: string[] = [];
      for (const [type, cnt] of byType.entries()) {
        typeParts.push(`${cnt} ${type}`);
      }

      const totalMinutes = workItems.reduce(
        (acc, wi) => acc + MINUTES_PER_ITEM[wi.verification_type],
        0,
      );

      const summary =
        `Scheduled ${scheduled.length} item${scheduled.length === 1 ? '' : 's'} ` +
        `(${typeParts.join(', ')}). ` +
        `Estimated total: ~${totalMinutes}m. ` +
        `Critical path length: ${criticalPath.length}.`;

      return {
        items: scheduled,
        total_items: scheduled.length,
        critical_path: criticalPath,
        summary,
      };
    },
  };
}
