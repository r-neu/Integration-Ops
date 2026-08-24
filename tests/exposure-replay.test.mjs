import assert from "node:assert/strict";
import test from "node:test";
import {
  dependency,
  evaluatedAt,
  executionEvent,
  fingerprint,
  loadExposureEngine,
} from "./load-exposure-engine.mjs";

test("replaying identical evidence produces the same immutable decision identity", async () => {
  const { evaluateExposureDecision } = await loadExposureEngine();
  const dependencies = [
    dependency({ id: "dep-b", workflowId: "flow-b" }),
    dependency({ id: "dep-a", workflowId: "flow-a" }),
  ];
  const input = {
    incidentId: "inc-1",
    fingerprint: fingerprint(),
    events: [executionEvent({ dependencyId: "dep-a" })],
    evaluatedAt,
  };
  const first = evaluateExposureDecision({ ...input, dependencies });
  const replay = evaluateExposureDecision({
    ...input,
    dependencies: [...dependencies].reverse(),
  });

  assert.equal(replay.decisionId, first.decisionId);
  assert.equal(replay.inputHash, first.inputHash);
  assert.deepEqual(replay.tenantAssessments, first.tenantAssessments);
});

test("policy or configuration revisions create a new decision identity", async () => {
  const { evaluateExposureDecision } = await loadExposureEngine();
  const original = evaluateExposureDecision({
    incidentId: "inc-1",
    fingerprint: fingerprint(),
    dependencies: [dependency()],
    events: [],
    evaluatedAt,
  });
  const configChanged = evaluateExposureDecision({
    incidentId: "inc-1",
    fingerprint: fingerprint(),
    dependencies: [dependency({ configRevision: "cfg-v2" })],
    events: [],
    evaluatedAt,
  });
  const policyChanged = evaluateExposureDecision({
    incidentId: "inc-1",
    fingerprint: fingerprint({ policyVersion: "exposure-policy-v3" }),
    dependencies: [dependency()],
    events: [],
    evaluatedAt,
  });

  assert.notEqual(configChanged.decisionId, original.decisionId);
  assert.notEqual(policyChanged.decisionId, original.decisionId);
});
