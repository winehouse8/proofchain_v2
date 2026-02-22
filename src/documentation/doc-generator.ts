/**
 * ProofChain Documentation Generator
 *
 * Generates ISO 26262-compliant safety documents in Markdown format.
 * Supports SRS, SAS, Unit Design, Verification Report, and Traceability Matrix.
 *
 * ISO 26262 Part 6 (Software) document templates are inlined here.
 * Each document type builds structured sections from the provided context.
 */

import type { AsilLevel } from '../core/types.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

/** Safety document type identifiers */
export type SafetyDocType =
  | 'srs'
  | 'sas'
  | 'unit_design'
  | 'verification_report'
  | 'traceability_matrix';

/** A single section (possibly nested) in a generated document */
export interface DocSection {
  title: string;
  content: string;
  subsections: DocSection[];
}

/** A fully generated safety document ready for rendering */
export interface GeneratedDocument {
  doc_type: SafetyDocType;
  title: string;
  document_id: string;
  asil_level: AsilLevel;
  generated_at: string;
  sections: DocSection[];
  format: 'markdown';
}

/** Input context for document generation */
export interface DocGeneratorContext {
  asilLevel: AsilLevel;
  projectName: string;
  requirements?: Array<{ id: string; text: string; asil_level: AsilLevel; version: number }>;
  traceabilityLinks?: Array<{
    requirement_id: string;
    code_artifact_id: string;
    test_artifact_ids: string[];
  }>;
  coverageSummary?: { statement: number; branch: number; mcdc: number };
  verificationSummary?: { total: number; verified: number; failed: number; pending: number };
}

/** Main documentation generator interface */
export interface DocumentationGenerator {
  generate(docType: SafetyDocType, context: DocGeneratorContext): GeneratedDocument;
  generateAll(context: DocGeneratorContext): GeneratedDocument[];
  formatAsMarkdown(doc: GeneratedDocument): string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function makeDocId(docType: SafetyDocType, projectName: string, timestamp: string): string {
  const prefix: Record<SafetyDocType, string> = {
    srs: 'SRS',
    sas: 'SAS',
    unit_design: 'UDS',
    verification_report: 'VER',
    traceability_matrix: 'TRM',
  };
  const datePart = timestamp.substring(0, 10).replace(/-/g, '');
  const projPart = projectName.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);
  return `${prefix[docType]}-${projPart}-${datePart}`;
}

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function section(title: string, content: string, subsections: DocSection[] = []): DocSection {
  return { title, content, subsections };
}

// ─── Template builders ────────────────────────────────────────────────────────

