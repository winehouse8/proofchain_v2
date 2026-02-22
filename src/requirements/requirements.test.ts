/**
 * Tests for ProofChain Requirements modules:
 * RequirementParser, RequirementVersioner, RequirementDiffer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../test-utils/in-memory-db.js';
import { createRequirementParser } from './requirement-parser.js';
import type { RequirementParser } from './requirement-parser.js';
import { createRequirementVersioner } from './requirement-versioner.js';
import type { RequirementVersioner } from './requirement-versioner.js';
import { createRequirementDiffer } from './requirement-differ.js';
import type { RequirementVersion } from '../core/types.js';
import type Database from 'better-sqlite3';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const SINGLE_REQ_MD = `### REQ-SSR-042 [ASIL D]
The braking system shall respond within 10ms.

**Acceptance Criteria:**
- Response time < 10ms
- Input validation before processing
`;

const MULTI_REQ_MD = `### REQ-SSR-042 [ASIL D]
The braking system shall respond within 10ms.

**Acceptance Criteria:**
- Response time < 10ms

### REQ-SSR-043 [ASIL B]
The steering system shall detect lane departure.

**Acceptance Criteria:**
- Detection accuracy >= 95%
- False positive rate < 1%
`;

// ─── RequirementParser ────────────────────────────────────────────────────────

describe('RequirementParser', () => {
  let parser: RequirementParser;

  beforeEach(() => {
    parser = createRequirementParser();
  });

  it('parses single requirement from markdown', () => {
    const results = parser.parseFile(SINGLE_REQ_MD, 'requirements/safety.md');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('REQ-SSR-042');
  });

  it('parses multiple requirements from one file', () => {
    const results = parser.parseFile(MULTI_REQ_MD, 'requirements/safety.md');
    expect(results).toHaveLength(2);
    const ids = results.map(r => r.id);
    expect(ids).toContain('REQ-SSR-042');
    expect(ids).toContain('REQ-SSR-043');
  });

  it('extracts ASIL level correctly', () => {
    const results = parser.parseFile(SINGLE_REQ_MD, 'requirements/safety.md');
    expect(results[0].asil_level).toBe('D');
  });

  it('extracts ASIL B correctly', () => {
    const results = parser.parseFile(MULTI_REQ_MD, 'requirements/safety.md');
    const req043 = results.find(r => r.id === 'REQ-SSR-043');
    expect(req043).toBeDefined();
    expect(req043!.asil_level).toBe('B');
  });

  it('extracts acceptance criteria', () => {
    const results = parser.parseFile(SINGLE_REQ_MD, 'requirements/safety.md');
    expect(results[0].acceptance_criteria).toContain('Response time < 10ms');
    expect(results[0].acceptance_criteria).toContain('Input validation before processing');
  });

  it('handles malformed requirement (skips gracefully)', () => {
    // Unknown ASIL level "Z" — should be skipped
    const malformed = `### REQ-BAD-001 [ASIL Z]
This requirement has an invalid ASIL level.

**Acceptance Criteria:**
- Does not matter
`;
    const results = parser.parseFile(malformed, 'requirements/bad.md');
    expect(results).toHaveLength(0);
  });

  it('handles file with no requirements', () => {
    const noReqs = `# Safety Requirements

This file has no requirements yet.
Just some introductory text.
`;
    const results = parser.parseFile(noReqs, 'requirements/empty.md');
    expect(results).toEqual([]);
  });

  it('extracts requirement text without criteria section', () => {
    const noCriteria = `### REQ-SSR-100 [ASIL A]
The system shall log all sensor readings.
`;
    const results = parser.parseFile(noCriteria, 'requirements/logging.md');
    expect(results).toHaveLength(1);
    expect(results[0].text).toContain('log all sensor readings');
    expect(results[0].acceptance_criteria).toEqual([]);
  });

  it('records source file path', () => {
    const results = parser.parseFile(SINGLE_REQ_MD, 'requirements/safety.md');
    expect(results[0].source_file).toBe('requirements/safety.md');
  });

  it('records correct line number (1-based)', () => {
    const results = parser.parseFile(SINGLE_REQ_MD, 'requirements/safety.md');
    // Header is on line 1
    expect(results[0].line_number).toBe(1);
  });

  it('records correct line number for second requirement', () => {
    const results = parser.parseFile(MULTI_REQ_MD, 'requirements/safety.md');
    const req043 = results.find(r => r.id === 'REQ-SSR-043');
    expect(req043).toBeDefined();
    // Second header appears after blank line + body + blank line
    expect(req043!.line_number).toBeGreaterThan(1);
  });

  it('skips requirement with no body text', () => {
    // Header exists but no body follows (no text before next header or EOF)
    const noBody = `### REQ-SSR-200 [ASIL D]
### REQ-SSR-201 [ASIL D]
This one has a body.
`;
    const results = parser.parseFile(noBody, 'requirements/body.md');
    // REQ-SSR-200 has no body text, REQ-SSR-201 does
    const ids = results.map(r => r.id);
    expect(ids).not.toContain('REQ-SSR-200');
    expect(ids).toContain('REQ-SSR-201');
  });

  it('supports ## (h2) header format', () => {
    const h2 = `## REQ-SSR-300 [ASIL C]
The system shall perform self-test on startup.
`;
    const results = parser.parseFile(h2, 'requirements/startup.md');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('REQ-SSR-300');
    expect(results[0].asil_level).toBe('C');
  });

  it('supports all valid ASIL levels', () => {
    const allAsil = `### REQ-T-001 [ASIL QM]
Quality managed requirement.

### REQ-T-002 [ASIL A]
ASIL A requirement.

### REQ-T-003 [ASIL B]
ASIL B requirement.

### REQ-T-004 [ASIL C]
ASIL C requirement.

### REQ-T-005 [ASIL D]
ASIL D requirement.
`;
    const results = parser.parseFile(allAsil, 'requirements/all.md');
    expect(results).toHaveLength(5);
    const levels = results.map(r => r.asil_level);
    expect(levels).toContain('QM');
    expect(levels).toContain('A');
    expect(levels).toContain('B');
    expect(levels).toContain('C');
    expect(levels).toContain('D');
  });
});

// ─── RequirementVersioner ─────────────────────────────────────────────────────

describe('RequirementVersioner', () => {
  let db: Database.Database;
  let versioner: RequirementVersioner;

  beforeEach(() => {
    db = createTestDb();
    versioner = createRequirementVersioner(db);
  });

  it('addOrUpdate creates first version', () => {
    const v = versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'The braking system shall respond within 10ms.',
      asil_level: 'D',
      acceptance_criteria: ['Response time < 10ms'],
    });
    expect(v.version).toBe(1);
    expect(v.requirement_id).toBe('REQ-SSR-042');
    expect(v.text).toBe('The braking system shall respond within 10ms.');
    expect(v.asil_level).toBe('D');
  });

  it('addOrUpdate increments version on text change', () => {
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Original text.',
      asil_level: 'D',
      acceptance_criteria: [],
    });
    const v2 = versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Updated text with changes.',
      asil_level: 'D',
      acceptance_criteria: [],
    });
    expect(v2.version).toBe(2);
  });

  it('addOrUpdate does NOT increment when text unchanged', () => {
    const req = {
      requirement_id: 'REQ-SSR-042',
      text: 'The braking system shall respond within 10ms.',
      asil_level: 'D' as const,
      acceptance_criteria: ['Response time < 10ms'],
    };
    versioner.addOrUpdate(req);
    const v2 = versioner.addOrUpdate(req);
    expect(v2.version).toBe(1);
    expect(versioner.count()).toBe(1);
  });

  it('getLatest returns most recent version', () => {
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Version one.',
      asil_level: 'D',
      acceptance_criteria: [],
    });
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Version two with changes.',
      asil_level: 'D',
      acceptance_criteria: [],
    });

    const latest = versioner.getLatest('REQ-SSR-042');
    expect(latest).not.toBeNull();
    expect(latest!.version).toBe(2);
    expect(latest!.text).toBe('Version two with changes.');
  });

  it('getLatest returns null for unknown requirement', () => {
    const result = versioner.getLatest('REQ-NONEXISTENT');
    expect(result).toBeNull();
  });

  it('getVersion returns specific version', () => {
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Version one.',
      asil_level: 'D',
      acceptance_criteria: [],
    });
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Version two different text.',
      asil_level: 'D',
      acceptance_criteria: [],
    });

    const v1 = versioner.getVersion('REQ-SSR-042', 1);
    expect(v1).not.toBeNull();
    expect(v1!.version).toBe(1);
    expect(v1!.text).toBe('Version one.');
  });

  it('getVersion returns null for non-existent version', () => {
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Only one version.',
      asil_level: 'D',
      acceptance_criteria: [],
    });
    const v99 = versioner.getVersion('REQ-SSR-042', 99);
    expect(v99).toBeNull();
  });

  it('getHistory returns all versions oldest first', () => {
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'First version.',
      asil_level: 'D',
      acceptance_criteria: [],
    });
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Second version different.',
      asil_level: 'D',
      acceptance_criteria: [],
    });
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Third version also different.',
      asil_level: 'D',
      acceptance_criteria: [],
    });

    const history = versioner.getHistory('REQ-SSR-042');
    expect(history).toHaveLength(3);
    expect(history[0].version).toBe(1);
    expect(history[1].version).toBe(2);
    expect(history[2].version).toBe(3);
  });

  it('getHistory returns empty array for unknown requirement', () => {
    const history = versioner.getHistory('REQ-NONEXISTENT');
    expect(history).toEqual([]);
  });

  it('getAllLatest returns latest of each requirement', () => {
    versioner.addOrUpdate({
      requirement_id: 'REQ-001',
      text: 'Req 001 v1.',
      asil_level: 'A',
      acceptance_criteria: [],
    });
    versioner.addOrUpdate({
      requirement_id: 'REQ-001',
      text: 'Req 001 v2 changed.',
      asil_level: 'A',
      acceptance_criteria: [],
    });
    versioner.addOrUpdate({
      requirement_id: 'REQ-002',
      text: 'Req 002 v1.',
      asil_level: 'B',
      acceptance_criteria: [],
    });

    const all = versioner.getAllLatest();
    expect(all).toHaveLength(2);

    const req001 = all.find(r => r.requirement_id === 'REQ-001');
    const req002 = all.find(r => r.requirement_id === 'REQ-002');
    expect(req001).toBeDefined();
    expect(req001!.version).toBe(2);
    expect(req002).toBeDefined();
    expect(req002!.version).toBe(1);
  });

  it('hasChanged returns true for modified text', () => {
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Original text.',
      asil_level: 'D',
      acceptance_criteria: [],
    });
    const changed = versioner.hasChanged('REQ-SSR-042', 'Modified text here.');
    expect(changed).toBe(true);
  });

  it('hasChanged returns false for same text', () => {
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Stable text.',
      asil_level: 'D',
      acceptance_criteria: [],
    });
    const changed = versioner.hasChanged('REQ-SSR-042', 'Stable text.');
    expect(changed).toBe(false);
  });

  it('hasChanged returns true for unknown requirement (never stored)', () => {
    const changed = versioner.hasChanged('REQ-NONEXISTENT', 'some text');
    expect(changed).toBe(true);
  });

  it('count returns total unique requirements', () => {
    expect(versioner.count()).toBe(0);

    versioner.addOrUpdate({
      requirement_id: 'REQ-001',
      text: 'First.',
      asil_level: 'A',
      acceptance_criteria: [],
    });
    versioner.addOrUpdate({
      requirement_id: 'REQ-002',
      text: 'Second.',
      asil_level: 'B',
      acceptance_criteria: [],
    });
    // Second version of REQ-001 should NOT increment count
    versioner.addOrUpdate({
      requirement_id: 'REQ-001',
      text: 'First updated significantly.',
      asil_level: 'A',
      acceptance_criteria: [],
    });

    expect(versioner.count()).toBe(2);
  });

  it('deleteRequirement removes all versions', () => {
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Version one.',
      asil_level: 'D',
      acceptance_criteria: [],
    });
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Version two changed.',
      asil_level: 'D',
      acceptance_criteria: [],
    });
    expect(versioner.count()).toBe(1);

    versioner.deleteRequirement('REQ-SSR-042');

    expect(versioner.count()).toBe(0);
    expect(versioner.getLatest('REQ-SSR-042')).toBeNull();
    expect(versioner.getHistory('REQ-SSR-042')).toEqual([]);
  });

  it('persists acceptance criteria and round-trips via getLatest', () => {
    const criteria = ['Response time < 10ms', 'Input validation before processing'];
    versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'The braking system shall respond within 10ms.',
      asil_level: 'D',
      acceptance_criteria: criteria,
    });

    const latest = versioner.getLatest('REQ-SSR-042');
    expect(latest).not.toBeNull();
    expect([...latest!.acceptance_criteria]).toEqual(criteria);
  });

  it('stores content_hash on creation', () => {
    const v = versioner.addOrUpdate({
      requirement_id: 'REQ-SSR-042',
      text: 'Some text.',
      asil_level: 'D',
      acceptance_criteria: [],
    });
    expect(v.content_hash).toBeTruthy();
    expect(typeof v.content_hash).toBe('string');
  });
});

// ─── RequirementDiffer ────────────────────────────────────────────────────────

describe('RequirementDiffer', () => {
  function makeVersion(overrides: Partial<RequirementVersion> = {}): RequirementVersion {
    return {
      requirement_id: 'REQ-SSR-042',
      version: 1,
      content_hash: 'abc',
      text: 'The braking system shall respond within 10ms.',
      asil_level: 'D',
      acceptance_criteria: ['Response time < 10ms'],
      created_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('classifies ASIL change as critical', () => {
    const differ = createRequirementDiffer();
    const oldV = makeVersion({ asil_level: 'B', version: 1 });
    const newV = makeVersion({ asil_level: 'D', version: 2 });
    expect(differ.classifySeverity(oldV, newV)).toBe('critical');
  });

  it('classifies criteria change as high', () => {
    const differ = createRequirementDiffer();
    const oldV = makeVersion({
      version: 1,
      acceptance_criteria: ['Response time < 10ms'],
    });
    const newV = makeVersion({
      version: 2,
      acceptance_criteria: ['Response time < 5ms', 'Input validation'],
    });
    expect(differ.classifySeverity(oldV, newV)).toBe('high');
  });

  it('classifies major text change (>30% word diff) as high', () => {
    const differ = createRequirementDiffer();
    const oldV = makeVersion({
      version: 1,
      acceptance_criteria: [],
      text: 'The braking system shall respond quickly.',
    });
    // Completely different text — >30% word diff
    const newV = makeVersion({
      version: 2,
      acceptance_criteria: [],
      text: 'An entirely different specification with new words that replace most of the original content here.',
    });
    expect(differ.classifySeverity(oldV, newV)).toBe('high');
  });

  it('classifies medium text change (10-30% word diff) as medium', () => {
    const differ = createRequirementDiffer();
    // 9 words, change 1 word = ~11% ratio
    const oldV = makeVersion({
      version: 1,
      acceptance_criteria: [],
      text: 'The braking system shall respond within ten milliseconds exactly.',
    });
    const newV = makeVersion({
      version: 2,
      acceptance_criteria: [],
      // Changed "ten" -> "five" (1 word changed in 9-word sentence ~11%)
      text: 'The braking system shall respond within five milliseconds exactly.',
    });
    expect(differ.classifySeverity(oldV, newV)).toBe('medium');
  });

  it('classifies cosmetic change (<10% word diff) as low', () => {
    const differ = createRequirementDiffer();
    // Very long text with tiny change — well below 10% ratio
    const base = 'The braking system shall respond within ten milliseconds ' +
      'and must validate all sensor inputs before processing ' +
      'to ensure correct operation under all conditions and scenarios.';
    const oldV = makeVersion({ version: 1, acceptance_criteria: [], text: base });
    // Change only one word in a ~25-word sentence => ~4% ratio
    const newV = makeVersion({
      version: 2,
      acceptance_criteria: [],
      text: base.replace('ten', '10'),
    });
    expect(differ.classifySeverity(oldV, newV)).toBe('low');
  });

  it('classifies identical text as low', () => {
    const differ = createRequirementDiffer();
    const v = makeVersion({ version: 1 });
    const vSame = makeVersion({ version: 2 });
    expect(differ.classifySeverity(v, vSame)).toBe('low');
  });

  it('diff returns correct old/new text', () => {
    const differ = createRequirementDiffer();
    const oldV = makeVersion({ version: 1, text: 'Old text.' });
    const newV = makeVersion({ version: 2, text: 'New text changed significantly here.' });
    const result = differ.diff('REQ-SSR-042', oldV, newV);
    expect(result.old_text).toBe('Old text.');
    expect(result.new_text).toBe('New text changed significantly here.');
  });

  it('diff includes human-readable description', () => {
    const differ = createRequirementDiffer();
    const oldV = makeVersion({ version: 1, text: 'Old text.' });
    const newV = makeVersion({ version: 2, text: 'Completely rewritten different content here now.' });
    const result = differ.diff('REQ-SSR-042', oldV, newV);
    expect(typeof result.description).toBe('string');
    expect(result.description.length).toBeGreaterThan(0);
  });

  it('diff sets text_changed flag correctly', () => {
    const differ = createRequirementDiffer();
    const oldV = makeVersion({ version: 1, text: 'Same text.' });
    const newV = makeVersion({ version: 2, text: 'Same text.' });
    const result = differ.diff('REQ-SSR-042', oldV, newV);
    expect(result.text_changed).toBe(false);
  });

  it('diff sets text_changed to true when text differs', () => {
    const differ = createRequirementDiffer();
    const oldV = makeVersion({ version: 1, text: 'Original.' });
    const newV = makeVersion({ version: 2, text: 'Changed text here significantly.' });
    const result = differ.diff('REQ-SSR-042', oldV, newV);
    expect(result.text_changed).toBe(true);
  });

  it('diff sets asil_changed flag correctly', () => {
    const differ = createRequirementDiffer();
    const oldV = makeVersion({ version: 1, asil_level: 'B' });
    const newV = makeVersion({ version: 2, asil_level: 'D' });
    const result = differ.diff('REQ-SSR-042', oldV, newV);
    expect(result.asil_changed).toBe(true);
    expect(result.severity).toBe('critical');
  });

  it('diff sets criteria_changed flag correctly', () => {
    const differ = createRequirementDiffer();
    const oldV = makeVersion({ version: 1, acceptance_criteria: ['Criterion A'] });
    const newV = makeVersion({ version: 2, acceptance_criteria: ['Criterion A', 'Criterion B'] });
    const result = differ.diff('REQ-SSR-042', oldV, newV);
    expect(result.criteria_changed).toBe(true);
  });

  it('diff populates requirement_id, old_version, new_version', () => {
    const differ = createRequirementDiffer();
    const oldV = makeVersion({ version: 3 });
    const newV = makeVersion({ version: 4, text: 'Slightly different text here yes.' });
    const result = differ.diff('REQ-SSR-042', oldV, newV);
    expect(result.requirement_id).toBe('REQ-SSR-042');
    expect(result.old_version).toBe(3);
    expect(result.new_version).toBe(4);
  });

  it('description says "No changes detected" when nothing changed', () => {
    const differ = createRequirementDiffer();
    const v = makeVersion({ version: 1 });
    const vSame = makeVersion({ version: 2 });
    const result = differ.diff('REQ-SSR-042', v, vSame);
    expect(result.description).toBe('No changes detected.');
  });

  it('ASIL change description mentions old and new ASIL levels', () => {
    const differ = createRequirementDiffer();
    const oldV = makeVersion({ version: 1, asil_level: 'A' });
    const newV = makeVersion({ version: 2, asil_level: 'D' });
    const result = differ.diff('REQ-SSR-042', oldV, newV);
    expect(result.description).toContain('A');
    expect(result.description).toContain('D');
  });
});
