import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const port = 3219;
const tenantId = "tenant-easy-spaces";

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/access`);
      if (response.ok) return;
    } catch {
      // The local worker is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Acceptance server did not start within 30 seconds.");
}

async function createSession(
  baseUrl,
  role,
  {
    customerId = null,
    previousCookie = null,
    mode = "role",
    freshRun = false,
  } = {},
) {
  const response = await fetch(`${baseUrl}/api/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(previousCookie ? { Cookie: previousCookie } : {}),
    },
    body: JSON.stringify({ role, customerId, mode, freshRun }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const body = await response.json();
  return { cookie, session: body.session };
}

async function getWorkspace(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/workspace`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function action(baseUrl, cookie, body, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      ...body,
      commandId: body.commandId ?? crypto.randomUUID(),
    }),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    expectedStatus,
    `action ${body.action} on ${body.targetId}: ${result.error ?? "unexpected status"}`,
  );
  return result;
}

async function tick(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/scenario/tick`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  return response.json();
}

function incident(snapshot, id) {
  return snapshot.incidents.find((item) => item.id === id);
}

async function playToResolved(baseUrl, cookie, id) {
  let snapshot = await getWorkspace(baseUrl, cookie);
  for (let index = 0; index < 6; index += 1) {
    if (incident(snapshot, id).status === "Resolved") return snapshot;
    snapshot = await action(baseUrl, cookie, {
      action: "run_guided_step",
      targetId: id,
      expectedUpdatedAt: incident(snapshot, id).updatedAt,
    });
  }
  assert.fail(`${id} did not resolve within the guided event budget`);
}