function buildSrsSections(context: DocGeneratorContext): DocSection[] {
  const reqs = context.requirements ?? [];

  const reqTableLines: string[] = [
    '| ID | Version | ASIL | Description |',
    '|----|---------|------|-------------|',
  ];
  if (reqs.length === 0) {
    reqTableLines.push('| — | — | — | No requirements provided |');
  } else {
    for (const r of reqs) {
      reqTableLines.push(`| ${r.id} | v${r.version} | ${r.asil_level} | ${r.text} |`);
    }
  }

  const asilCounts: Partial<Record<AsilLevel, number>> = {};
  for (const r of reqs) {
    asilCounts[r.asil_level] = (asilCounts[r.asil_level] ?? 0) + 1;
  }
  const asilSummary = (Object.entries(asilCounts) as Array<[AsilLevel, number]>)
    .map(([lvl, cnt]) => `- ASIL ${lvl}: ${cnt} requirement(s)`)
    .join('\n');

  return [
    section(
      'Scope and Purpose',
      [
        `This Software Safety Requirements Specification (SRS) defines the safety requirements`,
        `for project **${context.projectName}** at ASIL ${context.asilLevel}.`,
        '',
        `It establishes the software-level requirements derived from the system safety goals`,
        `and provides the basis for design, implementation, and verification activities`,
        `in accordance with ISO 26262-6:2018.`,
      ].join('\n'),
    ),
    section(
      'Referenced Standards',
      [
        '| Standard | Title | Clause |',
        '|----------|-------|--------|',
        '| ISO 26262-1:2018 | Vocabulary | — |',
        '| ISO 26262-6:2018 | Product development at the software level | 7, 8 |',
        '| ISO 26262-8:2018 | Supporting processes | 11 |',
        '| MISRA C:2012 | Guidelines for the use of the C language | — |',
      ].join('\n'),
    ),
    section(
      'Requirements Table',
      `Total requirements: **${reqs.length}**\n\n` + reqTableLines.join('\n'),
    ),
    section(
      'ASIL Classification',
      [
        `Project ASIL level: **${context.asilLevel}**`,
        '',
        'Requirements by ASIL:',
        asilSummary || '- No requirements classified',
        '',
        'ASIL decomposition and allocation follows ISO 26262-9 where applicable.',
      ].join('\n'),
    ),
    section(
      'Acceptance Criteria',
      [
        'Each requirement listed in Section 3 shall be considered accepted when:',
        '',
        '1. The requirement is implemented in code and traced via a `@trace` annotation.',
        '2. At least one test artifact references the requirement ID.',
        `3. Coverage meets the ASIL ${context.asilLevel} thresholds (statement, branch, MC/DC as applicable).`,
        '4. No open MISRA violations are associated with the implementing code unit.',
        '5. Independent review is completed for ASIL C/D items.',
      ].join('\n'),
    ),
  ];
}

function buildSasSections(context: DocGeneratorContext): DocSection[] {
  return [
    section(
      'Architecture Overview',
      [
        `This Software Architecture Specification (SAS) describes the static and dynamic`,
        `structure of **${context.projectName}** at ASIL ${context.asilLevel}.`,
        '',
        `The architecture follows a layered decomposition aligned with ISO 26262-6:2018 §7.4`,
        `(Software architectural design). Each component is assigned an ASIL level consistent`,
        `with the safety goals allocated to it.`,
      ].join('\n'),
    ),
    section(
      'Component Decomposition',
      [
        '| Component | Responsibility | ASIL | Interface Type |',
        '|-----------|----------------|------|----------------|',
        `| Rule Engine | MISRA rule evaluation and violation detection | ${context.asilLevel} | Synchronous API |`,
        `| Verification Ledger | Artifact freshness tracking and staleness propagation | ${context.asilLevel} | In-memory + SQLite |`,
        `| Traceability Matrix | Requirement-to-code-to-test link management | ${context.asilLevel} | Query API |`,
        `| Coverage Gate | MC/DC and branch coverage enforcement | ${context.asilLevel} | Gate check API |`,
        `| CCP Orchestrator | Change cycle protocol and re-verification planning | ${context.asilLevel} | Event-driven |`,
        `| Documentation Generator | ISO 26262 document generation | QM | Output only |`,
      ].join('\n'),
    ),
    section(
      'Interface Specifications',
      [
        'All inter-component interfaces are defined as TypeScript interfaces in `src/core/types.ts`.',
        '',
        '**Interface principles:**',
        '- All interfaces are read-only where crossing trust boundaries.',
        '- No implicit `any` types; strict TypeScript mode enforced.',
        '- Factory functions return interface types (not class instances) to avoid tight coupling.',
        '- Cross-component calls are synchronous; no shared mutable state outside the SQLite ledger.',
      ].join('\n'),
    ),
    section(
      'Safety Mechanisms',
      [
        '| Mechanism | Type | Covered Hazard | ISO 26262 Ref |',
        '|-----------|------|----------------|---------------|',
        '| MISRA rule checking | Prevention | Unsafe coding patterns | ISO 26262-6 §8.4.5 |',
        '| Staleness propagation | Detection | Stale verification evidence | ISO 26262-6 §8.4.6 |',
        '| Traceability validation | Prevention | Missing test coverage | ISO 26262-6 §7.4.11 |',
        '| Gate enforcement | Prevention | Premature phase transitions | ISO 26262-6 §7.4.2 |',
        '| Audit logging | Detection | Untracked changes | ISO 26262-8 §6 |',
        '| Dual-agent review | Detection | Design/implementation errors | ISO 26262-6 §7.4.9 |',
      ].join('\n'),
    ),
  ];
}

