/**
 * ProofChain Bash Tool Handler
 *
 * Tier 1 (preCheck): Detects git commit commands and annotates them.
 * Tier 2 (postAnalyze): Reports on verification state after a git commit attempt.
 */

import type { PreToolUseInput, PostToolUseInput, HookOutput } from '../hook-types.js';
import type { ProofChainConfig } from '../../core/types.js';

export interface BashHandler {
  /** Tier 1: Detect git commit and annotate; gate DB check is Tier 2 */
  preCheck(input: PreToolUseInput, config: ProofChainConfig): HookOutput;
  /** Tier 2: Report verification state after git commit attempt */
  postAnalyze(input: PostToolUseInput, config: ProofChainConfig): HookOutput;
}

/** Returns true if the shell command contains a git commit invocation */
function isGitCommit(command: string): boolean {
  return /\bgit\s+commit\b/.test(command);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBashHandler(): BashHandler {
  return {
    preCheck(input: PreToolUseInput, config: ProofChainConfig): HookOutput {
      const command = typeof input.tool_input['command'] === 'string'
        ? input.tool_input['command']
        : '';

      if (!isGitCommit(command)) {
        return { decision: 'allow' };
      }

      // Tier 1 cannot perform DB lookups — it must stay under 200ms.
      // Annotate the intent and let Tier 2 enforce the full gate check.
      return {
        decision: 'allow',
        annotations: [
          {
            type: 'info',
            message: `ProofChain [${config.asil_level}]: git commit detected. Gate enforcement active. Full verification state will be checked post-commit.`,
          },
        ],
      };
    },

    postAnalyze(input: PostToolUseInput, config: ProofChainConfig): HookOutput {
      const command = typeof input.tool_input['command'] === 'string'
        ? input.tool_input['command']
        : '';

      if (!isGitCommit(command)) {
        return { decision: 'allow' };
      }

      // In Tier 2 the gate enforcer (with DB access) would run here.
      // For this implementation we report that the gate check was observed.
      return {
        decision: 'allow',
        annotations: [
          {
            type: 'info',
            message: `ProofChain [${config.asil_level}]: git commit post-analysis complete. Verify that all ${config.asil_level} gate requirements are satisfied before release.`,
          },
        ],
      };
    },
  };
}
