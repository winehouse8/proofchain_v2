/**
 * Tests for ProofChain StalenessPropagator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedGraph, seedLedger } from '../test-utils/in-memory-db.js';
import { createVerificationLedger } from './verification-ledger.js';
import { createDependencyGraph } from '../graph/dependency-graph.js';
import { createStalenessPropagator } from './staleness-propagator.js';
import type { VerificationLedger } from './verification-ledger.js';
import type { DependencyGraph } from '../graph/dependency-graph.js';
import type { StalenessPropagator } from './staleness-propagator.js';
import type Database from 'better-sqlite3';

describe('StalenessPropagator', () => {
  let db: Database.Database;
  let ledger: VerificationLedger;
  let graph: DependencyGraph;
  let propagator: StalenessPropagator;

  beforeEach(() => {
    db = createTestDb();
    ledger = createVerificationLedger(db);
    graph = createDependencyGraph(db);
    propagator = createStalenessPropagator(ledger, graph);
  });

  // ── Helper: seed a fresh linear chain A->B->C ─────────────────────────────

  function seedFreshLinear(): void {
    // Graph: A -> B -> C  (A calls B, B calls C)
    seedGraph(db, 'linear');
    // All three start fresh
    seedLedger(db, [
      { artifact_id: 'A', content_hash: 'hash-A', verification_status: 'fresh', freshness_score: 1.0, asil_level: 'QM' },
      { artifact_id: 'B', content_hash: 'hash-B', verification_status: 'fresh', freshness_score: 1.0, asil_level: 'QM' },
      { artifact_id: 'C', content_hash: 'hash-C', verification_status: 'fresh', freshness_score: 1.0, asil_level: 'QM' },
    ]);
  }

  // ── Interface change propagation ───────────────────────────────────────────

  describe('interface change propagation', () => {
    it('linear A->B->C: changing C (interface) makes C, B, and A stale', () => {
      seedFreshLinear();

      const result = propagator.propagate('C', 'interface_change');

      // C itself (distance 0)
      const cEntry = ledger.getEntry('C')!;
      expect(cEntry.verification_status).toBe('stale');

      // B is direct caller of C (distance 1) — should be stale
      const bEntry = ledger.getEntry('B')!;
      expect(bEntry.verification_status).toBe('stale');

      // A calls B which calls C (distance 2) — should be stale transitively
      const aEntry = ledger.getEntry('A')!;
      expect(aEntry.verification_status).toBe('stale');

      // Result metadata
      expect(result.changed_artifact).toBe('C');
      expect(result.change_type).toBe('interface_change');
      expect(result.total_invalidated).toBe(3);
    });

    it('returns correct distances in invalidated_artifacts', () => {
      seedFreshLinear();

      const result = propagator.propagate('C', 'interface_change');

      const byId = Object.fromEntries(
        result.invalidated_artifacts.map(a => [a.artifact_id, a]),
      );

      expect(byId['C'].distance).toBe(0);
      expect(byId['B'].distance).toBe(1);
      expect(byId['A'].distance).toBe(2);
    });
  });

  // ── Implementation change propagation ─────────────────────────────────────

  describe('implementation change propagation', () => {
    it('linear A->B->C: changing C (implementation) makes only C and B stale, A stays fresh', () => {
      seedFreshLinear();

      const result = propagator.propagate('C', 'implementation_change');

      // C itself becomes stale
      expect(ledger.getEntry('C')!.verification_status).toBe('stale');

      // B is direct caller — becomes stale
      expect(ledger.getEntry('B')!.verification_status).toBe('stale');

      // A is not directly affected — stays fresh
      expect(ledger.getEntry('A')!.verification_status).toBe('fresh');

      // Only C and B invalidated
      expect(result.total_invalidated).toBe(2);
      expect(result.change_type).toBe('implementation_change');
    });
  });

  // ── Skips already-unverified entries ──────────────────────────────────────

  describe('skips unverified entries', () => {
    it('does not re-invalidate B if it is already unverified', () => {
      seedGraph(db, 'linear');
      seedLedger(db, [
        { artifact_id: 'A', content_hash: 'hash-A', verification_status: 'fresh', freshness_score: 1.0, asil_level: 'QM' },
        { artifact_id: 'B', content_hash: 'hash-B', verification_status: 'unverified', freshness_score: null, asil_level: 'QM' },
        { artifact_id: 'C', content_hash: 'hash-C', verification_status: 'fresh', freshness_score: 1.0, asil_level: 'QM' },
      ]);

      const result = propagator.propagate('C', 'interface_change');

      // B is unverified — propagator skips it (not included in invalidated list)
      const bInvalidated = result.invalidated_artifacts.find(a => a.artifact_id === 'B');
      expect(bInvalidated).toBeUndefined();

      // B's status remains unverified (not changed to stale)
      expect(ledger.getEntry('B')!.verification_status).toBe('unverified');
    });
  });

  // ── Skips already-failed entries ──────────────────────────────────────────

  describe('skips failed entries', () => {
    it('does not re-invalidate B if it is already failed', () => {
      seedGraph(db, 'linear');
      seedLedger(db, [
        { artifact_id: 'A', content_hash: 'hash-A', verification_status: 'fresh', freshness_score: 1.0, asil_level: 'QM' },
        { artifact_id: 'B', content_hash: 'hash-B', verification_status: 'failed', freshness_score: -1.0, asil_level: 'QM' },
        { artifact_id: 'C', content_hash: 'hash-C', verification_status: 'fresh', freshness_score: 1.0, asil_level: 'QM' },
      ]);

      const result = propagator.propagate('C', 'interface_change');

      // B is failed — propagator skips it
      const bInvalidated = result.invalidated_artifacts.find(a => a.artifact_id === 'B');
      expect(bInvalidated).toBeUndefined();

      // B's status remains failed
      expect(ledger.getEntry('B')!.verification_status).toBe('failed');
    });
  });

  // ── Handles missing ledger entries ────────────────────────────────────────

  describe('handles missing ledger entries', () => {
    it('skips artifacts in blast radius that have no ledger entry', () => {
      seedGraph(db, 'linear');
      // Only seed C and A in the ledger; B has no entry
      seedLedger(db, [
        { artifact_id: 'A', content_hash: 'hash-A', verification_status: 'fresh', freshness_score: 1.0, asil_level: 'QM' },
        { artifact_id: 'C', content_hash: 'hash-C', verification_status: 'fresh', freshness_score: 1.0, asil_level: 'QM' },
      ]);

      // Should not throw
      expect(() => propagator.propagate('C', 'interface_change')).not.toThrow();

      // B has no entry — not invalidated
      expect(ledger.getEntry('B')).toBeNull();
    });
  });

  // ── Preserves verified_against evidence ───────────────────────────────────

  describe('preserves evidence after invalidation', () => {
    it('verified_against field is still present after invalidation', () => {
      seedGraph(db, 'linear');
      const evidence = {
        requirements: ['REQ-001@v1'],
        tests: ['test:hash-abc'],
        coverage: { statement: 1.0, branch: 1.0, mcdc: 0.0 },
        misra_clean: true,
        reviewer: null,
      };
      seedLedger(db, [
        { artifact_id: 'A', content_hash: 'hash-A', verification_status: 'fresh', freshness_score: 1.0, asil_level: 'QM' },
        {
          artifact_id: 'B',
          content_hash: 'hash-B',
          verification_status: 'fresh',
          freshness_score: 1.0,
          asil_level: 'QM',
          verified_against: evidence,
        },
        { artifact_id: 'C', content_hash: 'hash-C', verification_status: 'fresh', freshness_score: 1.0, asil_level: 'QM' },
      ]);

      propagator.propagate('C', 'implementation_change');

      const bEntry = ledger.getEntry('B')!;
      expect(bEntry.verification_status).toBe('stale');
      // Evidence is preserved (invalidateEntry only updates status fields)
      expect(bEntry.verified_against).not.toBeNull();
      expect(bEntry.verified_against!.requirements).toEqual(['REQ-001@v1']);
    });
  });

  // ── Returns correct result shape ──────────────────────────────────────────

  describe('result shape', () => {
    it('total_invalidated matches invalidated_artifacts length', () => {
      seedFreshLinear();

      const result = propagator.propagate('C', 'interface_change');

      expect(result.total_invalidated).toBe(result.invalidated_artifacts.length);
    });

    it('previous_status reflects status before invalidation', () => {
      seedFreshLinear();

      const result = propagator.propagate('C', 'implementation_change');

      const cRecord = result.invalidated_artifacts.find(a => a.artifact_id === 'C')!;
      expect(cRecord.previous_status).toBe('fresh');

      const bRecord = result.invalidated_artifacts.find(a => a.artifact_id === 'B')!;
      expect(bRecord.previous_status).toBe('fresh');
    });

    it('reason string mentions the changed artifact and change type', () => {
      seedFreshLinear();

      const result = propagator.propagate('C', 'implementation_change');

      const bRecord = result.invalidated_artifacts.find(a => a.artifact_id === 'B')!;
      expect(bRecord.reason).toContain('C');
      expect(bRecord.reason).toContain('implementation_change');
    });
  });

  // ── Edge: propagate on artifact with no ledger entry ─────────────────────

  describe('edge cases', () => {
    it('does not throw when the changed artifact has no ledger entry', () => {
      seedGraph(db, 'linear');
      // No ledger entries at all
      expect(() => propagator.propagate('C', 'interface_change')).not.toThrow();
    });

    it('returns zero total_invalidated when nothing is in the ledger', () => {
      seedGraph(db, 'linear');
      const result = propagator.propagate('C', 'interface_change');
      expect(result.total_invalidated).toBe(0);
    });
  });
});
