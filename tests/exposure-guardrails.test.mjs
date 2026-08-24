import assert from "node:assert/strict";
import test from "node:test";
import {
  dependency,
  evaluatedAt,
  fingerprint,
  loadExposureEngine,
} from "./load-exposure-engine.mjs";

test("uncertain metadata cannot authorize an automated production change", async () => {
  const { evaluateExposureDecision } = await loadExposureEngine();
  const uncertain = [
    dependency({ lastVerifiedAt: "2026-06-01T00:00:00.000Z" }),
    dependency({
      id: "dep-invalid-version",
      workflowId: "flow-invalid-version",
      connectorVersion: "latest",
    }),
  ];
  const decision = evaluateExposureDecision({
    incidentId: "inc-1",
    fingerprint: fingerprint(),
    dependencies: uncertain,
    events: [],
    evaluatedAt,
  });

  assert.equal(decision.tenantAssessments[0].state, "Needs review");
  assert.match(decision.tenantAssessments[0].recommendedAction, /do not change production state/i);
  assert.ok(decision.tenantAssessments[0].missingEvidence.length > 0);
});

test("future-dated verification metadata is treated as unknown", async () => {
  const { evaluateExposureDecision } = await loadExposureEngine();
  const decision = evaluateExposureDecision({
    incidentId: "inc-1",
    fingerprint: fingerprint(),
    dependencies: [dependency({ lastVerifiedAt: "2026-07-29T00:00:00.000Z" })],
    events: [],
    evaluatedAt,
  });
  assert.equal(decision.tenantAssessments[0].state, "Needs review");
  assert.equal(
    decision.tenantAssessments[0].pathAssessments[0].metadataFreshness,
    "Unknown",
  );
});

test("conflicting registry rows cannot be silently deduplicated", async () => {
  const { evaluateExposureDecision } = await loadExposureEngine();
  assert.throws(
    () =>
      evaluateExposureDecision({
        incidentId: "inc-1",
        fingerprint: fingerprint(),
        dependencies: [dependency(), dependency({ endpoints: ["chat.postMessage"] })],
        events: [],
        evaluatedAt,
      }),
    /Conflicting dependency records/,
  );
});