test("isolates demo runs, enforces ownership, and plays all recovery paths", async () => {
  const externalBaseUrl = process.env.TEST_BASE_URL;
  const baseUrl = externalBaseUrl ?? `http://localhost:${port}`;
  const server = externalBaseUrl
    ? null
    : spawn(
        process.execPath,
        [
          path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
          "dev",
          "--config",
          "dist/server/wrangler.json",
          "--ip",
          "127.0.0.1",
          "--port",
          String(port),
          "--persist-to",
          ".wrangler/state-test",
        ],
        {
          cwd: projectRoot,
          env: {
            ...process.env,
            WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
            WRANGLER_REGISTRY_PATH: path.join(
              projectRoot,
              ".wrangler",
              "registry-test",
            ),
            MINIFLARE_STATE_PATH: ".wrangler/state-test",
            CI: "true",
          },
          stdio: "ignore",
        },
      );

  try {
    await waitForServer(baseUrl);

    const support = await createSession(baseUrl, "support");
    const customer = await createSession(baseUrl, "customer", {
      customerId: tenantId,
      previousCookie: support.cookie,
    });
    assert.equal(customer.session.runId, support.session.runId);
    const customerWorkspace = await getWorkspace(baseUrl, customer.cookie);
    assert.deepEqual(
      customerWorkspace.incidents.map((item) => item.type).sort(),
      ["authentication", "data_quality", "provider_change"],
    );
    assert.deepEqual(customerWorkspace.traces, {});
    assert.equal(customerWorkspace.accounts.length, 0);
    assert.equal(customerWorkspace.mappings.length, 0);
    assert.equal(customerWorkspace.fleetTenants.length, 0);
    assert.equal(customerWorkspace.executionEvents.length, 0);
    assert.deepEqual(customerWorkspace.customerCommunications, []);
    assert.deepEqual(customerWorkspace.exposureDecisions, {});
    assert.deepEqual(customerWorkspace.exposureDecisionHistory, {});

    await action(
      baseUrl,
      customer.cookie,
      { action: "reset_demo", targetId: "workspace" },
      403,
    );
    await action(
      baseUrl,
      customer.cookie,
      { action: "run_guided_step", targetId: "inc-data-001" },
      403,
    );
    await action(
      baseUrl,
      customer.cookie,
      { action: "publish_mapping", targetId: "inc-map-001" },
      403,
    );
    await action(
      baseUrl,
      customer.cookie,
      {
        action: "refresh_dependency_evidence",
        targetId: "dep-harbor-slack-digest",
      },
      403,
    );

    const validating = await action(baseUrl, customer.cookie, {
      action: "approve_source_fix",
      targetId: "inc-data-001",
      payload: { sourcePolicyId: "default-no-reservation-not-started-v1" },
    });
    assert.equal(incident(validating, "inc-data-001").status, "Validating");
    assert.equal(incident(validating, "inc-data-001").owner, "System");
    assert.ok(
      validating.evidence["inc-data-001"].every(
        (record) => record.rawValue === "Not Started",
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 2600));
    const readOnlyWorkspace = await getWorkspace(baseUrl, customer.cookie);
    assert.equal(incident(readOnlyWorkspace, "inc-data-001").status, "Validating");

    const engineer = await createSession(baseUrl, "engineer", {
      previousCookie: customer.cookie,
    });
    assert.equal(engineer.session.runId, customer.session.runId);
    const engineerWorkspace = await getWorkspace(baseUrl, engineer.cookie);
    for (const tenantId of ["tenant-northstar-health", "tenant-brightline-labs"]) {
      const lastHealthCheck = engineerWorkspace.fleetRelease.targets.find(
        (tenant) => tenant.id === tenantId,
      ).lastHealthCheck;
      assert.ok(Number.isFinite(Date.parse(lastHealthCheck)));
      assert.ok(Math.abs(Date.now() - Date.parse(lastHealthCheck)) < 2 * 60 * 60 * 1000);
    }
    assert.equal("exposedTenants" in engineerWorkspace.fleetMetrics, false);
    assert.equal(engineerWorkspace.supportTasks[0].slaStatus, "On track");
    assert.equal(engineerWorkspace.fleetIncident.responseSlaStatus, "Due soon");
    assert.ok(Object.keys(engineerWorkspace.traces).length >= 5);
    assert.equal(engineerWorkspace.fleetTenants.length, 4);
    assert.equal(engineerWorkspace.connectorDependencies.length, 5);
    assert.equal(engineerWorkspace.executionEvents.length, 5);
    assert.equal(
      engineerWorkspace.recoveryPlans["inc-data-001"].accountableOwner,
      "Customer admin",
    );
    assert.equal(
      engineerWorkspace.recoveryPlans["inc-data-001"].decisionStages.find(
        (stage) => stage.id === "owner",
      ).status,
      "Completed",
    );
    const persistedDecision = engineerWorkspace.exposureDecisions["inc-api-001"];
    assert.match(persistedDecision.decisionId, /^decision-inc-api-001-/);
    assert.equal(persistedDecision.policyVersion, "exposure-policy-v2");
    assert.equal(persistedDecision.tenantAssessments.length, 4);
    assert.equal(
      engineerWorkspace.recoveryPlans["inc-api-001"].blastRadius,
      "Connector fleet",
    );
    await action(
      baseUrl,
      engineer.cookie,
      {
        action: "publish_mapping",
        targetId: "inc-map-001",
        payload: { transform: "Keep Draft as-is" },
      },
      422,
    );
    const mappingPublished = await action(baseUrl, engineer.cookie, {
      action: "publish_mapping",
      targetId: "inc-map-001",
      payload: { transform: "Map Draft to Planning" },
    });
    assert.equal(incident(mappingPublished, "inc-map-001").mappingVersion, "v6.1");
    assert.ok(mappingPublished.mappingRelease.cases.every((item) => item.result === "Pass"));
    assert.equal(
      mappingPublished.exposureDecisions["inc-api-001"].decisionId,
      persistedDecision.decisionId,
    );
    assert.equal(
      mappingPublished.exposureDecisionHistory["inc-api-001"].length,
      1,
    );

    const evidenceQueued = await action(baseUrl, engineer.cookie, {
      action: "refresh_dependency_evidence",
      targetId: "dep-harbor-slack-digest",
    });
    assert.equal(evidenceQueued.evidenceProbes[0].status, "Queued");
    assert.equal(
      evidenceQueued.connectorDependencies.find(
        (dependency) => dependency.id === "dep-harbor-slack-digest",
      ).metadataStatus,
      "Stale",
    );
    assert.equal(evidenceQueued.exposureDecisionHistory["inc-api-001"].length, 1);
    await new Promise((resolve) => setTimeout(resolve, 2600));
    const evidenceRunning = await tick(baseUrl, engineer.cookie);
    assert.equal(evidenceRunning.evidenceProbes[0].status, "Running");
    assert.equal(evidenceRunning.exposureDecisionHistory["inc-api-001"].length, 1);
    await new Promise((resolve) => setTimeout(resolve, 2600));
    const evidenceRefreshed = await tick(baseUrl, engineer.cookie);
    const refreshedDependency = evidenceRefreshed.connectorDependencies.find(
      (dependency) => dependency.id === "dep-harbor-slack-digest",
    );
    assert.equal(refreshedDependency.metadataStatus, "Verified");
    assert.ok(refreshedDependency.endpoints.includes("files.upload"));
    assert.equal(
      evidenceRefreshed.exposureDecisionHistory["inc-api-001"].length,
      2,
    );
    assert.equal(
      evidenceRefreshed.exposureDecisionHistory["inc-api-001"][0].decisionId,
      persistedDecision.decisionId,
    );
    assert.equal(
      evidenceRefreshed.exposureDecisions["inc-api-001"].evaluationMode,
      "Evidence refresh",
    );
    assert.notEqual(
      evidenceRefreshed.exposureDecisions["inc-api-001"].decisionId,
      persistedDecision.decisionId,
    );
    assert.equal(evidenceRefreshed.fleetMetrics.needsReviewTenants, 0);
    assert.equal(evidenceRefreshed.fleetMetrics.atRiskTenants, 3);
    assert.ok(
      evidenceRefreshed.activity.some(
        (item) => item.action === "Completed dependency evidence probe",
      ),
    );
    assert.equal(
      evidenceRefreshed.fleetRelease.targets.find(
        (tenant) => tenant.id === "tenant-harbor-retail",
      ).rolloutStatus,
      "Pending",
    );
    const latestPlan = evidenceRefreshed.recoveryPlans["inc-api-001"];
    const targetIds = new Set(
      evidenceRefreshed.fleetRelease.targets.map((tenant) => tenant.id),
    );
    assert.ok(
      [...latestPlan.affectedTenantIds, ...latestPlan.exposedTenantIds].every(
        (tenantId) => targetIds.has(tenantId),
      ),
    );
    await action(
      baseUrl,
      engineer.cookie,
      {
        action: "refresh_dependency_evidence",
        targetId: "dep-harbor-slack-digest",
      },
      409,
    );

    const patchTested = await action(baseUrl, engineer.cookie, {
      action: "test_connector_patch",
      targetId: "inc-api-001",
    });
    const canaryDeployed = await action(baseUrl, engineer.cookie, {
      action: "deploy_connector_patch",
      targetId: "inc-api-001",
      expectedUpdatedAt: incident(patchTested, "inc-api-001").updatedAt,
    });
    const rolledBack = await action(baseUrl, engineer.cookie, {
      action: "rollback_fleet_release",
      targetId: canaryDeployed.fleetRelease.id,
      expectedUpdatedAt: canaryDeployed.fleetRelease.updatedAt,
      payload: {
        rollbackReason:
          "Canary health regressed after deployment; stop promotion for review.",
      },
    });
    assert.equal(rolledBack.fleetRelease.status, "Rolled back");
    assert.equal(
      rolledBack.fleetRelease.targets.find(
        (tenant) => tenant.cohort === "Canary",
      ).activeConnectorVersion,
      "slack-4.3.1-text-only",
    );
    assert.equal(
      rolledBack.fleetRelease.targets.find(
        (tenant) => tenant.cohort === "Early access",
      ).activeConnectorVersion,
      "slack-4.3.0",
    );
    assert.equal(rolledBack.fleetMetrics.rollbacks, 1);

    const supportAgain = await createSession(baseUrl, "support", {
      previousCookie: engineer.cookie,
    });
    await action(
      baseUrl,
      supportAgain.cookie,
      { action: "acknowledge_incident", targetId: "inc-auth-001" },
      403,
    );
    await action(
      baseUrl,
      supportAgain.cookie,
      {
        action: "refresh_dependency_evidence",
        targetId: "dep-harbor-slack-digest",
      },
      403,
    );
    const fleetAcknowledged = await action(baseUrl, supportAgain.cookie, {
      action: "acknowledge_fleet_incident",
      targetId: "fleet-incident-slack-upload-001",
    });
    assert.ok(fleetAcknowledged.fleetIncident.acknowledgedAt);
    const unassignedTask = fleetAcknowledged.supportTasks.find(
      (task) => task.incidentId === "inc-api-001",
    );
    assert.equal(unassignedTask.status, "Update due");
    assert.equal(unassignedTask.assignee, null);
    const taskAccepted = await action(baseUrl, supportAgain.cookie, {
      action: "acknowledge_incident",
      targetId: "inc-api-001",
      expectedTaskUpdatedAt: unassignedTask.updatedAt,
    });
    const acceptedTask = taskAccepted.supportTasks.find(
      (task) => task.incidentId === "inc-api-001",
    );
    assert.equal(acceptedTask.status, "Update due");
    await action(
      baseUrl,
      supportAgain.cookie,
      {
        action: "acknowledge_incident",
        targetId: "inc-api-001",
        expectedTaskUpdatedAt: unassignedTask.updatedAt,
      },
      409,
    );
    const customerUpdated = await action(baseUrl, supportAgain.cookie, {
      action: "send_customer_update",
      targetId: "inc-api-001",
      expectedTaskUpdatedAt: acceptedTask.updatedAt,
      payload: {
        customerMessage:
          "The fallback Slack connector restored report delivery. The v4.4.0 defect remains under Engineering review.",
        customerImpact:
          "The scheduled Slack risk digest briefly failed to attach its report file.",
        customerAction: "No customer action is required.",
      },
    });
    assert.equal(
      customerUpdated.fleetIncident.communications.find(
        (item) => item.tenantId === tenantId,
      ).status,
      "Resolved",
    );
    assert.equal(customerUpdated.customerCommunications[0].kind, "Containment update");
    assert.equal(customerUpdated.customerCommunications[0].nextUpdateBy, null);
    assert.match(customerUpdated.customerCommunications[0].impact, /Slack/);
    assert.equal(
      customerUpdated.fleetIncident.communications.find(
        (item) => item.tenantId === "tenant-northstar-health",
      ).requirement,
      "Monitor only",
    );
    await action(
      baseUrl,
      supportAgain.cookie,
      {
        action: "acknowledge_incident",
        targetId: "inc-api-001",
        expectedUpdatedAt: incident(customerUpdated, "inc-api-001").updatedAt,
      },
      409,
    );
    const acknowledgedWorkspace = await getWorkspace(baseUrl, supportAgain.cookie);
    assert.equal(
      acknowledgedWorkspace.activity.filter(
        (item) =>
          item.incidentId === "inc-api-001" &&
          item.action === "Sent containment update",
      ).length,
      1,
    );

    const guidedA = await createSession(baseUrl, "support", {
      mode: "guided",
      previousCookie: supportAgain.cookie,
      freshRun: true,
    });
    assert.notEqual(guidedA.session.runId, supportAgain.session.runId);
    const guidedB = await createSession(baseUrl, "support", { mode: "guided" });
    assert.notEqual(guidedA.session.runId, guidedB.session.runId);
    let snapshotA = await action(baseUrl, guidedA.cookie, {
      action: "run_guided_step",
      targetId: "inc-rate-001",
    });
    const snapshotB = await getWorkspace(baseUrl, guidedB.cookie);
    assert.equal(incident(snapshotA, "inc-rate-001").status, "Running");
    assert.equal(incident(snapshotB, "inc-rate-001").status, "Backoff scheduled");

    await action(baseUrl, guidedB.cookie, {
      action: "run_guided_step",
      targetId: "inc-data-001",
    });
    await action(baseUrl, guidedA.cookie, {
      action: "reset_demo",
      targetId: "workspace",
    });
    assert.equal(
      incident(await getWorkspace(baseUrl, guidedB.cookie), "inc-data-001").status,
      "Validating",
    );

    const slackFirstEvent = await action(baseUrl, guidedA.cookie, {
      action: "run_guided_step",
      targetId: "inc-api-001",
    });
    assert.equal(incident(slackFirstEvent, "inc-api-001").status, "Awaiting engineering");
    assert.ok(
      slackFirstEvent.activity.some(
        (item) =>
          item.incidentId === "inc-api-001" && item.action === "Sent customer update",
      ),
    );
    assert.equal(slackFirstEvent.customerCommunications[0].kind, "Progress update");
    assert.ok(slackFirstEvent.customerCommunications[0].nextUpdateBy);

    for (const id of [
      "inc-data-001",
      "inc-auth-001",
      "inc-map-001",
      "inc-rate-001",
      "inc-api-001",
    ]) {
      snapshotA = await playToResolved(baseUrl, guidedA.cookie, id);
      assert.equal(incident(snapshotA, id).status, "Resolved");
    }
    assert.equal(snapshotA.incidents.filter((item) => item.status === "Resolved").length, 5);
    const retries = snapshotA.jobs.filter((job) => job.retryOf);
    assert.ok(retries.length >= 5);
    assert.equal(
      new Set(retries.map((job) => job.idempotencyKey)).size,
      retries.length,
    );
    assert.ok(snapshotA.insights.humanActionsCompleted >= 4);
    assert.ok(snapshotA.insights.systemTransitionsCompleted >= 5);
    assert.equal(snapshotA.insights.decisionMetrics.resolvedIncidents, 5);
    assert.ok(snapshotA.insights.decisionMetrics.medianTimeToResolveMinutes > 0);
    assert.equal(snapshotA.insights.decisionMetrics.multiRolePathsObserved, 1);
    assert.equal(snapshotA.insights.decisionMetrics.systemManagedPaths, 1);
    assert.equal(snapshotA.insights.decisionMetrics.totalDecisionPaths, 5);
    assert.equal(snapshotA.insights.decisionMetrics.boundedScopeDecisions, 4);
    assert.equal(snapshotA.insights.decisionMetrics.excludedFleetPaths, 1);
    assert.ok(snapshotA.quarantine.every((record) => record.status === "Replayed"));
    assert.equal(snapshotA.fleetRelease.status, "Canary passed");

    snapshotA = await action(baseUrl, guidedA.cookie, {
      action: "refresh_dependency_evidence",
      targetId: "dep-harbor-slack-digest",
    });
    assert.equal(snapshotA.evidenceProbes[0].status, "Queued");
    snapshotA = await action(baseUrl, guidedA.cookie, {
      action: "run_guided_release_step",
      targetId: snapshotA.fleetRelease.id,
      expectedUpdatedAt: snapshotA.fleetRelease.updatedAt,
    });
    assert.equal(snapshotA.evidenceProbes[0].status, "Running");
    snapshotA = await action(baseUrl, guidedA.cookie, {
      action: "run_guided_release_step",
      targetId: snapshotA.fleetRelease.id,
      expectedUpdatedAt: snapshotA.fleetRelease.updatedAt,
    });
    assert.equal(snapshotA.evidenceProbes[0].status, "Succeeded");

    for (let index = 0; index < 6; index += 1) {
      snapshotA = await action(baseUrl, guidedA.cookie, {
        action: "run_guided_release_step",
        targetId: snapshotA.fleetRelease.id,
        expectedUpdatedAt: snapshotA.fleetRelease.updatedAt,
      });
    }
    assert.equal(snapshotA.fleetRelease.status, "Completed");
    assert.ok(
      snapshotA.fleetRelease.targets.every(
        (tenant) =>
          tenant.activeConnectorVersion === "slack-4.4.0" &&
          tenant.rolloutStatus === "Healthy",
      ),
    );
    assert.equal(snapshotA.fleetMetrics.completedRollouts, 1);
    assert.equal(snapshotA.fleetRelease.healthEvidence.length, 6);
    assert.ok(snapshotA.insights.decisionMetrics.medianTimeToResolveMinutes < 240);
    const recoveryMetricBeforeResolutionUpdate =
      snapshotA.insights.decisionMetrics.medianTimeToResolveMinutes;
    assert.ok(
      snapshotA.fleetRelease.healthEvidence.every(
        (evidence) => evidence.status === "Passed",
      ),
    );
    assert.equal(
      new Set(
        snapshotA.fleetRelease.healthEvidence.map(
          (evidence) => evidence.evaluatedAt,
        ),
      ).size,
      6,
    );
    assert.deepEqual(
      snapshotA.fleetRelease.healthEvidence.map((evidence) => [
        evidence.cohort,
        evidence.runNumber,
      ]),
      [
        ["Canary", 1],
        ["Canary", 2],
        ["Early access", 1],
        ["Early access", 2],
        ["Stable", 1],
        ["Stable", 2],
      ],
    );

    const resolvedSupport = await createSession(baseUrl, "support", {
      previousCookie: guidedA.cookie,
    });
    await action(
      baseUrl,
      resolvedSupport.cookie,
      { action: "acknowledge_incident", targetId: "inc-api-001" },
      409,
    );
    await action(baseUrl, resolvedSupport.cookie, {
      action: "send_customer_update",
      targetId: "inc-api-001",
      payload: {
        customerMessage:
          "Slack connector recovery is complete across all release cohorts. No customer action is required.",
        customerImpact: "All Slack report delivery cohorts are healthy.",
        customerAction: "No customer action is required.",
      },
    });
    await action(
      baseUrl,
      resolvedSupport.cookie,
      {
        action: "send_customer_update",
        targetId: "inc-api-001",
        payload: {
          customerMessage:
            "Slack connector recovery is complete across all release cohorts. No customer action is required.",
          customerImpact: "All Slack report delivery cohorts are healthy.",
          customerAction: "No customer action is required.",
        },
      },
      409,
    );
    const resolutionWorkspace = await getWorkspace(
      baseUrl,
      resolvedSupport.cookie,
    );
    assert.equal(
      resolutionWorkspace.activity.filter(
        (item) =>
          item.incidentId === "inc-api-001" &&
          item.action === "Sent resolution update",
      ).length,
      1,
    );
    assert.equal(
      resolutionWorkspace.insights.decisionMetrics.medianTimeToResolveMinutes,
      recoveryMetricBeforeResolutionUpdate,
    );

    const exceptionCustomer = await createSession(baseUrl, "customer", {
      customerId: tenantId,
    });
    const exceptionStart = await getWorkspace(baseUrl, exceptionCustomer.cookie);
    const exceptionValidating = await action(baseUrl, exceptionCustomer.cookie, {
      action: "decline_source_fix",
      targetId: "inc-data-001",
      expectedUpdatedAt: incident(exceptionStart, "inc-data-001").updatedAt,
      payload: { sourcePolicyId: "keep-blank-records-quarantined-v1" },
    });
    assert.equal(incident(exceptionValidating, "inc-data-001").status, "Validating");
    await new Promise((resolve) => setTimeout(resolve, 2_600));
    const exceptionResolved = await tick(baseUrl, exceptionCustomer.cookie);
    assert.equal(incident(exceptionResolved, "inc-data-001").status, "Contained");
    assert.equal(
      incident(exceptionResolved, "inc-data-001").disposition,
      "Exception accepted",
    );
    assert.equal(
      exceptionResolved.insights.decisionMetrics.containedIncidents,
      1,
    );
    assert.equal(
      exceptionResolved.insights.decisionMetrics.resolvedIncidents,
      0,
    );
    assert.ok(
      exceptionResolved.quarantine.every((record) => record.status === "Quarantined"),
    );
    assert.ok(
      exceptionResolved.activity.some(
        (item) => item.action === "Validated source policy exception",
      ),
    );
    assert.equal(incident(exceptionResolved, "inc-data-001").owner, "Customer admin");
    const exceptionRemediation = exceptionResolved.remediationTasks.find(
      (task) => task.incidentId === "inc-data-001",
    );
    assert.equal(exceptionRemediation.status, "Open");
    assert.equal(exceptionRemediation.disposition, "Exception accepted");
    assert.equal(exceptionRemediation.ownerLabel, "Easy Spaces admin");
    assert.ok(
      Date.parse(exceptionRemediation.dueAt) >
        Date.parse(exceptionRemediation.createdAt),
    );
    assert.equal(
      exceptionResolved.recoveryPlans["inc-data-001"].decisionStages.find(
        (stage) => stage.id === "recovery",
      ).status,
      "Current",
    );

    const degraded = await createSession(baseUrl, "support", {
      mode: "guided",
      freshRun: true,
    });
    let degradedSnapshot = await getWorkspace(baseUrl, degraded.cookie);
    for (let index = 0; index < 3; index += 1) {
      degradedSnapshot = await action(baseUrl, degraded.cookie, {
        action: "run_guided_step",
        targetId: "inc-api-001",
        expectedUpdatedAt: incident(degradedSnapshot, "inc-api-001").updatedAt,
      });
    }
    assert.equal(incident(degradedSnapshot, "inc-api-001").status, "Monitoring");
    degradedSnapshot = await action(baseUrl, degraded.cookie, {
      action: "run_guided_degraded_canary",
      targetId: "inc-api-001",
      expectedUpdatedAt: incident(degradedSnapshot, "inc-api-001").updatedAt,
    });
    assert.equal(degradedSnapshot.fleetRelease.status, "Health gate blocked");
    assert.equal(degradedSnapshot.fleetRelease.healthEvidence[0].status, "Failed");
    assert.ok(
      degradedSnapshot.fleetRelease.targets
        .filter((tenant) => tenant.cohort !== "Canary")
        .every((tenant) => tenant.activeConnectorVersion === "slack-4.3.0"),
    );
    degradedSnapshot = await action(baseUrl, degraded.cookie, {
      action: "run_guided_release_step",
      targetId: degradedSnapshot.fleetRelease.id,
      expectedUpdatedAt: degradedSnapshot.fleetRelease.updatedAt,
    });
    assert.equal(degradedSnapshot.fleetRelease.status, "Rolled back");
    assert.equal(incident(degradedSnapshot, "inc-api-001").status, "Contained");
    assert.equal(
      incident(degradedSnapshot, "inc-api-001").disposition,
      "Fallback mitigation",
    );
    assert.equal(
      incident(degradedSnapshot, "inc-api-001").owner,
      "Integration engineer",
    );
    assert.equal(degradedSnapshot.fleetIncident.status, "Mitigated");
    const fallbackRemediation = degradedSnapshot.remediationTasks.find(
      (task) => task.incidentId === "inc-api-001",
    );
    assert.equal(fallbackRemediation.status, "Open");
    assert.equal(fallbackRemediation.disposition, "Fallback mitigation");
    assert.equal(fallbackRemediation.ownerLabel, "Integration Engineering");
    const rollbackSupportTask = degradedSnapshot.supportTasks.find(
      (task) => task.incidentId === "inc-api-001",
    );
    assert.notEqual(rollbackSupportTask.slaStatus, "Breached");
    assert.ok(
      Date.parse(rollbackSupportTask.nextUpdateBy) >
        Date.parse(rollbackSupportTask.updatedAt),
    );
    await action(
      baseUrl,
      degraded.cookie,
      {
        action: "run_guided_release_step",
        targetId: degradedSnapshot.fleetRelease.id,
        expectedUpdatedAt: degradedSnapshot.fleetRelease.updatedAt,
      },
      409,
    );
    await action(
      baseUrl,
      degraded.cookie,
      {
        action: "refresh_dependency_evidence",
        targetId: "dep-harbor-slack-digest",
      },
      409,
    );

    assert.equal((await fetch(`${baseUrl}/portal`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/fleet`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/policy`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/jobs/job-data-001`)).status, 200);
    assert.equal(
      (await fetch(`${baseUrl}/customers/not-a-customer/connections`)).status,
      404,
    );
  } finally {
    if (server) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", resolve);
        setTimeout(resolve, 2_000);
      });
    }
  }
});
