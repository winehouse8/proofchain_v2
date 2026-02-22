/**
 * ProofChain Safety Reviewer
 *
 * Defines the safety reviewer agent interface, prompt generation, response
 * parsing, and result validation. The reviewer is intentionally stateless —
 * prompts contain no conversation history to preserve independence per
 * ISO 26262-8 requirements.
 */

import type {
  AsilLevel,
  IndependenceLevel,
  ReviewDimension,
  SafetyReviewResult,
  DimensionResult,
  ReviewFinding,
} from '../core/types.js';
import type { ReviewEvidence } from './review-evidence-collector.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface SafetyReviewRequest {
  evidence: ReviewEvidence;
  review_dimensions: readonly ReviewDimension[];
  independence_level: IndependenceLevel;
}

export interface SafetyReviewer {
  /** Generate the structured review prompt for the agent */
  generatePrompt(request: SafetyReviewRequest): string;

  /** Parse structured JSON response from the agent */
  parseResponse(response: string): SafetyReviewResult | null;

  /** Validate that a review result meets completeness requirements */
  validateResult(result: SafetyReviewResult, request: SafetyReviewRequest): boolean;

  /** Get the appropriate agent tier based on ASIL level */
  getAgentTier(asilLevel: AsilLevel): string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Dimension-specific pass/fail criteria for the 8 review dimensions. */
const DIMENSION_CRITERIA: Readonly<Record<ReviewDimension, string>> = {
  requirements_compliance:
    'PASS if every function has a TRACE tag linking to a versioned requirement. ' +
    'FAIL if any safety-critical function lacks traceability. ' +
    'WARN if traceability exists but requirement version is stale.',

  coding_standard:
    'PASS if no mandatory or required MISRA violations are present. ' +
    'FAIL if mandatory MISRA violations exist. ' +
    'WARN if only advisory violations are present.',

  defensive_programming:
    'PASS if all pointer dereferences, array accesses, and return values are checked. ' +
    'FAIL if unchecked pointer or return value creates a safety hazard. ' +
    'WARN if defensive checks are present but incomplete.',

  error_handling:
    'PASS if all error paths are handled and propagated correctly. ' +
    'FAIL if an error condition is silently ignored or could cause undefined behavior. ' +
    'WARN if error handling exists but is inconsistent.',

  resource_management:
    'PASS if all allocated resources (memory, file handles, mutexes) are released on all paths. ' +
    'FAIL if a resource leak exists on any execution path. ' +
    'WARN if resource management is correct but fragile.',

  concurrency_safety:
    'PASS if shared state is protected with appropriate synchronization on all access paths. ' +
    'FAIL if a data race or deadlock risk is identifiable. ' +
    'WARN if synchronization exists but could be improved.',

  interface_correctness:
    'PASS if function signatures, preconditions, and postconditions are documented and enforced. ' +
    'FAIL if an interface contract is violated at a call site. ' +
    'WARN if the interface is correct but underdocumented.',

  complexity_compliance:
    'PASS if cyclomatic complexity, nesting depth, LOC, and parameter count are within ASIL thresholds. ' +
    'FAIL if any metric exceeds the mandatory threshold for the declared ASIL level. ' +
    'WARN if metrics are near the threshold boundary.',
};

/** Format complexity metrics section of the prompt. */
function formatComplexitySection(evidence: ReviewEvidence): string {
  if (evidence.complexity_metrics.size === 0) {
    return '  (no complexity data available)';
  }

  const lines: string[] = [];
  for (const [fnName, m] of evidence.complexity_metrics) {
    lines.push(
      `  ${fnName}: CC=${m.cyclomatic_complexity}, ` +
      `ND=${m.nesting_depth}, LOC=${m.lines_of_code}, ` +
      `params=${m.parameter_count}, comment_density=${m.comment_density.toFixed(2)}`,
    );
  }
  return lines.join('\n');
}

/** Format MISRA violations section of the prompt. */
function formatViolationsSection(evidence: ReviewEvidence): string {
  if (evidence.misra_violations.length === 0) {
    return '  (no violations detected)';
  }

  return evidence.misra_violations
    .map(v =>
      `  [${v.severity.toUpperCase()}] ${v.rule_id} @ ${v.file}:${v.line} — ${v.message}`,
    )
    .join('\n');
}

/** Format coverage data section of the prompt. */
function formatCoverageSection(evidence: ReviewEvidence): string {
  if (evidence.coverage_data.length === 0) {
    return '  (no coverage data available)';
  }

  return evidence.coverage_data
    .map(c =>
      `  ${c.function_name}: stmt=${(c.statement_coverage * 100).toFixed(1)}%, ` +
      `branch=${(c.branch_coverage * 100).toFixed(1)}%, ` +
      `mcdc=${(c.mcdc_coverage * 100).toFixed(1)}%` +
      (c.uncovered_lines.length > 0 ? ` | uncovered lines: ${c.uncovered_lines.join(', ')}` : ''),
    )
    .join('\n');
}

/** Format traceability links section of the prompt. */
function formatTraceabilitySection(evidence: ReviewEvidence): string {
  if (evidence.traceability_links.length === 0) {
    return '  (no traceability links found)';
  }

  return evidence.traceability_links
    .map(l =>
      `  ${l.code_artifact_id} → REQ ${l.requirement_id}@v${l.requirement_version}` +
      (l.architecture_id !== null ? ` [ARCH: ${l.architecture_id}]` : '') +
      (l.test_artifact_ids.length > 0 ? ` | tests: ${l.test_artifact_ids.join(', ')}` : ''),
    )
    .join('\n');
}

/** Build the 8-dimension checklist section of the prompt. */
function formatDimensionChecklist(dimensions: readonly ReviewDimension[]): string {
  return dimensions
    .map((dim, i) => {
      const criteria = DIMENSION_CRITERIA[dim];
      return `${i + 1}. **${dim}**\n   Criteria: ${criteria}`;
    })
    .join('\n\n');
}

/** Extract a JSON block from agent response text. */
function extractJsonBlock(response: string): string | null {
  // Try fenced code block first
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(response);
  if (fenceMatch !== null && fenceMatch[1] !== undefined) {
    return fenceMatch[1].trim();
  }

  // Try bare JSON object starting with {
  const braceStart = response.indexOf('{');
  if (braceStart === -1) return null;

  // Find matching closing brace
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < response.length; i++) {
    if (response[i] === '{') depth++;
    else if (response[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return null;
  return response.slice(braceStart, end + 1);
}

/** Type guard: check if a value is a plain object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate and coerce a raw parsed JSON value into SafetyReviewResult. */
function coerceReviewResult(raw: unknown): SafetyReviewResult | null {
  if (!isObject(raw)) return null;

  const { dimensions, overall_status, reviewer_id, reviewed_at } = raw;

  if (!Array.isArray(dimensions)) return null;
  if (typeof overall_status !== 'string') return null;
  if (!['approved', 'rejected', 'approved_with_conditions'].includes(overall_status)) return null;
  if (typeof reviewer_id !== 'string') return null;
  if (typeof reviewed_at !== 'string') return null;

  const parsedDimensions: DimensionResult[] = [];
  for (const d of dimensions) {
    if (!isObject(d)) return null;
    const { name, status, findings, severity } = d;
    if (typeof name !== 'string') return null;
    if (typeof status !== 'string') return null;
    if (!['pass', 'fail', 'warn'].includes(status)) return null;
    if (typeof severity !== 'string') return null;
    if (!['critical', 'major', 'minor'].includes(severity)) return null;
    if (!Array.isArray(findings)) return null;

    const parsedFindings: ReviewFinding[] = [];
    for (const f of findings) {
      if (!isObject(f)) return null;
      const { file, line, rule, description, suggested_fix } = f;
      if (typeof file !== 'string') return null;
      if (typeof line !== 'number') return null;
      if (typeof rule !== 'string') return null;
      if (typeof description !== 'string') return null;
      if (typeof suggested_fix !== 'string') return null;
      parsedFindings.push({ file, line, rule, description, suggested_fix });
    }

    parsedDimensions.push({
      name: name as ReviewDimension,
      status: status as DimensionResult['status'],
      findings: parsedFindings,
      severity: severity as DimensionResult['severity'],
    });
  }

  return {
    dimensions: parsedDimensions,
    overall_status: overall_status as SafetyReviewResult['overall_status'],
    reviewer_id,
    reviewed_at,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSafetyReviewer(): SafetyReviewer {
  return {
    generatePrompt(request: SafetyReviewRequest): string {
      const { evidence, review_dimensions, independence_level } = request;

      return [
        '# ProofChain Safety Review',
        '',
        `You are an independent safety reviewer operating at independence level **${independence_level}**.`,
        'Review the code below against all specified dimensions. Do NOT reference prior conversation history.',
        'Output ONLY a single JSON object matching the schema at the end of this prompt.',
        '',
        '---',
        '',
        '## Code Under Review',
        `**File:** ${evidence.file_path}`,
        `**ASIL Level:** ${evidence.asil_level}`,
        `**Functions:** ${evidence.function_names.length > 0 ? evidence.function_names.join(', ') : '(file-level review)'}`,
        '',
        '```c',
        evidence.code_content,
        '```',
        '',
        '---',
        '',
        '## Pre-Collected Evidence',
        '',
        '### MISRA Violations',
        formatViolationsSection(evidence),
        '',
        '### Complexity Metrics',
        formatComplexitySection(evidence),
        '',
        '### Test Coverage',
        formatCoverageSection(evidence),
        '',
        '### Traceability Links',
        formatTraceabilitySection(evidence),
        '',
        '---',
        '',
        '## Review Dimensions Checklist',
        '',
        'Evaluate each dimension and assign: **pass**, **warn**, or **fail**.',
        'For each finding include: file, line number, rule ID, description, and a concrete suggested fix.',
        '',
        formatDimensionChecklist(review_dimensions),
        '',
        '---',
        '',
        '## Required Output Schema',
        '',
        'Respond with ONLY the following JSON (no prose before or after):',
        '',
        '```json',
        '{',
        '  "dimensions": [',
        '    {',
        '      "name": "<dimension_name>",',
        '      "status": "pass" | "warn" | "fail",',
        '      "severity": "critical" | "major" | "minor",',
        '      "findings": [',
        '        {',
        '          "file": "<file_path>",',
        '          "line": <line_number>,',
        '          "rule": "<rule_id>",',
        '          "description": "<description>",',
        '          "suggested_fix": "<fix>"',
        '        }',
        '      ]',
        '    }',
        '  ],',
        '  "overall_status": "approved" | "rejected" | "approved_with_conditions",',
        '  "reviewer_id": "<your_agent_id>",',
        '  "reviewed_at": "<ISO_8601_timestamp>"',
        '}',
        '```',
        '',
        `Include exactly ${review_dimensions.length} dimension entries, one per dimension listed above.`,
        'Set overall_status to "rejected" if any dimension has status "fail" with severity "critical".',
        'Set overall_status to "approved_with_conditions" if any dimension has status "warn" or non-critical "fail".',
        'Set overall_status to "approved" only if all dimensions pass.',
      ].join('\n');
    },

    parseResponse(response: string): SafetyReviewResult | null {
      const jsonStr = extractJsonBlock(response);
      if (jsonStr === null) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr) as unknown;
      } catch {
        return null;
      }

      return coerceReviewResult(parsed);
    },

    validateResult(result: SafetyReviewResult, request: SafetyReviewRequest): boolean {
      const requestedDimensions = new Set<string>(request.review_dimensions);
      const resultDimensions = new Set<string>(result.dimensions.map(d => d.name));

      // All requested dimensions must be present
      for (const dim of requestedDimensions) {
        if (!resultDimensions.has(dim)) return false;
      }

      // Each finding must have file, non-zero line, rule, description, and suggested_fix
      for (const dim of result.dimensions) {
        for (const finding of dim.findings) {
          if (finding.file.trim().length === 0) return false;
          if (finding.line <= 0) return false;
          if (finding.rule.trim().length === 0) return false;
          if (finding.description.trim().length === 0) return false;
          if (finding.suggested_fix.trim().length === 0) return false;
        }
      }

      return true;
    },

    getAgentTier(asilLevel: AsilLevel): string {
      switch (asilLevel) {
        case 'QM':
        case 'A':
        case 'B':
          return 'code-reviewer';
        case 'C':
        case 'D':
          return 'architect';
      }
    },
  };
}
