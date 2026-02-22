/**
 * ProofChain Core Type System
 *
 * All shared TypeScript types and interfaces for the ProofChain
 * ISO 26262-inspired safety-grade development enforcer.
 *
 * Design principle: No `any` types. Strict mode enforced.
 */

// ─── ASIL & Configuration Types ─────────────────────────────────────────────

/** Automotive Safety Integrity Level */
export type AsilLevel = 'QM' | 'A' | 'B' | 'C' | 'D';

/** Enforcement behavior when a violation is detected */
export type EnforcementMode = 'strict' | 'warn' | 'info';

/** Supported programming languages for rule evaluation */
export type SupportedLanguage = 'c' | 'cpp';

/** Coding standard to enforce */
export type CodingStandard = 'misra-c-2012' | 'misra-cpp-2008';

/** ASIL-level thresholds for metrics and coverage */
export interface AsilThresholds {
  readonly cyclomatic_complexity_max: number;
  readonly function_lines_max: number;
  readonly function_params_max: number;
  readonly nesting_depth_max: number;
  readonly comment_density_min: number;
  readonly statement_coverage_min: number;
  readonly branch_coverage_min: number;
  readonly mcdc_coverage_min: number;
}

/** Gate requirements that vary by ASIL level */
export interface AsilGates {
  readonly require_traceability_tag: boolean;
  readonly require_test_before_commit: boolean;
  readonly require_independent_review: boolean;
  readonly require_change_impact_analysis: boolean;
  readonly require_safety_doc: boolean;
}

/** ProofChain project configuration (.proofchain/config.json) */
export interface ProofChainConfig {
  readonly asil_level: AsilLevel;
  readonly language: SupportedLanguage;
  readonly coding_standard: CodingStandard;
  readonly enforcement_mode: EnforcementMode;
  readonly thresholds: AsilThresholds;
  readonly gates: AsilGates;
}

// ─── Verification Ledger Types ──────────────────────────────────────────────

/** Verification status of an artifact */
export type VerificationStatus = 'fresh' | 'stale' | 'unverified' | 'failed';

/**
 * Freshness score for an artifact.
 *
 * - 1.0 = FRESH (all deps at verified versions)
 * - 0.0 to 0.9 = STALE (deps changed since verification)
 * - null = UNVERIFIED (never verified)
 * - -1.0 = FAILED (last verification failed)
 *
 * Computed formula for stale:
 *   max(0.1, 1.0 - 0.2 * interface_changes - 0.1 * impl_changes - 0.1 * asil_weight)
 * where asil_weight: QM=0, A/B=0.5, C/D=1.0
 */
export type FreshnessScore = number | null;

/** Evidence collected during a verification */
export interface VerificationEvidence {
  readonly requirements: readonly string[];  // Versioned requirement refs e.g. "REQ-SSR-042@v3"
  readonly tests: readonly string[];          // Content-hashed test refs
  readonly coverage: CoverageData;
  readonly misra_clean: boolean;
  readonly reviewer: string | null;
}

/** Coverage data for an artifact */
export interface CoverageData {
  readonly statement: number;
  readonly branch: number;
  readonly mcdc: number;
}

/** A single entry in the Verification Ledger */
export interface LedgerEntry {
  readonly artifact_id: string;
  readonly content_hash: string;
  readonly interface_hash: string | null;
  readonly verification_status: VerificationStatus;
  readonly freshness_score: FreshnessScore;
  readonly verified_at: string | null;       // ISO 8601 timestamp
  readonly verified_against: VerificationEvidence | null;
  readonly dependencies: readonly string[];  // Artifact IDs this depends on
  readonly invalidated_by: string | null;    // Reason for staleness
  readonly invalidated_at: string | null;    // ISO 8601 timestamp
  readonly asil_level: AsilLevel;
}

// ─── Dependency Graph Types ─────────────────────────────────────────────────

/** Types of edges in the dependency graph */
export type DependencyEdgeType = 'calls' | 'traces' | 'tests' | 'includes';

