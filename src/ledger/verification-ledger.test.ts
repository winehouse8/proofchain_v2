/**
 * Tests for ProofChain VerificationLedger
 */

import { describe, it, expect } from 'vitest';
import { createTestDb } from '../test-utils/in-memory-db.js';
import { createVerificationLedger } from './verification-ledger.js';
import type { CreateLedgerInput } from './verification-ledger.js';
import type { VerificationEvidence } from '../core/types.js';

function makeInput(overrides: Partial<CreateLedgerInput> = {}): CreateLedgerInput {
  return {
    artifact_id: 'art-default',
    content_hash: 'sha256:aabbcc',
    ...overrides,
  };
}

const sampleEvidence: VerificationEvidence = {
  requirements: ['REQ-SSR-001@v1', 'REQ-SSR-002@v2'],
  tests: ['sha256:test001', 'sha256:test002'],
  coverage: { statement: 0.95, branch: 0.90, mcdc: 0.85 },
  misra_clean: true,
  reviewer: 'engineer-alice',
};

describe('VerificationLedger', () => {
  describe('createEntry', () => {
    it('creates with defaults when only required fields are provided', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      const entry = ledger.createEntry({ artifact_id: 'art-1', content_hash: 'sha256:aabb' });

      expect(entry.artifact_id).toBe('art-1');
      expect(entry.content_hash).toBe('sha256:aabb');
      expect(entry.verification_status).toBe('unverified');
      expect(entry.asil_level).toBe('QM');
      expect(entry.freshness_score).toBeNull();
      expect(entry.verified_at).toBeNull();
      expect(entry.verified_against).toBeNull();
      expect(entry.dependencies).toEqual([]);
      expect(entry.invalidated_by).toBeNull();
      expect(entry.invalidated_at).toBeNull();
      expect(entry.interface_hash).toBeNull();
    });

    it('creates with full evidence including JSON fields', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      const entry = ledger.createEntry({
        artifact_id: 'art-full',
        content_hash: 'sha256:full001',
        interface_hash: 'sha256:iface001',
        verification_status: 'fresh',
        freshness_score: 1.0,
        verified_at: '2024-06-15T12:00:00.000Z',
        verified_against: sampleEvidence,
        dependencies: ['art-dep-1', 'art-dep-2'],
        asil_level: 'D',
      });

      expect(entry.artifact_id).toBe('art-full');
      expect(entry.content_hash).toBe('sha256:full001');
      expect(entry.interface_hash).toBe('sha256:iface001');
      expect(entry.verification_status).toBe('fresh');
      expect(entry.freshness_score).toBe(1.0);
      expect(entry.verified_at).toBe('2024-06-15T12:00:00.000Z');
      expect(entry.asil_level).toBe('D');
      expect(entry.dependencies).toEqual(['art-dep-1', 'art-dep-2']);
      expect(entry.verified_against).toEqual(sampleEvidence);
    });

    it('updates existing entry on conflict (upsert)', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      ledger.createEntry({ artifact_id: 'art-up', content_hash: 'sha256:old' });
      const updated = ledger.createEntry({
        artifact_id: 'art-up',
        content_hash: 'sha256:new',
        verification_status: 'fresh',
      });

      expect(updated.content_hash).toBe('sha256:new');
      expect(updated.verification_status).toBe('fresh');
    });
  });

  describe('getEntry', () => {
    it('returns null for non-existent artifact', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      const entry = ledger.getEntry('nonexistent');
      expect(entry).toBeNull();
    });

    it('returns correct entry with parsed JSON fields', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      ledger.createEntry({
        artifact_id: 'art-get',
        content_hash: 'sha256:getme',
        verified_against: sampleEvidence,
        dependencies: ['dep-a', 'dep-b'],
        asil_level: 'C',
      });

      const entry = ledger.getEntry('art-get');
      expect(entry).not.toBeNull();
      expect(entry!.artifact_id).toBe('art-get');
      expect(entry!.dependencies).toEqual(['dep-a', 'dep-b']);
      expect(entry!.verified_against).toEqual(sampleEvidence);
      expect(entry!.asil_level).toBe('C');
    });
  });

  describe('invalidateEntry', () => {
    it('sets status to stale and records reason', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      ledger.createEntry({
        artifact_id: 'art-inv',
        content_hash: 'sha256:inv',
        verification_status: 'fresh',
        freshness_score: 1.0,
      });

      const updated = ledger.invalidateEntry('art-inv', 'upstream changed');
      expect(updated).not.toBeNull();
      expect(updated!.verification_status).toBe('stale');
      expect(updated!.invalidated_by).toBe('upstream changed');
      expect(updated!.invalidated_at).not.toBeNull();
    });

    it('preserves evidence fields after invalidation', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      ledger.createEntry({
        artifact_id: 'art-pres',
        content_hash: 'sha256:pres',
        verification_status: 'fresh',
        verified_against: sampleEvidence,
        dependencies: ['dep-x'],
        asil_level: 'B',
      });

      const updated = ledger.invalidateEntry('art-pres', 'dep changed');
      expect(updated!.verified_against).toEqual(sampleEvidence);
      expect(updated!.dependencies).toEqual(['dep-x']);
      expect(updated!.asil_level).toBe('B');
      expect(updated!.content_hash).toBe('sha256:pres');
    });

    it('returns null for non-existent artifact', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      const result = ledger.invalidateEntry('does-not-exist', 'reason');
      expect(result).toBeNull();
    });

    it('sets freshness_score to 0.5 when invalidated', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      ledger.createEntry({
        artifact_id: 'art-fs',
        content_hash: 'sha256:fs',
        freshness_score: 1.0,
      });

      const updated = ledger.invalidateEntry('art-fs', 'changed');
      expect(updated!.freshness_score).toBe(0.5);
    });
  });

  describe('queryStale', () => {
    it('returns stale entries sorted by ASIL priority (D first)', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      ledger.createEntry({ artifact_id: 'art-qm', content_hash: 'h1', asil_level: 'QM' });
      ledger.createEntry({ artifact_id: 'art-d', content_hash: 'h2', asil_level: 'D' });
      ledger.createEntry({ artifact_id: 'art-b', content_hash: 'h3', asil_level: 'B' });
      ledger.createEntry({ artifact_id: 'art-c', content_hash: 'h4', asil_level: 'C' });
      ledger.createEntry({ artifact_id: 'art-a', content_hash: 'h5', asil_level: 'A' });

      ledger.invalidateEntry('art-qm', 'changed');
      ledger.invalidateEntry('art-d', 'changed');
      ledger.invalidateEntry('art-b', 'changed');
      ledger.invalidateEntry('art-c', 'changed');
      ledger.invalidateEntry('art-a', 'changed');

      const stale = ledger.queryStale();
      const asilOrder = stale.map(e => e.asil_level);
      expect(asilOrder[0]).toBe('D');
      expect(asilOrder[1]).toBe('C');
      expect(asilOrder[2]).toBe('B');
      expect(asilOrder[3]).toBe('A');
      expect(asilOrder[4]).toBe('QM');
    });

    it('returns only stale entries', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      ledger.createEntry({ artifact_id: 'fresh-1', content_hash: 'h1', verification_status: 'fresh' });
      ledger.createEntry({ artifact_id: 'stale-1', content_hash: 'h2' });
      ledger.invalidateEntry('stale-1', 'changed');

      const stale = ledger.queryStale();
      expect(stale).toHaveLength(1);
      expect(stale[0]!.artifact_id).toBe('stale-1');
    });
  });

  describe('queryFresh', () => {
    it('returns only fresh entries', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      ledger.createEntry({ artifact_id: 'fresh-a', content_hash: 'h1', verification_status: 'fresh' });
      ledger.createEntry({ artifact_id: 'fresh-b', content_hash: 'h2', verification_status: 'fresh' });
      ledger.createEntry({ artifact_id: 'unver-a', content_hash: 'h3' });
      ledger.createEntry({ artifact_id: 'stale-a', content_hash: 'h4' });
      ledger.invalidateEntry('stale-a', 'changed');

      const fresh = ledger.queryFresh();
      expect(fresh).toHaveLength(2);
      expect(fresh.every(e => e.verification_status === 'fresh')).toBe(true);
    });
  });

  describe('queryByStatus', () => {
    it('filters correctly by status', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      ledger.createEntry({ artifact_id: 'f1', content_hash: 'h1', verification_status: 'fresh' });
      ledger.createEntry({ artifact_id: 'f2', content_hash: 'h2', verification_status: 'fresh' });
      ledger.createEntry({ artifact_id: 'u1', content_hash: 'h3' });
      ledger.createEntry({ artifact_id: 'fail1', content_hash: 'h4', verification_status: 'failed' });

      expect(ledger.queryByStatus('fresh')).toHaveLength(2);
      expect(ledger.queryByStatus('unverified')).toHaveLength(1);
      expect(ledger.queryByStatus('failed')).toHaveLength(1);
      expect(ledger.queryByStatus('stale')).toHaveLength(0);
    });
  });

  describe('computeFreshness', () => {
    it('returns null for non-existent artifact', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);
      expect(ledger.computeFreshness('nonexistent')).toBeNull();
    });

    it('returns null for unverified status', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);
      ledger.createEntry({ artifact_id: 'unv', content_hash: 'h1', verification_status: 'unverified' });
      expect(ledger.computeFreshness('unv')).toBeNull();
    });

    it('returns -1.0 for failed status', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);
      ledger.createEntry({ artifact_id: 'fail', content_hash: 'h1', verification_status: 'failed' });
      expect(ledger.computeFreshness('fail')).toBe(-1.0);
    });

    it('returns 1.0 for fresh entry with no dependencies', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);
      ledger.createEntry({
        artifact_id: 'fresh-nodeps',
        content_hash: 'h1',
        verification_status: 'fresh',
        dependencies: [],
      });
      expect(ledger.computeFreshness('fresh-nodeps')).toBe(1.0);
    });

    it('applies formula with interface changes: 1.0 - 0.2*iface - 0.1*impl - 0.1*asilWeight', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      // Create a stale dependency with a different interface_hash than the main entry
      ledger.createEntry({
        artifact_id: 'dep-iface',
        content_hash: 'dep-hash',
        interface_hash: 'sha256:dep-iface-DIFFERENT',
        verification_status: 'stale',
      });

      // Main entry with interface_hash different from dep's, so it will count as interface change
      ledger.createEntry({
        artifact_id: 'art-formula',
        content_hash: 'main-hash',
        interface_hash: 'sha256:main-iface',
        verification_status: 'fresh',
        dependencies: ['dep-iface'],
        asil_level: 'QM', // asilWeight = 0
      });

      // dep has interface_hash != entry's interface_hash => interfaceChanges = 1
      // score = 1.0 - 0.2*1 - 0.1*0 - 0.1*0 = 0.8
      const score = ledger.computeFreshness('art-formula');
      expect(score).toBeCloseTo(0.8);
    });

    it('applies formula with implementation-only changes', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      // Dep has same interface_hash as entry => impl change (not interface change)
      const sharedIfaceHash = 'sha256:same-iface';
      ledger.createEntry({
        artifact_id: 'dep-impl',
        content_hash: 'dep-hash',
        interface_hash: sharedIfaceHash,
        verification_status: 'stale',
      });

      ledger.createEntry({
        artifact_id: 'art-impl-change',
        content_hash: 'main-hash',
        interface_hash: sharedIfaceHash,
        verification_status: 'fresh',
        dependencies: ['dep-impl'],
        asil_level: 'QM', // asilWeight = 0
      });

      // interfaceChanges=0, implChanges=1, asilWeight=0
      // score = 1.0 - 0.0 - 0.1*1 - 0.0 = 0.9
      const score = ledger.computeFreshness('art-impl-change');
      expect(score).toBeCloseTo(0.9);
    });

    it('applies max(0.1, score) floor', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      // Many interface changes to push score below 0.1
      for (let i = 0; i < 10; i++) {
        ledger.createEntry({
          artifact_id: `dep-heavy-${i}`,
          content_hash: `dep-hash-${i}`,
          interface_hash: `sha256:dep-iface-${i}`,
          verification_status: 'stale',
        });
      }

      const deps = Array.from({ length: 10 }, (_, i) => `dep-heavy-${i}`);
      ledger.createEntry({
        artifact_id: 'art-heavy',
        content_hash: 'main-hash',
        interface_hash: 'sha256:main-iface-heavy',
        verification_status: 'fresh',
        dependencies: deps,
        asil_level: 'D', // asilWeight = 1.0
      });

      const score = ledger.computeFreshness('art-heavy');
      expect(score).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('deleteEntry', () => {
    it('removes the entry and returns true', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      ledger.createEntry({ artifact_id: 'del-me', content_hash: 'h1' });
      const deleted = ledger.deleteEntry('del-me');
      expect(deleted).toBe(true);
      expect(ledger.getEntry('del-me')).toBeNull();
    });

    it('returns false when entry does not exist', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);
      expect(ledger.deleteEntry('nonexistent')).toBe(false);
    });
  });

  describe('countByStatus', () => {
    it('returns correct counts per status', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      ledger.createEntry({ artifact_id: 'f1', content_hash: 'h1', verification_status: 'fresh' });
      ledger.createEntry({ artifact_id: 'f2', content_hash: 'h2', verification_status: 'fresh' });
      ledger.createEntry({ artifact_id: 'u1', content_hash: 'h3', verification_status: 'unverified' });
      ledger.createEntry({ artifact_id: 'fail1', content_hash: 'h4', verification_status: 'failed' });
      ledger.createEntry({ artifact_id: 's1', content_hash: 'h5' });
      ledger.invalidateEntry('s1', 'changed');

      const counts = ledger.countByStatus();
      expect(counts.fresh).toBe(2);
      expect(counts.unverified).toBe(1);
      expect(counts.failed).toBe(1);
      expect(counts.stale).toBe(1);
    });

    it('returns zeros for statuses with no entries', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      const counts = ledger.countByStatus();
      expect(counts.fresh).toBe(0);
      expect(counts.stale).toBe(0);
      expect(counts.unverified).toBe(0);
      expect(counts.failed).toBe(0);
    });
  });

  describe('round-trip: create → invalidate → queryStale → verify', () => {
    it('full lifecycle works correctly', () => {
      const db = createTestDb();
      const ledger = createVerificationLedger(db);

      // 1. Create fresh entry
      const created = ledger.createEntry({
        artifact_id: 'lifecycle-art',
        content_hash: 'sha256:v1',
        verification_status: 'fresh',
        freshness_score: 1.0,
        verified_against: sampleEvidence,
        asil_level: 'C',
        dependencies: [],
      });
      expect(created.verification_status).toBe('fresh');

      // 2. Invalidate it
      const invalidated = ledger.invalidateEntry('lifecycle-art', 'upstream API changed');
      expect(invalidated!.verification_status).toBe('stale');
      expect(invalidated!.invalidated_by).toBe('upstream API changed');

      // 3. Query stale — should appear
      const staleList = ledger.queryStale();
      const found = staleList.find(e => e.artifact_id === 'lifecycle-art');
      expect(found).toBeDefined();
      expect(found!.asil_level).toBe('C');

      // 4. Re-verify by creating updated entry (upsert)
      const reverified = ledger.createEntry({
        artifact_id: 'lifecycle-art',
        content_hash: 'sha256:v2',
        verification_status: 'fresh',
        freshness_score: 1.0,
        verified_against: sampleEvidence,
        asil_level: 'C',
      });
      expect(reverified.verification_status).toBe('fresh');
      expect(reverified.content_hash).toBe('sha256:v2');

      // 5. No longer in stale list
      const staleAfter = ledger.queryStale();
      expect(staleAfter.find(e => e.artifact_id === 'lifecycle-art')).toBeUndefined();

      // 6. Appears in fresh list
      const freshList = ledger.queryFresh();
      expect(freshList.find(e => e.artifact_id === 'lifecycle-art')).toBeDefined();
    });
  });
});