function buildUnitDesignSections(context: DocGeneratorContext): DocSection[] {
  return [
    section(
      'Unit Descriptions',
      [
        `This document specifies the unit-level design for **${context.projectName}** at ASIL ${context.asilLevel}.`,
        '',
        'Each software unit is a function or module with a defined interface contract,',
        'error handling strategy, and MISRA compliance status.',
        '',
        '**Unit design follows ISO 26262-6:2018 §8** (Software unit design and implementation).',
        '',
        'Units are decomposed to a level where:',
        '- Cyclomatic complexity does not exceed the ASIL-level threshold.',
        '- All code paths can be exercised by unit tests.',
        '- Every unit has a single, well-defined responsibility.',
      ].join('\n'),
    ),
    section(
      'Interface Contracts',
      [
        '| Unit | Inputs | Outputs | Pre-conditions | Post-conditions |',
        '|------|--------|---------|----------------|-----------------|',
        '| `evaluate(code, filePath, asilLevel)` | Source code string, file path, ASIL | `RuleViolation[]` | Valid UTF-8 source | Violations sorted by line number |',
        '| `computeFreshness(artifactId)` | Artifact ID | `FreshnessScore` | Artifact exists in ledger | Score in range [-1, 1] or null |',
        '| `validateLinks(matrix)` | Traceability matrix | `ValidationResult` | Matrix not empty | All broken links identified |',
        '| `checkGate(phase, status)` | V-Model phase, gate status | `GateResult` | Valid phase enum value | Decision is allow or block |',
        '',
        'Contracts are enforced via TypeScript strict mode and runtime assertion guards for safety-critical inputs.',
      ].join('\n'),
    ),
    section(
      'Error Handling Strategy',
      [
        '**Strategy: Fail-fast with structured error returns**',
        '',
        'No exceptions are thrown across component boundaries. All error conditions',
        'are represented as typed return values or null/undefined with documented semantics.',
        '',
        '| Error Class | Handling | Example |',
        '|-------------|----------|---------|',
        '| Invalid input | Return empty result / null | `evaluate("")` returns `[]` |',
        '| Resource not found | Return null | `getLedgerEntry("x")` returns null |',
        '| Gate failure | Return structured block result | `checkGate()` returns `{ decision: "block" }` |',
        '| Parse error | Skip and continue, log warning | Invalid regex pattern in rule loader |',
        '| DB error | Propagate as Error throw | SQLite write failure |',
      ].join('\n'),
    ),
    section(
      'MISRA Compliance Notes',
      [
        `All implementation units targeting ASIL ${context.asilLevel} shall be free of MISRA violations`,
        'before passing the unit verification gate.',
        '',
        '**Applicable MISRA-C:2012 rule categories for this project:**',
        '',
        '| Category | Rules | Enforcement |',
        '|----------|-------|-------------|',
        '| Control Flow | MISRA-14.4, 15.1, 15.2, 15.5 | Mandatory |',
        '| Type Safety | MISRA-10.1, 10.3, 10.4, 11.3 | Required |',
        '| Memory | MISRA-21.3, 21.4, 18.4, 18.7 | Required |',
        '| Functions | MISRA-17.2, 17.7 | Required |',
        '',
        'Deviations require documented justification and independent review sign-off.',
      ].join('\n'),
    ),
  ];
}

