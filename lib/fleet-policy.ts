import type {
  ActivityEvent,
  DiagnosisConfidence,
  ExposureAssessment,
  ExposureDecision,
  FleetMetrics,
  FleetRelease,
  HealthGateEvidence,
  HealthGatePolicy,
  Incident,
  IncidentOwner,
  OperationalInsights,
  QuarantineRecord,
  RecoveryPolicyDefinition,
  RecoveryDecisionStage,
  RecoveryMode,
  RecoveryPlan,
  SupportEngagement,
  SupportSlaStatus,
  SupportTask,
  SyncJob,
} from "@/lib/types";

const localPolicyVersion = "recovery-policy-v2";

export function isTerminalIncidentStatus(status: Incident["status"]) {
  return status === "Resolved" || status === "Contained";
}

export function isResolvedIncidentStatus(status: Incident["status"]) {
  return status === "Resolved";
}

export function evaluateSupportSla(
  status: SupportTask["status"],
  nextUpdateBy: string | null,
  referenceAt: string | number = Date.now(),
): SupportSlaStatus {
  if (status === "Resolved") return "Closed";
  const reference = typeof referenceAt === "string" ? Date.parse(referenceAt) : referenceAt;
  const dueAt = nextUpdateBy ? Date.parse(nextUpdateBy) : Number.NaN;
  if (status === "Overdue" || (Number.isFinite(dueAt) && dueAt <= reference)) {
    return "Breached";
  }
  if (Number.isFinite(dueAt) && dueAt - reference <= 5 * 60 * 1000) {
    return "Due soon";
  }
  return "On track";
}

type RecoveryAuthorityPolicy = {
  diagnosisLabel: string;
  classificationBasis: string[];
  missingEvidence: string[];
  requiredActionCode: string;
  requiredAction: string;
  actionAuthority: string;
  accountableOwner: IncidentOwner;
  ownerReason: string;
  recoveryMode: RecoveryMode;
  automaticNextStep: string;
  supportEngagement: SupportEngagement;
  supportNote: string;
};

const recoveryAuthorityPolicies: Record<Incident["type"], RecoveryAuthorityPolicy> = {
  data_quality: {
    diagnosisLabel: "Required source field is missing",
    classificationBasis: [
      "Required-field validation failed",
      "Six source record IDs are known",
    ],
    missingEvidence: [],
    requiredActionCode: "correct_source_records",
    requiredAction:
      "Approve the suggested default or keep the six records quarantined.",
    actionAuthority: "Customer-owned source data",
    accountableOwner: "Customer admin",
    ownerReason:
      "Only the customer can approve changes to its CRM data.",
    recoveryMode: "Customer action required",
    automaticNextStep: "After approval, the platform rereads the records and retries from the saved checkpoint.",
    supportEngagement: "Watching",
    supportNote: "Track the response window; Support must not edit customer CRM data.",
  },
  authentication: {
    diagnosisLabel: "OAuth refresh grant is invalid",
    classificationBasis: [
      "Provider returned invalid_grant",
      "Failure occurred before records were read",
    ],
    missingEvidence: [],
    requiredActionCode: "reauthorize_connection",
    requiredAction: "Reconnect HubSpot and approve the required contact scope.",
    actionAuthority: "Customer authorization authority",
    accountableOwner: "Customer admin",
    ownerReason: "OAuth consent must be granted by an administrator in the customer organization.",
    recoveryMode: "Customer action required",
    automaticNextStep: "The platform verifies tenant identity and scopes, then resumes from the checkpoint.",
    supportEngagement: "Watching",
    supportNote: "Explain the reconnect request and monitor recovery; no token handling is delegated to Support.",
  },
  mapping: {
    diagnosisLabel: "Destination contract rejects the mapped value",
    classificationBasis: [
      "Destination enum rejected Draft",
      "The failed mapping version is known",
    ],
    missingEvidence: ["Cross-tenant contract check has not run yet"],
    requiredActionCode: "publish_mapping_contract",
    requiredAction: "Publish a scoped mapping after sample and contract checks pass.",
    actionAuthority: "SaaS mapping-contract authority",
    accountableOwner: "Integration engineer",
    ownerReason: "The rejected enum belongs to the platform mapping contract, not customer source data.",
    recoveryMode: "Engineering action required",
    automaticNextStep: "The platform validates the release, retries two blocked events, and monitors for regression.",
    supportEngagement: "Not involved",
    supportNote: "No customer action is required; communicate only if the delay breaches its SLA.",
  },
  rate_limit: {
    diagnosisLabel: "Transient provider quota is exhausted",
    classificationBasis: [
      "Provider returned HTTP 429",
      "The write batch has a bounded retry policy",
    ],
    missingEvidence: [],
    requiredActionCode: "retry_with_backoff",
    requiredAction: "Retry with jitter and the same operation identity after the quota window.",
    actionAuthority: "Platform retry policy",
    accountableOwner: "System",
    ownerReason: "HTTP 429 is a transient provider response covered by the bounded retry policy.",
    recoveryMode: "System managed",
    automaticNextStep: "The system retries after backoff using the same idempotency key.",
    supportEngagement: "Not involved",
    supportNote: "No manual action; escalate only after the retry budget or delivery SLA is exhausted.",
  },
  provider_change: {
    diagnosisLabel: "Provider capability has been retired",
    classificationBasis: [
      "Provider returned method_deprecated",
      "The failed trace called files.upload",
      "The connector version satisfies the vulnerable range",
    ],
    missingEvidence: [],
    requiredActionCode: "release_connector_patch",
    requiredAction: "Pass contract tests, release to an affected canary, and keep rollback ready.",
    actionAuthority: "SaaS connector release authority",
    accountableOwner: "Integration engineer",
    ownerReason: "A provider capability changed inside the SaaS-owned connector implementation.",
    recoveryMode: "Engineering action required",
    automaticNextStep: "The platform evaluates canary health, blocks failed gates, and promotes only after an authorized decision.",
    supportEngagement: "Needs support",
    supportNote: "Keep affected customers informed while Engineering restores the connector capability.",
  },
};

