/**
 * ProofChain Hook Registrar
 *
 * Registers all ProofChain hook handlers with their event type, tool matcher,
 * handler path, and timeout. Provides PreToolUse (Tier 1) and PostToolUse
 * (Tier 2) hook configurations for the Claude Code hook system.
 */

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface HookRegistration {
  event: 'PreToolUse' | 'PostToolUse';
  matcher: string;
  handler: string;
  timeout_ms: number;
}

export interface HookRegistrar {
  getPreToolUseHooks(): HookRegistration[];
  getPostToolUseHooks(): HookRegistration[];
  getAllHooks(): HookRegistration[];
}

// ─── Hook Definitions ─────────────────────────────────────────────────────────

/** Tier 1: synchronous PreToolUse hooks — must complete within 5 s */
const PRE_TOOL_USE_HOOKS: readonly HookRegistration[] = [
  {
    event: 'PreToolUse',
    matcher: 'Write',
    handler: 'dist/hooks/handlers/write-handler.js',
    timeout_ms: 5000,
  },
  {
    event: 'PreToolUse',
    matcher: 'Edit',
    handler: 'dist/hooks/handlers/edit-handler.js',
    timeout_ms: 5000,
  },
  {
    event: 'PreToolUse',
    matcher: 'Bash',
    handler: 'dist/hooks/handlers/bash-handler.js',
    timeout_ms: 5000,
  },
];

/** Tier 2: asynchronous PostToolUse hooks — longer timeout acceptable */
const POST_TOOL_USE_HOOKS: readonly HookRegistration[] = [
  {
    event: 'PostToolUse',
    matcher: 'Write',
    handler: 'dist/hooks/post-tool-use.js',
    timeout_ms: 30000,
  },
  {
    event: 'PostToolUse',
    matcher: 'Edit',
    handler: 'dist/hooks/post-tool-use.js',
    timeout_ms: 30000,
  },
  {
    event: 'PostToolUse',
    matcher: 'Bash',
    handler: 'dist/hooks/post-tool-use.js',
    timeout_ms: 30000,
  },
];

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createHookRegistrar(): HookRegistrar {
  return {
    getPreToolUseHooks(): HookRegistration[] {
      return [...PRE_TOOL_USE_HOOKS];
    },

    getPostToolUseHooks(): HookRegistration[] {
      return [...POST_TOOL_USE_HOOKS];
    },

    getAllHooks(): HookRegistration[] {
      return [...PRE_TOOL_USE_HOOKS, ...POST_TOOL_USE_HOOKS];
    },
  };
}
