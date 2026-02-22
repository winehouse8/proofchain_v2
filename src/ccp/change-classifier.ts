/**
 * ProofChain Change Classifier
 *
 * Classifies incoming changes by type (requirement, code, test, config),
 * severity, and whether they represent interface vs. implementation changes.
 */

import type { ChangeType, ChangeSeverity } from '../core/types.js';
import { extractFunctionSignature, normalizeSource } from '../ledger/content-hasher.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ChangeClassification {
  change_type: ChangeType;
  severity: ChangeSeverity;
  affected_artifacts: string[];
  is_interface_change: boolean;
  file_path: string;
  function_name: string | null;
  description: string;
}

export interface ChangeClassifier {
  classifyFileChange(
    filePath: string,
    oldContent: string | null,
    newContent: string,
  ): ChangeClassification;

  classifyRequirementChange(
    reqId: string,
    oldText: string | null,
    newText: string,
  ): ChangeClassification;

  classifyConfigChange(
    oldConfig: unknown,
    newConfig: unknown,
  ): ChangeClassification;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Determine ChangeType from file path.
 */
function classifyFileType(filePath: string): ChangeType {
  // Normalize path separators
  const normalized = filePath.replace(/\\/g, '/');

  // Requirements directory
  if (normalized.includes('/requirements/') || normalized.startsWith('requirements/')) {
    return 'requirement_change';
  }

  // Config file or rules directory
  if (
    normalized.endsWith('config.json') ||
    normalized.includes('/rules/') ||
    normalized.startsWith('rules/')
  ) {
    return 'config_change';
  }

  // Test files (.test.ts, .test.c, _test.c)
  if (
    normalized.endsWith('.test.ts') ||
    normalized.endsWith('.test.c') ||
    normalized.endsWith('_test.c') ||
    normalized.endsWith('.test.cpp') ||
    normalized.endsWith('_test.cpp')
  ) {
    return 'test_change';
  }

  // C/C++ source files
  if (
    normalized.endsWith('.c') ||
    normalized.endsWith('.cpp') ||
    normalized.endsWith('.h') ||
    normalized.endsWith('.hpp')
  ) {
    return 'code_change';
  }

  // Default
  return 'code_change';
}

/**
 * Extract function names from C/C++ source using regex.
 * Returns array of function names defined in the source.
 */
function extractFunctionNames(source: string): string[] {
  // Match C/C++ function definitions: return_type name(params) {
  // This pattern captures the function name from definitions
  const pattern = /\b(?:void|int|unsigned|signed|long|short|char|float|double|bool|auto|static|inline|extern|const|struct\s+\w+|\w+)\s+\**(\w+)\s*\([^)]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?(?:final\s*)?(?:;\s*$|\{)/gm;
  const names: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const name = match[1];
    // Exclude common keywords that can appear after a type
    if (
      name !== undefined &&
      name !== 'if' &&
      name !== 'while' &&
      name !== 'for' &&
      name !== 'switch' &&
      name !== 'return' &&
      name !== 'sizeof' &&
      name !== 'typedef'
    ) {
      names.push(name);
    }
  }

  return [...new Set(names)];
}

/**
 * Check if content is only comments or whitespace changes.
 */
function isOnlyCommentsOrWhitespace(
  oldContent: string,
  newContent: string,
): boolean {
  const normOld = normalizeSource(oldContent);
  const normNew = normalizeSource(newContent);
  return normOld === normNew;
}

/**
 * Check if a function signature changed between old and new content.
 * Returns true if any function's signature changed (interface change).
 */
function hasInterfaceChange(
  oldContent: string,
  newContent: string,
  functionNames: string[],
): boolean {
  for (const fnName of functionNames) {
    const oldSig = extractFunctionSignature(oldContent, fnName);
    const newSig = extractFunctionSignature(newContent, fnName);

    // Function added or removed counts as interface change
    if (oldSig === null && newSig !== null) return true;
    if (oldSig !== null && newSig === null) return true;

    // Signature changed
    if (
      oldSig !== null &&
      newSig !== null &&
      normalizeSource(oldSig) !== normalizeSource(newSig)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Derive severity from change characteristics.
 */
function deriveSeverity(
  isInterface: boolean,
  isOnlyWhitespace: boolean,
  changeType: ChangeType,
): ChangeSeverity {
  if (changeType === 'requirement_change') {
    return isOnlyWhitespace ? 'low' : 'high';
  }
  if (changeType === 'config_change') {
    return 'high';
  }
  if (isOnlyWhitespace) {
    return 'low';
  }
  if (isInterface) {
    return 'high';
  }
  return 'medium';
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createChangeClassifier(): ChangeClassifier {
  return {
    classifyFileChange(
      filePath: string,
      oldContent: string | null,
      newContent: string,
    ): ChangeClassification {
      const changeType = classifyFileType(filePath);
      const functionNames = extractFunctionNames(newContent);
      const primaryFunctionName = functionNames.length > 0 ? (functionNames[0] ?? null) : null;

      // Detect whitespace-only or comment-only change
      const onlyWhitespace =
        oldContent !== null && isOnlyCommentsOrWhitespace(oldContent, newContent);

      // Detect interface change (signature-level change)
      let isInterfaceChange = false;
      if (
        !onlyWhitespace &&
        oldContent !== null &&
        (changeType === 'code_change' || changeType === 'test_change')
      ) {
        isInterfaceChange = hasInterfaceChange(oldContent, newContent, functionNames);
      }

      const severity = deriveSeverity(isInterfaceChange, onlyWhitespace, changeType);

      // Affected artifacts: derive from file path itself
      const affectedArtifacts: string[] = [filePath];
      if (primaryFunctionName !== null) {
        affectedArtifacts.push(`${filePath}::${primaryFunctionName}`);
      }

      const description = onlyWhitespace
        ? `Comment/whitespace-only change in ${filePath}`
        : isInterfaceChange
          ? `Interface change in ${filePath}${primaryFunctionName ? ` (${primaryFunctionName})` : ''}`
          : `Implementation change in ${filePath}${primaryFunctionName ? ` (${primaryFunctionName})` : ''}`;

      return {
        change_type: changeType,
        severity,
        affected_artifacts: affectedArtifacts,
        is_interface_change: isInterfaceChange,
        file_path: filePath,
        function_name: primaryFunctionName,
        description,
      };
    },

    classifyRequirementChange(
      reqId: string,
      oldText: string | null,
      newText: string,
    ): ChangeClassification {
      const onlyWhitespace =
        oldText !== null &&
        oldText.replace(/\s+/g, ' ').trim() === newText.replace(/\s+/g, ' ').trim();

      const severity: ChangeSeverity = onlyWhitespace ? 'low' : 'high';

      const description = onlyWhitespace
        ? `Whitespace-only update to requirement ${reqId}`
        : oldText === null
          ? `New requirement ${reqId} added`
          : `Requirement ${reqId} text changed`;

      return {
        change_type: 'requirement_change',
        severity,
        affected_artifacts: [reqId],
        is_interface_change: false,
        file_path: `requirements/${reqId}`,
        function_name: null,
        description,
      };
    },

    classifyConfigChange(
      _oldConfig: unknown,
      _newConfig: unknown,
    ): ChangeClassification {
      return {
        change_type: 'config_change',
        severity: 'high',
        affected_artifacts: ['.proofchain/config.json'],
        is_interface_change: false,
        file_path: '.proofchain/config.json',
        function_name: null,
        description: 'ProofChain configuration changed — full re-verification required',
      };
    },
  };
}
