/**
 * ProofChain Blast Radius Calculator
 *
 * Combines change classification with the dependency graph to determine
 * the full set of artifacts requiring re-verification after a change.
 */

import type {
  AffectedArtifact,
  AsilLevel,
  ChangeType,
  ReverificationType,
} from '../core/types.js';
import type { DependencyGraph } from '../graph/dependency-graph.js';
import type { ChangeClassification } from './change-classifier.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface BlastRadiusDetail {
  changed_artifact: string;
  change_type: ChangeType;
  is_interface_change: boolean;
  affected_artifacts: AffectedArtifact[];
  total_affected: number;
  reverification_scope: ReverificationType;
}

export interface BlastRadiusCalculator {
  calculate(
    classification: ChangeClassification,
    graph: DependencyGraph,
  ): BlastRadiusDetail;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/** ASIL priority order: D is highest (0), QM is lowest (4) */
const ASIL_PRIORITY: Readonly<Record<AsilLevel, number>> = {
  D: 0,
  C: 1,
  B: 2,
  A: 3,
  QM: 4,
};

/**
 * Determine the re-verification scope from change type and interface flag.
 */
function determineReverificationScope(
  changeType: ChangeType,
  isInterfaceChange: boolean,
): ReverificationType {
  if (changeType === 'requirement_change') {
    return 'safety';
  }
  if (changeType === 'config_change') {
    return 'full';
  }
  if (changeType === 'code_change' && isInterfaceChange) {
    return 'integration';
  }
  // code_change impl-only or test_change
  return 'unit';
}

/**
 * Determine per-artifact reverification type.
 * Interface changes to high-ASIL artifacts warrant integration-level checks.
 */
function artifactReverificationType(
  isInterfaceChange: boolean,
  asil: AsilLevel,
  distance: number,
): ReverificationType {
  if (asil === 'D' || asil === 'C') {
    return isInterfaceChange ? 'safety' : 'integration';
  }
  if (isInterfaceChange && distance <= 2) {
    return 'integration';
  }
  return 'unit';
}

/**
 * Look up the ASIL level of an artifact node from the graph.
 * Falls back to QM if the node is not found.
 */
function getAsilFromGraph(graph: DependencyGraph, artifactId: string): AsilLevel {
  const node = graph.getNode(artifactId);
  if (node === null) return 'QM';

  // Infer ASIL from traced requirements names as a heuristic.
  // In a real system this would come from the ledger; here we derive from
  // the node's traced_requirements list (requirement IDs may embed ASIL).
  // For now return QM — callers can enrich via ledger lookups.
  // The graph node itself does not store asil_level directly.
  void node; // suppress unused-variable lint until richer lookup added
  return 'QM';
}

/**
 * Build an invalidation reason string for a given distance and change type.
 */
function buildInvalidationReason(
  changedArtifact: string,
  changeType: ChangeType,
  isInterfaceChange: boolean,
  distance: number,
): string {
  const changeDesc = isInterfaceChange ? 'interface change' : 'implementation change';
  if (distance === 1) {
    return `Direct dependency ${changedArtifact} had ${changeDesc} (${changeType})`;
  }
  return `Transitive dependency ${changedArtifact} had ${changeDesc} (${changeType}, distance ${distance})`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBlastRadiusCalculator(): BlastRadiusCalculator {
  return {
    calculate(
      classification: ChangeClassification,
      graph: DependencyGraph,
    ): BlastRadiusDetail {
      const {
        change_type: changeType,
        is_interface_change: isInterfaceChange,
        affected_artifacts: primaryArtifacts,
      } = classification;

      const reverificationScope = determineReverificationScope(changeType, isInterfaceChange);

      // Collect all affected artifacts across every primary artifact
      const seen = new Set<string>();
      const affectedArtifacts: AffectedArtifact[] = [];

      for (const artifactId of primaryArtifacts) {
        // Query the graph for this artifact's blast radius
        const blastResult = graph.getBlastRadius(artifactId, isInterfaceChange);

        for (const entry of blastResult.affected) {
          if (seen.has(entry.artifact_id)) continue;
          seen.add(entry.artifact_id);

          const asil = getAsilFromGraph(graph, entry.artifact_id);
          const reverificationType = artifactReverificationType(
            isInterfaceChange,
            asil,
            entry.distance,
          );
          const invalidationReason = buildInvalidationReason(
            artifactId,
            changeType,
            isInterfaceChange,
            entry.distance,
          );

          affectedArtifacts.push({
            artifact_id: entry.artifact_id,
            artifact_type: entry.artifact_type,
            distance: entry.distance,
            invalidation_reason: invalidationReason,
            asil_level: asil,
            reverification_type: reverificationType,
          });
        }
      }

      // Sort by ASIL priority (D first), then by distance (closest first)
      affectedArtifacts.sort((a, b) => {
        const pa = ASIL_PRIORITY[a.asil_level];
        const pb = ASIL_PRIORITY[b.asil_level];
        if (pa !== pb) return pa - pb;
        return a.distance - b.distance;
      });

      // Use the first primary artifact as the "changed_artifact" representative
      const changedArtifact = primaryArtifacts[0] ?? classification.file_path;

      return {
        changed_artifact: changedArtifact,
        change_type: changeType,
        is_interface_change: isInterfaceChange,
        affected_artifacts: affectedArtifacts,
        total_affected: affectedArtifacts.length,
        reverification_scope: reverificationScope,
      };
    },
  };
}
