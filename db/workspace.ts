import { env } from "cloudflare:workers";
import {
  buildSeedWorkspace,
  evidenceByIncidentId,
  seedActivity,
  seedEvidenceProbes,
  seedFleetRelease,
  seedFleetTenants,
  seedIncidents,
  seedJobs,
  seedQuarantineRecords,
  seedSupportTasks,
  seedTenant,
} from "@/lib/demo-seed";
import {
  buildFleetMetrics,
  buildRecoveryPlans,
  buildRecoveryValueMetrics,
  evaluateSupportSla,
  evaluateHealthGate,
  isTerminalIncidentStatus,
} from "@/lib/fleet-policy";
import { evaluateExposureDecision } from "@/lib/exposure-engine";
import type {
  ActionRequest,
  ConnectorDependency,
  CustomerCommunication,
  DemoSession,
  EvidenceProbe,
  ExposureDecision,
  FleetIncident,
  FleetRelease,
  FleetTenant,
  HealthGateEvidence,
  Incident,
  IncidentFingerprint,
  IncidentOwner,
  IncidentStatus,
  JobStatus,
  QuarantineStatus,
  RawExecutionEvent,
  RemediationTask,
  ReleaseStatus,
  Role,
  Severity,
  SupportTask,
  SupportSlaStatus,
  SyncJob,
  WorkspaceSnapshot,
} from "@/lib/types";

const scenarioVersion = "17";
const automaticDelayMs = 2_500;
const sourceDefaultPolicyId = "default-no-reservation-not-started-v1";
const sourceQuarantinePolicyId = "keep-blank-records-quarantined-v1";
const scenarioAnchorAt = "2026-07-28T16:40:00.000Z";

type IncidentStateRow = {
  incidentId: string;
  status: IncidentStatus;
  owner: IncidentOwner;
  actionState: string;
  step: number;
  currentValue: string | null;
  mappingVersion: string;
  connectorVersion: string;
  resolution: string | null;
  updatedAt: string;
};

type JobAttemptRow = {
  id: string;
  incidentId: string;
  flowId: string;
  connectionId: string;
  provider: string;
  objectType: string;
  status: JobStatus;
  startedAt: string;
  completedAt: string | null;
  processed: number;
  failed: number;
  checkpoint: string;
  summary: string;
  retryOf: string;
  idempotencyKey: string;
};

type ActivityRow = {
  id: number;
  incidentId: string | null;
  actorRole: Role | "system";
  actorLabel: string;
  action: string;
  detail: string;
  createdAt: string;
};

type ConnectorDependencyRow = Omit<
  ConnectorDependency,
  "capabilities" | "endpoints" | "enabled"
> & {
  capabilitiesJson: string;
  endpointsJson: string;
  enabled: number;
};

type ExecutionEventRow = RawExecutionEvent;

type IncidentFingerprintRow = Omit<IncidentFingerprint, "sourceEventIds"> & {
  sourceEventIdsJson: string;
};

type ExposureDecisionRow = Omit<ExposureDecision, "fingerprint" | "tenantAssessments"> & {
  resultJson: string;
};

type QuarantineRow = {
  id: string;
  incidentId: string;
  tenantId: string;
  sourceRecordId: string;
  label: string;
  status: QuarantineStatus;
  reason: string;
  checkpoint: string;
  idempotencyKey: string;
  replayAttemptId: string | null;
  updatedAt: string;
};

type ReleaseStateRow = {
  releaseId: string;
  status: ReleaseStatus;
  stageIndex: number;
  requiredHealthyRuns: number;
  observedHealthyRuns: number;
  rollbackReason: string | null;
  updatedAt: string;
};

type ReleaseTargetRow = {
  tenantId: string;
  cohort: FleetTenant["cohort"];
  activeVersion: string;
  targetVersion: string;
  rolloutStatus: FleetTenant["rolloutStatus"];
  lastHealthCheck: string;
  updatedAt: string;
};

type EvidenceProbeRow = Omit<EvidenceProbe, "result"> & {
  resultJson: string | null;
};

type HealthGateEvidenceRow = Omit<
  HealthGateEvidence,
  "tenantIds" | "traceIds" | "source"
> & {
  tenantIdsJson: string;
  traceIdsJson: string;
  source: HealthGateEvidence["source"];
};

type FleetIncidentStateRow = {
  incidentId: string;
  severity: Severity;
  status: FleetIncident["status"];
  recoveryOwner: FleetIncident["recoveryOwner"];
  communicationOwner: FleetIncident["communicationOwner"];
  actionState: string;
  detectedAt: string;
  acknowledgedAt: string | null;
  responseDueAt: string;
  updatedAt: string;
};

type SupportTaskRow = Omit<SupportTask, "slaStatus" | "slaReason">;

type RemediationTaskRow = RemediationTask;

type IncidentUpdate = {
  status: IncidentStatus;
  owner: IncidentOwner;
  actionState: string;
  step: number;
  currentValue?: string | null;
  mappingVersion?: string;
  connectorVersion?: string;
  resolution?: string | null;
};

type ActivityInput = {
  actorRole: Role | "system";
  actorLabel: string;
  action: string;
  detail: string;
};

let schemaReady: Promise<void> | null = null;

export class WorkspaceActionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function getD1(): D1Database {
  if (!env.DB) {
    throw new WorkspaceActionError("The workspace database is unavailable.", 503);
  }
  return env.DB;
}

function now() {
  return new Date().toISOString();
}

function shiftScenarioTimestamp(value: string, runAnchor: string) {
  const source = Date.parse(value);
  const anchor = Date.parse(runAnchor);
  const scenarioAnchor = Date.parse(scenarioAnchorAt);
  if (![source, anchor, scenarioAnchor].every(Number.isFinite)) return value;
  return new Date(source + anchor - scenarioAnchor).toISOString();
}

function timestampAfter(value: string) {
  const previous = Date.parse(value);
  return new Date(
    Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : Date.now()),
  ).toISOString();
}

function minutesAfter(value: string, minutes: number) {
  return new Date(Date.parse(value) + minutes * 60 * 1000).toISOString();
}

function supportSlaReason(task: SupportTaskRow, slaStatus: SupportSlaStatus) {
  if (slaStatus === "Closed") return "The required customer communication was sent.";
  if (slaStatus === "Breached") return "The internal communication deadline passed; the task is back in the action queue.";
  if (slaStatus === "Due soon") return "The internal communication deadline is due within five minutes.";
  return task.lastUpdateAt
    ? "A customer update was sent; the next internal communication checkpoint is on track."
    : "The initial impact-update deadline remains inside its response window.";
}

function fleetResponseSlaStatus(
  acknowledgedAt: string | null,
  responseDueAt: string,
): SupportSlaStatus {
  if (acknowledgedAt) return "Closed";
  return evaluateSupportSla("Unassigned", responseDueAt);
}