/** Types of artifacts (nodes) in the dependency graph */
export type ArtifactType =
  | 'function'
  | 'file'
  | 'requirement'
  | 'test'
  | 'architecture_element';

/** A node in the dependency graph */
export interface DependencyNode {
  readonly id: string;
  readonly type: ArtifactType;
  readonly file_path: string | null;
  readonly content_hash: string;
  readonly interface_hash: string | null;
  readonly traced_requirements: readonly string[];
  readonly tested_by: readonly string[];
}

/** An edge in the dependency graph */
export interface DependencyEdge {
  readonly from: string;  // Artifact ID
  readonly to: string;    // Artifact ID
  readonly edge_type: DependencyEdgeType;
}

/** Result of a blast radius computation */
export interface BlastRadius {
  readonly changed_artifact: string;
  readonly change_type: ChangeType;
  readonly is_interface_change: boolean;
  readonly affected_artifacts: readonly AffectedArtifact[];
  readonly total_affected: number;
}

/** An artifact affected by a change, with metadata */
export interface AffectedArtifact {
  readonly artifact_id: string;
  readonly artifact_type: ArtifactType;
  readonly distance: number;              // Hops from the changed artifact
  readonly invalidation_reason: string;
  readonly asil_level: AsilLevel;
  readonly reverification_type: ReverificationType;
}

/** What kind of re-verification is needed */
export type ReverificationType = 'unit' | 'integration' | 'safety' | 'full';

// ─── Change Cycle Protocol Types ────────────────────────────────────────────

/** Classification of a change event */
export type ChangeType =
  | 'requirement_change'
  | 'code_change'
  | 'test_change'
  | 'config_change';

/** Severity of a change */
export type ChangeSeverity = 'low' | 'medium' | 'high' | 'critical';

/** A classified change event */
export interface ChangeEvent {
  readonly change_type: ChangeType;
  readonly severity: ChangeSeverity;
  readonly affected_artifacts: readonly string[];
  readonly is_interface_change: boolean;
  readonly file_path: string;
  readonly function_name: string | null;
  readonly description: string;
  readonly timestamp: string;  // ISO 8601
}

/** A re-verification work item generated by the CCP */
export interface ReverificationWorkItem {
  readonly artifact_id: string;
  readonly verification_type: ReverificationType;
  readonly reason: string;
  readonly priority: number;  // Lower is higher priority
  readonly asil_level: AsilLevel;
  readonly estimated_scope: string;
}

// ─── Hook System Types ──────────────────────────────────────────────────────

/** Two-tier hook architecture */
export type HookTier = 'tier1_sync' | 'tier2_async';

/** Hook decision result */
export type HookDecision = 'allow' | 'block';

/** Result of a hook evaluation */
export interface HookResult {
  readonly tier: HookTier;
  readonly decision: HookDecision;
  readonly reason: string | null;
  readonly annotations: readonly HookAnnotation[];
  readonly duration_ms: number;
}

/** An annotation attached to a hook result */
export interface HookAnnotation {
  readonly type: 'error' | 'warning' | 'info';
  readonly rule_id: string | null;
  readonly message: string;
  readonly file: string | null;
  readonly line: number | null;
  readonly suggestion: string | null;
}

// ─── MISRA Rule Engine Types ────────────────────────────────────────────────

/** How a rule pattern is matched */
export type RulePatternType = 'regex' | 'ast';

/** MISRA rule severity classification */
export type RuleSeverity = 'mandatory' | 'required' | 'advisory';

/** A single MISRA rule definition */
export interface MisraRule {
  readonly rule_id: string;
  readonly category: string;
  readonly severity: RuleSeverity;
  readonly asil_min: AsilLevel;
  readonly description: string;
  readonly pattern: string;
  readonly pattern_type: RulePatternType;
  readonly ast_pattern: string | null;
  readonly fix_suggestion: string;
  readonly rationale: string;
}

/** Result of evaluating a rule against code */
export interface RuleViolation {
  readonly rule_id: string;
  readonly severity: RuleSeverity;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly fix_suggestion: string;
  readonly code_snippet: string | null;
}

