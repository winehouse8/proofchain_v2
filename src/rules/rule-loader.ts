/**
 * ProofChain Rule Loader
 *
 * Loads and aggregates MISRA rules from built-in modules and custom JSON files.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MisraRule, AsilLevel } from '../core/types.js';
import { getControlFlowRules } from './misra-rules/control-flow.js';
import { getTypeSafetyRules } from './misra-rules/type-safety.js';
import { getMemoryRules } from './misra-rules/memory.js';
import { getRecursionRules } from './misra-rules/recursion.js';

// ─── ASIL ordering ────────────────────────────────────────────────────────────

const ASIL_ORDER: Readonly<Record<AsilLevel, number>> = {
  QM: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
};

function asilValue(level: AsilLevel): number {
  return ASIL_ORDER[level];
}

// ─── Type guard for custom rule JSON ─────────────────────────────────────────

function isMisraRule(value: unknown): value is MisraRule {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['rule_id'] === 'string' &&
    typeof v['category'] === 'string' &&
    (v['severity'] === 'mandatory' || v['severity'] === 'required' || v['severity'] === 'advisory') &&
    (v['asil_min'] === 'QM' || v['asil_min'] === 'A' || v['asil_min'] === 'B' || v['asil_min'] === 'C' || v['asil_min'] === 'D') &&
    typeof v['description'] === 'string' &&
    typeof v['pattern'] === 'string' &&
    (v['pattern_type'] === 'regex' || v['pattern_type'] === 'ast') &&
    (v['ast_pattern'] === null || typeof v['ast_pattern'] === 'string') &&
    typeof v['fix_suggestion'] === 'string' &&
    typeof v['rationale'] === 'string'
  );
}

// ─── Public interface and factory ─────────────────────────────────────────────

export interface RuleLoader {
  loadBuiltinRules(): MisraRule[];
  loadCustomRules(rulesDir: string): MisraRule[];
  getActiveRules(asilLevel: AsilLevel): MisraRule[];
}

export function createRuleLoader(): RuleLoader {
  return {
    loadBuiltinRules(): MisraRule[] {
      return [
        ...getControlFlowRules(),
        ...getTypeSafetyRules(),
        ...getMemoryRules(),
        ...getRecursionRules(),
      ];
    },

    loadCustomRules(rulesDir: string): MisraRule[] {
      const customRules: MisraRule[] = [];

      if (!existsSync(rulesDir)) {
        return customRules;
      }

      let files: string[];
      try {
        files = readdirSync(rulesDir).filter(f => f.endsWith('.rules.json'));
      } catch {
        return customRules;
      }

      for (const file of files) {
        const filePath = join(rulesDir, file);
        let raw: string;
        try {
          raw = readFileSync(filePath, 'utf8');
        } catch {
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }

        if (!Array.isArray(parsed)) continue;

        for (const item of parsed) {
          if (isMisraRule(item)) {
            customRules.push(item);
          }
        }
      }

      return customRules;
    },

    getActiveRules(asilLevel: AsilLevel): MisraRule[] {
      const allRules = this.loadBuiltinRules();
      const targetValue = asilValue(asilLevel);

      return allRules.filter(
        rule => asilValue(rule.asil_min) <= targetValue,
      );
    },
  };
}
