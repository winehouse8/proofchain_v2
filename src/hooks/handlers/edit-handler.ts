/**
 * ProofChain Edit Tool Handler
 *
 * Tier 1 (preCheck): Same 5 regex-based safety checks as WriteHandler,
 * applied to the new_string content of an Edit/MultiEdit invocation.
 * Tier 2 (postAnalyze): Placeholder — full MISRA analysis runs in post-tool-use.ts.
 */

import type { PreToolUseInput, PostToolUseInput, HookOutput, HookOutputAnnotation } from '../hook-types.js';
import type { ProofChainConfig } from '../../core/types.js';

export interface EditHandler {
  /** Tier 1: Quick regex checks on the new content being edited in */
  preCheck(input: PreToolUseInput, config: ProofChainConfig): HookOutput;
  /** Tier 2: Full analysis after edit completes */
  postAnalyze(input: PostToolUseInput, config: ProofChainConfig): HookOutput;
}

// ─── Regex patterns for Tier 1 checks ────────────────────────────────────────

const GOTO_PATTERN = /\bgoto\s+\w+\s*;/;
const DYNAMIC_ALLOC_PATTERN = /\b(malloc|calloc|realloc|free)\s*\(/;

/** Returns true if the file extension indicates a C or C++ source/header file */
function isCFile(filePath: string): boolean {
  return /\.(c|cpp|h|hpp|cc|cxx)$/i.test(filePath);
}

/** Determines if ASIL level is A or higher */
function isAsilAOrHigher(config: ProofChainConfig): boolean {
  return config.asil_level === 'A' || config.asil_level === 'B'
    || config.asil_level === 'C' || config.asil_level === 'D';
}

/**
 * Run the 5 Tier 1 checks on new_string content for a C/C++ file.
 * Returns { shouldBlock, annotations }.
 */
function runTier1Checks(
  content: string,
  filePath: string,
  config: ProofChainConfig,
): { shouldBlock: boolean; annotations: HookOutputAnnotation[] } {
  const annotations: HookOutputAnnotation[] = [];
  let shouldBlock = false;

  const strictAndHighAsil = config.enforcement_mode === 'strict' && isAsilAOrHigher(config);

  // Check 1: goto statement
  if (GOTO_PATTERN.test(content)) {
    if (strictAndHighAsil) {
      shouldBlock = true;
      annotations.push({
        type: 'error',
        message: `ProofChain [${config.asil_level}]: 'goto' is prohibited in ASIL A+ code (MISRA C:2012 Rule 15.1). Remove the goto statement.`,
      });
    } else {
      annotations.push({
        type: 'warning',
        message: `ProofChain [${config.asil_level}]: 'goto' detected in ${filePath}. Prohibited at ASIL A+ (MISRA C:2012 Rule 15.1).`,
      });
    }
  }

  // Check 2: dynamic memory allocation
  if (DYNAMIC_ALLOC_PATTERN.test(content)) {
    if (strictAndHighAsil) {
      shouldBlock = true;
      annotations.push({
        type: 'error',
        message: `ProofChain [${config.asil_level}]: Dynamic memory allocation (malloc/calloc/realloc/free) is prohibited in ASIL A+ code (MISRA C:2012 Rule 21.3). Use static allocation.`,
      });
    } else {
      annotations.push({
        type: 'warning',
        message: `ProofChain [${config.asil_level}]: Dynamic memory allocation detected in ${filePath}. Prohibited at ASIL A+ (MISRA C:2012 Rule 21.3).`,
      });
    }
  }

  // Check 3: missing @trace tag
  if (config.gates.require_traceability_tag && !/@trace\b/.test(content)) {
    annotations.push({
      type: 'warning',
      message: `ProofChain [${config.asil_level}]: No @trace tag found in new content for ${filePath}. Traceability tag is required by gate configuration.`,
    });
  }

  // Check 4: rough line count heuristic on the new_string fragment
  const lineCount = content.split('\n').length;
  const fileLineThreshold = config.thresholds.function_lines_max * 2;
  if (lineCount > fileLineThreshold) {
    annotations.push({
      type: 'warning',
      message: `ProofChain [${config.asil_level}]: Edit fragment for ${filePath} has ${lineCount} lines, which exceeds the heuristic threshold of ${fileLineThreshold} (2x function_lines_max=${config.thresholds.function_lines_max}). Consider splitting into smaller units.`,
    });
  }

  return { shouldBlock, annotations };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createEditHandler(): EditHandler {
  return {
    preCheck(input: PreToolUseInput, config: ProofChainConfig): HookOutput {
      const filePath = typeof input.tool_input['file_path'] === 'string'
        ? input.tool_input['file_path']
        : '';
      // Edit uses new_string; MultiEdit may pass edits array — handle both
      const newString = typeof input.tool_input['new_string'] === 'string'
        ? input.tool_input['new_string']
        : '';

      if (!isCFile(filePath)) {
        return { decision: 'allow' };
      }

      if (newString === '') {
        return { decision: 'allow' };
      }

      const { shouldBlock, annotations } = runTier1Checks(newString, filePath, config);

      if (shouldBlock) {
        const errorAnnotation = annotations.find(a => a.type === 'error');
        return {
          decision: 'block',
          reason: errorAnnotation?.message ?? 'ProofChain: Safety violation detected.',
          annotations,
        };
      }

      return annotations.length > 0
        ? { decision: 'allow', annotations }
        : { decision: 'allow' };
    },

    postAnalyze(_input: PostToolUseInput, _config: ProofChainConfig): HookOutput {
      // Full MISRA analysis is performed in post-tool-use.ts using rule-engine.
      return { decision: 'allow' };
    },
  };
}
