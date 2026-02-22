/**
 * ProofChain Impact Skill
 *
 * Skill handler for merge impact analysis between V-Model feature tracks.
 * Returns a formatted analysis report as a string for Claude Code slash commands.
 */

import type { MergeImpactAnalyzer } from '../v-model/merge-impact-analyzer.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ImpactSkill {
  execute(command: 'analyze', mergingFeature: string, targetFeature: string): string;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createImpactSkill(analyzer: MergeImpactAnalyzer): ImpactSkill {
  return {
    execute(command: 'analyze', mergingFeature: string, targetFeature: string): string {
      if (command !== 'analyze') {
        return `[ProofChain] Unknown impact command: ${command}`;
      }

      const impact = analyzer.analyzeMergeImpact(mergingFeature, targetFeature);

      const regressionLines = impact.phase_regressions.length === 0
        ? ['  (none)']
        : impact.phase_regressions.map(
            r => `  - '${r.featureId}': ${r.from} -> ${r.to}`,
          );

      const reverifyLines = impact.artifacts_to_reverify.length === 0
        ? ['  (none)']
        : impact.artifacts_to_reverify.map(a => `  - ${a}`);

      const affectedLines = impact.affected_tracks.length === 0
        ? ['  (none)']
        : impact.affected_tracks.map(t => `  - ${t}`);

      return [
        `[ProofChain] Merge Impact Analysis`,
        `  Merging : ${impact.merging_feature}`,
        `  Into    : ${impact.target_feature}`,
        ``,
        `Affected Tracks (${impact.affected_tracks.length}):`,
        ...affectedLines,
        ``,
        `Phase Regressions Required (${impact.phase_regressions.length}):`,
        ...regressionLines,
        ``,
        `Artifacts to Re-verify (${impact.artifacts_to_reverify.length}):`,
        ...reverifyLines,
        ``,
        `Recommendation:`,
        `  ${impact.recommendation}`,
      ].join('\n');
    },
  };
}
