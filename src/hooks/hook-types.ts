/**
 * ProofChain Hook I/O Types
 *
 * Shared types for Claude Code hook protocol input/output.
 * Used by both Tier 1 (PreToolUse) and Tier 2 (PostToolUse) hooks.
 */

/** Claude Code PreToolUse hook input */
export interface PreToolUseInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/** Claude Code PostToolUse hook input */
export interface PostToolUseInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output: string;
}

/** Hook output conforming to Claude Code hook protocol */
export interface HookOutput {
  decision: 'allow' | 'block';
  reason?: string;
  annotations?: HookOutputAnnotation[];
}

export interface HookOutputAnnotation {
  type: 'error' | 'warning' | 'info';
  message: string;
}
