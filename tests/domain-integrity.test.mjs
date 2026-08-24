import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadDemoModel() {
  const sourceUrl = new URL("../lib/demo-seed.ts", import.meta.url);
  const fixtureUrl = new URL(
    "../data/processed/open-crm-fixtures.json",
    import.meta.url,
  );
  const policyUrl = new URL("../lib/fleet-policy.ts", import.meta.url);
  const engineUrl = new URL("../lib/exposure-engine.ts", import.meta.url);
  const [source, policy, engine, fixture] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(policyUrl, "utf8"),
    readFile(engineUrl, "utf8"),
    readFile(fixtureUrl, "utf8"),
  ]);
  const engineSource = engine
    .replace(
      'import { satisfies, valid } from "semver";',
      `import semver from ${JSON.stringify(import.meta.resolve("semver"))};\nconst { satisfies, valid } = semver;`,
    )
    .replace(/import type \{[\s\S]*?\} from "@\/lib\/types";/, "");
  const policySource = policy.replace(
    /import type \{[\s\S]*?\} from "@\/lib\/types";/,
    "",
  );
  const seedSource = source
    .replace(
      /import fixture from "@\/data\/processed\/open-crm-fixtures\.json";/,
      `const fixture = ${fixture};`,
    )
    .replace(/import type \{[\s\S]*?\} from "@\/lib\/types";/, "")
    .replace(
      /import \{[\s\S]*?\} from "@\/lib\/fleet-policy";/,
      "",
    )
    .replace(
      /import \{[\s\S]*?\} from "@\/lib\/exposure-engine";/,
      "",
    );
  const selfContained = `${engineSource}\n${policySource}\n${seedSource}`;
  const compiled = ts.transpileModule(selfContained, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

test("models Easy Spaces as one tenant and Salesforce Accounts as records", async () => {
  const model = await loadDemoModel();
  assert.equal(model.seedTenant.id, "tenant-easy-spaces");
  assert.equal(model.seedTenant.name, "Easy Spaces");
  assert.equal(model.seedTenant.sourceRecordCount, 180);
  assert.equal(model.seedAccounts.length, 12);
  assert.ok(model.seedAccounts.some((account) => account.name === "Farscape Inc."));
  assert.ok(
    model.seedAccounts.every(
      (account) => account.source === "Salesforce Easy Spaces",
    ),
  );
});

test("keeps Easy Spaces workflow entities tenant-scoped inside a multi-tenant fleet", async () => {
  const model = await loadDemoModel();
  const tenantId = model.seedTenant.id;
  const connections = new Map(
    model.seedConnections.map((connection) => [connection.id, connection]),
  );
  const flows = new Map(model.seedFlows.map((flow) => [flow.id, flow]));

  for (const connection of model.seedConnections) {
    assert.equal(connection.tenantId, tenantId);
  }
  for (const flow of model.seedFlows) {
    assert.equal(flow.tenantId, tenantId);
    assert.equal(connections.get(flow.sourceConnectionId)?.tenantId, tenantId);
    assert.equal(
      connections.get(flow.destinationConnectionId)?.tenantId,
      tenantId,
    );
  }
  for (const job of model.seedJobs) {
    assert.equal(job.tenantId, tenantId);
    assert.ok(flows.has(job.flowId));
  }
  for (const mapping of model.seedMappings) {
    assert.equal(mapping.tenantId, tenantId);
    assert.ok(flows.has(mapping.flowId));
  }
  for (const incident of model.seedIncidents) {
    assert.equal(incident.tenantId, tenantId);
    assert.ok(flows.has(incident.flowId));
    assert.ok(model.seedJobs.some((job) => job.id === incident.jobId));
  }
  assert.equal(model.seedFleetTenants.length, 4);
  assert.deepEqual(
    model.seedFleetTenants.map((tenant) => tenant.cohort),
    ["Canary", "Early access", "Stable", "Early access"],
  );
  assert.equal(model.seedConnectorDependencies.length, 5);
  assert.equal(
    model.seedFleetTenants.find((tenant) => tenant.id === "tenant-harbor-retail")
      .rolloutStatus,
    "Held for review",
  );
  assert.equal(model.seedQuarantineRecords.length, 6);
  assert.ok(
    model.seedQuarantineRecords.every(
      (record) => record.tenantId === tenantId && sourceIdsFor(model).has(record.sourceRecordId),
    ),
  );
});

function sourceIdsFor(model) {
  return new Set(
    Object.values(model.evidenceByIncidentId)
      .flat()
      .filter((record) => record.id.startsWith("sf-"))
      .map((record) => record.id),
  );
}

test("calculates record, tenant, and connector-fleet recovery scopes", async () => {
  const model = await loadDemoModel();
  const workspace = model.buildSeedWorkspace();
  const releaseTargetIds = new Set(
    workspace.fleetRelease.targets.map((tenant) => tenant.id),
  );
  assert.ok(
    [
      ...workspace.recoveryPlans["inc-api-001"].affectedTenantIds,
      ...workspace.recoveryPlans["inc-api-001"].exposedTenantIds,
    ].every((tenantId) => releaseTargetIds.has(tenantId)),
  );
  assert.equal(
    workspace.policyCatalog.find((policy) => policy.failureClass === "unknown")
      .productionMutationAllowed,
    false,
  );
  assert.equal(workspace.recoveryPlans["inc-data-001"].blastRadius, "Record");
  assert.equal(workspace.recoveryPlans["inc-auth-001"].blastRadius, "Tenant");
  assert.equal(
    workspace.recoveryPlans["inc-api-001"].blastRadius,
    "Connector fleet",
  );
  assert.equal(
    workspace.recoveryPlans["inc-api-001"].exposedTenantIds.length,
    2,
  );
  assert.deepEqual(
    Object.fromEntries(
      workspace.recoveryPlans["inc-api-001"].tenantAssessments.map(
        (assessment) => [assessment.tenantName, assessment.state],
      ),
    ),
    {
      "Easy Spaces": "Affected",
      "Northstar Health": "Exposed",
      "Brightline Labs": "Not exposed",
      "Harbor Retail": "Needs review",
    },
  );
  assert.equal(workspace.recoveryPlans["inc-api-001"].confidence, "High");
  assert.equal(workspace.recoveryPlans["inc-map-001"].confidence, "Medium");
  assert.equal(workspace.fleetMetrics.totalTenants, 4);
  assert.equal(workspace.fleetMetrics.needsReviewTenants, 1);
  assert.equal(workspace.fleetMetrics.notExposedTenants, 1);
  assert.equal(workspace.fleetMetrics.unaffectedRecordsContinued, 6);
  assert.deepEqual(
    workspace.fleetIncident.containedTenantIds.sort(),
    ["tenant-easy-spaces", "tenant-northstar-health"].sort(),
  );
  assert.deepEqual(workspace.fleetIncident.heldForEvidenceTenantIds, [
    "tenant-harbor-retail",
  ]);
  assert.equal(workspace.fleetIncident.status, "Containment active");
  assert.deepEqual(workspace.remediationTasks, []);
});

test("explains every fleet exposure decision from dependency evidence", async () => {
  const model = await loadDemoModel();
  const workspace = model.buildSeedWorkspace();
  const plan = workspace.recoveryPlans["inc-api-001"];

  assert.equal(plan.decisionId, workspace.exposureDecisions["inc-api-001"].decisionId);
  assert.equal(plan.policyVersion, "exposure-policy-v2");

  for (const assessment of plan.tenantAssessments) {
    assert.ok(assessment.decisionReason.length > 20);
    assert.ok(assessment.recommendedAction.length > 20);
    assert.ok(assessment.confidenceScore >= 0);
    assert.ok(assessment.confidenceScore <= 100);
    assert.ok(
      workspace.connectorDependencies.some(
        (dependency) => dependency.id === assessment.dependencyId,
      ),
    );
  }

  const brightline = plan.tenantAssessments.find(
    (assessment) => assessment.tenantName === "Brightline Labs",
  );
  assert.match(brightline.decisionReason, /does not use file_upload/);

  const harbor = plan.tenantAssessments.find(
    (assessment) => assessment.tenantName === "Harbor Retail",
  );
  assert.equal(harbor.confidence, "Medium");
  assert.ok(harbor.missingEvidence.length >= 2);

  const easySpaces = plan.tenantAssessments.find(
    (assessment) => assessment.tenantName === "Easy Spaces",
  );
  assert.equal(easySpaces.pathAssessments.length, 2);
  assert.deepEqual(
    easySpaces.pathAssessments.map((path) => path.state).sort(),
    ["Affected", "Not exposed"],
  );
});

test("routes each failure class to its realistic owner", async () => {
  const model = await loadDemoModel();
  const owners = Object.fromEntries(
    model.seedIncidents.map((incident) => [incident.type, incident.owner]),
  );
  assert.deepEqual(owners, {
    data_quality: "Customer admin",
    authentication: "Customer admin",
    mapping: "Integration engineer",
    rate_limit: "System",
    provider_change: "Integration engineer",
  });
  assert.equal(new Set(model.seedIncidents.map((item) => item.type)).size, 5);
  assert.equal(
    model.seedIncidents.filter((incident) => incident.customerVisible).length,
    3,
  );
  assert.deepEqual(
    model.seedIncidents
      .filter((incident) => incident.customerVisible)
      .map((incident) => incident.type)
      .sort(),
    ["authentication", "data_quality", "provider_change"],
  );
  assert.equal(
    model.seedIncidents.filter(
      (incident) => incident.supportEngagement === "Needs support",
    ).length,
    1,
  );
});

test("derives support SLA states from deadlines instead of decorative labels", async () => {
  const model = await loadDemoModel();
  assert.equal(
    model.evaluateSupportSla(
      "Unassigned",
      "2026-07-28T16:50:00.000Z",
      "2026-07-28T16:40:00.000Z",
    ),
    "On track",
  );
  assert.equal(
    model.evaluateSupportSla(
      "Waiting for recovery",
      "2026-07-28T16:50:00.000Z",
      "2026-07-28T16:46:00.000Z",
    ),
    "Due soon",
  );
  assert.equal(
    model.evaluateSupportSla(
      "Waiting for recovery",
      "2026-07-28T16:50:00.000Z",
      "2026-07-28T16:51:00.000Z",
    ),
    "Breached",
  );
  assert.equal(
    model.evaluateSupportSla("Resolved", null, "2026-07-28T16:51:00.000Z"),
    "Closed",
  );
});

test("derives action authority and every decision stage from one policy", async () => {
  const model = await loadDemoModel();
  const workspace = model.buildSeedWorkspace();
  const expectedStages = [
    "signal",
    "diagnosis",
    "scope",
    "owner",
    "recovery",
    "verification",
  ];

  for (const incident of workspace.incidents) {
    const policy = model.recoveryPolicyFor(incident.type);
    const plan = workspace.recoveryPlans[incident.id];
    assert.equal(incident.owner, policy.accountableOwner);
    assert.equal(incident.recoveryMode, policy.recoveryMode);
    assert.equal(plan.accountableOwner, policy.accountableOwner);
    assert.equal(plan.actionAuthority, policy.actionAuthority);
    assert.equal(plan.requiredAction, incident.actionRequired);
    assert.deepEqual(
      plan.decisionStages.map((stage) => stage.id),
      expectedStages,
    );
    assert.equal(plan.decisionStages[0].status, "Completed");
  }
});

test("calculates decision-value indicators without claiming production outcomes", async () => {
  const model = await loadDemoModel();
  const workspace = model.buildSeedWorkspace();
  const metrics = workspace.insights.decisionMetrics;

  assert.equal(metrics.medianTimeToOwnerMinutes, 1.6);
  assert.equal(metrics.medianTimeToResolveMinutes, null);
  assert.equal(metrics.multiRolePathsObserved, 0);
  assert.equal(metrics.systemManagedPaths, 1);
  assert.equal(metrics.totalDecisionPaths, 5);
  assert.equal(metrics.boundedScopeDecisions, 4);
  assert.equal(metrics.excludedFleetPaths, 1);
  assert.equal(metrics.guardedDecisions, 1);
  assert.equal(metrics.resolvedIncidents, 0);
});

test("fails a release health gate when any persisted threshold is breached", async () => {
  const model = await loadDemoModel();
  const policy = model.seedFleetRelease.healthPolicy;

  assert.equal(
    model.evaluateHealthGate(policy, {
      successRate: policy.minimumSuccessRate - 0.001,
      errorRate: policy.maximumErrorRate,
      p95LatencyMs: policy.maximumP95LatencyMs,
      duplicateWrites: policy.maximumDuplicateWrites,
    }),
    "Failed",
  );
  assert.equal(
    model.evaluateHealthGate(policy, {
      successRate: policy.minimumSuccessRate,
      errorRate: policy.maximumErrorRate,
      p95LatencyMs: policy.maximumP95LatencyMs,
      duplicateWrites: policy.maximumDuplicateWrites,
    }),
    "Passed",
  );
});

test("anchors incident evidence in the pinned fixture and provider contracts", async () => {
  const model = await loadDemoModel();
  const fixture = JSON.parse(
    await readFile(
      new URL("../data/processed/open-crm-fixtures.json", import.meta.url),
      "utf8",
    ),
  );
  const sourceIds = new Set(
    Object.values(fixture.salesforce)
      .flat()
      .map((record) => record.id),
  );

  for (const incident of model.seedIncidents) {
    assert.ok(model.evidenceByIncidentId[incident.id]?.length);
    assert.ok(model.traceByIncidentId[incident.id]);
    for (const evidence of model.evidenceByIncidentId[incident.id]) {
      assert.ok(evidence.provenance);
      assert.ok(evidence.sourceLabel);
      if (evidence.id.startsWith("sf-")) assert.ok(sourceIds.has(evidence.id));
    }
  }

  assert.ok(
    model.providerContracts.some(
      (contract) =>
        contract.provider === "Slack" &&
        contract.title.includes("files.upload"),
    ),
  );
  assert.ok(
    model.providerContracts.some(
      (contract) =>
        contract.provider === "Google Sheets" &&
        contract.use.includes("HTTP 429"),
    ),
  );
  assert.equal(model.mappingRelease.cases.length, 6);
  assert.equal(
    model.mappingRelease.cases.filter(
      (testCase) => testCase.provenance === "Sample data",
    ).length,
    2,
  );
});
