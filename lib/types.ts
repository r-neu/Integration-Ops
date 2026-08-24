export type Health = "healthy" | "warning" | "broken";
export type Role = "support" | "customer" | "engineer";
export type DemoMode = "role" | "guided";
export type View =
  | "overview"
  | "fleet"
  | "guided"
  | "integration"
  | "connection"
  | "mapping"
  | "jobs"
  | "failure"
  | "policy"
  | "insights"
  | "portal";

export type IncidentType =
  | "data_quality"
  | "authentication"
  | "mapping"
  | "rate_limit"
  | "provider_change";

export type IncidentStatus =
  | "Awaiting customer"
  | "Awaiting engineering"
  | "Backoff scheduled"
  | "Validating"
  | "Ready to deploy"
  | "Retry queued"
  | "Running"
  | "Monitoring"
  | "Contained"
  | "Resolved";

export type IncidentDisposition =
  | "Recovered"
  | "Exception accepted"
  | "Fallback mitigation"
  | null;

export type RemediationStatus = "Open" | "Completed";

export type IncidentOwner =
  | "Customer admin"
  | "Integration engineer"
  | "System";

export type JobStatus =
  | "Succeeded"
  | "Failed"
  | "Queued"
  | "Running"
  | "Backoff scheduled"
  | "Blocked";

export type MappingStatus = "Mapped" | "Review" | "Missing";
export type Severity = "High" | "Medium" | "Low";
export type RecoveryMode =
  | "System managed"
  | "Customer action required"
  | "Engineering action required";
export type RecoveryDecisionStageId =
  | "signal"
  | "diagnosis"
  | "scope"
  | "owner"
  | "recovery"
  | "verification";
export type RecoveryDecisionStageStatus = "Completed" | "Current" | "Guarded";
export type RecoveryDecisionStage = {
  id: RecoveryDecisionStageId;
  label: string;
  summary: string;
  detail: string;
  status: RecoveryDecisionStageStatus;
};
export type SupportEngagement =
  | "Needs support"
  | "Watching"
  | "Not involved";

export type WorkspaceAction =
  | "approve_source_fix"
  | "decline_source_fix"
  | "complete_oauth"
  | "acknowledge_incident"
  | "acknowledge_fleet_incident"
  | "send_customer_update"
  | "publish_mapping"
  | "test_connector_patch"
  | "deploy_connector_patch"
  | "refresh_dependency_evidence"
  | "promote_fleet_release"
  | "rollback_fleet_release"
  | "run_guided_release_step"
  | "run_guided_degraded_canary"
  | "run_guided_step"
  | "reset_demo";

export type BlastRadius = "Record" | "Tenant" | "Connector fleet";
export type RecoveryRisk = "Low" | "Medium" | "High";
export type DiagnosisConfidence = "High" | "Medium" | "Low";
export type ExposureState =
  | "Affected"
  | "Exposed"
  | "Needs review"
  | "Not exposed";
export type ApprovalPolicy =
  | "Automatic"
  | "Customer admin"
  | "Integration engineer";
export type QuarantineStatus =
  | "Quarantined"
  | "Ready for replay"
  | "Replayed";
export type ReleaseCohort = "Canary" | "Early access" | "Stable";
export type ReleaseStatus =
  | "Ready for canary"
  | "Canary running"
  | "Canary passed"
  | "Early access running"
  | "Early access passed"
  | "General rollout running"
  | "Health gate blocked"
  | "Completed"
  | "Rolled back";

export type Tenant = {
  id: string;
  name: string;
  plan: string;
  segment: string;
  owner: string;
  health: Health;
  openIncidents: number;
  sourceRecordCount: number;
};

export type FleetTenant = Tenant & {
  cohort: ReleaseCohort;
  activeConnectorVersion: string;
  targetConnectorVersion: string;
  rolloutStatus:
    | "Pending"
    | "Held for review"
    | "Monitoring"
    | "Healthy"
    | "Rolled back";
  lastHealthCheck: string;
  scenarioData: string;
};

export type ConnectorDependency = {
  id: string;
  tenantId: string;
  tenantName: string;
  workflowId: string;
  workflowName: string;
  provider: string;
  connectorFamily: string;
  connectorVersion: string;
  capabilities: string[];
  endpoints: string[];
  enabled: boolean;
  metadataStatus: "Verified" | "Stale";
  lastVerifiedAt: string;
  nextRunAt: string;
  criticality: "High" | "Medium" | "Low";
  configRevision: string;
};

