/**
 * ProofChain Review Evidence Collector
 *
 * Collects pre-analysis evidence (violations, complexity, traceability, coverage)
 * before invoking the safety review agent. This decouples data gathering from
 * the AI review step so the agent receives a complete, structured evidence package.
 */

import type {
  AsilLevel,
  RuleViolation,
  FunctionCoverage,
  TraceabilityLink,
  ComplexityMetrics,
} from '../core/types.js';
import type { RuleEngine } from '../rules/rule-engine.js';
import type { ComplexityAnalyzer } from '../rules/complexity-analyzer.js';
import type { TraceMatrix } from '../traceability/trace-matrix.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ReviewEvidence {
  code_content: string;
  file_path: string;
  function_names: string[];
  misra_violations: readonly RuleViolation[];
  coverage_data: readonly FunctionCoverage[];
  traceability_links: readonly TraceabilityLink[];
  complexity_metrics: Map<string, ComplexityMetrics>;
  asil_level: AsilLevel;
}

export interface EvidenceCollectorDeps {
  ruleEngine: RuleEngine;
  complexityAnalyzer: ComplexityAnalyzer;
  traceMatrix: TraceMatrix;
  asilLevel: AsilLevel;
  coverageData?: readonly FunctionCoverage[];
}

export interface EvidenceCollector {
  collectForFile(filePath: string, code: string, deps: EvidenceCollectorDeps): ReviewEvidence;
  collectForFunction(
    filePath: string,
    code: string,
    functionName: string,
    deps: EvidenceCollectorDeps,
  ): ReviewEvidence;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Extract C/C++ function names from source code using a regex that matches
 * typical function definitions: return_type name(params) [qualifiers] {
 */
function extractFunctionNames(code: string): string[] {
  const names: string[] = [];
  // Matches: word(params){ or word(params) const { etc.
  const fnDefPattern = /\b([A-Za-z_]\w*)\s*\([^)]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?(?:final\s*)?\{/g;

  const keywords = new Set([
    'if', 'else', 'while', 'for', 'switch', 'do',
    'return', 'sizeof', 'alignof', 'typeof',
  ]);

  let match: RegExpExecArray | null;
  while ((match = fnDefPattern.exec(code)) !== null) {
    const candidateName = match[1];
    if (candidateName === undefined) continue;
    if (keywords.has(candidateName)) continue;
    if (!names.includes(candidateName)) {
      names.push(candidateName);
    }
  }

  return names;
}

/**
 * Filter coverage data to only entries relevant to the given file and,
 * optionally, a specific function.
 */
function filterCoverage(
  coverageData: readonly FunctionCoverage[] | undefined,
  filePath: string,
  functionName?: string,
): readonly FunctionCoverage[] {
  if (coverageData === undefined) return [];
  return coverageData.filter(c => {
    const fileMatch = c.file === filePath;
    if (functionName !== undefined) {
      return fileMatch && c.function_name === functionName;
    }
    return fileMatch;
  });
}

/**
 * Collect traceability links for all functions in a file, or a single function.
 * The code artifact ID format used by the trace matrix is "file::function_name".
 */
function collectLinks(
  traceMatrix: TraceMatrix,
  filePath: string,
  functionNames: string[],
): readonly TraceabilityLink[] {
  const seen = new Set<string>();
  const links: TraceabilityLink[] = [];

  for (const fnName of functionNames) {
    const artifactId = `${filePath}::${fnName}`;
    const allLinks = traceMatrix.getAllLinks();
    for (const link of allLinks) {
      if (link.code_artifact_id === artifactId) {
        const key = `${link.requirement_id}::${link.code_artifact_id}`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push(link);
        }
      }
    }
  }

  return links;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createEvidenceCollector(): EvidenceCollector {
  return {
    collectForFile(
      filePath: string,
      code: string,
      deps: EvidenceCollectorDeps,
    ): ReviewEvidence {
      const { ruleEngine, complexityAnalyzer, traceMatrix, asilLevel, coverageData } = deps;

      const functionNames = extractFunctionNames(code);
      const misraViolations = ruleEngine.evaluate(code, filePath, asilLevel);
      const complexityMetrics = complexityAnalyzer.analyzeFile(code);
      const traceabilityLinks = collectLinks(traceMatrix, filePath, functionNames);
      const filteredCoverage = filterCoverage(coverageData, filePath);

      return {
        code_content: code,
        file_path: filePath,
        function_names: functionNames,
        misra_violations: misraViolations,
        coverage_data: filteredCoverage,
        traceability_links: traceabilityLinks,
        complexity_metrics: complexityMetrics,
        asil_level: asilLevel,
      };
    },

    collectForFunction(
      filePath: string,
      code: string,
      functionName: string,
      deps: EvidenceCollectorDeps,
    ): ReviewEvidence {
      const { ruleEngine, complexityAnalyzer, traceMatrix, asilLevel, coverageData } = deps;

      const misraViolations = ruleEngine.evaluateFunction(code, filePath, functionName, asilLevel);

      const singleMetrics = complexityAnalyzer.analyze(code, functionName);
      const complexityMetrics = new Map<string, ComplexityMetrics>();
      complexityMetrics.set(functionName, singleMetrics);

      const traceabilityLinks = collectLinks(traceMatrix, filePath, [functionName]);
      const filteredCoverage = filterCoverage(coverageData, filePath, functionName);

      return {
        code_content: code,
        file_path: filePath,
        function_names: [functionName],
        misra_violations: misraViolations,
        coverage_data: filteredCoverage,
        traceability_links: traceabilityLinks,
        complexity_metrics: complexityMetrics,
        asil_level: asilLevel,
      };
    },
  };
}
