import { readFile } from "node:fs/promises";
import ts from "typescript";

let modulePromise;

export function loadExposureEngine() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const source = await readFile(
        new URL("../lib/exposure-engine.ts", import.meta.url),
        "utf8",
      );
      const semverUrl = import.meta.resolve("semver");
      const selfContained = source
        .replace(
          'import { satisfies, valid } from "semver";',
          `import semver from ${JSON.stringify(semverUrl)};\nconst { satisfies, valid } = semver;`,
        )
        .replace(/import type \{[\s\S]*?\} from "@\/lib\/types";/, "");
      const compiled = ts.transpileModule(selfContained, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
      return import(
        `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
      );
    })();
  }
  return modulePromise;
}

export function dependency(overrides = {}) {
  return {
    id: "dep-1",
    tenantId: "tenant-1",
    tenantName: "Tenant 1",
    workflowId: "flow-1",
    workflowName: "Risk digest",
    provider: "Slack",
    connectorFamily: "slack-risk-digest",
    connectorVersion: "slack-4.3.0",
    capabilities: ["file_upload", "message_delivery"],
    endpoints: ["files.upload", "chat.postMessage"],
    enabled: true,
    metadataStatus: "Verified",
    lastVerifiedAt: "2026-07-28T15:58:00.000Z",
    nextRunAt: "2026-07-28T17:00:00.000Z",
    criticality: "High",
    configRevision: "cfg-v1",
    ...overrides,
  };
}

export function fingerprint(overrides = {}) {
  return {
    incidentId: "inc-1",
    classification: "Provider capability retired",
    method: "Deterministic rule",
    ruleId: "slack-files-upload-retired",
    policyVersion: "exposure-policy-v2",
    provider: "Slack",
    connectorFamily: "slack-risk-digest",
    connectorVersion: "slack-4.3.0",
    capability: "file_upload",
    endpoint: "files.upload",
    errorCode: "method_deprecated",
    vulnerableVersionRange: "<4.4.0",
    correlationWindowMinutes: 10,
    observedAt: "2026-07-28T16:02:04.000Z",
    sourceEventIds: ["event-failed"],
    correlatedFailureCount: 1,
    correlatedTenantCount: 1,
    ...overrides,
  };
}

export function executionEvent(overrides = {}) {
  return {
    id: "event-failed",
    incidentId: "inc-1",
    tenantId: "tenant-1",
    dependencyId: "dep-1",
    provider: "Slack",
    connectorFamily: "slack-risk-digest",
    connectorVersion: "slack-4.3.0",
    capability: "file_upload",
    endpoint: "files.upload",
    errorCode: "method_deprecated",
    traceId: "trace-1",
    spanId: "span-1",
    status: "Failed",
    observedAt: "2026-07-28T16:02:04.000Z",
    ...overrides,
  };
}

export const evaluatedAt = "2026-07-28T16:07:28.000Z";
