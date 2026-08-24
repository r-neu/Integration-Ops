import assert from "node:assert/strict";
import test from "node:test";
import {
  dependency,
  evaluatedAt,
  fingerprint,
  loadExposureEngine,
} from "./load-exposure-engine.mjs";

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("counterexample sweep preserves core exposure invariants", async () => {
  const { evaluateExposureDecision } = await loadExposureEngine();
  const next = random(20260728);

  for (let index = 0; index < 1_500; index += 1) {
    const usesFileUpload = next() > 0.5;
    const fresh = next() > 0.2;
    const enabled = next() > 0.15;
    const version = next() > 0.5 ? "slack-4.3.0" : "slack-4.4.0";
    const path = dependency({
      id: `dep-${index}`,
      tenantId: `tenant-${index}`,
      tenantName: `Tenant ${index}`,
      workflowId: `flow-${index}`,
      enabled,
      connectorVersion: version,
      capabilities: usesFileUpload ? ["file_upload"] : ["message_delivery"],
      endpoints: usesFileUpload ? ["files.upload"] : ["chat.postMessage"],
      lastVerifiedAt: fresh
        ? "2026-07-28T15:58:00.000Z"
        : "2026-06-01T00:00:00.000Z",
    });
    const decision = evaluateExposureDecision({
      incidentId: "inc-1",
      fingerprint: fingerprint(),
      dependencies: [path],
      events: [],
      evaluatedAt,
    });
    const assessment = decision.tenantAssessments[0];

    assert.notEqual(assessment.state, "Affected");
    if (!fresh) assert.equal(assessment.state, "Needs review");
    if (fresh && !enabled) assert.equal(assessment.state, "Not exposed");
    if (fresh && enabled && version === "slack-4.4.0") {
      assert.equal(assessment.state, "Not exposed");
    }
    if (fresh && enabled && !usesFileUpload) {
      assert.equal(assessment.state, "Not exposed");
    }
  }
});

test("adding an unrelated tenant cannot change an existing tenant decision", async () => {
  const { evaluateExposureDecision } = await loadExposureEngine();
  const base = dependency();
  const input = {
    incidentId: "inc-1",
    fingerprint: fingerprint(),
    events: [],
    evaluatedAt,
  };
  const before = evaluateExposureDecision({ ...input, dependencies: [base] });
  const after = evaluateExposureDecision({
    ...input,
    dependencies: [
      base,
      dependency({
        id: "dep-unrelated",
        tenantId: "tenant-unrelated",
        tenantName: "Unrelated",
        workflowId: "flow-unrelated",
        provider: "Salesforce",
        connectorFamily: "salesforce-sync",
      }),
    ],
  });
  assert.deepEqual(after.tenantAssessments[0], before.tenantAssessments[0]);
});
