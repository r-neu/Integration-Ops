import assert from "node:assert/strict";
import test from "node:test";
import {
  dependency,
  evaluatedAt,
  executionEvent,
  fingerprint,
  loadExposureEngine,
} from "./load-exposure-engine.mjs";

test("multiple workflow paths aggregate to one tenant using the highest-risk state", async () => {
  const { evaluateExposureDecision } = await loadExposureEngine();
  const affectedPath = dependency({ id: "dep-upload", workflowId: "flow-upload" });
  const safePath = dependency({
    id: "dep-message",
    workflowId: "flow-message",
    workflowName: "Customer alerts",
    capabilities: ["message_delivery"],
    endpoints: ["chat.postMessage"],
  });
  const decision = evaluateExposureDecision({
    incidentId: "inc-1",
    fingerprint: fingerprint(),
    dependencies: [safePath, affectedPath, affectedPath],
    events: [executionEvent({ dependencyId: affectedPath.id })],
    evaluatedAt,
  });

  assert.equal(decision.tenantAssessments.length, 1);
  assert.equal(decision.tenantAssessments[0].state, "Affected");
  assert.deepEqual(decision.tenantAssessments[0].dependencyIds, [
    "dep-message",
    "dep-upload",
  ]);
  assert.deepEqual(
    Object.fromEntries(
      decision.tenantAssessments[0].pathAssessments.map((path) => [path.dependencyId, path.state]),
    ),
    { "dep-message": "Not exposed", "dep-upload": "Affected" },
  );
});

test("one exposed path wins over safe paths without marking the tenant Affected", async () => {
  const { evaluateExposureDecision } = await loadExposureEngine();
  const decision = evaluateExposureDecision({
    incidentId: "inc-1",
    fingerprint: fingerprint(),
    dependencies: [
      dependency({ id: "dep-upload", workflowId: "flow-upload" }),
      dependency({
        id: "dep-message",
        workflowId: "flow-message",
        capabilities: ["message_delivery"],
        endpoints: ["chat.postMessage"],
      }),
    ],
    events: [],
    evaluatedAt,
  });
  assert.equal(decision.tenantAssessments[0].state, "Exposed");
});
