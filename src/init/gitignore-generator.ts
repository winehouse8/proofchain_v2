/**
 * ProofChain Gitignore Generator
 *
 * Generates `.proofchain/.gitignore` to ensure state and metrics
 * directories are excluded from version control while config,
 * rules, templates, and requirements are tracked.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROOFCHAIN_DIR = '.proofchain';
const GITIGNORE_FILE = '.gitignore';

const GITIGNORE_CONTENT = `# ProofChain generated files - DO NOT EDIT
# Tracked: config.json, rules/, templates/, requirements/
# Ignored: state/, metrics/

# Database and state files (local, generated)
state/

# Metrics (generated from analysis)
metrics/
`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the content for `.proofchain/.gitignore`.
 */
export function generateGitignoreContent(): string {
  return GITIGNORE_CONTENT;
}

/**
 * Write `.proofchain/.gitignore` to disk.
 * Assumes `.proofchain/` already exists.
 */
export function writeGitignore(projectRoot: string): void {
  const filePath = join(projectRoot, PROOFCHAIN_DIR, GITIGNORE_FILE);
  writeFileSync(filePath, generateGitignoreContent(), 'utf-8');
}
