/**
 * ProofChain Safety Doc Skill
 *
 * Skill handler for ISO 26262 safety documentation generation.
 * Exposes document generation and listing as formatted string output
 * for Claude Code slash commands.
 */

import type {
  DocumentationGenerator,
  SafetyDocType,
  DocGeneratorContext,
} from '../documentation/doc-generator.js';

// ─── Available doc types (mirrored from doc-generator for listing) ────────────

const ALL_DOC_TYPES: readonly SafetyDocType[] = [
  'srs',
  'sas',
  'unit_design',
  'verification_report',
  'traceability_matrix',
];

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface SafetyDocSkill {
  execute(command: 'generate', docType: SafetyDocType, context: DocGeneratorContext): string;
  execute(command: 'list', docType?: undefined, context?: undefined): string;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSafetyDocSkill(generator: DocumentationGenerator): SafetyDocSkill {
  return {
    execute(
      command: 'generate' | 'list',
      docType?: SafetyDocType,
      context?: DocGeneratorContext,
    ): string {
      if (command === 'list') {
        const lines: string[] = [
          `[ProofChain] Available Safety Document Types (${ALL_DOC_TYPES.length}):`,
          ...ALL_DOC_TYPES.map((t, i) => `  ${String(i + 1).padStart(2, ' ')}. ${t}`),
          ``,
          `Usage: /proofchain safety-doc generate <type> --project <name> --asil <level>`,
        ];
        return lines.join('\n');
      }

      // command === 'generate'
      if (docType === undefined || context === undefined) {
        return `[ProofChain] Error: 'generate' command requires docType and context.`;
      }

      const doc = generator.generate(docType, context);
      const markdown = generator.formatAsMarkdown(doc);
      return [
        `[ProofChain] Generated: ${doc.title}`,
        `  Document ID : ${doc.document_id}`,
        `  ASIL        : ${doc.asil_level}`,
        `  Generated   : ${doc.generated_at}`,
        `  Sections    : ${doc.sections.length}`,
        ``,
        markdown,
      ].join('\n');
    },
  };
}