/** Complexity metrics for a function */
export interface ComplexityMetrics {
  readonly cyclomatic_complexity: number;
  readonly nesting_depth: number;
  readonly lines_of_code: number;
  readonly parameter_count: number;
  readonly comment_density: number;
}

/**
 * Rule provider interface for multi-language support.
 * Implement this interface to add support for a new language.
 */
export interface RuleProvider {
  /** Language this provider supports */
  readonly language: SupportedLanguage;

  /** Evaluate all active rules against the given code */
  evaluateRules(
    code: string,
    filePath: string,
    activeRules: readonly MisraRule[],
  ): readonly RuleViolation[];

  /** Calculate complexity metrics for a function */
  calculateComplexity(
    code: string,
    functionName: string,
  ): ComplexityMetrics;

  /** Parse trace tags from source code */
  parseTraceTags(
    code: string,
    filePath: string,
  ): readonly TraceTag[];
}

// ─── Traceability Types ─────────────────────────────────────────────────────

/** A trace tag parsed from source code */
export interface TraceTag {
  readonly file: string;
  readonly function_name: string;
  readonly line: number;
  readonly traced_requirements: readonly string[];
  readonly traced_architecture: readonly string[];
  readonly tag_type: 'trace' | 'defensive_check';
}

/** A link in the traceability matrix */
export interface TraceabilityLink {
  readonly requirement_id: string;
  readonly requirement_version: number;
  readonly architecture_id: string | null;
  readonly code_artifact_id: string;
  readonly test_artifact_ids: readonly string[];
}

/** A versioned requirement */
export interface RequirementVersion {
  readonly requirement_id: string;
  readonly version: number;
  readonly content_hash: string;
  readonly text: string;
  readonly asil_level: AsilLevel;
  readonly acceptance_criteria: readonly string[];
  readonly created_at: string;  // ISO 8601
}

// ─── Audit Trail Types ──────────────────────────────────────────────────────

/** Types of auditable events */
export type AuditEventType =
  | 'code_change'
  | 'requirement_change'
  | 'test_change'
  | 'config_change'
  | 'verification_started'
  | 'verification_passed'
  | 'verification_failed'
  | 'staleness_propagated'
  | 'gate_blocked'
  | 'gate_passed'
  | 'phase_transition'
  | 'debt_created'
  | 'debt_resolved';

/** An entry in the audit trail */
export interface AuditEvent {
  readonly id: number;
  readonly timestamp: string;        // ISO 8601
  readonly event_type: AuditEventType;
  readonly agent_id: string | null;
  readonly artifact_id: string | null;
  readonly file_path: string | null;
  readonly function_name: string | null;
  readonly change_type: ChangeType | null;
  readonly asil_level: AsilLevel | null;
  readonly details: string;          // JSON string with event-specific data
  readonly before_snapshot: string | null;  // JSON string
  readonly after_snapshot: string | null;   // JSON string
}

// ─── V-Model State Machine Types ────────────────────────────────────────────

/** V-Model development phases */
export type VModelPhase =
  | 'requirements_spec'
  | 'architecture_design'
  | 'unit_design'
  | 'implementation'
  | 'unit_verification'
  | 'integration_verify'
  | 'safety_verify'
  | 'verified'
  | 'released';

/** Meta-states that can be combined with any primary phase */
export type VModelMetaState =
  | 'change_pending'
  | 'reverify_required'
  | 'debt_acknowledged';

/** Gate status for a phase transition check */
export interface PhaseGateStatus {
  readonly coverage_met: boolean;
  readonly tests_passing: boolean;
  readonly misra_clean: boolean;
  readonly traceability_complete: boolean;
  readonly trace_tags_present: boolean;
  readonly complexity_ok: boolean;
  readonly independent_review_done: boolean;
}