export type EvidenceProbeStatus = "Queued" | "Running" | "Succeeded" | "Failed";

export type EvidenceProbe = {
  id: string;
  incidentId: string;
  dependencyId: string;
  status: EvidenceProbeStatus;
  attempt: number;
  source: string;
  traceId: string;
  requestedBy: string;
  requestedAt: string;
  completedAt: string | null;
  failureReason: string | null;
  result: {
    capabilities: string[];
    endpoints: string[];
    configRevision: string;
  } | null;
  updatedAt: string;
};

export type ExecutionEventStatus = "Succeeded" | "Failed";

export type RawExecutionEvent = {
  id: string;
  incidentId: string | null;
  tenantId: string;
  dependencyId: string;
  provider: string;
  connectorFamily: string;
  connectorVersion: string;
  capability: string;
  endpoint: string;
  errorCode: string | null;
  traceId: string;
  spanId: string;
  status: ExecutionEventStatus;
  observedAt: string;
};

export type IncidentSignatureRule = {
  id: string;
  policyVersion: string;
  provider: string;
  connectorFamily: string;
  errorCodes: string[];
  endpoint: string;
  capability: string;
  classification: string;
  vulnerableVersionRange: string;
  correlationWindowMinutes: number;
};

export type IncidentFingerprint = {
  incidentId: string;
  classification: string;
  method: "Deterministic rule";
  ruleId: string;
  policyVersion: string;
  provider: string;
  connectorFamily: string;
  connectorVersion: string;
  capability: string;
  endpoint: string;
  errorCode: string;
  vulnerableVersionRange: string;
  correlationWindowMinutes: number;
  observedAt: string;
  sourceEventIds: string[];
  correlatedFailureCount: number;
  correlatedTenantCount: number;
};

export type DependencyExposureAssessment = {
  dependencyId: string;
  workflowId: string;
  workflowName: string;
  state: ExposureState;
  confidence: DiagnosisConfidence;
  confidenceScore: number;
  decisionReason: string;
  matchedSignals: string[];
  missingEvidence: string[];
  metadataFreshness: "Fresh" | "Stale" | "Unknown";
};

export type ExposureAssessment = {
  incidentId: string;
  tenantId: string;
  tenantName: string;
  dependencyId: string;
  dependencyIds: string[];
  state: ExposureState;
  confidence: DiagnosisConfidence;
  confidenceScore: number;
  decisionReason: string;
  matchedSignals: string[];
  missingEvidence: string[];
  recommendedAction: string;
  criticality: "High" | "Medium" | "Low";
  nextRunAt: string;
  pathAssessments: DependencyExposureAssessment[];
};

export type ExposureDecision = {
  decisionId: string;
  incidentId: string;
  policyVersion: string;
  dependencySnapshotVersion: string;
  inputHash: string;
  createdAt: string;
  evaluationMode: "At detection" | "Evidence refresh";
  fingerprint: IncidentFingerprint;
  tenantAssessments: ExposureAssessment[];
};

export type RecoveryPlan = {
  incidentId: string;
  diagnosisLabel: string;
  requiredActionCode: string;
  requiredAction: string;
  actionAuthority: string;
  accountableOwner: IncidentOwner;
  ownerReason: string;
  recoveryMode: RecoveryMode;
  supportEngagement: SupportEngagement;
  decisionStages: RecoveryDecisionStage[];
  blastRadius: BlastRadius;
  affectedTenantIds: string[];
  exposedTenantIds: string[];
  scopeReason: string;
  containment: string;
  approval: ApprovalPolicy;
  risk: RecoveryRisk;
  checkpoint: string;
  idempotencyKey: string;
  proposedAction: string;
  verification: string[];
  rollback: string;
  evidence: string[];
  diagnosisMethod: "Deterministic rule";
  confidence: DiagnosisConfidence;
  confidenceScore: number;
  classificationBasis: string[];
  missingEvidence: string[];
  tenantAssessments: ExposureAssessment[];
  decisionId: string;
  policyVersion: string;
  dependencySnapshotVersion: string;
  decisionInputHash: string;
  decisionCreatedAt: string;
};

