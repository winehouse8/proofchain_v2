/**
 * ProofChain Project Initializer
 *
 * Scaffolds the `.proofchain/` directory structure for a new project,
 * writes config, initializes the SQLite database, generates .gitignore,
 * and injects CLAUDE.md safety rules.
 */

import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import type { AsilLevel, SupportedLanguage } from '../core/types.js';
import { saveConfig } from '../core/config.js';
import { getDefaultConfig } from './asil-presets.js';
import { initializeSchema } from '../state/schema.js';
import { writeGitignore } from './gitignore-generator.js';
import { injectRules } from './claude-md-injector.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InitOptions {
  projectRoot: string;
  asilLevel: AsilLevel;
  language?: SupportedLanguage;  // defaults to 'c'
}

export interface InitResult {
  configPath: string;
  dbPath: string;
  directories_created: string[];
  files_created: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROOFCHAIN_DIR = '.proofchain';

const SUBDIRS = [
  'state',
  'requirements',
  'templates',
  'metrics',
  'rules',
] as const;

const SAFETY_REQUIREMENTS_TEMPLATE = `# Safety Requirements

<!-- This file is managed by ProofChain. Add project safety requirements below. -->

## Overview

Document high-level safety requirements for this project.

## Requirements

| ID | Description | ASIL | Status |
|----|-------------|------|--------|
|    |             |      |        |
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function proofchainDir(projectRoot: string): string {
  return join(projectRoot, PROOFCHAIN_DIR);
}

function configFilePath(projectRoot: string): string {
  return join(proofchainDir(projectRoot), 'config.json');
}

function dbFilePath(projectRoot: string): string {
  return join(proofchainDir(projectRoot), 'state', 'proofchain.db');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether this project has already been initialized.
 */
export function isInitialized(projectRoot: string): boolean {
  return existsSync(configFilePath(projectRoot));
}

/**
 * Initialize a new ProofChain project under `projectRoot`.
 *
 * Throws if `.proofchain/config.json` already exists.
 */
export function initializeProject(options: InitOptions): InitResult {
  const { projectRoot, asilLevel, language = 'c' } = options;

  if (isInitialized(projectRoot)) {
    throw new Error('ProofChain already initialized');
  }

  const directoriesCreated: string[] = [];
  const filesCreated: string[] = [];

  // 1. Create directory structure
  const rootDir = proofchainDir(projectRoot);
  mkdirSync(rootDir, { recursive: true });
  directoriesCreated.push(rootDir);

  for (const sub of SUBDIRS) {
    const subDir = join(rootDir, sub);
    mkdirSync(subDir, { recursive: true });
    directoriesCreated.push(subDir);
  }

  // 2. Generate and save config
  const config = getDefaultConfig(asilLevel, language);
  saveConfig(projectRoot, config);
  const configPath = configFilePath(projectRoot);
  filesCreated.push(configPath);

  // 3. Initialize SQLite database
  const dbPath = dbFilePath(projectRoot);
  const db = new Database(dbPath);
  try {
    initializeSchema(db);
  } finally {
    db.close();
  }
  filesCreated.push(dbPath);

  // 4. Write .proofchain/.gitignore
  writeGitignore(projectRoot);
  const gitignorePath = join(rootDir, '.gitignore');
  filesCreated.push(gitignorePath);

  // 5. Inject CLAUDE.md rules
  injectRules(projectRoot, config);
  const claudeMdPath = join(projectRoot, 'CLAUDE.md');
  filesCreated.push(claudeMdPath);

  // 6. Create initial safety requirements template
  const requirementsPath = join(rootDir, 'requirements', 'safety-requirements.md');
  writeFileSync(requirementsPath, SAFETY_REQUIREMENTS_TEMPLATE, 'utf-8');
  filesCreated.push(requirementsPath);

  return {
    configPath,
    dbPath,
    directories_created: directoriesCreated,
    files_created: filesCreated,
  };
}
