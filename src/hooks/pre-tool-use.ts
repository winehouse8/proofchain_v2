/**
 * ProofChain Tier 1 PreToolUse Hook Dispatcher
 *
 * Runs synchronously on every PreToolUse event.
 * Budget: < 200ms. Routes to the correct handler and enforces the time budget.
 * Blocks Write/Edit tools on critical safety violations.
 */

import type { PreToolUseInput, HookOutput } from './hook-types.js';
import type { ProofChainConfig } from '../core/types.js';
import { createWriteHandler } from './handlers/write-handler.js';
import { createEditHandler } from './handlers/edit-handler.js';
import { createBashHandler } from './handlers/bash-handler.js';

// Budget in milliseconds for Tier 1 synchronous checks
const TIER1_BUDGET_MS = 200;

export interface PreToolUseHook {
  /** Process a PreToolUse event, return hook decision */
  process(input: PreToolUseInput, config: ProofChainConfig): HookOutput;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createPreToolUseHook(): PreToolUseHook {
  const writeHandler = createWriteHandler();
  const editHandler = createEditHandler();
  const bashHandler = createBashHandler();

  return {
    process(input: PreToolUseInput, config: ProofChainConfig): HookOutput {
      const start = Date.now();

      let result: HookOutput;

      switch (input.tool_name) {
        case 'Write':
          result = writeHandler.preCheck(input, config);
          break;

        case 'Edit':
        case 'MultiEdit':
          result = editHandler.preCheck(input, config);
          break;

        case 'Bash':
          result = bashHandler.preCheck(input, config);
          break;

        default:
          result = { decision: 'allow' };
          break;
      }

      const duration = Date.now() - start;
      if (duration > TIER1_BUDGET_MS) {
        // Budget exceeded: log a warning annotation but never block on timing alone
        const budgetWarning = {
          type: 'warning' as const,
          message: `ProofChain: Tier 1 check for '${input.tool_name}' took ${duration}ms (budget: ${TIER1_BUDGET_MS}ms). Consider optimising hook latency.`,
        };
        return {
          ...result,
          annotations: [...(result.annotations ?? []), budgetWarning],
        };
      }

      return result;
    },
  };
}