export type QuarantineRecord = {
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

export type FleetRelease = {
  id: string;
  provider: string;
  connector: string;
  fromVersion: string;
  toVersion: string;
  fallbackVersion: string;
  status: ReleaseStatus;
  stageIndex: number;
  requiredHealthyRuns: number;
  observedHealthyRuns: number;
  rollbackReason: string | null;
  updatedAt: string;
  targets: FleetTenant[];
  healthPolicy: HealthGatePolicy;
  healthEvidence: HealthGateEvidence[];
};

export type HealthGatePolicy = {
  version: string;
  requiredRuns: number;
  minimumSuccessRate: number;
  maximumErrorRate: number;
  maximumP95LatencyMs: number;
  maximumDuplicateWrites: number;
};

export type HealthGateEvidence = {
  id: string;
  cohort: ReleaseCohort;
  runNumber: number;
  tenantIds: string[];
  status: "Passed" | "Failed";
  successRate: number;
  errorRate: number;
  p95LatencyMs: number;
  duplicateWrites: number;
  traceIds: string[];
  source: "Demo telemetry";
  evaluatedAt: string;
  policyVersion: string;
};

export type FleetIncident = {
  id: string;
  title: string;
  provider: string;
  connectorFamily: string;
  failureClass: string;
  severity: Severity;
  recoveryOwner: IncidentOwner;
  communicationOwner: "Support admin";
  actionState: string;
  detectedAt: string;
  acknowledgedAt: string | null;
  responseDueAt: string;
  responseSlaStatus: SupportSlaStatus;
  affectedTenantIds: string[];
  exposedTenantIds: string[];
  needsReviewTenantIds: string[];
  containedTenantIds: string[];
  heldForEvidenceTenantIds: string[];
  status:
    | "Assessing"
    | "Containment active"
    | "Recovering"
    | "Mitigated"
    | "Resolved";
  decisionId: string;
  updatedAt: string;
  communications: FleetTenantCommunication[];
};

export type FleetTenantCommunication = {
  tenantId: string;
  tenantName: string;
  requirement: "Customer update required" | "Monitor only" | "Not required";
  status:
    | "Unassigned"
    | "Update due"
    | "Overdue"
    | "Waiting for recovery"
    | "Resolved"
    | "Monitoring"
    | "Not required";
  reason: string;
  assignee: string | null;
  acknowledgedAt: string | null;
  lastUpdateAt: string | null;
  nextUpdateBy: string | null;
  slaStatus: SupportSlaStatus;
};

export type SupportSlaStatus = "On track" | "Due soon" | "Breached" | "Closed";

export type SupportTask = {
  id: string;
  fleetIncidentId: string;
  incidentId: string;
  tenantId: string;
  tenantName: string;
  status:
    | "Unassigned"
    | "Update due"
    | "Overdue"
    | "Waiting for recovery"
    | "Resolved";
  assignee: string | null;
  acknowledgedAt: string | null;
  lastUpdateAt: string | null;
  nextUpdateBy: string | null;
  resolvedAt: string | null;
  updatedAt: string;
  slaStatus: SupportSlaStatus;
  slaReason: string;
};

export type RemediationTask = {
  id: string;
  incidentId: string;
  tenantId: string;
  disposition: Exclude<IncidentDisposition, "Recovered" | null>;
  title: string;
  status: RemediationStatus;
  owner: IncidentOwner;
  ownerLabel: string;
  dueAt: string;
  scope: string;
  completionCondition: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerCommunication = {
  id: string;
  incidentId: string;
  tenantId: string;
  tenantName: string;
  kind: "Progress update" | "Recovery update" | "Containment update";
  message: string;
  impact: string;
  customerAction: string;
  recoveryOwner: string;
  postedBy: string;
  postedAt: string;
  nextUpdateBy: string | null;
};

export type FleetMetrics = {
  totalTenants: number;
  affectedTenants: number;
  atRiskTenants: number;
  needsReviewTenants: number;
  notExposedTenants: number;
  quarantinedRecords: number;
  replayedRecords: number;
  unaffectedRecordsContinued: number;
  duplicateOperationsBlocked: number;
  completedRollouts: number;
  rollbacks: number;
};

export type BusinessAccount = {
  id: string;
  name: string;
  phone: string | null;
  website: string | null;
  source: "Salesforce Easy Spaces";
};

export type Connection = {
  id: string;
  tenantId: string;
  provider: string;
  category: string;
  direction: "Source" | "Destination" | "Internal";
  status: Health;
  authStatus: string;
  owner: string;
  lastSync: string;
  openIncidents: number;
  scopes: string;
  nextAction: string;
  lastVerified: string;
};

export type IntegrationFlow = {
  id: string;
  tenantId: string;
  name: string;
  sourceConnectionId: string;
  destinationConnectionId: string;
  sourceObject: string;
  destinationObject: string;
  direction: "One-way" | "Bidirectional";
  schedule: string;
  status: Health;
  mappingVersion: string;
  schemaVersion: string;
  retryPolicy: string;
  ownerTeam: string;
  lastRunAt: string;
  nextRunAt: string;
  description: string;
  identityRule: string;
};

export type FieldMapping = {
  id: string;
  tenantId: string;
  flowId: string;
  connectionId: string;
  relatedIncidentId: string | null;
  sourceObject: string;
  sourceField: string;
  destinationField: string;
  dataType: string;
  required: boolean;
  confidence: number;
  status: MappingStatus;
  transform: string;
  transformOptions: string[];
  rawSample: string;
  cleanedSample: string;
  affectedRecords: number;
};

export type SyncJob = {
  id: string;
  tenantId: string;
  flowId: string;
  connectionId: string;
  incidentId: string | null;
  provider: string;
  objectType: string;
  status: JobStatus;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number;
  processed: number;
  failed: number;
  skipped: number;
  checkpoint: string;
  errorType: string | null;
  summary: string;
  affectedRecordIds: string[];
  retryOf: string | null;
  idempotencyKey: string;
};

export type Incident = {
  id: string;
  tenantId: string;
  flowId: string;
  jobId: string;
  connectionId: string;
  type: IncidentType;
  title: string;
  summary: string;
  severity: Severity;
  status: IncidentStatus;
  disposition: IncidentDisposition;
  owner: IncidentOwner;
  detectedAt: string;
  classifiedAt: string;
  updatedAt: string;
  impact: string;
  affectedRecords: number;
  actionState: string;
  step: number;
  runbook: string;
  providerCode: string;
  providerReferenceUrl: string | null;
  customerVisible: boolean;
  customerTitle: string;
  customerSummary: string;
  recoveryMode: RecoveryMode;
  ownerReason: string;
  actionRequired: string;
  automaticNextStep: string;
  escalationCondition: string;
  nextUpdateBy: string;
  supportEngagement: SupportEngagement;
  supportNote: string;
  resolution: string | null;
  mappingVersion: string;
  connectorVersion: string;
};

export type ActivityEvent = {
  id: number;
  tenantId: string;
  incidentId: string | null;
  actorRole: Role | "system";
  actorLabel: string;
  action: string;
  detail: string;
  createdAt: string;
};

export type RecordEvidence = {
  id: string;
  sourceObject: string;
  label: string;
  accountName: string | null;
  field: string;
  rawValue: string;
  cleanedValue: string;
  issue: string;
  provenance: "Open sample data" | "Provider contract" | "Demo event";
  sourceLabel: string;
  businessContext: string;
  suggestedValue: string;
  suggestionReason: string;
  verificationRequired: string;
};

export type RecoveryPolicyDefinition = {
  id: string;
  version: string;
  failureClass: IncidentType | "unknown";
  classification: string;
  matchSignals: string[];
  actionAuthority: string;
  accountableOwner: IncidentOwner | "Manual triage";
  scope: BlastRadius | "Unresolved";
  approval: ApprovalPolicy | "Incident commander";
  recoveryAction: string;
  escalation: string;
  evidenceBasis: string[];
  counterexample: string;
  productionMutationAllowed: boolean;
};

export type ScenarioWorkerState = {
  execution: "Automated demo worker";
  tickIntervalMs: number;
  pendingWork: string[];
  nextEligibleAt: string | null;
};

export type MappingRegressionCase = {
  id: string;
  input: string;
  expected: string;
  result: "Pass" | "Fail";
  provenance: "Sample data" | "Contract case";
};

export type MappingRelease = {
  incidentId: string;
  scope: string;
  rollbackVersion: string;
  destinationEnum: string[];
  cases: MappingRegressionCase[];
};

export type TraceStep = {
  stage: string;
  status: "Completed" | "Failed" | "Blocked" | "Scheduled";
  timestamp: string;
  detail: string;
};

export type JobTrace = {
  correlationId: string;
  requestId: string;
  idempotencyKey: string;
  endpoint: string;
  httpStatus: number | null;
  providerResponse: string;
  mappingVersion: string;
  schemaVersion: string;
  retryPolicy: string;
  simulated: true;
  steps: TraceStep[];
};

export type OperationalInsights = {
  failuresAwaitingOwner: number;
  failuresByType: { label: string; count: number }[];
  ownershipQueue: { role: string; count: number }[];
  recoveryMix: { label: RecoveryMode; count: number }[];
  humanActionsCompleted: number;
  systemTransitionsCompleted: number;
  decisionMetrics: {
    medianTimeToOwnerMinutes: number;
    medianTimeToResolveMinutes: number | null;
    multiRolePathsObserved: number;
    systemManagedPaths: number;
    totalDecisionPaths: number;
    boundedScopeDecisions: number;
    excludedFleetPaths: number;
    guardedDecisions: number;
    resolvedIncidents: number;
    containedIncidents: number;
  };
};

export type DataSource = {
  id: string;
  name: string;
  url: string;
  license: string;
  version: string;
  recordNature: string;
  use: string;
};

export type ProviderContract = {
  id: string;
  provider: string;
  title: string;
  url: string;
  license: string;
  use: string;
};

export type DataQuality = {
  salesforceCc0Records: number;
  totalRecords: number;
  resolvedContactAccountLinks: number;
  resolvedSpaceMarketLinks: number;
  resolvedReservationContactLinks: number;
  normalizedPhones: number;
  contactsMissingReservationStatus: number;
  leadsMissingIndustry: number;
  leadsMissingTitle: number;
};

export type WorkspaceSnapshot = {
  tenant: Tenant;
  fleetTenants: FleetTenant[];
  fleetIncident: FleetIncident;
  connectorDependencies: ConnectorDependency[];
  evidenceProbes: EvidenceProbe[];
  executionEvents: RawExecutionEvent[];
  incidentFingerprints: Record<string, IncidentFingerprint>;
  exposureDecisions: Record<string, ExposureDecision>;
  exposureDecisionHistory: Record<string, ExposureDecision[]>;
  recoveryPlans: Record<string, RecoveryPlan>;
  quarantine: QuarantineRecord[];
  fleetRelease: FleetRelease;
  policyCatalog: RecoveryPolicyDefinition[];
  scenarioWorker: ScenarioWorkerState;
  fleetMetrics: FleetMetrics;
  accounts: BusinessAccount[];
  connections: Connection[];
  flows: IntegrationFlow[];
  mappings: FieldMapping[];
  jobs: SyncJob[];
  incidents: Incident[];
  supportTasks: SupportTask[];
  remediationTasks: RemediationTask[];
  customerCommunications: CustomerCommunication[];
  activity: ActivityEvent[];
  sources: DataSource[];
  providerContracts: ProviderContract[];
  quality: DataQuality;
  evidence: Record<string, RecordEvidence[]>;
  traces: Record<string, JobTrace>;
  insights: OperationalInsights;
  mappingRelease: MappingRelease;
};

export type ActionRequest = {
  action: WorkspaceAction;
  targetId: string;
  commandId?: string;
  expectedUpdatedAt?: string;
  expectedTaskUpdatedAt?: string;
  payload?: {
    transform?: string;
    cleanedSample?: string;
    sourcePolicyId?: string;
    oauthAccountId?: string;
    oauthScopes?: string[];
    customerMessage?: string;
    customerImpact?: string;
    customerAction?: string;
    nextUpdateMinutes?: number;
    recipientTenantId?: string;
    rollbackReason?: string;
  };
};

export type DemoSession = {
  role: Role;
  mode: DemoMode;
  runId: string;
  displayName: string;
  customerId: string | null;
  customerName: string | null;
  expiresAt: string;
};

export type ConsoleRoute = {
  view: View;
  customerId?: string;
  flowId?: string;
  jobId?: string;
  incidentId?: string;
};
