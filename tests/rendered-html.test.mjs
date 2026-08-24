import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships separate customer and internal operating surfaces", async () => {
  const [consoleSource, views, access, portal, layout] = await Promise.all([
    readFile(
      new URL("../app/integration-ops-console.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/workspace-views.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/access/access-screen.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/portal/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  const productShell = `${consoleSource}\n${views}\n${access}\n${portal}\n${layout}`;

  assert.match(productShell, /Demo launcher/);
  assert.match(productShell, /Customer Integration Portal/);
  assert.match(productShell, /Internal Ops Console/);
  assert.match(productShell, /Easy Spaces · Integration Center/);
  assert.match(productShell, /Support admin/);
  assert.match(productShell, /Customer admin/);
  assert.match(productShell, /Integration engineer/);
  assert.match(productShell, /Data notes/);
  assert.match(productShell, /Provider trace and retry contract/);
  assert.match(productShell, /Guided review/);
  assert.match(productShell, /Apply customer correction/);
  assert.match(productShell, /Run connector tests/);
  assert.match(productShell, /Show decision evidence/);
  assert.match(productShell, /Recovery decision chain/);
  assert.match(productShell, /Fleet recovery/);
  assert.match(productShell, /Signal/);
  assert.match(productShell, /Evidence basis/);
  assert.match(productShell, /Verification/);
  assert.match(productShell, /Review fleet recovery/);
  assert.match(productShell, /blastRadius === "Connector fleet"/);
  assert.match(productShell, /Median classification latency/);
  assert.match(productShell, /System-owned paths/);
  assert.match(productShell, /Latest exposure assessment/);
  assert.match(productShell, /Refresh evidence/);
  assert.match(productShell, /Automated demo worker/);
  assert.match(productShell, /Health gate evidence/);
  assert.match(productShell, /Policy center/);
  assert.match(productShell, /Production action blocked/);
  assert.match(productShell, /Evidence available/);
  assert.match(productShell, /Provider incident/);
  assert.match(productShell, /Customer communication/);
  assert.match(productShell, /Accelerated demo clock/);
  assert.match(productShell, /Active exceptions and mitigations/);
  assert.match(productShell, /Follow-up still open/);
  assert.match(productShell, /Rollback complete/);
  assert.match(productShell, /Recently recovered/);
  assert.match(productShell, /Current recovery executor/);
  assert.match(productShell, /Needs review/);
  assert.match(productShell, /Evidence still required/);
  assert.match(productShell, /Selective replay quarantine/);
  assert.match(productShell, /Promote next cohort/);
  assert.match(productShell, /Needs Support/);
  assert.match(productShell, /row\.provenance/);
  assert.match(productShell, /og\.png/);
});

test("keeps permissions on the server and role actions distinct", async () => {
  const [actionsRoute, workspaceRoute, sessionSource, workspaceSource, consoleSource] =
    await Promise.all([
      readFile(new URL("../app/api/actions/route.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/workspace/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../db/session.ts", import.meta.url), "utf8"),
      readFile(new URL("../db/workspace.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/integration-ops-console.tsx", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(actionsRoute, /requireDemoSession/);
  assert.match(workspaceRoute, /requireDemoSession/);
  assert.match(sessionSource, /HttpOnly/);
  assert.match(sessionSource, /tenant-easy-spaces|seedTenant/);
  assert.match(workspaceSource, /approve_source_fix: "customer"/);
  assert.match(workspaceSource, /publish_mapping: "engineer"/);
  assert.match(workspaceSource, /test_connector_patch: "engineer"/);
  assert.match(workspaceSource, /promote_fleet_release: "engineer"/);
  assert.match(workspaceSource, /demo_quarantine_records/);
  assert.match(workspaceSource, /demo_release_targets/);
  assert.match(workspaceSource, /demo_attempts_idempotency_idx/);
  assert.match(workspaceSource, /demo_action_commands/);
  assert.match(workspaceSource, /demo_transition_claims/);
  assert.match(workspaceSource, /readExposureCandidates/);
  assert.match(workspaceSource, /demo_health_gate_evidence/);
  assert.match(workspaceSource, /demo_fleet_incident_state/);
  assert.match(workspaceSource, /demo_remediation_tasks/);
  assert.match(workspaceSource, /status: "Mitigated"/);
  assert.match(workspaceSource, /demo_support_tasks/);
  assert.match(workspaceSource, /session\.mode !== "guided"/);
  assert.match(workspaceSource, /demo_incident_state/);
  assert.match(workspaceSource, /run_id/);
  assert.doesNotMatch(consoleSource, /@\/lib\/demo-seed/);
  assert.doesNotMatch(actionsRoute, /body\.role/);
});

test("documents the real-data boundary and the five recovery paths", async () => {
  const [readme, dataSources, guide, architectureNotes, seed, packageJson] =
    await Promise.all([
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../data/SOURCES.md", import.meta.url), "utf8"),
      readFile(
        new URL("../docs/demo-guide.md", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../docs/architecture-notes.md", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../lib/demo-seed.ts", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
    ]);

  const docs = `${readme}\n${dataSources}\n${guide}\n${architectureNotes}`;
  assert.match(docs, /Easy Spaces/);
  assert.match(docs, /180/);
  assert.match(docs, /CC0-1\.0/);
  assert.match(docs, /Customer admin/);
  assert.match(docs, /Integration engineer/);
  assert.match(docs, /files\.upload/);
  assert.match(docs, /429/);
  assert.match(docs, /working portfolio project/i);
  assert.match(docs, /Northstar/);
  assert.match(docs, /simulated recovery events/i);
  assert.match(seed, /providerContracts/);
  assert.match(packageJson, /lucide-react/);
});
