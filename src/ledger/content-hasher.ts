/**
 * ProofChain Content Hasher
 *
 * SHA-256 content hashing for artifacts with AST normalization
 * for formatting-insensitive hashing of C/C++ source code.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// ─── Core Hashing ────────────────────────────────────────────────────────────

/**
 * Hash raw string content using SHA-256.
 * Returns hex digest prefixed with "sha256:".
 */
export function hashContent(content: string): string {
  const digest = createHash('sha256').update(content, 'utf8').digest('hex');
  return `sha256:${digest}`;
}

/**
 * Hash a file's contents from disk.
 * Returns hex digest prefixed with "sha256:".
 */
export function hashFile(filePath: string): string {
  const content = readFileSync(filePath, 'utf8');
  return hashContent(content);
}

// ─── C/C++ Source Normalization ───────────────────────────────────────────────

/**
 * Normalize C/C++ source code for hashing.
 * Steps:
 *   1. Strip C-style block comments (/* ... *\/)
 *   2. Strip C++ line comments (// ...)
 *   3. Collapse consecutive whitespace to single space
 *   4. Trim leading/trailing whitespace per line
 *   5. Remove empty lines
 */
export function normalizeSource(source: string): string {
  // Step 1: Strip block comments (non-greedy, handles multiline)
  let result = source.replace(/\/\*[\s\S]*?\*\//g, '');

  // Step 2: Strip line comments
  result = result.replace(/\/\/[^\n]*/g, '');

  // Step 3 & 4 & 5: Process line by line — trim, collapse whitespace, drop empty
  const lines = result.split('\n');
  const normalized = lines
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0);

  return normalized.join('\n');
}

// ─── C/C++ Function Extraction ────────────────────────────────────────────────

/**
 * Extract a function's signature from C/C++ source code.
 * Returns the text before the opening brace: return_type name(params)
 * Returns null if the function is not found.
 */
export function extractFunctionSignature(
  source: string,
  functionName: string,
): string | null {
  // Match: optional return type tokens, then functionName, then (params), then optional whitespace before {
  // This regex captures everything from the start of the return type up to (but not including) the opening brace.
  const pattern = new RegExp(
    // Match return type: one or more words/pointers/qualifiers before the function name
    `([\\w\\s\\*&:]+?\\s+\\**)?(${escapeRegExp(functionName)})\\s*\\([^)]*\\)(?:\\s*const)?(?:\\s*noexcept)?(?:\\s*override)?(?:\\s*final)?(?=\\s*\\{)`,
    'g',
  );

  const match = pattern.exec(source);
  if (match === null) {
    return null;
  }

  // The full match is the signature (everything before the brace)
  return match[0].trim();
}

/**
 * Extract a function's body from C/C++ source code.
 * Finds the function by name, then extracts the balanced-brace body.
 * Returns the body including the outer braces, or null if not found.
 */
export function extractFunctionBody(
  source: string,
  functionName: string,
): string | null {
  // Find the position of the function definition: name followed by ( ... ) {
  const signaturePattern = new RegExp(
    `[\\w\\s\\*&:]+?\\s+\\**${escapeRegExp(functionName)}\\s*\\([^)]*\\)(?:\\s*const)?(?:\\s*noexcept)?(?:\\s*override)?(?:\\s*final)?\\s*\\{`,
    'g',
  );

  const match = signaturePattern.exec(source);
  if (match === null) {
    return null;
  }

  // The match ends at the opening brace; find the position of that brace
  const openBracePos = match.index + match[0].length - 1;

  // Now walk forward matching balanced braces
  let depth = 1;
  let i = openBracePos + 1;

  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
    }
    i++;
  }

  if (depth !== 0) {
    // Unbalanced braces — malformed source
    return null;
  }

  // Extract from the opening brace to the closing brace (inclusive)
  return source.slice(openBracePos, i);
}

// ─── Function Hashing ─────────────────────────────────────────────────────────

/**
 * Hash a function's body from source code.
 * Strips comments and normalizes whitespace before hashing.
 * Returns "sha256:" prefixed hex digest, or null-equivalent hash if not found.
 */
export function hashFunction(source: string, functionName: string): string {
  const body = extractFunctionBody(source, functionName);
  if (body === null) {
    // Hash a sentinel indicating missing function
    return hashContent(`__missing_function__:${functionName}`);
  }
  return hashContent(normalizeSource(body));
}

/**
 * Hash only the function signature (for interface change detection).
 * Strips body, keeps: return type, name, params, qualifiers.
 * Returns "sha256:" prefixed hex digest.
 */
export function hashInterface(source: string, functionName: string): string {
  const signature = extractFunctionSignature(source, functionName);
  if (signature === null) {
    return hashContent(`__missing_signature__:${functionName}`);
  }
  return hashContent(normalizeSource(signature));
}

// ─── Requirement & Test Hashing ───────────────────────────────────────────────

/**
 * Hash a requirement text, binding the requirement ID into the hash.
 * Returns "sha256:" prefixed hex digest.
 */
export function hashRequirement(reqId: string, text: string): string {
  return hashContent(`${reqId}:${text}`);
}

/**
 * Hash a test case, binding the test ID into the hash.
 * Returns "sha256:" prefixed hex digest.
 */
export function hashTest(testId: string, content: string): string {
  return hashContent(`${testId}:${content}`);
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/** Escape special regex metacharacters in a literal string. */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
