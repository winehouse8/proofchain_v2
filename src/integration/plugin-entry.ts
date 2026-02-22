/**
 * ProofChain Plugin Entry Point
 *
 * Creates the full plugin manifest for the ProofChain Claude Code plugin.
 * Aggregates hook registrations, skill registrations, and the HUD data provider
 * into a single ProofChainPlugin object for the Claude Code extension system.
 */

import type { AsilLevel } from '../core/types.js';
import {
  createHookRegistrar,
  type HookRegistration,
} from './hook-registrar.js';
import {
  createSkillRegistrar,
  type SkillRegistration,
} from './skill-registrar.js';
import {
  createHudProvider,
  type HudDataProvider,
} from './hud-provider.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type { HookRegistration, SkillRegistration };

export interface ProofChainPlugin {
  name: string;
  version: string;
  description: string;
  hooks: HookRegistration[];
  skills: SkillRegistration[];
  hudProvider: HudDataProvider;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createProofChainPlugin(config?: { asilLevel?: AsilLevel }): ProofChainPlugin {
  const asilLevel: AsilLevel = config?.asilLevel ?? 'D';

  const hookRegistrar = createHookRegistrar();
  const skillRegistrar = createSkillRegistrar();
  const hudProvider = createHudProvider({ asilLevel });

  return {
    name: 'proofchain',
    version: '0.1.0',
    description:
      'ISO 26262-Inspired Safety-Grade Development Enforcer for Claude Code. ' +
      'Enforces MISRA compliance, V-Model phase gates, traceability, coverage, ' +
      'and verification debt tracking.',
    hooks: hookRegistrar.getAllHooks(),
    skills: skillRegistrar.getAllSkills(),
    hudProvider,
  };
}
