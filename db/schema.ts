import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const demoRuns = sqliteTable("demo_runs", {
  id: text("id").primaryKey(),
  scenarioVersion: text("scenario_version").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const demoSessions = sqliteTable("demo_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  role: text("role").notNull(),
  mode: text("mode").notNull().default("role"),
  runId: text("run_id"),
  customerId: text("customer_id"),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const demoIncidentState = sqliteTable(
  "demo_incident_state",
  {
    runId: text("run_id").notNull(),
    incidentId: text("incident_id").notNull(),
    status: text("status").notNull(),
    owner: text("owner").notNull(),
    actionState: text("action_state").notNull(),
    step: integer("step").notNull(),
    currentValue: text("current_value"),
    mappingVersion: text("mapping_version").notNull(),
    connectorVersion: text("connector_version").notNull(),
    resolution: text("resolution"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.incidentId] })],
);

export const demoJobAttempts = sqliteTable(
  "demo_job_attempts",
  {
    runId: text("run_id").notNull(),
    id: text("id").notNull(),
    incidentId: text("incident_id").notNull(),
    flowId: text("flow_id").notNull(),
    connectionId: text("connection_id").notNull(),
    provider: text("provider").notNull(),
    objectType: text("object_type").notNull(),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    processed: integer("processed").notNull(),
    failed: integer("failed").notNull(),
    checkpoint: text("checkpoint").notNull(),
    summary: text("summary").notNull(),
    retryOf: text("retry_of").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.id] })],
);

export const demoActivity = sqliteTable("demo_activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull(),
  incidentId: text("incident_id"),
  actorRole: text("actor_role").notNull(),
  actorLabel: text("actor_label").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: text("created_at").notNull(),
});

export const demoCustomerCommunications = sqliteTable(
  "demo_customer_communications",
  {
    runId: text("run_id").notNull(),
    id: text("id").notNull(),
    incidentId: text("incident_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    tenantName: text("tenant_name").notNull(),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    impact: text("impact").notNull(),
    customerAction: text("customer_action").notNull(),
    recoveryOwner: text("recovery_owner").notNull(),
    postedBy: text("posted_by").notNull(),
    postedAt: text("posted_at").notNull(),
    nextUpdateBy: text("next_update_by"),
  },
  (table) => [primaryKey({ columns: [table.runId, table.id] })],
);

export const demoRemediationTasks = sqliteTable(
  "demo_remediation_tasks",
  {
    runId: text("run_id").notNull(),
    id: text("id").notNull(),
    incidentId: text("incident_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    disposition: text("disposition").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(),
    owner: text("owner").notNull(),
    ownerLabel: text("owner_label").notNull(),
    dueAt: text("due_at").notNull(),
    scope: text("scope").notNull(),
    completionCondition: text("completion_condition").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.id] })],
);

export const demoConnectorDependencies = sqliteTable(
  "demo_connector_dependencies",
  {
    runId: text("run_id").notNull(),
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    tenantName: text("tenant_name").notNull(),
    workflowId: text("workflow_id").notNull(),
    workflowName: text("workflow_name").notNull(),
    provider: text("provider").notNull(),
    connectorFamily: text("connector_family").notNull(),
    connectorVersion: text("connector_version").notNull(),
    capabilitiesJson: text("capabilities_json").notNull(),
    endpointsJson: text("endpoints_json").notNull(),
    enabled: integer("enabled").notNull(),
    metadataStatus: text("metadata_status").notNull(),
    lastVerifiedAt: text("last_verified_at").notNull(),
    nextRunAt: text("next_run_at").notNull(),
    criticality: text("criticality").notNull(),
    configRevision: text("config_revision").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.id] })],
);

