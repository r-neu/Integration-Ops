import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import {
  dependency,
  evaluatedAt,
  fingerprint,
  loadExposureEngine,
} from "./load-exposure-engine.mjs";

test("evaluates a 10,000-path fleet within the demo service budget", async () => {
  const { evaluateExposureDecision } = await loadExposureEngine();
  const dependencies = Array.from({ length: 10_000 }, (_, index) =>
    dependency({
      id: `dep-${String(index).padStart(5, "0")}`,
      tenantId: `tenant-${Math.floor(index / 2)}`,
      tenantName: `Tenant ${Math.floor(index / 2)}`,
      workflowId: `flow-${index}`,
      capabilities: index % 4 === 0 ? ["file_upload"] : ["message_delivery"],
      endpoints: index % 4 === 0 ? ["files.upload"] : ["chat.postMessage"],
    }),
  );
  const startedAt = performance.now();
  const decision = evaluateExposureDecision({
    incidentId: "inc-1",
    fingerprint: fingerprint(),
    dependencies,
    events: [],
    evaluatedAt,
  });
  const durationMs = performance.now() - startedAt;

  assert.equal(decision.tenantAssessments.length, 5_000);
  assert.ok(durationMs < 5_000, `expected under 5000ms, received ${durationMs.toFixed(1)}ms`);
});