function policyEvidenceAssessment(policy: RecoveryAuthorityPolicy) {
  const matched = policy.classificationBasis.length;
  const total = matched + policy.missingEvidence.length;
  const confidenceScore = total ? Math.round((matched / total) * 100) : 0;
  const confidence: DiagnosisConfidence = policy.missingEvidence.length
    ? confidenceScore >= 50
      ? "Medium"
      : "Low"
    : "High";
  return { confidence, confidenceScore };
}

const policyScope: Record<Incident["type"], RecoveryPolicyDefinition["scope"]> = {
  data_quality: "Record",
  authentication: "Tenant",
  mapping: "Tenant",
  rate_limit: "Tenant",
  provider_change: "Connector fleet",
};

const policyApproval: Record<Incident["type"], RecoveryPolicyDefinition["approval"]> = {
  data_quality: "Customer admin",
  authentication: "Customer admin",
  mapping: "Integration engineer",
  rate_limit: "Automatic",
  provider_change: "Integration engineer",
};

export const recoveryPolicyCatalog: RecoveryPolicyDefinition[] = [
  ...Object.entries(recoveryAuthorityPolicies).map(([failureClass, policy]) => ({
    id: `policy-${failureClass}`,
    version: localPolicyVersion,
    failureClass: failureClass as Incident["type"],
    classification: policy.diagnosisLabel,
    matchSignals: policy.classificationBasis,
    actionAuthority: policy.actionAuthority,
    accountableOwner: policy.accountableOwner,
    scope: policyScope[failureClass as Incident["type"]],
    approval: policyApproval[failureClass as Incident["type"]],
    recoveryAction: policy.requiredAction,
    escalation: policy.supportNote,
    evidenceBasis: policy.classificationBasis,
    counterexample:
      failureClass === "rate_limit"
        ? "A 429 response with an exhausted retry budget is not auto-retried; it escalates for manual investigation."
        : failureClass === "provider_change"
          ? "One custom tenant endpoint should not trigger a fleet release until shared exposure is confirmed."
          : `A partial signal without the required owner or scope evidence stays in manual investigation.`,
    productionMutationAllowed: true,
  })),
  {
    id: "policy-unknown",
    version: localPolicyVersion,
    failureClass: "unknown",
    classification: "Unclassified integration failure",
    matchSignals: ["No known rule matches all required provider, version, and trace signals"],
    actionAuthority: "Incident commander review",
    accountableOwner: "Manual triage",
    scope: "Unresolved",
    approval: "Incident commander",
    recoveryAction: "Preserve evidence, contain only confirmed impact, and investigate manually.",
    escalation: "Escalate with trace, dependency snapshot, and failed rule candidates. Do not change production data.",
    evidenceBasis: ["Raw provider response", "Execution trace", "Dependency snapshot", "Rule mismatch reasons"],
    counterexample: "Unknown errors should not inherit the nearest known policy just because one signal is similar.",
    productionMutationAllowed: false,
  },
];