export const demoExecutionEvents = sqliteTable(
  "demo_execution_events",
  {
    runId: text("run_id").notNull(),
    id: text("id").notNull(),
    incidentId: text("incident_id"),
    tenantId: text("tenant_id").notNull(),
    dependencyId: text("dependency_id").notNull(),
    provider: text("provider").notNull(),
    connectorFamily: text("connector_family").notNull(),
    connectorVersion: text("connector_version").notNull(),
    capability: text("capability").notNull(),
    endpoint: text("endpoint").notNull(),
    errorCode: text("error_code"),
    traceId: text("trace_id").notNull(),
    spanId: text("span_id").notNull(),
    status: text("status").notNull(),
    observedAt: text("observed_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.id] })],
);

export const demoIncidentFingerprints = sqliteTable(
  "demo_incident_fingerprints",
  {
    runId: text("run_id").notNull(),
    incidentId: text("incident_id").notNull(),
    ruleId: text("rule_id").notNull(),
    policyVersion: text("policy_version").notNull(),
    classification: text("classification").notNull(),
    method: text("method").notNull(),
    provider: text("provider").notNull(),
    connectorFamily: text("connector_family").notNull(),
    connectorVersion: text("connector_version").notNull(),
    capability: text("capability").notNull(),
    endpoint: text("endpoint").notNull(),
    errorCode: text("error_code").notNull(),
    vulnerableVersionRange: text("vulnerable_version_range").notNull(),
    correlationWindowMinutes: integer("correlation_window_minutes").notNull(),
    observedAt: text("observed_at").notNull(),
    sourceEventIdsJson: text("source_event_ids_json").notNull(),
    correlatedFailureCount: integer("correlated_failure_count").notNull(),
    correlatedTenantCount: integer("correlated_tenant_count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.incidentId] })],
);

export const demoExposureDecisions = sqliteTable(
  "demo_exposure_decisions",
  {
    runId: text("run_id").notNull(),
    decisionId: text("decision_id").notNull(),
    incidentId: text("incident_id").notNull(),
    policyVersion: text("policy_version").notNull(),
    dependencySnapshotVersion: text("dependency_snapshot_version").notNull(),
    inputHash: text("input_hash").notNull(),
    createdAt: text("created_at").notNull(),
    evaluationMode: text("evaluation_mode").notNull(),
    resultJson: text("result_json").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.decisionId] })],
);

export const demoExposureRevisions = sqliteTable(
  "demo_exposure_revisions",
  {
    runId: text("run_id").notNull(),
    decisionId: text("decision_id").notNull(),
    incidentId: text("incident_id").notNull(),
    policyVersion: text("policy_version").notNull(),
    dependencySnapshotVersion: text("dependency_snapshot_version").notNull(),
    inputHash: text("input_hash").notNull(),
    createdAt: text("created_at").notNull(),
    evaluationMode: text("evaluation_mode").notNull(),
    resultJson: text("result_json").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.decisionId] })],
);

export const demoQuarantineRecords = sqliteTable(
  "demo_quarantine_records",
  {
    runId: text("run_id").notNull(),
    id: text("id").notNull(),
    incidentId: text("incident_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    sourceRecordId: text("source_record_id").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull(),
    reason: text("reason").notNull(),
    checkpoint: text("checkpoint").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    replayAttemptId: text("replay_attempt_id"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.id] })],
);

export const demoReleaseState = sqliteTable(
  "demo_release_state",
  {
    runId: text("run_id").notNull(),
    releaseId: text("release_id").notNull(),
    status: text("status").notNull(),
    stageIndex: integer("stage_index").notNull(),
    requiredHealthyRuns: integer("required_healthy_runs").notNull(),
    observedHealthyRuns: integer("observed_healthy_runs").notNull(),
    rollbackReason: text("rollback_reason"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.releaseId] })],
);

export const demoReleaseTargets = sqliteTable(
  "demo_release_targets",
  {
    runId: text("run_id").notNull(),
    releaseId: text("release_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    cohort: text("cohort").notNull(),
    activeVersion: text("active_version").notNull(),
    targetVersion: text("target_version").notNull(),
    rolloutStatus: text("rollout_status").notNull(),
    lastHealthCheck: text("last_health_check").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.releaseId, table.tenantId] }),
  ],
);