/** State of a single feature track in the V-Model */
export interface FeatureTrackState {
  readonly phase: VModelPhase;
  readonly meta_states: readonly VModelMetaState[];
  readonly entered_at: string;           // ISO 8601
  readonly gate_status: PhaseGateStatus;
  readonly verification_debt: number;
  readonly blocked_by: readonly string[];
}

// ─── Verification Debt Types ────────────────────────────────────────────────

/** ASIL-dependent debt ceiling (auto-escalation threshold) */
export const DEBT_CEILING: Readonly<Record<AsilLevel, number>> = {
  QM: Infinity,
  A: 20,
  B: 10,
  C: 5,
  D: 2,
};

/** ASIL weight for freshness score computation */
export const ASIL_WEIGHT: Readonly<Record<AsilLevel, number>> = {
  QM: 0,
  A: 0.5,
  B: 0.5,
  C: 1.0,
  D: 1.0,
};

/** A single verification debt item */
export interface VerificationDebtItem {
  readonly artifact_id: string;
  readonly reason: string;
  readonly stale_since: string;      // ISO 8601
  readonly asil_level: AsilLevel;
  readonly estimated_effort: string;
  readonly blocks_release: boolean;
}

/** Verification debt summary */
export interface VerificationDebtSummary {
  readonly total_debt: number;
  readonly by_asil: Readonly<Record<AsilLevel, number>>;
  readonly items: readonly VerificationDebtItem[];
  readonly trend: DebtTrend;
}

/** Debt trend tracking */
export interface DebtTrend {
  readonly seven_day_avg: number;
  readonly direction: 'increasing' | 'decreasing' | 'stable';
}

// ─── Coverage Types ─────────────────────────────────────────────────────────

/** Supported coverage report formats */
export type CoverageFormat = 'gcov' | 'lcov' | 'llvm-cov';

/** Parsed coverage report for a single function */
export interface FunctionCoverage {
  readonly file: string;
  readonly function_name: string;
  readonly statement_coverage: number;
  readonly branch_coverage: number;
  readonly mcdc_coverage: number;
  readonly uncovered_lines: readonly number[];
  readonly uncovered_branches: readonly BranchInfo[];
}

/** Info about an uncovered branch */
export interface BranchInfo {
  readonly line: number;
  readonly condition: string;
  readonly taken: boolean;
}

/** A test case suggestion for improving coverage */
export interface TestSuggestion {
  readonly function_name: string;
  readonly file: string;
  readonly uncovered_path: string;
  readonly suggested_test_description: string;
  readonly line: number;
  readonly priority: number;
}

// ─── Safety Review Types ────────────────────────────────────────────────────

/** Independence level per ISO 26262-8 */
export type IndependenceLevel = 'I0' | 'I1' | 'I2' | 'I3';

/** Review dimension names */
export type ReviewDimension =
  | 'requirements_compliance'
  | 'coding_standard'
  | 'defensive_programming'
  | 'error_handling'
  | 'resource_management'
  | 'concurrency_safety'
  | 'interface_correctness'
  | 'complexity_compliance';

/** Status of a single review dimension */
export type ReviewDimensionStatus = 'pass' | 'fail' | 'warn';

/** Finding severity */
export type FindingSeverity = 'critical' | 'major' | 'minor';

/** A finding from a safety review */
export interface ReviewFinding {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly description: string;
  readonly suggested_fix: string;
}

/** Result of reviewing a single dimension */
export interface DimensionResult {
  readonly name: ReviewDimension;
  readonly status: ReviewDimensionStatus;
  readonly findings: readonly ReviewFinding[];
  readonly severity: FindingSeverity;
}

/** Complete safety review result (structured JSON output) */
export interface SafetyReviewResult {
  readonly dimensions: readonly DimensionResult[];
  readonly overall_status: 'approved' | 'rejected' | 'approved_with_conditions';
  readonly reviewer_id: string;
  readonly reviewed_at: string;  // ISO 8601
}

// ─── SQLite Schema Version ──────────────────────────────────────────────────

/** Current schema version for migrations */
export const CURRENT_SCHEMA_VERSION = 1;
