import assert from "node:assert/strict";
import test from "node:test";
import {
  dependency,
  evaluatedAt,
  executionEvent,
  fingerprint,
  loadExposureEngine,
} from "./load-exposure-engine.mjs";

async function assess(dependencyOverrides = {}, events = []) {
  const { evaluateExposureDecision } = await loadExposureEngine();
  return evaluateExposureDecision({
    incidentId: "inc-1",
    fingerprint: fingerprint(),
    dependencies: [dependency(dependencyOverrides)],
    events,
    evaluatedAt,
  }).tenantAssessments[0];
}

test("golden matrix distinguishes observed, exposed, excluded, and uncertain paths", async () => {
  assert.equal((await assess({}, [executionEvent()])).state, "Affected");
  assert.equal((await assess()).state, "Exposed");
  assert.equal(
    (await assess({ connectorVersion: "slack-4.4.0" })).state,
    "Not exposed",
  );
  assert.equal((await assess({ enabled: false })).state, "Not exposed");
  assert.equal(
    (await assess({ capabilities: ["message_delivery"], endpoints: ["chat.postMessage"] })).state,
    "Not exposed",
  );
  assert.equal(
    (await assess({ lastVerifiedAt: "2026-06-01T00:00:00.000Z" })).state,
    "Needs review",
  );
  assert.equal(
    (await assess({ connectorVersion: "unknown" })).state,
    "Needs review",
  );
  assert.equal((await assess({ provider: "Teams" })).state, "Not exposed");
});

test("same-tenant membership alone cannot produce Affected", async () => {
  const result = await assess(
    { capabilities: ["message_delivery"], endpoints: ["chat.postMessage"] },
    [executionEvent({ dependencyId: "another-path" })],
  );
  assert.equal(result.state, "Not exposed");
  assert.doesNotMatch(result.decisionReason, /directly observed/i);
});

test("direct execution evidence preserves historical impact after containment", async () => {
  assert.equal(
    (await assess({ enabled: false }, [executionEvent()])).state,
    "Affected",
  );
  assert.equal(
    (
      await assess(
        { lastVerifiedAt: "2026-06-01T00:00:00.000Z" },
        [executionEvent()],
      )
    ).state,
    "Affected",
  );
});

test("conflicting event and registry identity requires review", async () => {
  const result = await assess({ provider: "Salesforce" }, [executionEvent()]);
  assert.equal(result.state, "Needs review");
  assert.match(result.decisionReason, /disagree/);
});
