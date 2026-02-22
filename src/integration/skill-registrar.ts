/**
 * ProofChain Skill Registrar
 *
 * Registers all ProofChain skills with their name, description, and handler path.
 * Provides lookup by name and enumeration for the plugin manifest.
 */

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface SkillRegistration {
  name: string;
  description: string;
  handler: string;
}

export interface SkillRegistrar {
  getAllSkills(): SkillRegistration[];
  getSkill(name: string): SkillRegistration | null;
}

// ─── Skill Definitions ────────────────────────────────────────────────────────

const SKILLS: readonly SkillRegistration[] = [
  {
    name: 'phase',
    description: 'Manage V-Model phase lifecycle (status, advance, set, checklist, gate-check)',
    handler: 'dist/skills/phase-skill.js',
  },
  {
    name: 'safety-doc',
    description: 'Generate ISO 26262 safety documentation artifacts (generate, list)',
    handler: 'dist/skills/safety-doc-skill.js',
  },
  {
    name: 'impact',
    description: 'Analyze merge impact between V-Model feature tracks',
    handler: 'dist/skills/impact-skill.js',
  },
  {
    name: 'audit',
    description: 'Inspect and export the ISO 26262 audit trail (show, export)',
    handler: 'dist/skills/audit-skill.js',
  },
  {
    name: 'tool-qual',
    description: 'Run tool qualification self-tests and generate accuracy reports',
    handler: 'dist/skills/tool-qual-skill.js',
  },
  {
    name: 'verify',
    description: 'Run full or incremental verification workflow and check status',
    handler: 'dist/skills/verify-skill.js',
  },
  {
    name: 'trace',
    description: 'Validate traceability, detect orphans, analyze gaps and coverage',
    handler: 'dist/skills/trace-skill.js',
  },
  {
    name: 'req',
    description: 'List requirements, diff versions, and view version history',
    handler: 'dist/skills/req-skill.js',
  },
];

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSkillRegistrar(): SkillRegistrar {
  const skillMap = new Map<string, SkillRegistration>(
    SKILLS.map(s => [s.name, s]),
  );

  return {
    getAllSkills(): SkillRegistration[] {
      return [...SKILLS];
    },

    getSkill(name: string): SkillRegistration | null {
      return skillMap.get(name) ?? null;
    },
  };
}