export function recoveryPolicyFor(type: Incident["type"]) {
  return recoveryAuthorityPolicies[type];
}

export function incidentPolicyFields(type: Incident["type"]) {
  const policy = recoveryPolicyFor(type);
  return {
    owner: policy.accountableOwner,
    recoveryMode: policy.recoveryMode,
    ownerReason: policy.ownerReason,
    actionRequired: policy.requiredAction,
    automaticNextStep: policy.automaticNextStep,
    supportEngagement: policy.supportEngagement,
    supportNote: policy.supportNote,
  };
}

function decisionStages(
  incident: Incident,
  policy: RecoveryAuthorityPolicy,
  blastRadius: RecoveryPlan["blastRadius"],
  scopeReason: string,
  proposedAction: string,
  verification: string[],
): RecoveryDecisionStage[] {
  const resolved = isResolvedIncidentStatus(incident.status);
  const contained = incident.status === "Contained";
  const ownerCompleted = resolved || incident.owner !== policy.accountableOwner;
  const recoveryStarted = ownerCompleted || incident.step > 0 || incident.owner === "System";
  const verificationStarted =
    resolved ||
    contained ||
    incident.step > 1 ||
    ["Validating", "Running", "Monitoring", "Ready to deploy"].includes(incident.status);

  return [
    {
      id: "signal",
      label: "Signal",
      summary: incident.providerCode,
      detail: `${incident.affectedRecords} affected record${incident.affectedRecords === 1 ? "" : "s"} on ${incident.connectionId}.`,
      status: "Completed",
    },
    {
      id: "diagnosis",
      label: "Diagnosis",
      summary: policy.diagnosisLabel,
      detail: policy.missingEvidence.length
        ? `${policy.classificationBasis.length} matched signals; ${policy.missingEvidence.length} evidence gap remains.`
        : `${policy.classificationBasis.length} required signals matched the policy.`,
      status: "Completed",
    },
    {
      id: "scope",
      label: "Scope",
      summary: blastRadius,
      detail: scopeReason,
      status: "Completed",
    },
    {
      id: "owner",
      label: "Who can act",
      summary: policy.accountableOwner,
      detail: `${policy.actionAuthority}. ${policy.ownerReason}`,
      status: ownerCompleted ? "Completed" : "Current",
    },
    {
      id: "recovery",
      label: "Recovery",
      summary: policy.requiredAction,
      detail: proposedAction,
      status: resolved ? "Completed" : recoveryStarted ? "Current" : "Guarded",
    },
    {
      id: "verification",
      label: "Verification",
      summary: verification[0],
      detail: verification.join(" · "),
      status: resolved ? "Completed" : verificationStarted ? "Current" : "Guarded",
    },
  ];
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildRecoveryValueMetrics(
  incidents: Incident[],
  activity: ActivityEvent[],
  plans: Record<string, RecoveryPlan>,
): OperationalInsights["decisionMetrics"] {
  const timeToOwner = incidents.map((incident) =>
    Math.max(0, Date.parse(incident.classifiedAt) - Date.parse(incident.detectedAt)) / 60000,
  );
  const resolved = incidents.filter((incident) => incident.status === "Resolved");
  const contained = incidents.filter((incident) => incident.status === "Contained");
  const timeToResolve = resolved.map((incident) =>
    Math.max(0, Date.parse(incident.updatedAt) - Date.parse(incident.detectedAt)) / 60000,
  );
  const multiRolePathsObserved = incidents.filter((incident) => {
    const roles = new Set(
      activity
        .filter((event) => event.incidentId === incident.id && event.actorRole !== "system")
        .map((event) => event.actorRole),
    );
    return roles.size > 1;
  }).length;
  const recoveryPlans = Object.values(plans);
  const systemManaged = recoveryPlans.filter(
    (plan) => plan.accountableOwner === "System",
  ).length;
  const boundedScopeDecisions = recoveryPlans.filter(
    (plan) => plan.blastRadius !== "Connector fleet",
  ).length;
  const excludedFleetPaths = recoveryPlans.reduce(
    (count, plan) =>
      count +
      plan.tenantAssessments.filter((assessment) => assessment.state === "Not exposed")
        .length,
    0,
  );
  const guardedDecisions = recoveryPlans.reduce(
    (count, plan) =>
      count +
      plan.tenantAssessments.filter((assessment) => assessment.state === "Needs review")
        .length,
    0,
  );

  return {
    medianTimeToOwnerMinutes: Number((median(timeToOwner) ?? 0).toFixed(1)),
    medianTimeToResolveMinutes:
      timeToResolve.length ? Number((median(timeToResolve) ?? 0).toFixed(1)) : null,
    multiRolePathsObserved,
    systemManagedPaths: systemManaged,
    totalDecisionPaths: recoveryPlans.length,
    boundedScopeDecisions,
    excludedFleetPaths,
    guardedDecisions,
    resolvedIncidents: resolved.length,
    containedIncidents: contained.length,
  };
}

export function evaluateHealthGate(
  policy: HealthGatePolicy,
  measurement: Pick<
    HealthGateEvidence,
    "successRate" | "errorRate" | "p95LatencyMs" | "duplicateWrites"
  >,
) {
  return measurement.successRate >= policy.minimumSuccessRate &&
    measurement.errorRate <= policy.maximumErrorRate &&
    measurement.p95LatencyMs <= policy.maximumP95LatencyMs &&
    measurement.duplicateWrites <= policy.maximumDuplicateWrites
    ? ("Passed" as const)
    : ("Failed" as const);
}

function incidentJob(incident: Incident, jobs: SyncJob[]) {
  return jobs.find((job) => job.id === incident.jobId);
}

function localAssessment(
  incident: Incident,
  confidence: DiagnosisConfidence,
  confidenceScore: number,
): ExposureAssessment {
  return {
    incidentId: incident.id,
    tenantId: incident.tenantId,
    tenantName: "Easy Spaces",
    dependencyId: incident.connectionId,
    dependencyIds: [incident.connectionId],
    state: "Affected",
    confidence,
    confidenceScore,
    decisionReason: "The failed job and connection both resolve to this tenant.",
    matchedSignals: [incident.providerCode, incident.connectionId, incident.jobId],
    missingEvidence: [],
    recommendedAction: incident.actionRequired,
    criticality: incident.severity,
    nextRunAt: incident.nextUpdateBy,
    pathAssessments: [
      {
        dependencyId: incident.connectionId,
        workflowId: incident.flowId,
        workflowName: incident.title,
        state: "Affected",
        confidence,
        confidenceScore,
        decisionReason: "The failed execution identifies this tenant workflow directly.",
        matchedSignals: [incident.jobId, incident.connectionId],
        missingEvidence: [],
        metadataFreshness: "Fresh",
      },
    ],
  };
}

export function buildRecoveryPlans(
  incidents: Incident[],
  jobs: SyncJob[],
  exposureDecisions: Record<string, ExposureDecision>,
): Record<string, RecoveryPlan> {
  return Object.fromEntries(
    incidents.map((incident) => {
      const job = incidentJob(incident, jobs);
      if (!job) throw new Error(`Missing failed job for ${incident.id}`);

      const policy = recoveryPolicyFor(incident.type);
      const evidenceAssessment = policyEvidenceAssessment(policy);
      const exposureDecision = exposureDecisions[incident.id];
      if (incident.type === "provider_change" && !exposureDecision) {
        throw new Error(`Missing exposure decision for ${incident.id}`);
      }
      const tenantAssessments = exposureDecision
        ? exposureDecision.tenantAssessments
        : [
            localAssessment(
              incident,
              evidenceAssessment.confidence,
              evidenceAssessment.confidenceScore,
            ),
          ];
      const exposedTenantIds = tenantAssessments
        .filter((assessment) => ["Affected", "Exposed"].includes(assessment.state))
        .map((assessment) => assessment.tenantId);
      const needsReviewCount = tenantAssessments.filter(
        (assessment) => assessment.state === "Needs review",
      ).length;
      const sharedEvidence = [
        `${incident.providerCode} on ${job.provider}`,
        `${incident.affectedRecords} failed after ${job.processed} records continued`,
        `Checkpoint ${job.checkpoint} retained`,
      ];

      type PolicyTemplate = Omit<
        RecoveryPlan,
        | "incidentId"
        | "diagnosisLabel"
        | "requiredActionCode"
        | "requiredAction"
        | "actionAuthority"
        | "accountableOwner"
        | "ownerReason"
        | "recoveryMode"
        | "supportEngagement"
        | "decisionStages"
        | "affectedTenantIds"
        | "exposedTenantIds"
        | "checkpoint"
        | "idempotencyKey"
        | "evidence"
        | "diagnosisMethod"
        | "confidence"
        | "confidenceScore"
        | "classificationBasis"
        | "missingEvidence"
        | "tenantAssessments"
        | "decisionId"
        | "policyVersion"
        | "dependencySnapshotVersion"
        | "decisionInputHash"
        | "decisionCreatedAt"
      >;

      const planByType: Record<Incident["type"], PolicyTemplate> = {
        data_quality: {
          blastRadius: "Record",
          containment: "Quarantine the six invalid contacts and continue processing valid records.",
          approval: "Customer admin",
          risk: "Low",
          proposedAction:
            "Apply the approved default and replay valid records, or keep the exception quarantined.",
          verification: [
            "Validate the selected policy disposition",
            "Reread every record eligible for replay",
            "Reject duplicate replay operations",
          ],
          rollback: "No release rollback; leave records quarantined if validation fails.",
          scopeReason: "Only the invalid records are isolated. The tenant and connection stay online.",
        },
        authentication: {
          blastRadius: "Tenant",
          scopeReason: "The rejected OAuth grant belongs only to the Easy Spaces HubSpot connection.",
          containment: "Pause the tenant's HubSpot flow without affecting other tenants or providers.",
          approval: "Customer admin",
          risk: "Medium",
          proposedAction: "Reconnect the same tenant account and verify identity and scopes before resuming.",
          verification: [
            "Match the returned account to the tenant",
            "Verify crm.objects.contacts.read",
            "Resume from the stored cursor",
          ],
          rollback: "Keep the flow paused and preserve the previous connection metadata.",
        },
        mapping: {
          blastRadius: "Tenant",
          scopeReason: "Evidence points to one tenant override. Engineering must check for cross-tenant impact before publishing.",
          containment: "Block only lifecycle events using mapping v6.0; other flows continue.",
          approval: "Integration engineer",
          risk: "Medium",
          proposedAction: "Publish a tenant-scoped mapping after sample and contract checks.",
          verification: [
            "Run sample records",
            "Run destination enum contract cases",
            "Check the shared contract for matching failures",
          ],
          rollback: "Restore mapping v6.0 and leave rejected events quarantined.",
        },
        rate_limit: {
          blastRadius: "Tenant",
          scopeReason: "The quota response applies to one spreadsheet write batch and has an explicit retry policy.",
          containment: "Hold the batch until the backoff window expires; do not create a manual task.",
          approval: "Automatic",
          risk: "Low",
          proposedAction: "Retry after the quota window using the same operation identity.",
          verification: [
            "Respect Retry-After or policy delay",
            "Reuse the operation identity",
            "Confirm each row exists once",
          ],
          rollback: "Stop after the retry budget and escalate without replaying uncertain writes.",
        },
        provider_change: {
          blastRadius: "Connector fleet",
          scopeReason: `The latest decision includes ${exposedTenantIds.length} affected or exposed tenant${exposedTenantIds.length === 1 ? "" : "s"}. ${needsReviewCount} tenant${needsReviewCount === 1 ? " stays" : "s stay"} on hold until evidence is refreshed.`,
          containment: "Stop the connector rollout and keep unaffected providers and flows running.",
          approval: "Integration engineer",
          risk: "High",
          proposedAction: "Validate the replacement contract, deploy one affected canary, then promote only through fleet health gates.",
          verification: [
            "Pass the external upload contract suite",
            "Observe two healthy canary runs",
            "Refresh stale dependency metadata",
          ],
          rollback: "Return active affected cohorts to the text-only fallback connector and stop promotion.",
        },
      };

      const plan = planByType[incident.type];
      const localDecisionId = `local-${incident.id}-${job.id}`;
      return [
        incident.id,
        {
          incidentId: incident.id,
          diagnosisLabel: policy.diagnosisLabel,
          requiredActionCode: policy.requiredActionCode,
          requiredAction: policy.requiredAction,
          actionAuthority: policy.actionAuthority,
          accountableOwner: policy.accountableOwner,
          ownerReason: policy.ownerReason,
          recoveryMode: policy.recoveryMode,
          supportEngagement: policy.supportEngagement,
          ...plan,
          decisionStages: decisionStages(
            incident,
            policy,
            plan.blastRadius,
            plan.scopeReason,
            plan.proposedAction,
            plan.verification,
          ),
          affectedTenantIds: [incident.tenantId],
          exposedTenantIds,
          checkpoint: job.checkpoint,
          idempotencyKey: job.idempotencyKey,
          evidence: exposureDecision
            ? [
                ...sharedEvidence,
                `${exposedTenantIds.length} of ${tenantAssessments.length} tenants have observed or verified exposure`,
                `${exposureDecision.fingerprint.correlatedFailureCount} matching failure event in the ${exposureDecision.fingerprint.correlationWindowMinutes}-minute window`,
              ]
            : sharedEvidence,
          diagnosisMethod: "Deterministic rule",
          confidence: evidenceAssessment.confidence,
          confidenceScore: evidenceAssessment.confidenceScore,
          classificationBasis: policy.classificationBasis,
          missingEvidence: policy.missingEvidence,
          tenantAssessments,
          decisionId: exposureDecision?.decisionId ?? localDecisionId,
          policyVersion: exposureDecision?.policyVersion ?? localPolicyVersion,
          dependencySnapshotVersion:
            exposureDecision?.dependencySnapshotVersion ?? `tenant-${incident.tenantId}`,
          decisionInputHash:
            exposureDecision?.inputHash ?? `job:${job.id}:${incident.providerCode}`,
          decisionCreatedAt: exposureDecision?.createdAt ?? incident.detectedAt,
        },
      ];
    }),
  );
}

export function buildFleetMetrics(
  jobs: SyncJob[],
  quarantine: QuarantineRecord[],
  release: FleetRelease,
  duplicateOperationsBlocked: number,
  fleetPlan?: RecoveryPlan,
): FleetMetrics {
  const dataFailure = jobs.find((job) => job.id === "job-data-001");
  const assessments = fleetPlan?.tenantAssessments ?? [];
  return {
    totalTenants: assessments.length || release.targets.length,
    affectedTenants: assessments.filter((row) => row.state === "Affected").length,
    atRiskTenants: assessments.filter((row) =>
      ["Affected", "Exposed"].includes(row.state),
    ).length,
    needsReviewTenants: assessments.filter((row) => row.state === "Needs review").length,
    notExposedTenants: assessments.filter((row) => row.state === "Not exposed").length,
    quarantinedRecords: quarantine.filter((row) => row.status === "Quarantined").length,
    replayedRecords: quarantine.filter((row) => row.status === "Replayed").length,
    unaffectedRecordsContinued: dataFailure?.processed ?? 0,
    duplicateOperationsBlocked,
    completedRollouts: release.status === "Completed" ? 1 : 0,
    rollbacks: release.status === "Rolled back" ? 1 : 0,
  };
}
