/**
 * ProofChain Requirement Differ
 *
 * Diffs requirement versions and classifies change severity per ISO 26262
 * impact rules: ASIL changes are critical, criteria changes are high,
 * significant text rewrites are high/medium/low based on word-diff ratio.
 */

import type { AsilLevel, ChangeSeverity, RequirementVersion } from '../core/types.js';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface RequirementDiff {
  requirement_id: string;
  old_version: number;
  new_version: number;
  severity: ChangeSeverity;
  text_changed: boolean;
  asil_changed: boolean;
  criteria_changed: boolean;
  old_text: string;
  new_text: string;
  description: string;
}

export interface RequirementDiffer {
  diff(
    requirementId: string,
    oldVersion: RequirementVersion,
    newVersion: RequirementVersion,
  ): RequirementDiff;
  classifySeverity(
    oldVersion: RequirementVersion,
    newVersion: RequirementVersion,
  ): ChangeSeverity;
}

// ─── Word-diff helpers ───────────────────────────────────────────────────────

/**
 * Split text into lowercase word tokens, filtering empty strings.
 */
function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(w => w.length > 0);
}

/**
 * Compute the fraction of words that changed between old and new text.
 * Uses multiset subtraction: counts words in new but not old (added) and
 * old but not new (removed), divided by the larger word count.
 *
 * Returns a value in [0.0, 1.0].
 */
function wordChangeRatio(oldText: string, newText: string): number {
  const oldWords = tokenize(oldText.toLowerCase());
  const newWords = tokenize(newText.toLowerCase());

  const denominator = Math.max(oldWords.length, newWords.length, 1);

  // Build frequency maps
  const oldFreq = new Map<string, number>();
  for (const word of oldWords) {
    oldFreq.set(word, (oldFreq.get(word) ?? 0) + 1);
  }

  const newFreq = new Map<string, number>();
  for (const word of newWords) {
    newFreq.set(word, (newFreq.get(word) ?? 0) + 1);
  }

  // Count added words (in new but not enough in old)
  let added = 0;
  for (const [word, count] of newFreq) {
    const oldCount = oldFreq.get(word) ?? 0;
    if (count > oldCount) {
      added += count - oldCount;
    }
  }

  // Count removed words (in old but not enough in new)
  let removed = 0;
  for (const [word, count] of oldFreq) {
    const newCount = newFreq.get(word) ?? 0;
    if (count > newCount) {
      removed += count - newCount;
    }
  }

  return (added + removed) / denominator;
}

// ─── Severity classifier ─────────────────────────────────────────────────────

function classifySeverity(
  oldVersion: RequirementVersion,
  newVersion: RequirementVersion,
): ChangeSeverity {
  // ASIL change → critical (affects all enforcement thresholds)
  if (oldVersion.asil_level !== newVersion.asil_level) {
    return 'critical';
  }

  // Acceptance criteria changed → high (affects verification scope)
  const oldCriteria = [...oldVersion.acceptance_criteria].sort().join('\n');
  const newCriteria = [...newVersion.acceptance_criteria].sort().join('\n');
  if (oldCriteria !== newCriteria) {
    return 'high';
  }

  // Text unchanged
  if (oldVersion.text === newVersion.text) {
    return 'low';
  }

  // Classify by word-diff ratio
  const ratio = wordChangeRatio(oldVersion.text, newVersion.text);

  if (ratio > 0.30) {
    return 'high';
  }
  if (ratio >= 0.10) {
    return 'medium';
  }
  return 'low';
}

// ─── Description builder ─────────────────────────────────────────────────────

function buildDescription(
  textChanged: boolean,
  asilChanged: boolean,
  criteriaChanged: boolean,
  severity: ChangeSeverity,
  oldAsil: AsilLevel,
  newAsil: AsilLevel,
): string {
  const parts: string[] = [];

  if (asilChanged) {
    parts.push(`ASIL level changed from ${oldAsil} to ${newAsil} (critical severity).`);
  }

  if (textChanged) {
    parts.push(`Text changed (${severity} severity).`);
  }

  if (criteriaChanged) {
    parts.push('Acceptance criteria modified.');
  }

  if (parts.length === 0) {
    return 'No changes detected.';
  }

  return parts.join(' ');
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRequirementDiffer(): RequirementDiffer {
  return {
    classifySeverity,

    diff(requirementId, oldVersion, newVersion) {
      const textChanged = oldVersion.text !== newVersion.text;
      const asilChanged = oldVersion.asil_level !== newVersion.asil_level;

      const oldCriteria = [...oldVersion.acceptance_criteria].sort().join('\n');
      const newCriteria = [...newVersion.acceptance_criteria].sort().join('\n');
      const criteriaChanged = oldCriteria !== newCriteria;

      const severity = classifySeverity(oldVersion, newVersion);

      const description = buildDescription(
        textChanged,
        asilChanged,
        criteriaChanged,
        severity,
        oldVersion.asil_level,
        newVersion.asil_level,
      );

      return {
        requirement_id: requirementId,
        old_version: oldVersion.version,
        new_version: newVersion.version,
        severity,
        text_changed: textChanged,
        asil_changed: asilChanged,
        criteria_changed: criteriaChanged,
        old_text: oldVersion.text,
        new_text: newVersion.text,
        description,
      };
    },
  };
}
