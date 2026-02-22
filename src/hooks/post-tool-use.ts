/**
 * ProofChain Tier 2 PostToolUse Hook Dispatcher
 *
 * Runs asynchronously after every tool invocation.
 * Budget: < 2s. Performs full MISRA rule evaluation and CCP-side analysis.
 * Always returns 'allow' — Tier 2 is annotation-only (non-blocking).
 */

import type { PostToolUseInput, HookOutput, HookOutputAnnotation } from './hook-types.js';
import type { ProofChainConfig, RuleViolation } from '../core/types.js';
import { createWriteHandler } from './handlers/write-handler.js';
import { createEditHandler } from './handlers/edit-handler.js';
import { createBashHandler } from './handlers/bash-handler.js';
import { createRuleEngine } from '../rules/rule-engine.js';
import { createRuleLoader } from '../rules/rule-loader.js';
import { createComplexityAnalyzer } from '../rules/complexity-analyzer.js';

// Budget in milliseconds for Tier 2 asynchronous analysis
const TIER2_BUDGET_MS = 2000;

export interface PostToolUseHookDeps {
  config: ProofChainConfig;
  projectRoot: string;
}

export interface PostToolUseHook {
  /** Process a PostToolUse event with full analysis */
  process(input: PostToolUseInput, deps: PostToolUseHookDeps): HookOutput;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the file extension indicates a C or C++ source/header file */
function isCFile(filePath: string): boolean {
  return /\.(c|cpp|h|hpp|cc|cxx)$/i.test(filePath);
}

/** Convert a RuleViolation to a HookOutputAnnotation */
function violationToAnnotation(v: RuleViolation): HookOutputAnnotation {
  const severityMap: Record<RuleViolation['severity'], HookOutputAnnotation['type']> = {
    mandatory: 'error',
    required: 'warning',
    advisory: 'info',
  };
  return {
    type: severityMap[v.severity],
    message: `ProofChain [${v.rule_id}] ${v.file}:${v.line}:${v.column} — ${v.message} Suggestion: ${v.fix_suggestion}`,
  };
}

/**
 * Run full MISRA rule evaluation on a C/C++ file's content.
 * Returns annotations derived from violations.
 */
function runFullMisraAnalysis(
  content: string,
  filePath: string,
  config: ProofChainConfig,
): HookOutputAnnotation[] {
  try {
    const loader = createRuleLoader();
    loader.loadBuiltinRules();
    const analyzer = createComplexityAnalyzer();
    const engine = createRuleEngine(loader, analyzer);

    const violations = engine.evaluate(content, filePath, config.asil_level);
    return violations.map(violationToAnnotation);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      {
        type: 'warning',
        message: `ProofChain: MISRA analysis failed for ${filePath}: ${message}`,
      },
    ];
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createPostToolUseHook(): PostToolUseHook {
  const writeHandler = createWriteHandler();
  const editHandler = createEditHandler();
  const bashHandler = createBashHandler();

  return {
    process(input: PostToolUseInput, deps: PostToolUseHookDeps): HookOutput {
      const { config } = deps;
      const start = Date.now();

      const annotations: HookOutputAnnotation[] = [];

      // Route to the appropriate handler for its post-analysis annotations
      let handlerResult: HookOutput;
      switch (input.tool_name) {
        case 'Write':
          handlerResult = writeHandler.postAnalyze(input, config);
          break;

        case 'Edit':
        case 'MultiEdit':
          handlerResult = editHandler.postAnalyze(input, config);
          break;

        case 'Bash':
          handlerResult = bashHandler.postAnalyze(input, config);
          break;

        default:
          handlerResult = { decision: 'allow' };
          break;
      }

      if (handlerResult.annotations) {
        annotations.push(...handlerResult.annotations);
      }

      // For Write/Edit on C/C++ files: run full MISRA rule evaluation
      if (input.tool_name === 'Write' || input.tool_name === 'Edit' || input.tool_name === 'MultiEdit') {
        const filePath = typeof input.tool_input['file_path'] === 'string'
          ? input.tool_input['file_path']
          : '';

        if (isCFile(filePath)) {
          // For Write, analyse the written content directly
          // For Edit, analyse the new_string fragment (full-file analysis would
          // require reading the file, which is a Tier 2 async capability)
          const content = input.tool_name === 'Write'
            ? (typeof input.tool_input['content'] === 'string' ? input.tool_input['content'] : '')
            : (typeof input.tool_input['new_string'] === 'string' ? input.tool_input['new_string'] : '');

          if (content !== '') {
            const misraAnnotations = runFullMisraAnalysis(content, filePath, config);
            annotations.push(...misraAnnotations);
          }
        }
      }

      const duration = Date.now() - start;
      if (duration > TIER2_BUDGET_MS) {
        annotations.push({
          type: 'warning',
          message: `ProofChain: Tier 2 analysis for '${input.tool_name}' took ${duration}ms (budget: ${TIER2_BUDGET_MS}ms). Consider optimising analysis pipeline.`,
        });
      }

      // Tier 2 is always non-blocking
      return annotations.length > 0
        ? { decision: 'allow', annotations }
        : { decision: 'allow' };
    },
  };
}