async function ensureWorkspaceTables(db: D1Database) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.batch([
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_runs (
            id TEXT PRIMARY KEY,
            scenario_version TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_incident_state (
            run_id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            status TEXT NOT NULL,
            owner TEXT NOT NULL,
            action_state TEXT NOT NULL,
            step INTEGER NOT NULL,
            current_value TEXT,
            mapping_version TEXT NOT NULL,
            connector_version TEXT NOT NULL,
            resolution TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (run_id, incident_id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_scenario_clock (
            run_id TEXT PRIMARY KEY,
            anchor_at TEXT NOT NULL
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_job_attempts (
            run_id TEXT NOT NULL,
            id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            flow_id TEXT NOT NULL,
            connection_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            object_type TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            processed INTEGER NOT NULL,
            failed INTEGER NOT NULL,
            checkpoint TEXT NOT NULL,
            summary TEXT NOT NULL,
            retry_of TEXT NOT NULL,
            idempotency_key TEXT NOT NULL,
            PRIMARY KEY (run_id, id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL,
            incident_id TEXT,
            actor_role TEXT NOT NULL,
            actor_label TEXT NOT NULL,
            action TEXT NOT NULL,
            detail TEXT NOT NULL,
            created_at TEXT NOT NULL
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_fleet_incident_state (
            run_id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL,
            recovery_owner TEXT NOT NULL,
            communication_owner TEXT NOT NULL,
            action_state TEXT NOT NULL,
            detected_at TEXT NOT NULL,
            acknowledged_at TEXT,
            response_due_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (run_id, incident_id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_support_tasks (
            run_id TEXT NOT NULL,
            id TEXT NOT NULL,
            fleet_incident_id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            tenant_name TEXT NOT NULL,
            status TEXT NOT NULL,
            assignee TEXT,
            acknowledged_at TEXT,
            last_update_at TEXT,
            next_update_by TEXT,
            resolved_at TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (run_id, id),
            UNIQUE (run_id, incident_id, tenant_id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_customer_communications (
            run_id TEXT NOT NULL,
            id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            tenant_name TEXT NOT NULL,
            kind TEXT NOT NULL,
            message TEXT NOT NULL,
            impact TEXT NOT NULL,
            customer_action TEXT NOT NULL,
            recovery_owner TEXT NOT NULL,
            posted_by TEXT NOT NULL,
            posted_at TEXT NOT NULL,
            next_update_by TEXT,
            PRIMARY KEY (run_id, id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_remediation_tasks (
            run_id TEXT NOT NULL,
            id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            disposition TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL,
            owner TEXT NOT NULL,
            owner_label TEXT NOT NULL,
            due_at TEXT NOT NULL,
            scope TEXT NOT NULL,
            completion_condition TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (run_id, id),
            UNIQUE (run_id, incident_id, status)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_connector_dependencies (
            run_id TEXT NOT NULL,
            id TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            tenant_name TEXT NOT NULL,
            workflow_id TEXT NOT NULL,
            workflow_name TEXT NOT NULL,
            provider TEXT NOT NULL,
            connector_family TEXT NOT NULL,
            connector_version TEXT NOT NULL,
            capabilities_json TEXT NOT NULL,
            endpoints_json TEXT NOT NULL,
            enabled INTEGER NOT NULL,
            metadata_status TEXT NOT NULL,
            last_verified_at TEXT NOT NULL,
            next_run_at TEXT NOT NULL,
            criticality TEXT NOT NULL,
            config_revision TEXT NOT NULL,
            PRIMARY KEY (run_id, id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_execution_events (
            run_id TEXT NOT NULL,
            id TEXT NOT NULL,
            incident_id TEXT,
            tenant_id TEXT NOT NULL,
            dependency_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            connector_family TEXT NOT NULL,
            connector_version TEXT NOT NULL,
            capability TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            error_code TEXT,
            trace_id TEXT NOT NULL,
            span_id TEXT NOT NULL,
            status TEXT NOT NULL,
            observed_at TEXT NOT NULL,
            PRIMARY KEY (run_id, id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_incident_fingerprints (
            run_id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            rule_id TEXT NOT NULL,
            policy_version TEXT NOT NULL,
            classification TEXT NOT NULL,
            method TEXT NOT NULL,
            provider TEXT NOT NULL,
            connector_family TEXT NOT NULL,
            connector_version TEXT NOT NULL,
            capability TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            error_code TEXT NOT NULL,
            vulnerable_version_range TEXT NOT NULL,
            correlation_window_minutes INTEGER NOT NULL,
            observed_at TEXT NOT NULL,
            source_event_ids_json TEXT NOT NULL,
            correlated_failure_count INTEGER NOT NULL,
            correlated_tenant_count INTEGER NOT NULL,
            PRIMARY KEY (run_id, incident_id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_exposure_decisions (
            run_id TEXT NOT NULL,
            decision_id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            policy_version TEXT NOT NULL,
            dependency_snapshot_version TEXT NOT NULL,
            input_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            evaluation_mode TEXT NOT NULL,
            result_json TEXT NOT NULL,
            PRIMARY KEY (run_id, decision_id),
            UNIQUE (run_id, incident_id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_exposure_revisions (
            run_id TEXT NOT NULL,
            decision_id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            policy_version TEXT NOT NULL,
            dependency_snapshot_version TEXT NOT NULL,
            input_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            evaluation_mode TEXT NOT NULL,
            result_json TEXT NOT NULL,
            PRIMARY KEY (run_id, decision_id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_quarantine_records (
            run_id TEXT NOT NULL,
            id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            source_record_id TEXT NOT NULL,
            label TEXT NOT NULL,
            status TEXT NOT NULL,
            reason TEXT NOT NULL,
            checkpoint TEXT NOT NULL,
            idempotency_key TEXT NOT NULL,
            replay_attempt_id TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (run_id, id),
            UNIQUE (run_id, idempotency_key)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_release_state (
            run_id TEXT NOT NULL,
            release_id TEXT NOT NULL,
            status TEXT NOT NULL,
            stage_index INTEGER NOT NULL,
            required_healthy_runs INTEGER NOT NULL,
            observed_healthy_runs INTEGER NOT NULL,
            rollback_reason TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (run_id, release_id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_release_targets (
            run_id TEXT NOT NULL,
            release_id TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            cohort TEXT NOT NULL,
            active_version TEXT NOT NULL,
            target_version TEXT NOT NULL,
            rollout_status TEXT NOT NULL,
            last_health_check TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (run_id, release_id, tenant_id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_evidence_probes (
            run_id TEXT NOT NULL,
            id TEXT NOT NULL,
            incident_id TEXT NOT NULL,
            dependency_id TEXT NOT NULL,
            status TEXT NOT NULL,
            attempt INTEGER NOT NULL,
            source TEXT NOT NULL,
            trace_id TEXT NOT NULL,
            requested_by TEXT NOT NULL,
            requested_at TEXT NOT NULL,
            completed_at TEXT,
            failure_reason TEXT,
            result_json TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (run_id, id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_health_gate_evidence (
            run_id TEXT NOT NULL,
            id TEXT NOT NULL,
            release_id TEXT NOT NULL,
            cohort TEXT NOT NULL,
            run_number INTEGER NOT NULL,
            tenant_ids_json TEXT NOT NULL,
            status TEXT NOT NULL,
            success_rate REAL NOT NULL,
            error_rate REAL NOT NULL,
            p95_latency_ms INTEGER NOT NULL,
            duplicate_writes INTEGER NOT NULL,
            trace_ids_json TEXT NOT NULL,
            source TEXT NOT NULL,
            evaluated_at TEXT NOT NULL,
            policy_version TEXT NOT NULL,
            PRIMARY KEY (run_id, id),
            UNIQUE (run_id, release_id, cohort, run_number)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_action_commands (
            run_id TEXT NOT NULL,
            command_id TEXT NOT NULL,
            action TEXT NOT NULL,
            target_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (run_id, command_id)
          )`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS demo_transition_claims (
            run_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            expected_updated_at TEXT NOT NULL,
            command_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (run_id, target_id, expected_updated_at)
          )`,
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS demo_activity_run_idx ON demo_activity(run_id, created_at)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS demo_support_tasks_queue_idx ON demo_support_tasks(run_id, status, next_update_by)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS demo_remediation_due_idx ON demo_remediation_tasks(run_id, status, due_at)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS demo_attempts_run_idx ON demo_job_attempts(run_id, incident_id)",
        ),
        db.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS demo_attempts_idempotency_idx ON demo_job_attempts(run_id, idempotency_key)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS demo_dependencies_tenant_idx ON demo_connector_dependencies(run_id, tenant_id)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS demo_dependencies_exposure_idx ON demo_connector_dependencies(run_id, provider, connector_family, enabled, connector_version)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS demo_events_correlation_idx ON demo_execution_events(run_id, provider, connector_family, observed_at)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS demo_decisions_incident_idx ON demo_exposure_decisions(run_id, incident_id)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS demo_revisions_incident_idx ON demo_exposure_revisions(run_id, incident_id, created_at)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS demo_probes_due_idx ON demo_evidence_probes(run_id, status, updated_at)",
        ),
      ]);
      const expired = await db
        .prepare("SELECT id FROM demo_runs WHERE expires_at <= ?")
        .bind(now())
        .all<{ id: string }>();
      if (expired.results.length) {
        const ids = expired.results.map((run) => run.id);
        const placeholders = ids.map(() => "?").join(", ");
        await db.batch([
          db
            .prepare(`DELETE FROM demo_incident_state WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_scenario_clock WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_job_attempts WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_activity WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_fleet_incident_state WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_support_tasks WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_customer_communications WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_remediation_tasks WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_connector_dependencies WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_execution_events WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_incident_fingerprints WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_exposure_decisions WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_exposure_revisions WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_quarantine_records WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_release_targets WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_release_state WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_evidence_probes WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_health_gate_evidence WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_action_commands WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_transition_claims WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_sessions WHERE run_id IN (${placeholders})`)
            .bind(...ids),
          db
            .prepare(`DELETE FROM demo_runs WHERE id IN (${placeholders})`)
            .bind(...ids),
        ]);
      }
    })().catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  await schemaReady;
}

function clearRunStatements(db: D1Database, runId: string) {
  return [
    db.prepare("DELETE FROM demo_incident_state WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_scenario_clock WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_job_attempts WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_activity WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_fleet_incident_state WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_support_tasks WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_customer_communications WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_remediation_tasks WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_connector_dependencies WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_execution_events WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_incident_fingerprints WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_exposure_decisions WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_exposure_revisions WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_quarantine_records WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_release_targets WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_release_state WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_evidence_probes WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_health_gate_evidence WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_action_commands WHERE run_id = ?").bind(runId),
    db.prepare("DELETE FROM demo_transition_claims WHERE run_id = ?").bind(runId),
  ];
}

function seedRunStatements(db: D1Database, runId: string) {
  const seededAt = now();
  const seedWorkspace = buildSeedWorkspace();
  const statements = seedIncidents.map((incident) =>
    db
      .prepare(
        `INSERT INTO demo_incident_state (
          run_id, incident_id, status, owner, action_state, step, current_value,
          mapping_version, connector_version, resolution, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        runId,
        incident.id,
        incident.status,
        incident.owner,
        incident.actionState,
        incident.step,
        incident.type === "data_quality" ? null : "",
        incident.mappingVersion,
        incident.connectorVersion,
        incident.resolution,
        shiftScenarioTimestamp(incident.updatedAt, seededAt),
      ),
  );
  statements.push(
    db
      .prepare("INSERT INTO demo_scenario_clock (run_id, anchor_at) VALUES (?, ?)")
      .bind(runId, seededAt),
    ...seedActivity.map((event) =>
      db
        .prepare(
          `INSERT INTO demo_activity (
            run_id, incident_id, actor_role, actor_label, action, detail, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          runId,
          event.incidentId,
          event.actorRole,
          event.actorLabel,
          event.action,
          event.detail,
          shiftScenarioTimestamp(event.createdAt, seededAt),
        ),
    ),
    db
      .prepare(
        `INSERT INTO demo_fleet_incident_state (
          run_id, incident_id, severity, status, recovery_owner,
          communication_owner, action_state, detected_at, acknowledged_at,
          response_due_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        runId,
        seedWorkspace.fleetIncident.id,
        seedWorkspace.fleetIncident.severity,
        seedWorkspace.fleetIncident.status,
        seedWorkspace.fleetIncident.recoveryOwner,
        seedWorkspace.fleetIncident.communicationOwner,
        seedWorkspace.fleetIncident.actionState,
        shiftScenarioTimestamp(seedWorkspace.fleetIncident.detectedAt, seededAt),
        null,
        shiftScenarioTimestamp(seedWorkspace.fleetIncident.responseDueAt, seededAt),
        shiftScenarioTimestamp(seedWorkspace.fleetIncident.updatedAt, seededAt),
      ),
    ...seedSupportTasks.map((task) =>
      db
        .prepare(
          `INSERT INTO demo_support_tasks (
            run_id, id, fleet_incident_id, incident_id, tenant_id, tenant_name,
            status, assignee, acknowledged_at, last_update_at, next_update_by,
            resolved_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          runId,
          task.id,
          task.fleetIncidentId,
          task.incidentId,
          task.tenantId,
          task.tenantName,
          task.status,
          task.assignee,
          null,
          null,
          task.nextUpdateBy
            ? shiftScenarioTimestamp(task.nextUpdateBy, seededAt)
            : null,
          null,
          shiftScenarioTimestamp(task.updatedAt, seededAt),
        ),
    ),
    ...seedWorkspace.connectorDependencies.map((dependency) =>
      db
        .prepare(
          `INSERT INTO demo_connector_dependencies (
            run_id, id, tenant_id, tenant_name, workflow_id, workflow_name,
            provider, connector_family, connector_version, capabilities_json,
            endpoints_json, enabled, metadata_status, last_verified_at,
            next_run_at, criticality, config_revision
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          runId,
          dependency.id,
          dependency.tenantId,
          dependency.tenantName,
          dependency.workflowId,
          dependency.workflowName,
          dependency.provider,
          dependency.connectorFamily,
          dependency.connectorVersion,
          JSON.stringify(dependency.capabilities),
          JSON.stringify(dependency.endpoints),
          dependency.enabled ? 1 : 0,
          dependency.metadataStatus,
          shiftScenarioTimestamp(dependency.lastVerifiedAt, seededAt),
          shiftScenarioTimestamp(dependency.nextRunAt, seededAt),
          dependency.criticality,
          dependency.configRevision,
        ),
    ),
    ...seedWorkspace.executionEvents.map((event) =>
      db
        .prepare(
          `INSERT INTO demo_execution_events (
            run_id, id, incident_id, tenant_id, dependency_id, provider,
            connector_family, connector_version, capability, endpoint,
            error_code, trace_id, span_id, status, observed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          runId,
          event.id,
          event.incidentId,
          event.tenantId,
          event.dependencyId,
          event.provider,
          event.connectorFamily,
          event.connectorVersion,
          event.capability,
          event.endpoint,
          event.errorCode,
          event.traceId,
          event.spanId,
          event.status,
          shiftScenarioTimestamp(event.observedAt, seededAt),
        ),
    ),
    ...Object.values(seedWorkspace.incidentFingerprints).map((fingerprint) =>
      db
        .prepare(
          `INSERT INTO demo_incident_fingerprints (
            run_id, incident_id, rule_id, policy_version, classification,
            method, provider, connector_family, connector_version, capability,
            endpoint, error_code, vulnerable_version_range,
            correlation_window_minutes, observed_at, source_event_ids_json,
            correlated_failure_count, correlated_tenant_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          runId,
          fingerprint.incidentId,
          fingerprint.ruleId,
          fingerprint.policyVersion,
          fingerprint.classification,
          fingerprint.method,
          fingerprint.provider,
          fingerprint.connectorFamily,
          fingerprint.connectorVersion,
          fingerprint.capability,
          fingerprint.endpoint,
          fingerprint.errorCode,
          fingerprint.vulnerableVersionRange,
          fingerprint.correlationWindowMinutes,
          shiftScenarioTimestamp(fingerprint.observedAt, seededAt),
          JSON.stringify(fingerprint.sourceEventIds),
          fingerprint.correlatedFailureCount,
          fingerprint.correlatedTenantCount,
        ),
    ),
    ...Object.values(seedWorkspace.exposureDecisions).map((decision) =>
      db
        .prepare(
          `INSERT INTO demo_exposure_decisions (
            run_id, decision_id, incident_id, policy_version,
            dependency_snapshot_version, input_hash, created_at,
            evaluation_mode, result_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          runId,
          decision.decisionId,
          decision.incidentId,
          decision.policyVersion,
          decision.dependencySnapshotVersion,
          decision.inputHash,
          shiftScenarioTimestamp(decision.createdAt, seededAt),
          decision.evaluationMode,
          JSON.stringify(decision),
        ),
    ),
    ...seedQuarantineRecords.map((record) =>
      db
        .prepare(
          `INSERT INTO demo_quarantine_records (
            run_id, id, incident_id, tenant_id, source_record_id, label, status,
            reason, checkpoint, idempotency_key, replay_attempt_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          runId,
          record.id,
          record.incidentId,
          record.tenantId,
          record.sourceRecordId,
          record.label,
          record.status,
          record.reason,
          record.checkpoint,
          record.idempotencyKey,
          record.replayAttemptId,
          shiftScenarioTimestamp(record.updatedAt, seededAt),
        ),
    ),
    db
      .prepare(
        `INSERT INTO demo_release_state (
          run_id, release_id, status, stage_index, required_healthy_runs,
          observed_healthy_runs, rollback_reason, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        runId,
        seedFleetRelease.id,
        seedFleetRelease.status,
        seedFleetRelease.stageIndex,
        seedFleetRelease.requiredHealthyRuns,
        seedFleetRelease.observedHealthyRuns,
        seedFleetRelease.rollbackReason,
        shiftScenarioTimestamp(seedFleetRelease.updatedAt, seededAt),
      ),
    ...seedFleetTenants.map((tenant) =>
      db
        .prepare(
          `INSERT INTO demo_release_targets (
            run_id, release_id, tenant_id, cohort, active_version,
            target_version, rollout_status, last_health_check, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          runId,
          seedFleetRelease.id,
          tenant.id,
          tenant.cohort,
          tenant.activeConnectorVersion,
          tenant.targetConnectorVersion,
          tenant.rolloutStatus,
          Number.isFinite(Date.parse(tenant.lastHealthCheck))
            ? shiftScenarioTimestamp(tenant.lastHealthCheck, seededAt)
            : tenant.lastHealthCheck,
          shiftScenarioTimestamp(seedFleetRelease.updatedAt, seededAt),
        ),
    ),
    ...seedEvidenceProbes.map((probe) =>
      db
        .prepare(
          `INSERT INTO demo_evidence_probes (
            run_id, id, incident_id, dependency_id, status, attempt, source,
            trace_id, requested_by, requested_at, completed_at,
            failure_reason, result_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          runId,
          probe.id,
          probe.incidentId,
          probe.dependencyId,
          probe.status,
          probe.attempt,
          probe.source,
          probe.traceId,
          probe.requestedBy,
          shiftScenarioTimestamp(probe.requestedAt, seededAt),
          probe.completedAt
            ? shiftScenarioTimestamp(probe.completedAt, seededAt)
            : null,
          probe.failureReason,
          probe.result ? JSON.stringify(probe.result) : null,
          shiftScenarioTimestamp(probe.updatedAt, seededAt),
        ),
    ),
    db
      .prepare(
        "UPDATE demo_runs SET scenario_version = ?, updated_at = ? WHERE id = ?",
      )
      .bind(scenarioVersion, seededAt, runId),
  );
  return statements;
}

async function ensureRun(db: D1Database, runId: string) {
  await ensureWorkspaceTables(db);
  const run = await db
    .prepare("SELECT scenario_version AS version FROM demo_runs WHERE id = ?")
    .bind(runId)
    .first<{ version: string }>();
  if (!run) {
    throw new WorkspaceActionError("This demo run has expired. Start again.", 401);
  }
  const stateCount = await db
    .prepare("SELECT COUNT(*) AS count FROM demo_incident_state WHERE run_id = ?")
    .bind(runId)
    .first<{ count: number }>();
  if (run.version !== scenarioVersion || !stateCount?.count) {
    await db.batch([
      ...clearRunStatements(db, runId),
      ...seedRunStatements(db, runId),
    ]);
  }
}

async function readIncidentStates(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT incident_id AS incidentId, status, owner,
        action_state AS actionState, step, current_value AS currentValue,
        mapping_version AS mappingVersion, connector_version AS connectorVersion,
        resolution, updated_at AS updatedAt
      FROM demo_incident_state WHERE run_id = ?`,
    )
    .bind(runId)
    .all<IncidentStateRow>();
  return result.results;
}

async function readJobAttempts(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT id, incident_id AS incidentId, flow_id AS flowId,
        connection_id AS connectionId, provider, object_type AS objectType,
        status, started_at AS startedAt, completed_at AS completedAt,
        processed, failed, checkpoint, summary, retry_of AS retryOf,
        idempotency_key AS idempotencyKey
      FROM demo_job_attempts WHERE run_id = ? ORDER BY started_at DESC`,
    )
    .bind(runId)
    .all<JobAttemptRow>();
  return result.results;
}

async function readActivity(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT id, incident_id AS incidentId, actor_role AS actorRole,
        actor_label AS actorLabel, action, detail, created_at AS createdAt
      FROM demo_activity WHERE run_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .bind(runId)
    .all<ActivityRow>();
  return result.results;
}

async function readRunAnchor(db: D1Database, runId: string) {
  const run = await db
    .prepare("SELECT anchor_at AS updatedAt FROM demo_scenario_clock WHERE run_id = ?")
    .bind(runId)
    .first<{ updatedAt: string }>();
  if (!run) throw new WorkspaceActionError("This demo run has expired. Start again.", 401);
  return run.updatedAt;
}

async function readFleetIncidentState(db: D1Database, runId: string) {
  return db
    .prepare(
      `SELECT incident_id AS incidentId, severity, status,
        recovery_owner AS recoveryOwner,
        communication_owner AS communicationOwner,
        action_state AS actionState, detected_at AS detectedAt,
        acknowledged_at AS acknowledgedAt, response_due_at AS responseDueAt,
        updated_at AS updatedAt
      FROM demo_fleet_incident_state WHERE run_id = ? AND incident_id = ?`,
    )
    .bind(runId, "fleet-incident-slack-upload-001")
    .first<FleetIncidentStateRow>();
}

async function readSupportTasks(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT id, fleet_incident_id AS fleetIncidentId,
        incident_id AS incidentId, tenant_id AS tenantId,
        tenant_name AS tenantName, status, assignee,
        acknowledged_at AS acknowledgedAt, last_update_at AS lastUpdateAt,
        next_update_by AS nextUpdateBy, resolved_at AS resolvedAt,
        updated_at AS updatedAt
      FROM demo_support_tasks WHERE run_id = ? ORDER BY next_update_by, tenant_name`,
    )
    .bind(runId)
    .all<SupportTaskRow>();
  return result.results.map((task) => {
    const slaStatus = evaluateSupportSla(task.status, task.nextUpdateBy);
    return {
      ...task,
      slaStatus,
      slaReason: supportSlaReason(task, slaStatus),
    };
  });
}

async function readCustomerCommunications(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT id, incident_id AS incidentId, tenant_id AS tenantId,
        tenant_name AS tenantName, kind, message, impact,
        customer_action AS customerAction, recovery_owner AS recoveryOwner,
        posted_by AS postedBy, posted_at AS postedAt,
        next_update_by AS nextUpdateBy
      FROM demo_customer_communications WHERE run_id = ?
      ORDER BY posted_at DESC`,
    )
    .bind(runId)
    .all<CustomerCommunication>();
  return result.results;
}

async function readRemediationTasks(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT id, incident_id AS incidentId, tenant_id AS tenantId,
        disposition, title, status, owner, owner_label AS ownerLabel,
        due_at AS dueAt, scope, completion_condition AS completionCondition,
        created_at AS createdAt, updated_at AS updatedAt
      FROM demo_remediation_tasks WHERE run_id = ?
      ORDER BY CASE status WHEN 'Open' THEN 0 ELSE 1 END, due_at`,
    )
    .bind(runId)
    .all<RemediationTaskRow>();
  return result.results;
}

async function readConnectorDependencies(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT id, tenant_id AS tenantId, tenant_name AS tenantName,
        workflow_id AS workflowId, workflow_name AS workflowName, provider,
        connector_family AS connectorFamily, connector_version AS connectorVersion,
        capabilities_json AS capabilitiesJson, endpoints_json AS endpointsJson,
        enabled, metadata_status AS metadataStatus,
        last_verified_at AS lastVerifiedAt, next_run_at AS nextRunAt,
        criticality, config_revision AS configRevision
      FROM demo_connector_dependencies WHERE run_id = ? ORDER BY tenant_name, id`,
    )
    .bind(runId)
    .all<ConnectorDependencyRow>();
  return result.results.map((row) => ({
    ...row,
    capabilities: JSON.parse(row.capabilitiesJson) as string[],
    endpoints: JSON.parse(row.endpointsJson) as string[],
    enabled: Boolean(row.enabled),
  }));
}

async function readExposureCandidates(
  db: D1Database,
  runId: string,
  fingerprint: IncidentFingerprint,
) {
  const versionPrefix = `${fingerprint.connectorVersion.split("-")[0]}-%`;
  const result = await db
    .prepare(
      `SELECT id, tenant_id AS tenantId, tenant_name AS tenantName,
        workflow_id AS workflowId, workflow_name AS workflowName, provider,
        connector_family AS connectorFamily, connector_version AS connectorVersion,
        capabilities_json AS capabilitiesJson, endpoints_json AS endpointsJson,
        enabled, metadata_status AS metadataStatus,
        last_verified_at AS lastVerifiedAt, next_run_at AS nextRunAt,
        criticality, config_revision AS configRevision
      FROM demo_connector_dependencies
      WHERE run_id = ? AND provider = ? AND connector_family = ?
        AND enabled = 1 AND connector_version LIKE ?
      ORDER BY tenant_name, id`,
    )
    .bind(
      runId,
      fingerprint.provider,
      fingerprint.connectorFamily,
      versionPrefix,
    )
    .all<ConnectorDependencyRow>();
  return result.results.map((row) => ({
    ...row,
    capabilities: JSON.parse(row.capabilitiesJson) as string[],
    endpoints: JSON.parse(row.endpointsJson) as string[],
    enabled: Boolean(row.enabled),
  }));
}

async function readEvidenceProbes(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT id, incident_id AS incidentId, dependency_id AS dependencyId,
        status, attempt, source, trace_id AS traceId,
        requested_by AS requestedBy, requested_at AS requestedAt,
        completed_at AS completedAt, failure_reason AS failureReason,
        result_json AS resultJson, updated_at AS updatedAt
      FROM demo_evidence_probes WHERE run_id = ?
      ORDER BY requested_at DESC, attempt DESC`,
    )
    .bind(runId)
    .all<EvidenceProbeRow>();
  return result.results.map((row) => ({
    ...row,
    result: row.resultJson
      ? (JSON.parse(row.resultJson) as EvidenceProbe["result"])
      : null,
  }));
}

async function readHealthGateEvidence(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT id, cohort, run_number AS runNumber,
        tenant_ids_json AS tenantIdsJson, status,
        success_rate AS successRate, error_rate AS errorRate,
        p95_latency_ms AS p95LatencyMs,
        duplicate_writes AS duplicateWrites,
        trace_ids_json AS traceIdsJson, source,
        evaluated_at AS evaluatedAt, policy_version AS policyVersion
      FROM demo_health_gate_evidence
      WHERE run_id = ? AND release_id = ?
      ORDER BY evaluated_at, cohort, run_number`,
    )
    .bind(runId, seedFleetRelease.id)
    .all<HealthGateEvidenceRow>();
  return result.results.map((row) => ({
    ...row,
    tenantIds: JSON.parse(row.tenantIdsJson) as string[],
    traceIds: JSON.parse(row.traceIdsJson) as string[],
  }));
}

async function readExecutionEvents(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT id, incident_id AS incidentId, tenant_id AS tenantId,
        dependency_id AS dependencyId, provider,
        connector_family AS connectorFamily, connector_version AS connectorVersion,
        capability, endpoint, error_code AS errorCode, trace_id AS traceId,
        span_id AS spanId, status, observed_at AS observedAt
      FROM demo_execution_events WHERE run_id = ? ORDER BY observed_at`,
    )
    .bind(runId)
    .all<ExecutionEventRow>();
  return result.results;
}

async function readIncidentFingerprints(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT incident_id AS incidentId, rule_id AS ruleId,
        policy_version AS policyVersion, classification, method, provider,
        connector_family AS connectorFamily, connector_version AS connectorVersion,
        capability, endpoint, error_code AS errorCode,
        vulnerable_version_range AS vulnerableVersionRange,
        correlation_window_minutes AS correlationWindowMinutes,
        observed_at AS observedAt, source_event_ids_json AS sourceEventIdsJson,
        correlated_failure_count AS correlatedFailureCount,
        correlated_tenant_count AS correlatedTenantCount
      FROM demo_incident_fingerprints WHERE run_id = ?`,
    )
    .bind(runId)
    .all<IncidentFingerprintRow>();
  return result.results.map((row) => ({
    ...row,
    sourceEventIds: JSON.parse(row.sourceEventIdsJson) as string[],
  }));
}

async function readExposureDecisions(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT decision_id AS decisionId, incident_id AS incidentId,
        policy_version AS policyVersion,
        dependency_snapshot_version AS dependencySnapshotVersion,
        input_hash AS inputHash, created_at AS createdAt,
        evaluation_mode AS evaluationMode, result_json AS resultJson
      FROM demo_exposure_decisions WHERE run_id = ?
      UNION ALL
      SELECT decision_id AS decisionId, incident_id AS incidentId,
        policy_version AS policyVersion,
        dependency_snapshot_version AS dependencySnapshotVersion,
        input_hash AS inputHash, created_at AS createdAt,
        evaluation_mode AS evaluationMode, result_json AS resultJson
      FROM demo_exposure_revisions WHERE run_id = ?
      ORDER BY createdAt, decisionId`,
    )
    .bind(runId, runId)
    .all<ExposureDecisionRow>();
  return result.results.map((row) => {
    const decision = JSON.parse(row.resultJson) as ExposureDecision;
    return {
      ...decision,
      decisionId: row.decisionId,
      incidentId: row.incidentId,
      policyVersion: row.policyVersion,
      dependencySnapshotVersion: row.dependencySnapshotVersion,
      inputHash: row.inputHash,
      createdAt: row.createdAt,
      evaluationMode: row.evaluationMode,
    };
  });
}

async function readQuarantine(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT id, incident_id AS incidentId, tenant_id AS tenantId,
        source_record_id AS sourceRecordId, label, status, reason, checkpoint,
        idempotency_key AS idempotencyKey, replay_attempt_id AS replayAttemptId,
        updated_at AS updatedAt
      FROM demo_quarantine_records WHERE run_id = ? ORDER BY id`,
    )
    .bind(runId)
    .all<QuarantineRow>();
  return result.results;
}

async function readReleaseState(db: D1Database, runId: string) {
  return db
    .prepare(
      `SELECT release_id AS releaseId, status, stage_index AS stageIndex,
        required_healthy_runs AS requiredHealthyRuns,
        observed_healthy_runs AS observedHealthyRuns,
        rollback_reason AS rollbackReason, updated_at AS updatedAt
      FROM demo_release_state WHERE run_id = ? AND release_id = ?`,
    )
    .bind(runId, seedFleetRelease.id)
    .first<ReleaseStateRow>();
}

async function readReleaseTargets(db: D1Database, runId: string) {
  const result = await db
    .prepare(
      `SELECT tenant_id AS tenantId, cohort, active_version AS activeVersion,
        target_version AS targetVersion, rollout_status AS rolloutStatus,
        last_health_check AS lastHealthCheck, updated_at AS updatedAt
      FROM demo_release_targets WHERE run_id = ? AND release_id = ?
      ORDER BY CASE cohort WHEN 'Canary' THEN 0 WHEN 'Early access' THEN 1 ELSE 2 END`,
    )
    .bind(runId, seedFleetRelease.id)
    .all<ReleaseTargetRow>();
  return result.results;
}

function rowsToFleetRelease(
  release: ReleaseStateRow,
  targets: ReleaseTargetRow[],
  healthEvidence: HealthGateEvidence[],
): FleetRelease {
  const seedById = new Map(seedFleetTenants.map((tenant) => [tenant.id, tenant]));
  return {
    ...structuredClone(seedFleetRelease),
    status: release.status,
    stageIndex: release.stageIndex,
    requiredHealthyRuns: release.requiredHealthyRuns,
    observedHealthyRuns: release.observedHealthyRuns,
    rollbackReason: release.rollbackReason,
    updatedAt: release.updatedAt,
    healthEvidence,
    targets: targets.map((target) => {
      const tenant = seedById.get(target.tenantId);
      if (!tenant) {
        throw new WorkspaceActionError(`Unknown fleet tenant ${target.tenantId}.`, 500);
      }
      return {
        ...structuredClone(tenant),
        cohort: target.cohort,
        activeConnectorVersion: target.activeVersion,
        targetConnectorVersion: target.targetVersion,
        rolloutStatus: target.rolloutStatus,
        lastHealthCheck: target.lastHealthCheck,
      };
    }),
  };
}

function stateToIncident(incident: Incident, state?: IncidentStateRow): Incident {
  if (!state) return incident;
  const disposition =
    state.status === "Resolved"
      ? "Recovered"
      : state.status === "Contained"
        ? state.currentValue === "fallback_mitigation"
          ? "Fallback mitigation"
          : "Exception accepted"
        : null;
  return {
    ...incident,
    status: state.status,
    disposition,
    owner: state.owner,
    actionState: state.actionState,
    step: state.step,
    mappingVersion: state.mappingVersion,
    connectorVersion: state.connectorVersion,
    resolution: state.resolution,
    updatedAt: state.updatedAt,
  };
}

function attemptToJob(row: JobAttemptRow): SyncJob {
  return {
    id: row.id,
    tenantId: seedTenant.id,
    flowId: row.flowId,
    connectionId: row.connectionId,
    incidentId: row.incidentId,
    provider: row.provider,
    objectType: row.objectType,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    durationSeconds: row.completedAt
      ? Math.max(
          1,
          Math.round(
            (new Date(row.completedAt).getTime() -
              new Date(row.startedAt).getTime()) /
              1000,
          ),
        )
      : 0,
    processed: row.processed,
    failed: row.failed,
    skipped: 0,
    checkpoint: row.checkpoint,
    errorType: null,
    summary: row.summary,
    affectedRecordIds: [],
    retryOf: row.retryOf,
    idempotencyKey: row.idempotencyKey,
  };
}

function shiftSeedSnapshotTimes(snapshot: WorkspaceSnapshot, runAnchor: string) {
  snapshot.incidents = snapshot.incidents.map((incident) => ({
    ...incident,
    detectedAt: shiftScenarioTimestamp(incident.detectedAt, runAnchor),
    classifiedAt: shiftScenarioTimestamp(incident.classifiedAt, runAnchor),
    updatedAt: shiftScenarioTimestamp(incident.updatedAt, runAnchor),
  }));
  snapshot.jobs = snapshot.jobs.map((job) => ({
    ...job,
    startedAt: shiftScenarioTimestamp(job.startedAt, runAnchor),
    completedAt: job.completedAt
      ? shiftScenarioTimestamp(job.completedAt, runAnchor)
      : null,
  }));
  snapshot.connections = snapshot.connections.map((connection) => ({
    ...connection,
    lastSync: shiftScenarioTimestamp(connection.lastSync, runAnchor),
    lastVerified: shiftScenarioTimestamp(connection.lastVerified, runAnchor),
  }));
  snapshot.flows = snapshot.flows.map((flow) => ({
    ...flow,
    lastRunAt: shiftScenarioTimestamp(flow.lastRunAt, runAnchor),
    nextRunAt: shiftScenarioTimestamp(flow.nextRunAt, runAnchor),
  }));
}

function applyHealth(snapshot: WorkspaceSnapshot) {
  const activeRecovery = snapshot.incidents.filter(
    (incident) => !isTerminalIncidentStatus(incident.status),
  );
  const openRemediationIncidentIds = new Set(
    snapshot.remediationTasks
      .filter((task) => task.status === "Open")
      .map((task) => task.incidentId),
  );
  const containedFollowUp = snapshot.incidents.filter(
    (incident) =>
      incident.status === "Contained" &&
      openRemediationIncidentIds.has(incident.id),
  );
  const activeWork = [...activeRecovery, ...containedFollowUp];
  snapshot.tenant.openIncidents = activeWork.length;
  snapshot.tenant.health = activeWork.length ? "warning" : "healthy";

  for (const connection of snapshot.connections) {
    const incidents = activeRecovery.filter(
      (incident) => incident.connectionId === connection.id,
    );
    const containedIncidents = containedFollowUp.filter(
      (incident) => incident.connectionId === connection.id,
    );
    connection.openIncidents = incidents.length;
    if (!incidents.length && containedIncidents.length) {
      connection.status = "warning";
      connection.nextAction = "Review the active containment exception";
    } else if (!incidents.length) {
      connection.status = "healthy";
      connection.nextAction = "No action needed";
      if (connection.authStatus === "Reconnect required") {
        connection.authStatus = "Connected";
      }
    } else {
      connection.status = incidents.some((incident) => incident.severity === "High")
        ? "broken"
        : "warning";
    }
  }

  for (const flow of snapshot.flows) {
    const incidents = activeRecovery.filter((incident) => incident.flowId === flow.id);
    const containedIncidents = containedFollowUp.filter(
      (incident) => incident.flowId === flow.id,
    );
    flow.status = !incidents.length
      ? containedIncidents.length
        ? "warning"
        : "healthy"
      : incidents.some((incident) => incident.severity === "High")
        ? "broken"
        : "warning";
  }

  snapshot.insights.failuresAwaitingOwner = activeWork.filter(
    (incident) => incident.owner !== "System",
  ).length;
  snapshot.insights.ownershipQueue = [
    {
      role: "Customer admin",
      count: activeWork.filter((incident) => incident.owner === "Customer admin").length,
    },
    {
      role: "Integration engineer",
      count: activeWork.filter((incident) => incident.owner === "Integration engineer").length,
    },
    {
      role: "System",
      count: activeWork.filter((incident) => incident.owner === "System").length,
    },
  ];
  snapshot.insights.recoveryMix = [
    "Customer action required",
    "Engineering action required",
    "System managed",
  ].map((label) => ({
    label: label as Incident["recoveryMode"],
    count: snapshot.incidents.filter((incident) => incident.recoveryMode === label)
      .length,
  }));
  const recoveryActions = new Set([
    "Approved Salesforce source policy",
    "Reauthorized HubSpot",
    "Published mapping v6.1",
    "Passed connector contract tests",
    "Deployed Slack connector v4.4.0",
  ]);
  snapshot.insights.humanActionsCompleted = snapshot.activity.filter((event) =>
    recoveryActions.has(event.action),
  ).length;
  snapshot.insights.systemTransitionsCompleted = snapshot.activity.filter(
    (event) => event.actorRole === "system" && event.action !== "Classified incident",
  ).length;
  snapshot.insights.decisionMetrics = buildRecoveryValueMetrics(
    snapshot.incidents,
    snapshot.activity,
    snapshot.recoveryPlans,
  );
}

function scopeSnapshot(snapshot: WorkspaceSnapshot, session: DemoSession) {
  if (session.mode === "guided" || session.role === "engineer") return snapshot;

  if (session.role === "support") {
    snapshot.accounts = [];
    snapshot.mappings = [];
    snapshot.evidence = Object.fromEntries(
      Object.entries(snapshot.evidence).map(([incidentId, rows]) => [
        incidentId,
        rows.map((row) => ({
          ...row,
          label: `${row.sourceObject} ${row.id}`,
          accountName: null,
          rawValue: row.provenance === "Open sample data" ? "Redacted" : row.rawValue,
        })),
      ]),
    );
    snapshot.traces = {};
    snapshot.executionEvents = [];
    snapshot.quarantine = snapshot.quarantine.map((record) => ({
      ...record,
      label: `Contact ${record.sourceRecordId}`,
    }));
    return snapshot;
  }

  snapshot.accounts = [];
  snapshot.mappings = [];
  snapshot.mappingRelease.cases = [];
  snapshot.incidents = snapshot.incidents
    .filter((incident) => incident.customerVisible)
    .map((incident) => ({
      ...incident,
      title:
        incident.type !== "authentication"
          ? incident.customerTitle
          : incident.status === "Awaiting customer"
            ? incident.customerTitle
            : isTerminalIncidentStatus(incident.status)
              ? "HubSpot connection recovered"
              : incident.status === "Validating"
                ? "Verifying HubSpot authorization"
                : "Restoring HubSpot contact sync",
      summary: incident.customerSummary,
      actionState:
        incident.owner === "Customer admin"
          ? incident.actionState
          : incident.status === "Contained"
            ? incident.disposition === "Fallback mitigation"
              ? "Fallback service active; permanent connector remediation is open"
              : "Exception accepted; affected records remain quarantined"
            : incident.status === "Resolved"
              ? "Recovery completed"
            : "Platform recovery in progress",
    }));
  const visibleIncidentIds = new Set(snapshot.incidents.map((incident) => incident.id));
  snapshot.fleetTenants = [];
  snapshot.supportTasks = [];
  snapshot.remediationTasks = snapshot.remediationTasks.filter(
    (task) =>
      task.tenantId === session.customerId &&
      visibleIncidentIds.has(task.incidentId),
  );
  snapshot.customerCommunications = snapshot.customerCommunications.filter(
    (communication) =>
      communication.tenantId === session.customerId &&
      visibleIncidentIds.has(communication.incidentId),
  );
  snapshot.evidenceProbes = [];
  snapshot.connectorDependencies = [];
  snapshot.executionEvents = [];
  snapshot.incidentFingerprints = {};
  snapshot.exposureDecisions = {};
  snapshot.exposureDecisionHistory = {};
  snapshot.fleetRelease.targets = [];
  snapshot.fleetRelease.healthEvidence = [];
  snapshot.policyCatalog = [];
  snapshot.fleetIncident = {
    ...snapshot.fleetIncident,
    affectedTenantIds: [],
    exposedTenantIds: [],
    needsReviewTenantIds: [],
    containedTenantIds: [],
    heldForEvidenceTenantIds: [],
    communications: [],
  };
  snapshot.recoveryPlans = Object.fromEntries(
    Object.entries(snapshot.recoveryPlans).filter(([incidentId]) =>
      visibleIncidentIds.has(incidentId),
    ),
  );
  snapshot.quarantine = snapshot.quarantine.filter((record) =>
    visibleIncidentIds.has(record.incidentId),
  );
  snapshot.fleetMetrics = {
    ...snapshot.fleetMetrics,
    totalTenants: 0,
    affectedTenants: 0,
    atRiskTenants: 0,
    needsReviewTenants: 0,
    notExposedTenants: 0,
    completedRollouts: 0,
    rollbacks: 0,
  };
  const customerActivity = new Set([
    "Sent customer update",
    "Sent resolution update",
    "Sent containment update",
    "Approved Salesforce source policy",
    "Rejected suggested Salesforce source policy",
    "Validated source policy exception",
    "Reauthorized HubSpot",
    "Resolved incident",
  ]);
  snapshot.activity = snapshot.activity.filter(
    (event) =>
      Boolean(event.incidentId && visibleIncidentIds.has(event.incidentId)) &&
      customerActivity.has(event.action),
  );
  snapshot.jobs = snapshot.jobs.filter(
    (job) => job.incidentId && visibleIncidentIds.has(job.incidentId),
  );
  snapshot.evidence = {
    "inc-data-001": snapshot.evidence["inc-data-001"] ?? [],
  };
  snapshot.traces = {};
  snapshot.providerContracts = snapshot.providerContracts.filter(
    (contract) => contract.provider === "HubSpot" || contract.provider === "Slack",
  );
  applyHealth(snapshot);
  return snapshot;
}

function incidentUpdateStatement(
  db: D1Database,
  runId: string,
  incidentId: string,
  state: IncidentStateRow,
  values: IncidentUpdate,
  updatedAt: string,
) {
  return db
    .prepare(
      `UPDATE demo_incident_state SET status = ?, owner = ?, action_state = ?,
        step = ?, current_value = ?, mapping_version = ?, connector_version = ?,
        resolution = ?, updated_at = ?
      WHERE run_id = ? AND incident_id = ? AND updated_at = ?`,
    )
    .bind(
      values.status,
      values.owner,
      values.actionState,
      values.step,
      values.currentValue === undefined ? state.currentValue : values.currentValue,
      values.mappingVersion ?? state.mappingVersion,
      values.connectorVersion ?? state.connectorVersion,
      values.resolution === undefined ? state.resolution : values.resolution,
      updatedAt,
      runId,
      incidentId,
      state.updatedAt,
    );
}

function fleetIncidentUpdateStatement(
  db: D1Database,
  runId: string,
  values: {
    status: FleetIncident["status"];
    actionState: string;
    acknowledgedAt?: string | null;
  },
  updatedAt: string,
) {
  return db
    .prepare(
      `UPDATE demo_fleet_incident_state
      SET status = ?, action_state = ?,
        acknowledged_at = COALESCE(?, acknowledged_at), updated_at = ?
      WHERE run_id = ? AND incident_id = ?`,
    )
    .bind(
      values.status,
      values.actionState,
      values.acknowledgedAt ?? null,
      updatedAt,
      runId,
      "fleet-incident-slack-upload-001",
    );
}

function supportTaskUpdateStatement(
  db: D1Database,
  runId: string,
  task: SupportTask,
  values: Partial<
    Pick<
      SupportTask,
      | "status"
      | "assignee"
      | "acknowledgedAt"
      | "lastUpdateAt"
      | "nextUpdateBy"
      | "resolvedAt"
    >
  >,
  updatedAt: string,
) {
  return db
    .prepare(
      `UPDATE demo_support_tasks SET status = ?, assignee = ?,
        acknowledged_at = ?, last_update_at = ?, next_update_by = ?,
        resolved_at = ?, updated_at = ?
      WHERE run_id = ? AND id = ?`,
    )
    .bind(
      values.status ?? task.status,
      values.assignee === undefined ? task.assignee : values.assignee,
      values.acknowledgedAt === undefined
        ? task.acknowledgedAt
        : values.acknowledgedAt,
      values.lastUpdateAt === undefined ? task.lastUpdateAt : values.lastUpdateAt,
      values.nextUpdateBy === undefined ? task.nextUpdateBy : values.nextUpdateBy,
      values.resolvedAt === undefined ? task.resolvedAt : values.resolvedAt,
      updatedAt,
      runId,
      task.id,
    );
}

function activityStatement(
  db: D1Database,
  runId: string,
  incidentId: string | null,
  activity: ActivityInput,
  createdAt: string,
) {
  return db
    .prepare(
      `INSERT INTO demo_activity (
        run_id, incident_id, actor_role, actor_label, action, detail, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      runId,
      incidentId,
      activity.actorRole,
      activity.actorLabel,
      activity.action,
      activity.detail,
      createdAt,
    );
}

function customerCommunicationStatement(
  db: D1Database,
  runId: string,
  communication: CustomerCommunication,
) {
  return db
    .prepare(
      `INSERT INTO demo_customer_communications (
        run_id, id, incident_id, tenant_id, tenant_name, kind, message,
        impact, customer_action, recovery_owner, posted_by, posted_at,
        next_update_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      runId,
      communication.id,
      communication.incidentId,
      communication.tenantId,
      communication.tenantName,
      communication.kind,
      communication.message,
      communication.impact,
      communication.customerAction,
      communication.recoveryOwner,
      communication.postedBy,
      communication.postedAt,
      communication.nextUpdateBy,
    );
}

function remediationTaskStatement(
  db: D1Database,
  runId: string,
  task: RemediationTask,
) {
  return db
    .prepare(
      `INSERT INTO demo_remediation_tasks (
        run_id, id, incident_id, tenant_id, disposition, title, status,
        owner, owner_label, due_at, scope, completion_condition, created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, id) DO UPDATE SET
        disposition = excluded.disposition,
        title = excluded.title,
        status = excluded.status,
        owner = excluded.owner,
        owner_label = excluded.owner_label,
        due_at = excluded.due_at,
        scope = excluded.scope,
        completion_condition = excluded.completion_condition,
        updated_at = excluded.updated_at`,
    )
    .bind(
      runId,
      task.id,
      task.incidentId,
      task.tenantId,
      task.disposition,
      task.title,
      task.status,
      task.owner,
      task.ownerLabel,
      task.dueAt,
      task.scope,
      task.completionCondition,
      task.createdAt,
      task.updatedAt,
    );
}

function createRetryStatement(
  db: D1Database,
  runId: string,
  incident: Incident,
  status: JobStatus,
  createdAt: string,
) {
  const original = seedJobs.find((job) => job.id === incident.jobId);
  if (!original) throw new WorkspaceActionError("Original job was not found.", 404);
  return db
    .prepare(
      `INSERT OR IGNORE INTO demo_job_attempts (
        run_id, id, incident_id, flow_id, connection_id, provider, object_type,
        status, started_at, completed_at, processed, failed, checkpoint,
        summary, retry_of, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      runId,
      `${incident.id}-retry-01`,
      incident.id,
      incident.flowId,
      incident.connectionId,
      original.provider,
      original.objectType,
      status,
      createdAt,
      null,
      0,
      0,
      original.checkpoint,
      status === "Running"
        ? "Retry is running from the saved checkpoint."
        : "Retry is queued from the saved checkpoint.",
      original.id,
      `${original.idempotencyKey}:retry:1`,
    );
}

function updateRetryStatement(
  db: D1Database,
  runId: string,
  incident: Incident,
  status: JobStatus,
  updatedAt: string,
) {
  const succeeded = status === "Succeeded";
  return db
    .prepare(
      `UPDATE demo_job_attempts SET status = ?, completed_at = ?, processed = ?,
        failed = ?, summary = ? WHERE run_id = ? AND incident_id = ?`,
    )
    .bind(
      status,
      succeeded ? updatedAt : null,
      succeeded ? incident.affectedRecords : 0,
      0,
      succeeded
        ? `${incident.affectedRecords} affected records recovered without duplication.`
        : "Retry is running from the saved checkpoint.",
      runId,
      incident.id,
    );
}

function updateQuarantineStatement(
  db: D1Database,
  runId: string,
  status: QuarantineStatus,
  updatedAt: string,
  replayAttemptId: string | null = null,
) {
  return db
    .prepare(
      `UPDATE demo_quarantine_records SET status = ?, replay_attempt_id = ?,
        updated_at = ? WHERE run_id = ? AND incident_id = 'inc-data-001'`,
    )
    .bind(status, replayAttemptId, updatedAt, runId);
}

function updateReleaseStatement(
  db: D1Database,
  runId: string,
  values: {
    status: ReleaseStatus;
    stageIndex: number;
    observedHealthyRuns: number;
    rollbackReason?: string | null;
  },
  updatedAt: string,
) {
  return db
    .prepare(
      `UPDATE demo_release_state SET status = ?, stage_index = ?,
        observed_healthy_runs = ?, rollback_reason = ?, updated_at = ?
      WHERE run_id = ? AND release_id = ?`,
    )
    .bind(
      values.status,
      values.stageIndex,
      values.observedHealthyRuns,
      values.rollbackReason ?? null,
      updatedAt,
      runId,
      seedFleetRelease.id,
    );
}

function updateReleaseCohortStatement(
  db: D1Database,
  runId: string,
  cohort: FleetTenant["cohort"],
  values: {
    activeVersion: string;
    rolloutStatus: FleetTenant["rolloutStatus"];
    lastHealthCheck: string;
  },
  updatedAt: string,
) {
  return db
    .prepare(
      `UPDATE demo_release_targets SET active_version = ?, rollout_status = ?,
        last_health_check = ?, updated_at = ?
      WHERE run_id = ? AND release_id = ? AND cohort = ?`,
    )
    .bind(
      values.activeVersion,
      values.rolloutStatus,
      values.lastHealthCheck,
      updatedAt,
      runId,
      seedFleetRelease.id,
      cohort,
    );
}

type HealthMeasurement = Pick<
  HealthGateEvidence,
  "successRate" | "errorRate" | "p95LatencyMs" | "duplicateWrites"
>;

const degradedCanaryMeasurement: HealthMeasurement = {
  successRate: 0.982,
  errorRate: 0.018,
  p95LatencyMs: 3260,
  duplicateWrites: 1,
};

const healthRunFixtures: Record<
  FleetTenant["cohort"],
  HealthMeasurement[]
> = {
  Canary: [
    { successRate: 1, errorRate: 0, p95LatencyMs: 820, duplicateWrites: 0 },
    { successRate: 0.998, errorRate: 0.002, p95LatencyMs: 910, duplicateWrites: 0 },
  ],
  "Early access": [
    { successRate: 1, errorRate: 0, p95LatencyMs: 880, duplicateWrites: 0 },
    { successRate: 0.999, errorRate: 0.001, p95LatencyMs: 1020, duplicateWrites: 0 },
  ],
  Stable: [
    { successRate: 0.999, errorRate: 0.001, p95LatencyMs: 1080, duplicateWrites: 0 },
    { successRate: 0.998, errorRate: 0.002, p95LatencyMs: 1190, duplicateWrites: 0 },
  ],
};

function healthGateStatus(
  measurement: HealthMeasurement,
) {
  return evaluateHealthGate(seedFleetRelease.healthPolicy, measurement);
}

function healthRunMeasurement(
  cohort: FleetTenant["cohort"],
  runNumber: number,
) {
  const measurement = healthRunFixtures[cohort][runNumber - 1];
  if (!measurement) {
    throw new WorkspaceActionError(
      `No ${cohort} health sample exists for run ${runNumber}.`,
      500,
    );
  }
  return measurement;
}

function healthGateEvidenceStatement(
  db: D1Database,
  runId: string,
  cohort: FleetTenant["cohort"],
  tenantIds: string[],
  runNumber: number,
  evaluatedAt: string,
  measurement: HealthMeasurement = healthRunMeasurement(cohort, runNumber),
) {
  return db
    .prepare(
      `INSERT OR REPLACE INTO demo_health_gate_evidence (
        run_id, id, release_id, cohort, run_number, tenant_ids_json, status,
        success_rate, error_rate, p95_latency_ms, duplicate_writes,
        trace_ids_json, source, evaluated_at, policy_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      runId,
      `health-${cohort.toLowerCase().replaceAll(" ", "-")}-${runNumber}`,
      seedFleetRelease.id,
      cohort,
      runNumber,
      JSON.stringify(tenantIds),
      healthGateStatus(measurement),
      measurement.successRate,
      measurement.errorRate,
      measurement.p95LatencyMs,
      measurement.duplicateWrites,
      JSON.stringify(
        tenantIds.map(
          (tenantId) =>
            `trace-${cohort.toLowerCase().replaceAll(" ", "-")}-${runNumber}-${tenantId}`,
        ),
      ),
      "Demo telemetry",
      evaluatedAt,
      seedFleetRelease.healthPolicy.version,
    );
}

async function commitTransition(
  db: D1Database,
  runId: string,
  incident: Incident,
  state: IncidentStateRow,
  values: IncidentUpdate,
  activity: ActivityInput,
  extras: D1PreparedStatement[] = [],
) {
  const updatedAt = timestampAfter(state.updatedAt);
  await db.batch([
    incidentUpdateStatement(db, runId, incident.id, state, values, updatedAt),
    ...extras,
    activityStatement(db, runId, incident.id, activity, updatedAt),
    db
      .prepare("UPDATE demo_runs SET updated_at = ? WHERE id = ?")
      .bind(updatedAt, runId),
  ]);
}

async function readState(db: D1Database, runId: string, incidentId: string) {
  return db
    .prepare(
      `SELECT incident_id AS incidentId, status, owner,
        action_state AS actionState, step, current_value AS currentValue,
        mapping_version AS mappingVersion, connector_version AS connectorVersion,
        resolution, updated_at AS updatedAt
      FROM demo_incident_state WHERE run_id = ? AND incident_id = ?`,
    )
    .bind(runId, incidentId)
    .first<IncidentStateRow>();
}

async function advanceSystemTransition(
  db: D1Database,
  runId: string,
  incident: Incident,
  state: IncidentStateRow,
  measurementOverride?: HealthMeasurement,
) {
  if (state.owner !== "System") {
    throw new WorkspaceActionError("The next step belongs to a person, not the worker.");
  }

  if (incident.type === "provider_change" && state.status === "Monitoring") {
    const release = await readReleaseState(db, runId);
    if (!release || release.status !== "Canary running") {
      throw new WorkspaceActionError("The canary release is not collecting health evidence.");
    }
    const completedAt = timestampAfter(state.updatedAt);
    const releaseTargets = await readReleaseTargets(db, runId);
    const canaryTenantIds = releaseTargets
      .filter((target) => target.cohort === "Canary")
      .map((target) => target.tenantId);
    const existingEvidence = await readHealthGateEvidence(db, runId);
    const runNumber =
      existingEvidence.filter((item) => item.cohort === "Canary").length + 1;
    const measurement = measurementOverride ?? healthRunMeasurement("Canary", runNumber);
    const gateStatus = healthGateStatus(measurement);
    const healthyRuns =
      gateStatus === "Passed" ? release.observedHealthyRuns + 1 : 0;
    if (gateStatus === "Failed") {
      await commitTransition(
        db,
        runId,
        incident,
        state,
        {
          status: "Awaiting engineering",
          owner: "Integration engineer",
          actionState: "Canary health gate failed; promotion is blocked",
          step: 3,
        },
        {
          actorRole: "system",
          actorLabel: "Fleet health gate",
          action: "Blocked canary promotion",
          detail: `Canary run ${runNumber} failed the persisted health policy. No broader cohort was promoted.`,
        },
        [
          healthGateEvidenceStatement(
            db,
            runId,
            "Canary",
            canaryTenantIds,
            runNumber,
            completedAt,
            measurement,
          ),
          updateReleaseStatement(
            db,
            runId,
            {
              status: "Health gate blocked",
              stageIndex: 0,
              observedHealthyRuns: 0,
            },
            completedAt,
          ),
          updateReleaseCohortStatement(
            db,
            runId,
            "Canary",
            {
              activeVersion: seedFleetRelease.toVersion,
              rolloutStatus: "Held for review",
              lastHealthCheck: `Run ${runNumber} failed; promotion blocked`,
            },
            completedAt,
          ),
          fleetIncidentUpdateStatement(
            db,
            runId,
            {
              status: "Recovering",
              actionState: "Canary health regressed; Engineering must review or roll back",
            },
            completedAt,
          ),
        ],
      );
      return;
    }
    if (healthyRuns < release.requiredHealthyRuns) {
      await commitTransition(
        db,
        runId,
        incident,
        state,
        {
          status: "Monitoring",
          owner: "System",
          actionState: `Canary health run ${runNumber} of ${release.requiredHealthyRuns} passed`,
          step: 3,
        },
        {
          actorRole: "system",
          actorLabel: "Fleet health gate",
          action: `Recorded canary health run ${runNumber}`,
          detail: `Easy Spaces passed run ${runNumber} of ${release.requiredHealthyRuns}. The canary remains under observation.`,
        },
        [
          healthGateEvidenceStatement(
            db,
            runId,
            "Canary",
            canaryTenantIds,
            runNumber,
            completedAt,
            measurement,
          ),
          updateReleaseStatement(
            db,
            runId,
            {
              status: "Canary running",
              stageIndex: 0,
              observedHealthyRuns: healthyRuns,
            },
            completedAt,
          ),
          updateReleaseCohortStatement(
            db,
            runId,
            "Canary",
            {
              activeVersion: seedFleetRelease.toVersion,
              rolloutStatus: "Monitoring",
              lastHealthCheck: `${healthyRuns} of ${release.requiredHealthyRuns} consecutive canary runs healthy`,
            },
            completedAt,
          ),
        ],
      );
      return;
    }
    await commitTransition(
      db,
      runId,
      incident,
      state,
      {
        status: "Resolved",
        owner: "System",
        actionState: "Connector recovered",
        step: 3,
        resolution:
          "The external upload sequence completed and the Slack digest was delivered.",
      },
      {
        actorRole: "system",
        actorLabel: "Connector monitor",
        action: "Resolved incident",
        detail: "The canary completed. The connector stays on v4.4.0 and no rollback was needed.",
      },
      [
        healthGateEvidenceStatement(
          db,
          runId,
          "Canary",
          canaryTenantIds,
          runNumber,
          completedAt,
          measurement,
        ),
        updateRetryStatement(db, runId, incident, "Succeeded", completedAt),
        updateReleaseStatement(
          db,
          runId,
          {
            status: "Canary passed",
            stageIndex: 0,
            observedHealthyRuns: healthyRuns,
          },
          completedAt,
        ),
        updateReleaseCohortStatement(
          db,
          runId,
          "Canary",
          {
            activeVersion: seedFleetRelease.toVersion,
            rolloutStatus: "Healthy",
            lastHealthCheck: `${healthyRuns} of ${release.requiredHealthyRuns} consecutive canary runs healthy`,
          },
          completedAt,
        ),
        fleetIncidentUpdateStatement(
          db,
          runId,
          {
            status: "Recovering",
            actionState: "Affected canary recovered; broader cohorts remain gated",
          },
          completedAt,
        ),
        ...(await readSupportTasks(db, runId))
          .filter((task) => task.incidentId === incident.id)
          .map((task) =>
            supportTaskUpdateStatement(
              db,
              runId,
              task,
              {
                status: "Update due",
                nextUpdateBy: minutesAfter(completedAt, 10),
              },
              completedAt,
            ),
          ),
      ],
    );
    return;
  }

  if (incident.type === "rate_limit") {
    if (state.status === "Backoff scheduled") {
      const createdAt = now();
      await commitTransition(
        db,
        runId,
        incident,
        state,
        {
          status: "Running",
          owner: "System",
          actionState: "Automatic retry is running",
          step: 1,
        },
        {
          actorRole: "system",
          actorLabel: "Retry worker",
          action: "Started automatic retry",
          detail: "The backoff window elapsed; attempt 2 resumed with the same idempotency key.",
        },
        [createRetryStatement(db, runId, incident, "Running", createdAt)],
      );
      return;
    }
    if (state.status === "Running") {
      const completedAt = now();
      await commitTransition(
        db,
        runId,
        incident,
        state,
        {
          status: "Resolved",
          owner: "System",
          actionState: "Export delivered",
          step: 2,
          resolution: "The quota window reopened and all 12 rows were appended once.",
        },
        {
          actorRole: "system",
          actorLabel: "Retry worker",
          action: "Resolved incident",
          detail: "The scheduled retry succeeded without manual intervention.",
        },
        [updateRetryStatement(db, runId, incident, "Succeeded", completedAt)],
      );
      return;
    }
  }

  if (state.status === "Validating") {
    const createdAt = now();
    const sourcePolicyDisposition =
      incident.type === "data_quality" && state.currentValue
        ? (JSON.parse(state.currentValue) as { policyDisposition?: string })
            .policyDisposition
        : null;
    if (sourcePolicyDisposition === "keep_quarantined") {
      const remediationCreatedAt = now();
      const resolution =
        "Easy Spaces rejected the suggested default. Six blank contacts remain quarantined while unaffected records continue under the approved exception policy.";
      await commitTransition(
        db,
        runId,
        incident,
        state,
        {
          status: "Contained",
          owner: "Customer admin",
          actionState: "Policy exception validated; records remain quarantined",
          step: 2,
          resolution,
        },
        {
          actorRole: "system",
          actorLabel: "Validation worker",
          action: "Validated source policy exception",
          detail: resolution,
        },
        [
          remediationTaskStatement(db, runId, {
            id: "remediation-data-quality-exception",
            incidentId: incident.id,
            tenantId: incident.tenantId,
            disposition: "Exception accepted",
            title: "Review the Salesforce quarantine exception",
            status: "Open",
            owner: "Customer admin",
            ownerLabel: "Easy Spaces admin",
            dueAt: minutesAfter(remediationCreatedAt, 30 * 24 * 60),
            scope: "Six Salesforce contacts remain excluded from replay.",
            completionCondition:
              "Approve a valid source-data policy or correct the six source records before replay.",
            createdAt: remediationCreatedAt,
            updatedAt: remediationCreatedAt,
          }),
        ],
      );
      return;
    }
    const extras = [createRetryStatement(db, runId, incident, "Queued", createdAt)];
    if (incident.type === "data_quality") {
      extras.push(
        updateQuarantineStatement(db, runId, "Ready for replay", createdAt),
      );
    }
    await commitTransition(
      db,
      runId,
      incident,
      state,
      {
        status: "Retry queued",
        owner: "System",
        actionState: "Validation passed; retry queued",
        step: 2,
      },
      {
        actorRole: "system",
        actorLabel: "Validation worker",
        action: "Queued retry",
        detail:
          incident.type === "mapping"
            ? "All sample and contract checks passed; a scoped retry was created."
            : "Validation passed and a retry was created from the saved checkpoint.",
      },
      extras,
    );
    return;
  }

  if (state.status === "Retry queued") {
    await commitTransition(
      db,
      runId,
      incident,
      state,
      {
        status: "Running",
        owner: "System",
        actionState: "Retry is running",
        step: 3,
      },
      {
        actorRole: "system",
        actorLabel: "Sync worker",
        action: "Started retry",
        detail: "The worker resumed from the checkpoint using an idempotent request.",
      },
      [updateRetryStatement(db, runId, incident, "Running", now())],
    );
    return;
  }

  if (state.status === "Running") {
    const resolution =
      incident.type === "data_quality"
        ? "The corrected source values passed validation and six profiles recovered."
        : incident.type === "authentication"
          ? "The OAuth grant was verified and the paused contact sync resumed."
          : "Mapping v6.1 normalized Draft to Planning and both events loaded.";
    const completedAt = now();
    await commitTransition(
      db,
      runId,
      incident,
      state,
      {
        status: "Resolved",
        owner: "System",
        actionState: "Recovery completed",
        step: 4,
        resolution,
      },
      {
        actorRole: "system",
        actorLabel: "Sync worker",
        action: "Resolved incident",
        detail: resolution,
      },
      [
        updateRetryStatement(db, runId, incident, "Succeeded", completedAt),
        ...(incident.type === "data_quality"
          ? [
              updateQuarantineStatement(
                db,
                runId,
                "Replayed",
                completedAt,
                `${incident.id}-retry-01`,
              ),
            ]
          : []),
      ],
    );
    return;
  }

  throw new WorkspaceActionError(
    isTerminalIncidentStatus(state.status)
      ? "This walkthrough is already complete."
      : "No automatic transition is available from this state.",
  );
}

async function progressDueAutomation(
  db: D1Database,
  session: DemoSession,
  states: IncidentStateRow[],
) {
  if (session.mode === "guided") return false;
  let progressed = false;
  for (const state of states) {
    if (
      state.owner !== "System" ||
      isTerminalIncidentStatus(state.status) ||
      Date.now() - new Date(state.updatedAt).getTime() < automaticDelayMs
    ) {
      continue;
    }
    const incident = seedIncidents.find((item) => item.id === state.incidentId);
    if (!incident) continue;
    await advanceSystemTransition(db, session.runId, incident, state);
    progressed = true;
  }
  return progressed;
}

async function advanceReleaseStage(
  db: D1Database,
  runId: string,
  release: ReleaseStateRow,
) {
  const gate =
    release.status === "Early access running"
      ? {
          cohort: "Early access" as const,
          passedStatus: "Early access passed" as const,
          passedAction: "Passed early-access gate",
          passedDetail:
            "Northstar Health and Harbor Retail completed two policy-compliant connector runs. Stable promotion is now available.",
        }
      : release.status === "General rollout running"
        ? {
            cohort: "Stable" as const,
            passedStatus: "Completed" as const,
            passedAction: "Completed fleet rollout",
            passedDetail:
              "All four release targets across three cohorts satisfy the Slack connector v4.4.0 health policy.",
          }
        : null;
  if (!gate) {
    throw new WorkspaceActionError("No release health gate is running.");
  }

  const updatedAt = timestampAfter(release.updatedAt);
  const targets = await readReleaseTargets(db, runId);
  const tenantIds = targets
    .filter((target) => target.cohort === gate.cohort)
    .map((target) => target.tenantId);
  const existingEvidence = await readHealthGateEvidence(db, runId);
  const runNumber =
    existingEvidence.filter((item) => item.cohort === gate.cohort).length + 1;
  const gateStatus = healthGateStatus(
    healthRunMeasurement(gate.cohort, runNumber),
  );
  const healthyRuns =
    gateStatus === "Passed" ? release.observedHealthyRuns + 1 : 0;
  const gatePassed =
    gateStatus === "Passed" && healthyRuns >= release.requiredHealthyRuns;
  await db.batch([
    healthGateEvidenceStatement(
      db,
      runId,
      gate.cohort,
      tenantIds,
      runNumber,
      updatedAt,
    ),
    updateReleaseStatement(
      db,
      runId,
      {
        status:
          gateStatus === "Failed"
            ? "Health gate blocked"
            : gatePassed
              ? gate.passedStatus
              : release.status,
        stageIndex: release.stageIndex,
        observedHealthyRuns: healthyRuns,
      },
      updatedAt,
    ),
    updateReleaseCohortStatement(
      db,
      runId,
      gate.cohort,
      {
        activeVersion: seedFleetRelease.toVersion,
        rolloutStatus:
          gateStatus === "Failed"
            ? "Held for review"
            : gatePassed
              ? "Healthy"
              : "Monitoring",
        lastHealthCheck:
          gateStatus === "Failed"
            ? `Run ${runNumber} failed; promotion blocked`
            : `${healthyRuns} of ${release.requiredHealthyRuns} consecutive ${gate.cohort.toLowerCase()} runs healthy`,
      },
      updatedAt,
    ),
    activityStatement(
      db,
      runId,
      "inc-api-001",
      {
        actorRole: "system",
        actorLabel: "Fleet health gate",
        action:
          gateStatus === "Failed"
            ? `Blocked ${gate.cohort.toLowerCase()} promotion`
            : gatePassed
              ? gate.passedAction
              : `Recorded ${gate.cohort.toLowerCase()} health run ${runNumber}`,
        detail:
          gateStatus === "Failed"
            ? `${gate.cohort} run ${runNumber} failed the persisted health policy. No broader cohort was promoted.`
            : gatePassed
              ? gate.passedDetail
              : `${gate.cohort} passed run ${runNumber} of ${release.requiredHealthyRuns}. The cohort remains under observation.`,
      },
      updatedAt,
    ),
    fleetIncidentUpdateStatement(
      db,
      runId,
      {
        status: gatePassed && gate.passedStatus === "Completed" ? "Resolved" : "Recovering",
        actionState:
          gateStatus === "Failed"
            ? `${gate.cohort} health failed; promotion is blocked pending rollback or review`
            : gatePassed && gate.passedStatus === "Completed"
              ? "All release cohorts passed; provider incident closed"
              : `${gate.cohort} is ${gatePassed ? "healthy" : "under observation"}`,
      },
      updatedAt,
    ),
  ]);
}

async function progressDueRelease(
  db: D1Database,
  session: DemoSession,
  release: ReleaseStateRow | null,
) {
  if (
    session.mode === "guided" ||
    !release ||
    !["Early access running", "General rollout running"].includes(release.status) ||
    Date.now() - new Date(release.updatedAt).getTime() < automaticDelayMs
  ) {
    return false;
  }
  await advanceReleaseStage(db, session.runId, release);
  return true;
}

async function progressDueSupportEscalations(db: D1Database, session: DemoSession) {
  const [tasks, fleetState] = await Promise.all([
    readSupportTasks(db, session.runId),
    readFleetIncidentState(db, session.runId),
  ]);
  const referenceAt = Date.now();
  const overdue = tasks.filter(
    (task) =>
      task.status !== "Resolved" &&
      task.status !== "Overdue" &&
      Boolean(task.nextUpdateBy) &&
      Date.parse(task.nextUpdateBy as string) <= referenceAt,
  );
  const responseBreached = Boolean(
    fleetState &&
      !fleetState.acknowledgedAt &&
      Date.parse(fleetState.responseDueAt) <= referenceAt &&
      !fleetState.actionState.startsWith("Response SLA breached"),
  );
  if (!overdue.length && !responseBreached) return false;

  const escalatedAt = now();
  await db.batch([
    ...overdue.flatMap((task) => [
      supportTaskUpdateStatement(
        db,
        session.runId,
        task,
        { status: "Overdue" },
        timestampAfter(task.updatedAt),
      ),
      activityStatement(
        db,
        session.runId,
        task.incidentId,
        {
          actorRole: "system",
          actorLabel: "Support SLA worker",
          action: "Escalated overdue communication task",
          detail: `${task.tenantName}'s internal communication deadline passed. The task returned to the Support action queue; any separate customer promise remains visible in the communication history.`,
        },
        escalatedAt,
      ),
    ]),
    ...(responseBreached && fleetState
      ? [
          fleetIncidentUpdateStatement(
            db,
            session.runId,
            {
              status: fleetState.status,
              actionState: "Response SLA breached; incident command acknowledgement is required",
            },
            escalatedAt,
          ),
          activityStatement(
            db,
            session.runId,
            "inc-api-001",
            {
              actorRole: "system",
              actorLabel: "Incident SLA worker",
              action: "Escalated provider incident response",
              detail: "The incident-command acknowledgement deadline passed without an owner response.",
            },
            escalatedAt,
          ),
        ]
      : []),
  ]);
  return true;
}

export async function getWorkspaceSnapshot(
  session: DemoSession,
  requestedCustomerId?: string | null,
): Promise<WorkspaceSnapshot> {
  if (requestedCustomerId && requestedCustomerId !== seedTenant.id) {
    throw new WorkspaceActionError("Customer workspace not found.", 404);
  }
  if (
    session.role === "customer" &&
    requestedCustomerId &&
    requestedCustomerId !== session.customerId
  ) {
    throw new WorkspaceActionError("This workspace belongs to another customer.", 403);
  }

  const db = getD1();
  await ensureRun(db, session.runId);
  const runAnchor = await readRunAnchor(db, session.runId);
  const states = await readIncidentStates(db, session.runId);
  const releaseState = await readReleaseState(db, session.runId);
  const [
    attempts,
    activity,
    connectorDependencies,
    executionEvents,
    incidentFingerprints,
    exposureDecisions,
    evidenceProbes,
    quarantine,
    releaseTargets,
    healthEvidence,
    fleetIncidentState,
    supportTasks,
    remediationTasks,
    customerCommunications,
  ] = await Promise.all([
    readJobAttempts(db, session.runId),
    readActivity(db, session.runId),
    readConnectorDependencies(db, session.runId),
    readExecutionEvents(db, session.runId),
    readIncidentFingerprints(db, session.runId),
    readExposureDecisions(db, session.runId),
    readEvidenceProbes(db, session.runId),
    readQuarantine(db, session.runId),
    readReleaseTargets(db, session.runId),
    readHealthGateEvidence(db, session.runId),
    readFleetIncidentState(db, session.runId),
    readSupportTasks(db, session.runId),
    readRemediationTasks(db, session.runId),
    readCustomerCommunications(db, session.runId),
  ]);
  if (!releaseState || !fleetIncidentState) {
    throw new WorkspaceActionError("Fleet recovery state was not found.", 500);
  }
  const snapshot = buildSeedWorkspace();
  shiftSeedSnapshotTimes(snapshot, runAnchor);
  const stateById = new Map(states.map((state) => [state.incidentId, state]));

  snapshot.incidents = snapshot.incidents.map((incident) =>
    stateToIncident(incident, stateById.get(incident.id)),
  );
  snapshot.jobs = [...attempts.map(attemptToJob), ...snapshot.jobs].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
  snapshot.activity = activity.map((event) => ({
    ...event,
    tenantId: seedTenant.id,
  }));
  snapshot.supportTasks = supportTasks;
  snapshot.remediationTasks = remediationTasks;
  snapshot.customerCommunications = customerCommunications;
  snapshot.connectorDependencies = connectorDependencies;
  snapshot.evidenceProbes = evidenceProbes;
  snapshot.executionEvents = executionEvents;
  snapshot.incidentFingerprints = Object.fromEntries(
    incidentFingerprints.map((fingerprint) => [fingerprint.incidentId, fingerprint]),
  );
  snapshot.exposureDecisions = Object.fromEntries(
    exposureDecisions.map((decision) => [decision.incidentId, decision]),
  );
  snapshot.exposureDecisionHistory = exposureDecisions.reduce<
    Record<string, ExposureDecision[]>
  >((history, decision) => {
    (history[decision.incidentId] ??= []).push(decision);
    return history;
  }, {});
  snapshot.quarantine = quarantine;
  snapshot.fleetRelease = rowsToFleetRelease(
    releaseState,
    releaseTargets,
    healthEvidence,
  );
  snapshot.fleetTenants = snapshot.fleetRelease.targets;
  const pendingSystemStates = states.filter(
    (state) => state.owner === "System" && !isTerminalIncidentStatus(state.status),
  );
  const pendingProbes = evidenceProbes.filter((probe) =>
    ["Queued", "Running"].includes(probe.status),
  );
  const releaseWorkPending = [
    "Early access running",
    "General rollout running",
  ].includes(releaseState.status);
  const pendingSupportDeadlines = supportTasks.filter(
    (task) => task.status !== "Resolved" && task.nextUpdateBy,
  );
  const dueTimes = [
    ...pendingSystemStates.map(
      (state) => new Date(state.updatedAt).getTime() + automaticDelayMs,
    ),
    ...pendingProbes.map(
      (probe) => new Date(probe.updatedAt).getTime() + automaticDelayMs,
    ),
    ...(releaseWorkPending
      ? [new Date(releaseState.updatedAt).getTime() + automaticDelayMs]
      : []),
    ...pendingSupportDeadlines.map((task) => Date.parse(task.nextUpdateBy as string)),
  ].filter(Number.isFinite);
  snapshot.scenarioWorker = {
    execution: "Automated demo worker",
    tickIntervalMs: automaticDelayMs,
    pendingWork: [
      ...pendingSystemStates.map(
        (state) =>
          state.incidentId === "inc-api-001" && state.status === "Monitoring"
            ? `Evaluate Canary health run ${releaseState.observedHealthyRuns + 1} of ${releaseState.requiredHealthyRuns}`
            : `Advance ${seedIncidents.find((incident) => incident.id === state.incidentId)?.title ?? state.incidentId}`,
      ),
      ...pendingProbes.map(
        (probe) => `${probe.status === "Queued" ? "Start" : "Complete"} evidence probe ${probe.id}`,
      ),
      ...(releaseWorkPending
        ? [
            `Evaluate ${releaseState.status.replace(" running", "")} health run ${releaseState.observedHealthyRuns + 1} of ${releaseState.requiredHealthyRuns}`,
          ]
        : []),
      ...pendingSupportDeadlines.map(
        (task) => `Monitor ${task.tenantName} internal communication SLA`,
      ),
    ],
    nextEligibleAt:
      session.mode === "guided" || !dueTimes.length
        ? null
        : new Date(Math.min(...dueTimes)).toISOString(),
  };
  const latestFleetDecision = snapshot.exposureDecisions["inc-api-001"];
  if (latestFleetDecision) {
    const tenantIdsFor = (state: "Affected" | "Exposed" | "Needs review") =>
      latestFleetDecision.tenantAssessments
        .filter((assessment) => assessment.state === state)
        .map((assessment) => assessment.tenantId);
    const affectedTenantIds = tenantIdsFor("Affected");
    const exposedTenantIds = tenantIdsFor("Exposed");
    const needsReviewTenantIds = tenantIdsFor("Needs review");
    const communications = latestFleetDecision.tenantAssessments.map((assessment) => {
      const customerUpdateRequired = assessment.state === "Affected";
      const task = supportTasks.find(
        (item) =>
          item.incidentId === "inc-api-001" && item.tenantId === assessment.tenantId,
      );
      return {
        tenantId: assessment.tenantId,
        tenantName: assessment.tenantName,
        requirement: customerUpdateRequired
          ? ("Customer update required" as const)
          : assessment.state === "Not exposed"
            ? ("Not required" as const)
            : ("Monitor only" as const),
        status: customerUpdateRequired
          ? task?.status ?? ("Unassigned" as const)
          : assessment.state === "Not exposed"
            ? ("Not required" as const)
            : ("Monitoring" as const),
        reason: customerUpdateRequired
          ? "A customer-visible workflow failed and requires impact and recovery updates."
          : assessment.state === "Needs review"
            ? "Dependency evidence is incomplete; keep the hold internal until exposure is confirmed."
            : assessment.state === "Exposed"
              ? "The workflow is at risk but has no observed customer failure. Notify only on impact or SLA breach."
              : "The active workflow path is outside the confirmed impact area.",
        assignee: customerUpdateRequired ? task?.assignee ?? null : null,
        acknowledgedAt: customerUpdateRequired ? task?.acknowledgedAt ?? null : null,
        lastUpdateAt: customerUpdateRequired ? task?.lastUpdateAt ?? null : null,
        nextUpdateBy: customerUpdateRequired ? task?.nextUpdateBy ?? null : null,
        slaStatus: customerUpdateRequired
          ? task?.slaStatus ?? ("On track" as const)
          : ("Closed" as const),
      };
    });
    const targetIds = new Set(snapshot.fleetRelease.targets.map((target) => target.id));
    const missingTargets = [...affectedTenantIds, ...exposedTenantIds].filter(
      (tenantId) => !targetIds.has(tenantId),
    );
    if (missingTargets.length) {
      throw new WorkspaceActionError(
        `Exposure decision references release targets that do not exist: ${missingTargets.join(", ")}.`,
        500,
      );
    }
    snapshot.fleetIncident = {
      ...snapshot.fleetIncident,
      severity: fleetIncidentState.severity,
      recoveryOwner: fleetIncidentState.recoveryOwner,
      communicationOwner: fleetIncidentState.communicationOwner,
      actionState: fleetIncidentState.actionState,
      detectedAt: fleetIncidentState.detectedAt,
      acknowledgedAt: fleetIncidentState.acknowledgedAt,
      responseDueAt: fleetIncidentState.responseDueAt,
      responseSlaStatus: fleetResponseSlaStatus(
        fleetIncidentState.acknowledgedAt,
        fleetIncidentState.responseDueAt,
      ),
      affectedTenantIds,
      exposedTenantIds,
      needsReviewTenantIds,
      containedTenantIds: [...affectedTenantIds, ...exposedTenantIds],
      heldForEvidenceTenantIds: needsReviewTenantIds,
      status: fleetIncidentState.status,
      decisionId: latestFleetDecision.decisionId,
      updatedAt: [
        latestFleetDecision.createdAt,
        releaseState.updatedAt,
        fleetIncidentState.updatedAt,
        ...supportTasks.map((task) => task.updatedAt),
      ].sort().at(-1) as string,
      communications,
    };
  }

  const dataState = stateById.get("inc-data-001");
  if (dataState?.currentValue) {
    const corrections = JSON.parse(dataState.currentValue) as Record<string, unknown>;
    const keptQuarantined = corrections.policyDisposition === "keep_quarantined";
    snapshot.evidence["inc-data-001"] = snapshot.evidence["inc-data-001"].map(
      (row) => ({
        ...row,
        rawValue:
          typeof corrections[row.id] === "string"
            ? (corrections[row.id] as string)
            : row.rawValue,
        issue:
          keptQuarantined && dataState.status === "Contained"
            ? "Excluded by the customer-approved quarantine policy"
            : dataState.status === "Resolved"
            ? "Source value validated"
            : "Source correction is awaiting validation",
      }),
    );
  }

  const mappingState = stateById.get("inc-map-001");
  if (mappingState?.mappingVersion !== "v6.0") {
    const mapping = snapshot.mappings.find(
      (item) => item.id === "map-reservation-lifecycle",
    );
    if (mapping) {
      mapping.transform = "Map Draft to Planning";
      mapping.status = "Mapped";
      mapping.confidence = 100;
    }
    snapshot.mappingRelease.cases = snapshot.mappingRelease.cases.map((testCase) => ({
      ...testCase,
      result: "Pass",
    }));
  }

  const slackState = stateById.get("inc-api-001");
  if (slackState && slackState.step >= 1) {
    const trace = snapshot.traces["inc-api-001"];
    trace.endpoint =
      "files.getUploadURLExternal -> upload URL -> files.completeUploadExternal";
    trace.providerResponse =
      slackState.status === "Resolved"
        ? '{"ok":true,"files":[{"id":"F-DEMO-001"}]}'
        : "Patch contract test passed in the demo harness";
  }

  snapshot.recoveryPlans = buildRecoveryPlans(
    snapshot.incidents,
    snapshot.jobs,
    snapshot.exposureDecisions,
  );
  snapshot.fleetMetrics = buildFleetMetrics(
    snapshot.jobs,
    snapshot.quarantine,
    snapshot.fleetRelease,
    0,
    snapshot.recoveryPlans["inc-api-001"],
  );
  applyHealth(snapshot);
  return scopeSnapshot(snapshot, session);
}

export async function advanceDueScenarioWork(
  session: DemoSession,
  requestedCustomerId?: string | null,
) {
  const db = getD1();
  await ensureRun(db, session.runId);
  await progressDueSupportEscalations(db, session);
  if (session.mode !== "guided") {
    await progressDueEvidenceProbe(db, session);
    const states = await readIncidentStates(db, session.runId);
    await progressDueAutomation(db, session, states);
    const release = await readReleaseState(db, session.runId);
    await progressDueRelease(db, session, release);
  }
  return getWorkspaceSnapshot(session, requestedCustomerId);
}

function assertCustomerScope(session: DemoSession, incident: Incident) {
  if (session.role !== "customer") return;
  if (session.customerId !== incident.tenantId || !incident.customerVisible) {
    throw new WorkspaceActionError("This incident is outside the customer portal.", 403);
  }
}

function assertActionRole(
  action: ActionRequest["action"],
  session: DemoSession,
  incident?: Incident,
) {
  if (action === "refresh_dependency_evidence" && session.mode === "guided") {
    return;
  }
  if (
    action === "run_guided_step" ||
    action === "run_guided_release_step" ||
    action === "run_guided_degraded_canary" ||
    action === "reset_demo"
  ) {
    if (session.mode !== "guided") {
      throw new WorkspaceActionError(
        "This control belongs to the guided portfolio reviewer.",
        403,
      );
    }
    return;
  }
  if (session.mode === "guided") {
    throw new WorkspaceActionError(
      "Use Play next event in guided review instead of a production action.",
      403,
    );
  }
  const requiredRole: Partial<Record<ActionRequest["action"], Role>> = {
    approve_source_fix: "customer",
    decline_source_fix: "customer",
    complete_oauth: "customer",
    acknowledge_incident: "support",
    acknowledge_fleet_incident: "support",
    send_customer_update: "support",
    publish_mapping: "engineer",
    test_connector_patch: "engineer",
    deploy_connector_patch: "engineer",
    refresh_dependency_evidence: "engineer",
    promote_fleet_release: "engineer",
    rollback_fleet_release: "engineer",
  };
  if (requiredRole[action] !== session.role) {
    throw new WorkspaceActionError(
      `This action belongs to the ${requiredRole[action]} demo persona.`,
      403,
    );
  }
  if (
    session.role === "support" &&
    action !== "acknowledge_fleet_incident" &&
    incident?.supportEngagement !== "Needs support"
  ) {
    throw new WorkspaceActionError(
      "Support is observing this recovery and has no manual task.",
      403,
    );
  }
}

function actorLabel(session: DemoSession) {
  return session.role === "customer"
    ? `${session.displayName}, Easy Spaces`
    : `${session.displayName}, SaaS provider`;
}

async function refreshDependencyEvidence(
  db: D1Database,
  session: DemoSession,
  dependencyId: string,
) {
  const release = await readReleaseState(db, session.runId);
  if (release?.status === "Rolled back") {
    throw new WorkspaceActionError(
      "This release was rolled back. Start a new patch release before collecting promotion evidence.",
      409,
    );
  }
  const dependencies = await readConnectorDependencies(db, session.runId);
  const target = dependencies.find((dependency) => dependency.id === dependencyId);
  if (!target || dependencyId !== "dep-harbor-slack-digest") {
    throw new WorkspaceActionError("Dependency evidence target not found.", 404);
  }
  if (target.metadataStatus === "Verified") {
    throw new WorkspaceActionError("Dependency evidence is already current.", 409);
  }
  const probes = await readEvidenceProbes(db, session.runId);
  if (
    probes.some(
      (probe) =>
        probe.dependencyId === dependencyId &&
        ["Queued", "Running"].includes(probe.status),
    )
  ) {
    throw new WorkspaceActionError("A dependency evidence probe is already running.", 409);
  }
  const attempt =
    Math.max(
      0,
      ...probes
        .filter((probe) => probe.dependencyId === dependencyId)
        .map((probe) => probe.attempt),
    ) + 1;
  const requestedAt = now();
  const probeId = `probe-harbor-slack-${String(attempt).padStart(2, "0")}`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO demo_evidence_probes (
          run_id, id, incident_id, dependency_id, status, attempt, source,
          trace_id, requested_by, requested_at, completed_at,
          failure_reason, result_json, updated_at
        ) VALUES (?, ?, ?, ?, 'Queued', ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      )
      .bind(
        session.runId,
        probeId,
        "inc-api-001",
        dependencyId,
        attempt,
        "Dependency inventory probe",
        `trace-probe-harbor-${String(attempt).padStart(2, "0")}`,
        session.mode === "guided" ? "Scenario reviewer" : actorLabel(session),
        requestedAt,
        requestedAt,
      ),
    activityStatement(
      db,
      session.runId,
      "inc-api-001",
      {
        actorRole: "engineer",
        actorLabel:
          session.mode === "guided"
            ? "Priya Shah"
            : actorLabel(session),
        action: "Queued dependency evidence probe",
        detail:
          `Attempt ${attempt} will read Harbor Retail's registered capabilities and endpoints. No exposure or release decision changes until the probe succeeds.`,
      },
      requestedAt,
    ),
  ]);
}

async function progressDueEvidenceProbe(
  db: D1Database,
  session: DemoSession,
  force = false,
) {
  const release = await readReleaseState(db, session.runId);
  if (release?.status === "Rolled back") return false;
  const probes = await readEvidenceProbes(db, session.runId);
  const probe = probes.find((candidate) =>
    ["Queued", "Running"].includes(candidate.status),
  );
  if (
    !probe ||
    (!force && Date.now() - new Date(probe.updatedAt).getTime() < automaticDelayMs)
  ) {
    return false;
  }
  const progressedAt = now();
  if (probe.status === "Queued") {
    await db.batch([
      db
        .prepare(
          `UPDATE demo_evidence_probes SET status = 'Running', updated_at = ?
          WHERE run_id = ? AND id = ? AND status = 'Queued'`,
        )
        .bind(progressedAt, session.runId, probe.id),
      activityStatement(
        db,
        session.runId,
        probe.incidentId,
        {
          actorRole: "system",
          actorLabel: "Dependency inventory worker",
          action: "Started dependency evidence probe",
          detail: `Attempt ${probe.attempt} is reading provider capability registration under trace ${probe.traceId}.`,
        },
        progressedAt,
      ),
    ]);
    return true;
  }

  const fingerprints = await readIncidentFingerprints(db, session.runId);
  const fingerprint = fingerprints.find(
    (candidate) => candidate.incidentId === probe.incidentId,
  );
  if (!fingerprint) {
    throw new WorkspaceActionError("Incident fingerprint not found.", 500);
  }
  const [candidates, events] = await Promise.all([
    readExposureCandidates(db, session.runId, fingerprint),
    readExecutionEvents(db, session.runId),
  ]);
  const target = candidates.find(
    (dependency) => dependency.id === probe.dependencyId,
  );
  if (!target) {
    throw new WorkspaceActionError("Dependency evidence target not found.", 404);
  }
  const result: NonNullable<EvidenceProbe["result"]> = {
    capabilities: ["file_upload", "message_delivery"],
    endpoints: ["files.upload", "chat.postMessage"],
    configRevision: "cfg-harbor-weekly-v3",
  };
  const refreshedTarget: ConnectorDependency = {
    ...target,
    ...result,
    metadataStatus: "Verified",
    lastVerifiedAt: progressedAt,
  };
  const decision = evaluateExposureDecision({
    incidentId: fingerprint.incidentId,
    fingerprint,
    dependencies: candidates.map((dependency) =>
      dependency.id === probe.dependencyId ? refreshedTarget : dependency,
    ),
    events,
    evaluatedAt: progressedAt,
    evaluationMode: "Evidence refresh",
  });
  const harborAssessment = decision.tenantAssessments.find(
    (assessment) => assessment.tenantId === "tenant-harbor-retail",
  );
  if (harborAssessment?.state !== "Exposed") {
    throw new WorkspaceActionError(
      "The refreshed Harbor dependency did not satisfy the exposure rule.",
      500,
    );
  }
  await db.batch([
    db
      .prepare(
        `UPDATE demo_connector_dependencies SET capabilities_json = ?,
          endpoints_json = ?, metadata_status = 'Verified', last_verified_at = ?,
          config_revision = ? WHERE run_id = ? AND id = ?`,
      )
      .bind(
        JSON.stringify(result.capabilities),
        JSON.stringify(result.endpoints),
        progressedAt,
        result.configRevision,
        session.runId,
        probe.dependencyId,
      ),
    db
      .prepare(
        `UPDATE demo_evidence_probes SET status = 'Succeeded',
          completed_at = ?, failure_reason = NULL, result_json = ?, updated_at = ?
        WHERE run_id = ? AND id = ? AND status = 'Running'`,
      )
      .bind(
        progressedAt,
        JSON.stringify(result),
        progressedAt,
        session.runId,
        probe.id,
      ),
    db
      .prepare(
        `INSERT INTO demo_exposure_revisions (
          run_id, decision_id, incident_id, policy_version,
          dependency_snapshot_version, input_hash, created_at,
          evaluation_mode, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        session.runId,
        decision.decisionId,
        decision.incidentId,
        decision.policyVersion,
        decision.dependencySnapshotVersion,
        decision.inputHash,
        decision.createdAt,
        decision.evaluationMode,
        JSON.stringify(decision),
      ),
    db
      .prepare(
        `UPDATE demo_release_targets SET rollout_status = 'Pending',
          last_health_check = ?, updated_at = ?
        WHERE run_id = ? AND release_id = ? AND tenant_id = ?
          AND rollout_status = 'Held for review'`,
      )
      .bind(
        "Exposure confirmed; included in early-access containment",
        progressedAt,
        session.runId,
        seedFleetRelease.id,
        "tenant-harbor-retail",
      ),
    activityStatement(
      db,
      session.runId,
      probe.incidentId,
      {
        actorRole: "system",
        actorLabel: "Dependency inventory worker",
        action: "Completed dependency evidence probe",
        detail: "The probe verified Harbor Retail's files.upload path. Exposure was recalculated from Needs review to Exposed, and Harbor remains contained until its cohort is promoted.",
      },
      progressedAt,
    ),
  ]);
  return true;
}

async function performFleetReleaseAction(
  db: D1Database,
  request: ActionRequest,
  session: DemoSession,
) {
  const release = await readReleaseState(db, session.runId);
  if (!release || request.targetId !== release.releaseId) {
    throw new WorkspaceActionError("Fleet release not found.", 404);
  }
  if (
    request.expectedUpdatedAt &&
    request.expectedUpdatedAt !== release.updatedAt
  ) {
    throw new WorkspaceActionError(
      "This release changed in another session. Refresh before taking action.",
      409,
    );
  }

  if (
    release.status === "Rolled back" &&
    request.action === "run_guided_release_step"
  ) {
    throw new WorkspaceActionError(
      "Impact is contained by rollback. A new patch release is required before any further promotion.",
      409,
    );
  }

  if (request.action === "run_guided_release_step") {
    if (await progressDueEvidenceProbe(db, session, true)) {
      await db
        .prepare(
          "UPDATE demo_release_state SET updated_at = ? WHERE run_id = ? AND release_id = ?",
        )
        .bind(now(), session.runId, seedFleetRelease.id)
        .run();
      return;
    }
  }

  if (
    request.action === "run_guided_release_step" &&
    release.status === "Health gate blocked"
  ) {
    request = {
      ...request,
      action: "rollback_fleet_release",
      payload: {
        ...request.payload,
        rollbackReason:
          "Canary telemetry breached the persisted health gate; restore the fallback before further review.",
      },
    };
  }

  if (request.action === "run_guided_release_step") {
    if (["Early access running", "General rollout running"].includes(release.status)) {
      await advanceReleaseStage(db, session.runId, release);
      return;
    }
  }

  if (
    request.action === "promote_fleet_release" ||
    request.action === "run_guided_release_step"
  ) {
    const next =
      release.status === "Canary passed"
        ? {
            status: "Early access running" as const,
            stageIndex: 1,
            cohort: "Early access" as const,
            tenant: "Northstar Health and Harbor Retail",
          }
        : release.status === "Early access passed"
          ? {
              status: "General rollout running" as const,
              stageIndex: 2,
              cohort: "Stable" as const,
              tenant: "Brightline Labs",
            }
          : null;
    if (!next) {
      throw new WorkspaceActionError(
        release.status === "Ready for canary" || release.status === "Canary running"
          ? "The canary health gate must pass before promotion."
          : "This release has no cohort ready for promotion.",
      );
    }
    const targets = await readReleaseTargets(db, session.runId);
    const heldTargets = targets.filter(
      (target) =>
        target.cohort === next.cohort && target.rolloutStatus === "Held for review",
    );
    if (heldTargets.length) {
      throw new WorkspaceActionError(
        "Resolve held dependency evidence before promoting this cohort.",
        409,
      );
    }
    const updatedAt = timestampAfter(release.updatedAt);
    await db.batch([
      updateReleaseStatement(
        db,
        session.runId,
        {
          status: next.status,
          stageIndex: next.stageIndex,
          observedHealthyRuns: 0,
        },
        updatedAt,
      ),
      fleetIncidentUpdateStatement(
        db,
        session.runId,
        {
          status: "Recovering",
          actionState: `${next.cohort} cohort is under health-gate observation`,
        },
        updatedAt,
      ),
      updateReleaseCohortStatement(
        db,
        session.runId,
        next.cohort,
        {
          activeVersion: seedFleetRelease.toVersion,
          rolloutStatus: "Monitoring",
          lastHealthCheck: "Health gate is collecting run evidence",
        },
        updatedAt,
      ),
      activityStatement(
        db,
        session.runId,
        "inc-api-001",
        {
          actorRole: session.mode === "guided" ? "engineer" : session.role,
          actorLabel:
            session.mode === "guided"
              ? "Priya Shah"
              : actorLabel(session),
          action: `Promoted ${next.cohort} cohort`,
          detail: `${next.tenant} moved to ${seedFleetRelease.toVersion}; the next cohort remains pinned until two healthy runs complete.`,
        },
        updatedAt,
      ),
    ]);
    return;
  }

  if (request.action === "rollback_fleet_release") {
    if (["Ready for canary", "Completed", "Rolled back"].includes(release.status)) {
      throw new WorkspaceActionError("This release is not eligible for rollback.");
    }
    const reason = request.payload?.rollbackReason?.trim();
    if (!reason || reason.length < 12 || reason.length > 240) {
      throw new WorkspaceActionError(
        "Add a rollback reason between 12 and 240 characters.",
        422,
      );
    }
    const providerIncident = seedIncidents.find(
      (incident) => incident.id === "inc-api-001",
    );
    const providerState = await readState(db, session.runId, "inc-api-001");
    if (!providerIncident || !providerState) {
      throw new WorkspaceActionError(
        "The provider incident state is unavailable.",
        500,
      );
    }
    const updatedAt = timestampAfter(
      [release.updatedAt, providerState.updatedAt].sort().at(-1) as string,
    );
    await db.batch([
      updateReleaseStatement(
        db,
        session.runId,
        {
          status: "Rolled back",
          stageIndex: release.stageIndex,
          observedHealthyRuns: release.observedHealthyRuns,
          rollbackReason: reason,
        },
        updatedAt,
      ),
      db
        .prepare(
          `UPDATE demo_release_targets SET active_version = ?,
            rollout_status = 'Rolled back', last_health_check = ?, updated_at = ?
          WHERE run_id = ? AND release_id = ? AND active_version = ?`,
        )
        .bind(
          seedFleetRelease.fallbackVersion,
          "Rollback verified; promotion stopped",
          updatedAt,
          session.runId,
          seedFleetRelease.id,
          seedFleetRelease.toVersion,
        ),
      incidentUpdateStatement(
        db,
        session.runId,
        providerIncident.id,
        providerState,
        {
          status: "Contained",
          owner: "Integration engineer",
          actionState: "Service restored on fallback; root-cause fix remains open",
          step: 3,
          currentValue: "fallback_mitigation",
          resolution:
            "The release was rolled back and the text-only fallback connector restored service. The v4.4.0 defect remains open for Engineering.",
        },
        updatedAt,
      ),
      updateRetryStatement(
        db,
        session.runId,
        providerIncident,
        "Failed",
        updatedAt,
      ),
      fleetIncidentUpdateStatement(
        db,
        session.runId,
        {
          status: "Mitigated",
          actionState: "Fallback connector restored service; permanent remediation remains open",
        },
        updatedAt,
      ),
      ...(await readSupportTasks(db, session.runId))
        .filter((task) => task.incidentId === providerIncident.id)
        .map((task) =>
          supportTaskUpdateStatement(
            db,
            session.runId,
            task,
            {
              status: "Update due",
              nextUpdateBy: minutesAfter(updatedAt, 10),
            },
            updatedAt,
          ),
        ),
      remediationTaskStatement(db, session.runId, {
        id: "remediation-slack-fallback",
        incidentId: providerIncident.id,
        tenantId: providerIncident.tenantId,
        disposition: "Fallback mitigation",
        title: "Replace the failed Slack connector release",
        status: "Open",
        owner: "Integration engineer",
        ownerLabel: "Integration Engineering",
        dueAt: minutesAfter(updatedAt, 7 * 24 * 60),
        scope:
          "The text-only fallback is serving affected tenants; file attachments remain unavailable.",
        completionCondition:
          "Ship a new connector version through contract tests and a fresh gated fleet release.",
        createdAt: updatedAt,
        updatedAt,
      }),
      activityStatement(
        db,
        session.runId,
        "inc-api-001",
        {
          actorRole: session.mode === "guided" ? "engineer" : session.role,
          actorLabel:
            session.mode === "guided"
              ? "Priya Shah"
              : actorLabel(session),
          action: "Rolled back fleet release",
          detail: `${reason} Active cohorts moved to ${seedFleetRelease.fallbackVersion}.`,
        },
        updatedAt,
      ),
    ]);
    return;
  }

  throw new WorkspaceActionError("Unsupported fleet release action.");
}

async function guidedOwnerStep(
  db: D1Database,
  session: DemoSession,
  incident: Incident,
  state: IncidentStateRow,
) {
  if (state.owner === "System") {
    await advanceSystemTransition(db, session.runId, incident, state);
    return;
  }
  if (incident.type === "data_quality" && state.status === "Awaiting customer") {
    const corrections = Object.fromEntries(
      (evidenceByIncidentId[incident.id] ?? []).map((row) => [
        row.id,
        row.cleanedValue,
      ]),
    );
    await commitTransition(
      db,
      session.runId,
      incident,
      state,
      {
        status: "Validating",
        owner: "System",
        actionState: "Validating the source correction",
        step: 1,
        currentValue: JSON.stringify(corrections),
      },
      {
        actorRole: "customer",
        actorLabel: "Jordan Lee",
        action: "Approved Salesforce source policy",
        detail: "Approved the no-reservation default policy and applied Not Started to six blank source records before a fresh read.",
      },
    );
    return;
  }
  if (incident.type === "authentication" && state.status === "Awaiting customer") {
    await commitTransition(
      db,
      session.runId,
      incident,
      state,
      {
        status: "Validating",
        owner: "System",
        actionState: "Verifying OAuth scopes and tenant identity",
        step: 1,
      },
      {
        actorRole: "customer",
        actorLabel: "Jordan Lee",
        action: "Reauthorized HubSpot",
        detail: "Authorized the linked HubSpot account with the required contact scope.",
      },
    );
    return;
  }
  if (incident.type === "mapping" && state.status === "Awaiting engineering") {
    await commitTransition(
      db,
      session.runId,
      incident,
      state,
      {
        status: "Validating",
        owner: "System",
        actionState: "Running sample and contract checks",
        step: 1,
        mappingVersion: "v6.1",
      },
      {
        actorRole: "engineer",
        actorLabel: "Priya Shah",
        action: "Published mapping v6.1",
        detail: "Scoped Draft -> Planning to Easy Spaces with v6.0 available for rollback.",
      },
    );
    return;
  }
  if (incident.type === "provider_change") {
    if (state.status === "Awaiting engineering") {
      if (state.currentValue !== "support_update_sent") {
        const communicationAt = timestampAfter(state.updatedAt);
        const supportTask = (await readSupportTasks(db, session.runId)).find(
          (task) => task.incidentId === incident.id,
        );
        await commitTransition(
          db,
          session.runId,
          incident,
          state,
          {
            status: state.status,
            owner: state.owner,
            actionState: "Customer update sent; connector contract test next",
            step: state.step,
            currentValue: "support_update_sent",
          },
          {
            actorRole: "support",
            actorLabel: "Alex Morgan",
            action: "Sent customer update",
            detail: "Engineering owns recovery. Easy Spaces was told no customer action is needed and the next update follows the canary run.",
          },
          [
            ...(supportTask
              ? [
                  supportTaskUpdateStatement(
                    db,
                    session.runId,
                    supportTask,
                    {
                      status: "Waiting for recovery",
                      assignee: "Alex Morgan",
                      acknowledgedAt: communicationAt,
                      lastUpdateAt: communicationAt,
                      nextUpdateBy: new Date(
                        new Date(communicationAt).getTime() + 30 * 60 * 1000,
                      ).toISOString(),
                    },
                    communicationAt,
                  ),
                  customerCommunicationStatement(db, session.runId, {
                    id: `communication-${crypto.randomUUID()}`,
                    incidentId: incident.id,
                    tenantId: supportTask.tenantId,
                    tenantName: supportTask.tenantName,
                    kind: "Progress update",
                    message:
                      "Engineering is replacing the retired Slack upload method. No customer action is required; the next update follows the canary run.",
                    impact:
                      "The scheduled Slack risk digest could not attach its report file.",
                    customerAction: "No customer action is required.",
                    recoveryOwner: "Integration engineer",
                    postedBy: "Alex Morgan",
                    postedAt: communicationAt,
                    nextUpdateBy: new Date(
                      new Date(communicationAt).getTime() + 30 * 60 * 1000,
                    ).toISOString(),
                  }),
                ]
              : []),
            fleetIncidentUpdateStatement(
              db,
              session.runId,
              {
                status: "Containment active",
                actionState: "Customer impact update sent; connector patch remains in progress",
                acknowledgedAt: communicationAt,
              },
              communicationAt,
            ),
          ],
        );
        return;
      }
      await commitTransition(
        db,
        session.runId,
        incident,
        state,
        {
          status: "Ready to deploy",
          owner: "Integration engineer",
          actionState: "Contract tests passed",
          step: 1,
          connectorVersion: "slack-4.4.0-rc1",
        },
        {
          actorRole: "engineer",
          actorLabel: "Priya Shah",
          action: "Passed connector contract tests",
          detail: "Validated the external upload sequence and rejected any files.upload fallback.",
        },
      );
      return;
    }
    if (state.status === "Ready to deploy") {
      const startedAt = now();
      await commitTransition(
        db,
        session.runId,
        incident,
        state,
        {
          status: "Monitoring",
          owner: "System",
          actionState: "Connector v4.4.0 deployed; monitoring canary",
          step: 2,
          connectorVersion: "slack-4.4.0",
        },
        {
          actorRole: "engineer",
          actorLabel: "Priya Shah",
          action: "Deployed Slack connector v4.4.0",
          detail: "Released to the Easy Spaces canary with v4.3.0 ready for rollback.",
        },
        [
          createRetryStatement(db, session.runId, incident, "Running", startedAt),
          updateReleaseStatement(
            db,
            session.runId,
            {
              status: "Canary running",
              stageIndex: 0,
              observedHealthyRuns: 0,
            },
            startedAt,
          ),
          updateReleaseCohortStatement(
            db,
            session.runId,
            "Canary",
            {
              activeVersion: seedFleetRelease.toVersion,
              rolloutStatus: "Monitoring",
              lastHealthCheck: "Canary run 1 is in progress",
            },
            startedAt,
          ),
          fleetIncidentUpdateStatement(
            db,
            session.runId,
            {
              status: "Recovering",
              actionState: "Connector patch is live on the affected canary",
            },
            startedAt,
          ),
        ],
      );
      return;
    }
  }
  throw new WorkspaceActionError("No guided event is available from this state.");
}

async function performWorkspaceActionOnce(
  request: ActionRequest,
  session: DemoSession,
) {
  const db = getD1();
  await ensureRun(db, session.runId);

  if (request.action === "reset_demo") {
    assertActionRole(request.action, session);
    await db.batch([
      ...clearRunStatements(db, session.runId),
      ...seedRunStatements(db, session.runId),
    ]);
    return getWorkspaceSnapshot(session);
  }

  if (request.action === "run_guided_degraded_canary") {
    assertActionRole(request.action, session);
    if (request.targetId !== "inc-api-001") {
      throw new WorkspaceActionError("The degraded canary belongs to the Slack provider incident.", 404);
    }
    const incident = seedIncidents.find((item) => item.id === request.targetId);
    const state = await readState(db, session.runId, request.targetId);
    if (!incident || !state) {
      throw new WorkspaceActionError("Provider incident state was not found.", 404);
    }
    if (request.expectedUpdatedAt && request.expectedUpdatedAt !== state.updatedAt) {
      throw new WorkspaceActionError(
        "This incident changed in another session. Refresh before playing the degraded canary.",
        409,
      );
    }
    if (state.status !== "Monitoring" || state.owner !== "System") {
      throw new WorkspaceActionError(
        "Deploy the canary before playing degraded health telemetry.",
        409,
      );
    }
    await advanceSystemTransition(
      db,
      session.runId,
      incident,
      state,
      degradedCanaryMeasurement,
    );
    return getWorkspaceSnapshot(session);
  }

  if (request.action === "refresh_dependency_evidence") {
    assertActionRole(request.action, session);
    await refreshDependencyEvidence(db, session, request.targetId);
    return getWorkspaceSnapshot(session);
  }

  if (
    request.action === "promote_fleet_release" ||
    request.action === "rollback_fleet_release" ||
    request.action === "run_guided_release_step"
  ) {
    assertActionRole(request.action, session);
    await performFleetReleaseAction(db, request, session);
    return getWorkspaceSnapshot(session);
  }

  if (request.action === "acknowledge_fleet_incident") {
    assertActionRole(request.action, session);
    const fleetState = await readFleetIncidentState(db, session.runId);
    if (!fleetState || request.targetId !== fleetState.incidentId) {
      throw new WorkspaceActionError("Provider incident not found.", 404);
    }
    if (fleetState.acknowledgedAt) {
      throw new WorkspaceActionError("This provider incident is already acknowledged.", 409);
    }
    const updatedAt = now();
    const label = actorLabel(session);
    await db.batch([
      fleetIncidentUpdateStatement(
        db,
        session.runId,
        {
          status: fleetState.status,
          actionState: "Incident command acknowledged; tenant communication tasks remain separately routed",
          acknowledgedAt: updatedAt,
        },
        updatedAt,
      ),
      activityStatement(
        db,
        session.runId,
        "inc-api-001",
        {
          actorRole: session.role,
          actorLabel: label,
          action: "Acknowledged provider incident",
          detail: "The incident commander acknowledged the provider event. Tenant communication tasks remain unassigned until an operator accepts each one.",
        },
        updatedAt,
      ),
    ]);
    return getWorkspaceSnapshot(session);
  }

  const incident = seedIncidents.find((item) => item.id === request.targetId);
  if (!incident) throw new WorkspaceActionError("Incident not found.", 404);
  assertCustomerScope(session, incident);
  assertActionRole(request.action, session, incident);

  const state = await readState(db, session.runId, incident.id);
  if (!state) throw new WorkspaceActionError("Incident state was not found.", 404);
  if (request.expectedUpdatedAt && request.expectedUpdatedAt !== state.updatedAt) {
    throw new WorkspaceActionError(
      "This incident changed in another session. Refresh before taking action.",
      409,
    );
  }

  if (request.action === "run_guided_step") {
    await guidedOwnerStep(db, session, incident, state);
    return getWorkspaceSnapshot(session);
  }

  const label = actorLabel(session);
  switch (request.action) {
    case "approve_source_fix": {
      if (incident.type !== "data_quality" || state.status !== "Awaiting customer") {
        throw new WorkspaceActionError("This source correction is not available.");
      }
      const affectedIds = evidenceByIncidentId[incident.id]?.map((row) => row.id) ?? [];
      if (request.payload?.sourcePolicyId !== sourceDefaultPolicyId) {
        throw new WorkspaceActionError(
          "Approve the scoped no-reservation default policy before rechecking.",
          422,
        );
      }
      const corrections = Object.fromEntries(
        (evidenceByIncidentId[incident.id] ?? []).map((row) => [
          row.id,
          row.cleanedValue,
        ]),
      );
      await commitTransition(
        db,
        session.runId,
        incident,
        state,
        {
          status: "Validating",
          owner: "System",
          actionState: "Validating the source correction",
          step: 1,
          currentValue: JSON.stringify(corrections),
        },
        {
          actorRole: session.role,
          actorLabel: label,
          action: "Approved Salesforce source policy",
          detail: `Approved ${sourceDefaultPolicyId}; applied Not Started to ${affectedIds.length} blank contacts with no linked reservation and requested a fresh source read.`,
        },
      );
      break;
    }
    case "decline_source_fix": {
      if (incident.type !== "data_quality" || state.status !== "Awaiting customer") {
        throw new WorkspaceActionError("This source policy decision is not available.");
      }
      if (request.payload?.sourcePolicyId !== sourceQuarantinePolicyId) {
        throw new WorkspaceActionError(
          "Choose the scoped quarantine exception before continuing.",
          422,
        );
      }
      await commitTransition(
        db,
        session.runId,
        incident,
        state,
        {
          status: "Validating",
          owner: "System",
          actionState: "Validating the customer policy exception",
          step: 1,
          currentValue: JSON.stringify({
            policyDisposition: "keep_quarantined",
            affectedRecordIds: (evidenceByIncidentId[incident.id] ?? []).map(
              (row) => row.id,
            ),
          }),
        },
        {
          actorRole: session.role,
          actorLabel: label,
          action: "Rejected suggested Salesforce source policy",
          detail: `Selected ${sourceQuarantinePolicyId}; blank contacts remain quarantined and unaffected records may continue.`,
        },
      );
      break;
    }
    case "complete_oauth": {
      if (incident.type !== "authentication" || state.status !== "Awaiting customer") {
        throw new WorkspaceActionError("This connection does not need OAuth.");
      }
      const scopes = request.payload?.oauthScopes ?? [];
      if (request.payload?.oauthAccountId !== "hubspot-easy-spaces") {
        throw new WorkspaceActionError(
          "The selected HubSpot account is not linked to the Easy Spaces tenant.",
          422,
        );
      }
      if (!scopes.includes("crm.objects.contacts.read")) {
        throw new WorkspaceActionError(
          "HubSpot returned without the required contacts read scope.",
          422,
        );
      }
      await commitTransition(
        db,
        session.runId,
        incident,
        state,
        {
          status: "Validating",
          owner: "System",
          actionState: "Verifying OAuth scopes and tenant identity",
          step: 1,
        },
        {
          actorRole: session.role,
          actorLabel: label,
          action: "Reauthorized HubSpot",
          detail: "Authorized the linked HubSpot account with crm.objects.contacts.read.",
        },
      );
      break;
    }
    case "acknowledge_incident":
    case "send_customer_update": {
      const action = request.action;
      const message = request.payload?.customerMessage?.trim();
      const recipientTenantId = request.payload?.recipientTenantId ?? incident.tenantId;
      const supportTask = (await readSupportTasks(db, session.runId)).find(
        (task) =>
          task.incidentId === incident.id && task.tenantId === recipientTenantId,
      );
      if (!supportTask) {
        throw new WorkspaceActionError(
          "No tenant communication task exists for this incident and recipient.",
          404,
        );
      }
      if (
        request.expectedTaskUpdatedAt &&
        request.expectedTaskUpdatedAt !== supportTask.updatedAt
      ) {
        throw new WorkspaceActionError(
          "This communication task changed in another session. Refresh before taking action.",
          409,
        );
      }
      if (action === "acknowledge_incident") {
        if (supportTask.acknowledgedAt) {
          throw new WorkspaceActionError(
            `This communication task was already accepted by ${supportTask.assignee}.`,
            409,
          );
        }
      }
      if (action === "send_customer_update" && isTerminalIncidentStatus(state.status)) {
        if (supportTask.status === "Resolved") {
          throw new WorkspaceActionError(
            `The resolution was already sent by ${supportTask.assignee}.`,
            409,
          );
        }
      }
      if (action === "send_customer_update" && !supportTask.acknowledgedAt) {
        throw new WorkspaceActionError(
          "Accept this tenant communication task before sending an update.",
          409,
        );
      }
      if (action === "send_customer_update" && (!message || message.length < 20 || message.length > 360)) {
        throw new WorkspaceActionError(
          "Customer updates must be between 20 and 360 characters.",
          422,
        );
      }
      const impact = request.payload?.customerImpact?.trim();
      const customerAction = request.payload?.customerAction?.trim();
      const nextUpdateMinutes = request.payload?.nextUpdateMinutes;
      if (
        action === "send_customer_update" &&
        (!impact || impact.length < 10 || impact.length > 240)
      ) {
        throw new WorkspaceActionError(
          "Customer impact must be between 10 and 240 characters.",
          422,
        );
      }
      if (
        action === "send_customer_update" &&
        (!customerAction || customerAction.length < 5 || customerAction.length > 200)
      ) {
        throw new WorkspaceActionError(
          "Customer action must be between 5 and 200 characters.",
          422,
        );
      }
      if (
        action === "send_customer_update" &&
        !isTerminalIncidentStatus(state.status) &&
        (!Number.isInteger(nextUpdateMinutes) ||
          (nextUpdateMinutes as number) < 5 ||
          (nextUpdateMinutes as number) > 120)
      ) {
        throw new WorkspaceActionError(
          "Choose a next-update commitment between 5 and 120 minutes.",
          422,
        );
      }
      const updatedAt = now();
      const nextUpdateBy =
        action === "send_customer_update" && !isTerminalIncidentStatus(state.status)
          ? new Date(
              new Date(updatedAt).getTime() + (nextUpdateMinutes as number) * 60 * 1000,
            ).toISOString()
          : null;
      await db.batch([
        supportTaskUpdateStatement(
          db,
          session.runId,
          supportTask,
          action === "acknowledge_incident"
            ? {
                status: "Update due",
                assignee: label,
                acknowledgedAt: updatedAt,
              }
            : isTerminalIncidentStatus(state.status)
              ? {
                  status: "Resolved",
                  assignee: supportTask.assignee ?? label,
                  lastUpdateAt: updatedAt,
                  nextUpdateBy: null,
                  resolvedAt: updatedAt,
                }
              : {
                  status: "Waiting for recovery",
                  assignee: supportTask.assignee ?? label,
                  lastUpdateAt: updatedAt,
                  nextUpdateBy,
                },
          updatedAt,
        ),
        ...(action === "send_customer_update"
          ? [
              customerCommunicationStatement(
                db,
                session.runId,
                {
                  id: `communication-${crypto.randomUUID()}`,
                  incidentId: incident.id,
                  tenantId: supportTask.tenantId,
                  tenantName: supportTask.tenantName,
                  kind:
                    state.status === "Contained"
                      ? "Containment update"
                      : state.status === "Resolved"
                        ? "Recovery update"
                        : "Progress update",
                  message: message as string,
                  impact: impact as string,
                  customerAction: customerAction as string,
                  recoveryOwner: incident.owner,
                  postedBy: supportTask.assignee ?? label,
                  postedAt: updatedAt,
                  nextUpdateBy,
                },
              ),
            ]
          : []),
        activityStatement(
          db,
          session.runId,
          incident.id,
          {
            actorRole: session.role,
            actorLabel: label,
            action:
              action === "send_customer_update"
                ? state.status === "Contained"
                  ? "Sent containment update"
                  : state.status === "Resolved"
                    ? "Sent resolution update"
                    : "Sent customer update"
                : "Acknowledged incident",
            detail:
              action === "send_customer_update"
                ? message as string
                : `Support accepted communication ownership for ${supportTask.tenantName} while Engineering remains the recovery owner.`,
          },
          updatedAt,
        ),
      ]);
      break;
    }
    case "publish_mapping": {
      if (incident.type !== "mapping" || state.status !== "Awaiting engineering") {
        throw new WorkspaceActionError("This mapping is not awaiting a change.");
      }
      if (request.payload?.transform !== "Map Draft to Planning") {
        throw new WorkspaceActionError(
          "Regression preview failed: Draft remains outside the destination lifecycle enum.",
          422,
        );
      }
      await commitTransition(
        db,
        session.runId,
        incident,
        state,
        {
          status: "Validating",
          owner: "System",
          actionState: "Running sample and contract checks",
          step: 1,
          mappingVersion: "v6.1",
        },
        {
          actorRole: session.role,
          actorLabel: label,
          action: "Published mapping v6.1",
          detail: "Scoped Draft -> Planning to Easy Spaces; all six regression cases passed with v6.0 available for rollback.",
        },
      );
      break;
    }
    case "test_connector_patch": {
      if (incident.type !== "provider_change" || state.status !== "Awaiting engineering") {
        throw new WorkspaceActionError("This connector patch cannot be tested now.");
      }
      await commitTransition(
        db,
        session.runId,
        incident,
        state,
        {
          status: "Ready to deploy",
          owner: "Integration engineer",
          actionState: "Contract tests passed",
          step: 1,
          connectorVersion: "slack-4.4.0-rc1",
        },
        {
          actorRole: session.role,
          actorLabel: label,
          action: "Passed connector contract tests",
          detail: "Validated the external upload sequence and rejected any files.upload fallback.",
        },
      );
      break;
    }
    case "deploy_connector_patch": {
      if (incident.type !== "provider_change" || state.status !== "Ready to deploy") {
        throw new WorkspaceActionError("Test the connector patch before deploy.");
      }
      const startedAt = now();
      await commitTransition(
        db,
        session.runId,
        incident,
        state,
        {
          status: "Monitoring",
          owner: "System",
          actionState: "Connector v4.4.0 deployed; monitoring canary",
          step: 2,
          connectorVersion: "slack-4.4.0",
        },
        {
          actorRole: session.role,
          actorLabel: label,
          action: "Deployed Slack connector v4.4.0",
          detail: "Released to the Easy Spaces canary with v4.3.0 ready for automatic rollback.",
        },
        [
          createRetryStatement(db, session.runId, incident, "Running", startedAt),
          updateReleaseStatement(
            db,
            session.runId,
            {
              status: "Canary running",
              stageIndex: 0,
              observedHealthyRuns: 0,
            },
            startedAt,
          ),
          updateReleaseCohortStatement(
            db,
            session.runId,
            "Canary",
            {
              activeVersion: seedFleetRelease.toVersion,
              rolloutStatus: "Monitoring",
              lastHealthCheck: "Canary run 1 is in progress",
            },
            startedAt,
          ),
          fleetIncidentUpdateStatement(
            db,
            session.runId,
            {
              status: "Recovering",
              actionState: "Connector patch is live on the affected canary",
            },
            startedAt,
          ),
        ],
      );
      break;
    }
    default:
      throw new WorkspaceActionError("Unsupported workspace action.");
  }

  return getWorkspaceSnapshot(session);
}

export async function performWorkspaceAction(
  request: ActionRequest,
  session: DemoSession,
) {
  if (
    !request.commandId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      request.commandId,
    )
  ) {
    throw new WorkspaceActionError(
      "A valid commandId is required for an idempotent action.",
      422,
    );
  }
  const db = getD1();
  await ensureRun(db, session.runId);
  const createdAt = now();
  const reservation = await db
    .prepare(
      `INSERT OR IGNORE INTO demo_action_commands (
        run_id, command_id, action, target_id, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      session.runId,
      request.commandId,
      request.action,
      request.targetId,
      createdAt,
    )
    .run();
  if (!reservation.meta.changes) {
    return getWorkspaceSnapshot(session);
  }

  let transitionClaimed = false;
  let taskTransitionClaimed = false;
  const taskClaimTarget = `support-task:${request.targetId}:${request.payload?.recipientTenantId ?? seedTenant.id}`;
  try {
    if (request.expectedUpdatedAt) {
      const claim = await db
        .prepare(
          `INSERT OR IGNORE INTO demo_transition_claims (
            run_id, target_id, expected_updated_at, command_id, created_at
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          session.runId,
          request.targetId,
          request.expectedUpdatedAt,
          request.commandId,
          createdAt,
        )
        .run();
      if (!claim.meta.changes) {
        throw new WorkspaceActionError(
          "Another command already consumed this state version. Refresh before taking action.",
          409,
        );
      }
      transitionClaimed = true;
    }
    if (request.expectedTaskUpdatedAt) {
      const taskClaim = await db
        .prepare(
          `INSERT OR IGNORE INTO demo_transition_claims (
            run_id, target_id, expected_updated_at, command_id, created_at
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          session.runId,
          taskClaimTarget,
          request.expectedTaskUpdatedAt,
          request.commandId,
          createdAt,
        )
        .run();
      if (!taskClaim.meta.changes) {
        throw new WorkspaceActionError(
          "Another operator already acted on this communication task version. Refresh before continuing.",
          409,
        );
      }
      taskTransitionClaimed = true;
    }
    const snapshot = await performWorkspaceActionOnce(request, session);
    await db
      .prepare(
        `INSERT OR IGNORE INTO demo_action_commands (
          run_id, command_id, action, target_id, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        session.runId,
        request.commandId,
        request.action,
        request.targetId,
        createdAt,
      )
      .run();
    return snapshot;
  } catch (error) {
    await db.batch([
      db
        .prepare(
          "DELETE FROM demo_action_commands WHERE run_id = ? AND command_id = ?",
        )
        .bind(session.runId, request.commandId),
      ...(transitionClaimed
        ? [
            db
              .prepare(
                `DELETE FROM demo_transition_claims
                WHERE run_id = ? AND target_id = ? AND expected_updated_at = ?
                  AND command_id = ?`,
              )
              .bind(
                session.runId,
                request.targetId,
                request.expectedUpdatedAt,
                request.commandId,
              ),
          ]
        : []),
      ...(taskTransitionClaimed
        ? [
            db
              .prepare(
                `DELETE FROM demo_transition_claims
                WHERE run_id = ? AND target_id = ? AND expected_updated_at = ?
                  AND command_id = ?`,
              )
              .bind(
                session.runId,
                taskClaimTarget,
                request.expectedTaskUpdatedAt,
                request.commandId,
              ),
          ]
        : []),
    ]);
    throw error;
  }
}

export async function getJobEvidence(jobId: string, session: DemoSession) {
  const db = getD1();
  await ensureRun(db, session.runId);
  let incidentId = seedJobs.find((job) => job.id === jobId)?.incidentId ?? null;
  if (!incidentId) {
    const retry = await db
      .prepare(
        "SELECT incident_id AS incidentId FROM demo_job_attempts WHERE run_id = ? AND id = ?",
      )
      .bind(session.runId, jobId)
      .first<{ incidentId: string }>();
    incidentId = retry?.incidentId ?? null;
  }
  const incident = seedIncidents.find((item) => item.id === incidentId);
  if (!incident) throw new WorkspaceActionError("No affected-record export exists.", 404);
  assertCustomerScope(session, incident);
  if (session.role === "customer" && incident.type !== "data_quality") {
    throw new WorkspaceActionError(
      "This evidence is restricted to the SaaS provider team.",
      403,
    );
  }
  return evidenceByIncidentId[incident.id] ?? [];
}
