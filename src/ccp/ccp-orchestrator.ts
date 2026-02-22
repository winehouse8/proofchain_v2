/**
 * ProofChain CCP Orchestrator
 *
 * Main entry point for the Change Cycle Protocol.  Ties together the
 * classifier, blast-radius calculator, staleness propagator, gate enforcer,
 * reverification planner, and audit logger into a single atomic transaction.
 */

import type Database from 'better-sqlite3';
import type {
  AuditEventType,
  ChangeEvent,
  ChangeType,
  ProofChainConfig,
} from '../core/types.js';
import type { VerificationLedger } from '../ledger/verification-ledger.js';
import type { DependencyGraph } from '../graph/dependency-graph.js';
import type {
  StalenessPropagator,
  PropagationResult,
} from '../ledger/staleness-propagator.js';
import type { AuditLogger } from '../state/audit-logger.js';

import { createChangeClassifier } from './change-classifier.js';
import { createBlastRadiusCalculator } from './blast-radius-calculator.js';
import type { BlastRadiusDetail } from './blast-radius-calculator.js';
import { createGateEnforcer } from './gate-enforcer.js';
import type { GateCheckResult } from './gate-enforcer.js';
import { createReverificationPlanner } from './reverification-planner.js';
import type { ReverificationPlan } from './reverification-planner.js';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface CCPResult {
  change_event: ChangeEvent;
  blast_radius: BlastRadiusDetail;
  propagation: PropagationResult;
  gate_check: GateCheckResult;
  reverification_plan: ReverificationPlan;
  audit_event_id: number;
}

export interface CCPDependencies {
  db: Database.Database;
  ledger: VerificationLedger;
  graph: DependencyGraph;
  propagator: StalenessPropagator;
  auditLogger: AuditLogger;
  config: ProofChainConfig;
}

export interface CCPOrchestrator {
  handleCodeChange(
    filePath: string,
    oldContent: string | null,
    newContent: string,
  ): CCPResult;

  handleRequirementChange(
    reqId: string,
    oldText: string | null,
    newText: string,
  ): CCPResult;

  handleTestChange(
    filePath: string,
    oldContent: string | null,
    newContent: string,
  ): CCPResult;

  handleConfigChange(
    oldConfig: unknown,
    newConfig: unknown,
  ): CCPResult;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Map a ChangeType to the corresponding AuditEventType.
 */
function changeTypeToAuditEvent(changeType: ChangeType): AuditEventType {
  switch (changeType) {
    case 'requirement_change': return 'requirement_change';
    case 'code_change':        return 'code_change';
    case 'test_change':        return 'test_change';
    case 'config_change':      return 'config_change';
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createCCPOrchestrator(deps: CCPDependencies): CCPOrchestrator {
  const { db, ledger, graph, propagator, auditLogger, config } = deps;

  const classifier = createChangeClassifier();
  const blastCalculator = createBlastRadiusCalculator();
  const gateEnforcer = createGateEnforcer();
  const planner = createReverificationPlanner();

  /**
   * Core pipeline: classify → blast radius → propagate → gate → plan → audit.
   * All mutations run inside a single SQLite transaction for atomicity.
   */
  function runPipeline(
    classifyFn: () => ReturnType<typeof classifier.classifyFileChange>,
    overrideChangeType?: ChangeType,
  ): CCPResult {
    // Step 1: classify (pure — no DB side effects)
    const classification = classifyFn();

    // The effective change type (may be overridden for test_change)
    const changeType: ChangeType = overrideChangeType ?? classification.change_type;

    // Build the ChangeEvent before we enter the transaction
    const now = new Date().toISOString();
    const changeEvent: ChangeEvent = {
      change_type: changeType,
      severity: classification.severity,
      affected_artifacts: classification.affected_artifacts,
      is_interface_change: classification.is_interface_change,
      file_path: classification.file_path,
      function_name: classification.function_name,
      description: classification.description,
      timestamp: now,
    };

    // Step 2: blast radius (pure — only reads the graph)
    const blastRadius = blastCalculator.calculate(classification, graph);

    // Steps 3–6 run inside a transaction
    let propagation!: PropagationResult;
    let gateCheck!: GateCheckResult;
    let reverificationPlan!: ReverificationPlan;
    let auditEventId!: number;

    const transact = db.transaction(() => {
      // Step 3: propagate staleness through dependency graph
      const propagationChangeType = classification.is_interface_change
        ? 'interface_change'
        : 'implementation_change';

      // Propagate for the primary artifact (first affected artifact or file_path)
      const primaryArtifact =
        classification.affected_artifacts[0] ?? classification.file_path;

      propagation = propagator.propagate(primaryArtifact, propagationChangeType);

      // Step 4: check gate
      gateCheck = gateEnforcer.checkGate('commit', config, ledger);

      // Step 5: plan re-verification
      reverificationPlan = planner.plan(blastRadius, ledger);

      // Step 6: log audit event
      const auditEventType = changeTypeToAuditEvent(changeType);
      const partialResult = {
        change_event: changeEvent,
        blast_radius: blastRadius,
        propagation,
        gate_check: gateCheck,
        reverification_plan: reverificationPlan,
      };

      auditEventId = auditLogger.log({
        timestamp: now,
        event_type: auditEventType,
        agent_id: null,
        artifact_id: primaryArtifact,
        file_path: classification.file_path,
        function_name: classification.function_name,
        change_type: changeType,
        asil_level: config.asil_level,
        details: JSON.stringify(partialResult),
        before_snapshot: null,
        after_snapshot: null,
      });
    });

    transact();

    return {
      change_event: changeEvent,
      blast_radius: blastRadius,
      propagation,
      gate_check: gateCheck,
      reverification_plan: reverificationPlan,
      audit_event_id: auditEventId,
    };
  }

  return {
    handleCodeChange(
      filePath: string,
      oldContent: string | null,
      newContent: string,
    ): CCPResult {
      return runPipeline(
        () => classifier.classifyFileChange(filePath, oldContent, newContent),
        'code_change',
      );
    },

    handleRequirementChange(
      reqId: string,
      oldText: string | null,
      newText: string,
    ): CCPResult {
      return runPipeline(
        () => classifier.classifyRequirementChange(reqId, oldText, newText),
        'requirement_change',
      );
    },

    handleTestChange(
      filePath: string,
      oldContent: string | null,
      newContent: string,
    ): CCPResult {
      return runPipeline(
        () => classifier.classifyFileChange(filePath, oldContent, newContent),
        'test_change',
      );
    },

    handleConfigChange(
      oldConfig: unknown,
      newConfig: unknown,
    ): CCPResult {
      return runPipeline(
        () => classifier.classifyConfigChange(oldConfig, newConfig),
        'config_change',
      );
    },
  };
}