function buildVerificationReportSections(context: DocGeneratorContext): DocSection[] {
  const vs = context.verificationSummary;
  const cs = context.coverageSummary;

  const verRows = vs
    ? [
        `| Total Artifacts | ${vs.total} |`,
        `| Verified | ${vs.verified} |`,
        `| Failed | ${vs.failed} |`,
        `| Pending | ${vs.pending} |`,
        `| Pass Rate | ${vs.total > 0 ? fmtPct(vs.verified / vs.total) : 'N/A'} |`,
      ]
    : ['| Status | No verification data provided |'];

  const covRows = cs
    ? [
        `| Statement Coverage | ${fmtPct(cs.statement)} |`,
        `| Branch Coverage | ${fmtPct(cs.branch)} |`,
        `| MC/DC Coverage | ${fmtPct(cs.mcdc)} |`,
      ]
    : ['| Coverage | No coverage data provided |'];

  const passRate = vs && vs.total > 0 ? vs.verified / vs.total : null;
  const conclusionStatus =
    passRate === null
      ? 'INCONCLUSIVE — No verification data available.'
      : passRate >= 1.0 && (cs === undefined || cs.mcdc >= 0.9)
      ? 'PASS — All verification objectives met.'
      : 'FAIL — One or more verification objectives not met. See findings below.';

  return [
    section(
      'Scope',
      [
        `This Verification Report documents the results of verification activities for`,
        `**${context.projectName}** at ASIL ${context.asilLevel}.`,
        '',
        'It is produced in accordance with ISO 26262-6:2018 §9 (Software unit verification)',
        'and covers unit testing, coverage measurement, and static analysis results.',
      ].join('\n'),
    ),
    section(
      'Test Results',
      ['| Metric | Value |', '|--------|-------|', ...verRows].join('\n'),
    ),
    section(
      'Coverage Results',
      ['| Coverage Type | Value |', '|---------------|-------|', ...covRows].join('\n'),
    ),
    section(
      'Findings',
      vs && vs.failed > 0
        ? [
            `**${vs.failed} verification failure(s) detected.**`,
            '',
            'Failed artifacts require root-cause analysis and re-verification before',
            'the next phase gate can be passed.',
            '',
            'Refer to the Verification Ledger for per-artifact failure details.',
          ].join('\n')
        : 'No failures detected in the current verification run.',
    ),
    section(
      'Conclusion',
      [
        `**Status: ${conclusionStatus}**`,
        '',
        'This report shall be reviewed and signed off by the responsible safety engineer',
        `before proceeding past the current V-Model phase for ASIL ${context.asilLevel} artifacts.`,
      ].join('\n'),
    ),
  ];
}

function buildTraceabilityMatrixSections(context: DocGeneratorContext): DocSection[] {
  const links = context.traceabilityLinks ?? [];
  const reqs = context.requirements ?? [];

  const reqToCodeLines: string[] = [
    '| Requirement ID | Code Artifact | Status |',
    '|----------------|--------------|--------|',
  ];
  const reqToTestLines: string[] = [
    '| Requirement ID | Test Artifacts | Count |',
    '|----------------|----------------|-------|',
  ];

  if (links.length === 0) {
    reqToCodeLines.push('| — | — | No links |');
    reqToTestLines.push('| — | — | 0 |');
  } else {
    for (const link of links) {
      reqToCodeLines.push(`| ${link.requirement_id} | ${link.code_artifact_id} | Traced |`);
      const tests = link.test_artifact_ids.join(', ') || '—';
      reqToTestLines.push(
        `| ${link.requirement_id} | ${tests} | ${link.test_artifact_ids.length} |`,
      );
    }
  }

  const coveredReqIds = new Set(links.map((l) => l.requirement_id));
  const allReqIds = new Set(reqs.map((r) => r.id));
  const uncoveredIds = [...allReqIds].filter((id) => !coveredReqIds.has(id));
  const coveragePct = allReqIds.size > 0 ? fmtPct(coveredReqIds.size / allReqIds.size) : 'N/A';

  const coverageLines = [
    '| Metric | Value |',
    '|--------|-------|',
    `| Total Requirements | ${allReqIds.size} |`,
    `| Traced to Code | ${coveredReqIds.size} |`,
    `| Traceability Coverage | ${coveragePct} |`,
    `| Requirements with Tests | ${links.filter((l) => l.test_artifact_ids.length > 0).length} |`,
  ];

  const gapContent =
    uncoveredIds.length === 0
      ? 'No traceability gaps detected. All requirements are traced to code artifacts.'
      : [
          `**${uncoveredIds.length} requirement(s) without code traceability:**`,
          '',
          ...uncoveredIds.map((id) => `- \`${id}\``),
          '',
          'These requirements must be traced before the traceability gate can pass.',
        ].join('\n');

  return [
    section('Requirements to Code Mapping', reqToCodeLines.join('\n')),
    section('Requirements to Tests Mapping', reqToTestLines.join('\n')),
    section('Coverage Analysis', coverageLines.join('\n')),
    section('Gap Analysis', gapContent),
  ];
}

