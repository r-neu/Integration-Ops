import assert from "node:assert/strict";
import test from "node:test";
import {
  executionEvent,
  loadExposureEngine,
} from "./load-exposure-engine.mjs";

test("fingerprint correlation includes matching failures only inside the rule window", async () => {
  const { classifyIncidentFingerprint } = await loadExposureEngine();
  const rules = [
    {
      id: "rule-1",
      policyVersion: "exposure-policy-v2",
      provider: "Slack",
      connectorFamily: "slack-risk-digest",
      errorCodes: ["method_deprecated"],
      endpoint: "files.upload",
      capability: "file_upload",
      classification: "Provider capability retired",
      vulnerableVersionRange: "<4.4.0",
      correlationWindowMinutes: 10,
    },
  ];
  const events = [
    executionEvent(),
    executionEvent({
      id: "event-second-tenant",
      incidentId: null,
      tenantId: "tenant-2",
      dependencyId: "dep-2",
      observedAt: "2026-07-28T16:10:00.000Z",
    }),
    executionEvent({
      id: "event-too-old",
      incidentId: null,
      tenantId: "tenant-3",
      dependencyId: "dep-3",
      observedAt: "2026-07-28T15:30:00.000Z",
    }),
    executionEvent({
      id: "event-different-error",
      incidentId: null,
      tenantId: "tenant-4",
      dependencyId: "dep-4",
      errorCode: "invalid_auth",
      observedAt: "2026-07-28T16:03:00.000Z",
    }),
  ];
  const result = classifyIncidentFingerprint({
    incidentId: "inc-1",
    events,
    rules,
    evaluatedAt: "2026-07-28T16:12:00.000Z",
  });

  assert.equal(result.correlatedFailureCount, 2);
  assert.equal(result.correlatedTenantCount, 2);
  assert.deepEqual(result.sourceEventIds, ["event-failed", "event-second-tenant"]);
});

test("an unrecognized error remains unclassified", async () => {
  const { classifyIncidentFingerprint } = await loadExposureEngine();
  const result = classifyIncidentFingerprint({
    incidentId: "inc-1",
    events: [executionEvent({ errorCode: "unknown_failure" })],
    rules: [],
    evaluatedAt: "2026-07-28T16:07:28.000Z",
  });
  assert.equal(result, null);
});

test("events arriving after the decision timestamp cannot change historical scope", async () => {
  const { classifyIncidentFingerprint } = await loadExposureEngine();
  const result = classifyIncidentFingerprint({
    incidentId: "inc-1",
    events: [
      executionEvent(),
      executionEvent({
        id: "event-future",
        incidentId: null,
        tenantId: "tenant-2",
        dependencyId: "dep-2",
        observedAt: "2026-07-28T16:10:00.000Z",
      }),
    ],
    rules: [
      {
        id: "rule-1",
        policyVersion: "exposure-policy-v2",
        provider: "Slack",
        connectorFamily: "slack-risk-digest",
        errorCodes: ["method_deprecated"],
        endpoint: "files.upload",
        capability: "file_upload",
        classification: "Provider capability retired",
        vulnerableVersionRange: "<4.4.0",
        correlationWindowMinutes: 10,
      },
    ],
    evaluatedAt: "2026-07-28T16:07:28.000Z",
  });
  assert.equal(result.correlatedFailureCount, 1);
  assert.deepEqual(result.sourceEventIds, ["event-failed"]);
});