// ─── Title map ────────────────────────────────────────────────────────────────

const DOC_TITLES: Record<SafetyDocType, string> = {
  srs: 'Software Safety Requirements Specification',
  sas: 'Software Architecture Specification',
  unit_design: 'Software Unit Design Specification',
  verification_report: 'Software Verification Report',
  traceability_matrix: 'Requirements Traceability Matrix',
};

// ─── Section dispatcher ───────────────────────────────────────────────────────

function buildSections(docType: SafetyDocType, context: DocGeneratorContext): DocSection[] {
  switch (docType) {
    case 'srs':                 return buildSrsSections(context);
    case 'sas':                 return buildSasSections(context);
    case 'unit_design':         return buildUnitDesignSections(context);
    case 'verification_report': return buildVerificationReportSections(context);
    case 'traceability_matrix': return buildTraceabilityMatrixSections(context);
  }
}

function renderSection(lines: string[], sec: DocSection, depth: number): void {
  const hashes = '#'.repeat(depth);
  lines.push(`${hashes} ${sec.title}`);
  lines.push('');
  if (sec.content.length > 0) {
    lines.push(sec.content);
    lines.push('');
  }
  for (const sub of sec.subsections) {
    renderSection(lines, sub, depth + 1);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createDocumentationGenerator(): DocumentationGenerator {
  return {
    generate(docType: SafetyDocType, context: DocGeneratorContext): GeneratedDocument {
      const timestamp = new Date().toISOString();
      return {
        doc_type: docType,
        title: DOC_TITLES[docType],
        document_id: makeDocId(docType, context.projectName, timestamp),
        asil_level: context.asilLevel,
        generated_at: timestamp,
        sections: buildSections(docType, context),
        format: 'markdown',
      };
    },

    generateAll(context: DocGeneratorContext): GeneratedDocument[] {
      const allTypes: SafetyDocType[] = [
        'srs',
        'sas',
        'unit_design',
        'verification_report',
        'traceability_matrix',
      ];
      return allTypes.map((docType) => this.generate(docType, context));
    },

    formatAsMarkdown(doc: GeneratedDocument): string {
      const lines: string[] = [];
      lines.push(`# ${doc.title}`);
      lines.push('');
      lines.push(`**Document ID:** ${doc.document_id}`);
      lines.push(`**ASIL Level:** ${doc.asil_level}`);
      lines.push(`**Generated:** ${doc.generated_at}`);
      lines.push(`**Format:** ISO 26262 Part 6 compliant`);
      lines.push('');
      lines.push('---');
      lines.push('');
      for (const sec of doc.sections) {
        renderSection(lines, sec, 2);
      }
      lines.push('---');
      lines.push('');
      lines.push(
        '*Generated by ProofChain — ISO 26262-inspired safety-grade development enforcer*',
      );
      lines.push('');
      return lines.join('\n');
    },
  };
}
