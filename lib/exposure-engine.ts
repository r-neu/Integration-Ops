import { satisfies, valid } from "semver";
import type {
  ConnectorDependency,
  DependencyExposureAssessment,
  DiagnosisConfidence,
  ExposureAssessment,
  ExposureDecision,
  ExposureState,
  IncidentFingerprint,
  IncidentSignatureRule,
  RawExecutionEvent,
} from "@/lib/types";

export const EXPOSURE_POLICY_VERSION = "exposure-policy-v2";
export const DEPENDENCY_FRESHNESS_DAYS = 14;

const statePriority: Record<ExposureState, number> = {
  Affected: 4,
  Exposed: 3,
  "Needs review": 2,
  "Not exposed": 1,
};

const criticalityPriority: Record<ConnectorDependency["criticality"], number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

function normalizedToken(value: string) {
  return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function normalizedEndpoint(value: string) {
  return value
    .trim()
    .split("?", 1)[0]
    .replace(/^https?:\/\/[^/]+\//i, "")
    .replace(/^\/+/, "")
    .toLowerCase();
}

function normalizedVersion(value: string) {
  const match = value.trim().match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  if (!match) return null;
  return valid(match[1], { loose: false });
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function stableHash(value: unknown) {
  const input = JSON.stringify(canonicalValue(value));
  let hash = BigInt("14695981039346656037");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * BigInt("1099511628211"));
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function dateValue(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function withinWindow(value: string, anchor: string, windowMinutes: number) {
  const candidate = dateValue(value);
  const center = dateValue(anchor);
  if (candidate === null || center === null) return false;
  return Math.abs(candidate - center) <= windowMinutes * 60_000;
}

function metadataFreshness(
  dependency: ConnectorDependency,
  evaluatedAt: string,
): DependencyExposureAssessment["metadataFreshness"] {
  const verified = dateValue(dependency.lastVerifiedAt);
  const evaluated = dateValue(evaluatedAt);
  if (verified === null || evaluated === null || verified > evaluated) return "Unknown";
  const ageDays = (evaluated - verified) / 86_400_000;
  return ageDays <= DEPENDENCY_FRESHNESS_DAYS ? "Fresh" : "Stale";
}

function eventMatchesRule(
  event: RawExecutionEvent,
  rule: IncidentSignatureRule,
) {
  return (
    normalizedToken(event.provider) === normalizedToken(rule.provider) &&
    normalizedToken(event.connectorFamily) ===
      normalizedToken(rule.connectorFamily) &&
    normalizedEndpoint(event.endpoint) === normalizedEndpoint(rule.endpoint) &&
    Boolean(
      event.errorCode &&
        rule.errorCodes
          .map(normalizedToken)
          .includes(normalizedToken(event.errorCode)),
    )
  );
}

export function classifyIncidentFingerprint({
  incidentId,
  events,
  rules,
  evaluatedAt,
}: {
  incidentId: string;
  events: RawExecutionEvent[];
  rules: IncidentSignatureRule[];
  evaluatedAt: string;
}): IncidentFingerprint | null {
  const observed = events
    .filter(
      (event) =>
        event.incidentId === incidentId &&
        event.status === "Failed" &&
        event.observedAt <= evaluatedAt,
    )
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt))[0];
  if (!observed) return null;

  const rule = rules.find((candidate) => eventMatchesRule(observed, candidate));
  if (!rule) return null;

  const correlated = events.filter(
    (event) =>
      event.status === "Failed" &&
      event.observedAt <= evaluatedAt &&
      eventMatchesRule(event, rule) &&
      withinWindow(
        event.observedAt,
        observed.observedAt,
        rule.correlationWindowMinutes,
      ),
  );

  return {
    incidentId,
    classification: rule.classification,
    method: "Deterministic rule",
    ruleId: rule.id,
    policyVersion: rule.policyVersion,
    provider: rule.provider,
    connectorFamily: rule.connectorFamily,
    connectorVersion: observed.connectorVersion,
    capability: rule.capability,
    endpoint: rule.endpoint,
    errorCode: observed.errorCode ?? "unknown",
    vulnerableVersionRange: rule.vulnerableVersionRange,
    correlationWindowMinutes: rule.correlationWindowMinutes,
    observedAt: observed.observedAt,
    sourceEventIds: correlated.map((event) => event.id).sort(),
    correlatedFailureCount: correlated.length,
    correlatedTenantCount: new Set(correlated.map((event) => event.tenantId)).size,
  };
}

export function dependencySnapshotVersion(
  dependencies: ConnectorDependency[],
) {
  return stableHash(
    dependencies
      .map((dependency) => ({ ...dependency }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  ).replace("fnv1a64:", "deps-");
}

function pathAssessment({
  dependency,
  fingerprint,
  events,
  evaluatedAt,
}: {
  dependency: ConnectorDependency;
  fingerprint: IncidentFingerprint;
  events: RawExecutionEvent[];
  evaluatedAt: string;
}): DependencyExposureAssessment {
  const providerMatch =
    normalizedToken(dependency.provider) === normalizedToken(fingerprint.provider);
  const connectorMatch =
    normalizedToken(dependency.connectorFamily) ===
    normalizedToken(fingerprint.connectorFamily);
  const capabilityMatch = dependency.capabilities
    .map(normalizedToken)
    .includes(normalizedToken(fingerprint.capability));
  const endpointMatch = dependency.endpoints
    .map(normalizedEndpoint)
    .includes(normalizedEndpoint(fingerprint.endpoint));
  const parsedVersion = normalizedVersion(dependency.connectorVersion);
  const versionMatch = Boolean(
    parsedVersion &&
      satisfies(parsedVersion, fingerprint.vulnerableVersionRange, {
        includePrerelease: true,
      }),
  );
  const freshness = metadataFreshness(dependency, evaluatedAt);
  const matchingFailure = events.find(
    (event) => {
      const eventVersion = normalizedVersion(event.connectorVersion);
      return (
        event.dependencyId === dependency.id &&
        event.status === "Failed" &&
        event.observedAt <= evaluatedAt &&
        normalizedToken(event.provider) === normalizedToken(fingerprint.provider) &&
        normalizedToken(event.connectorFamily) ===
          normalizedToken(fingerprint.connectorFamily) &&
        normalizedToken(event.capability) === normalizedToken(fingerprint.capability) &&
        normalizedEndpoint(event.endpoint) === normalizedEndpoint(fingerprint.endpoint) &&
        normalizedToken(event.errorCode ?? "") ===
          normalizedToken(fingerprint.errorCode) &&
        Boolean(
          eventVersion &&
            satisfies(eventVersion, fingerprint.vulnerableVersionRange, {
              includePrerelease: true,
            }),
        ) &&
        withinWindow(
          event.observedAt,
          fingerprint.observedAt,
          fingerprint.correlationWindowMinutes,
        )
      );
    },
  );
  const matchedSignals = [
    providerMatch ? `${fingerprint.provider} provider` : null,
    connectorMatch ? `${fingerprint.connectorFamily} connector family` : null,
    versionMatch ? `${dependency.connectorVersion} satisfies ${fingerprint.vulnerableVersionRange}` : null,
    capabilityMatch ? `${fingerprint.capability} capability` : null,
    endpointMatch ? `${fingerprint.endpoint} endpoint` : null,
  ].filter((signal): signal is string => Boolean(signal));

  const result = (
    state: ExposureState,
    confidence: DiagnosisConfidence,
    confidenceScore: number,
    decisionReason: string,
    missingEvidence: string[] = [],
  ): DependencyExposureAssessment => ({
    dependencyId: dependency.id,
    workflowId: dependency.workflowId,
    workflowName: dependency.workflowName,
    state,
    confidence,
    confidenceScore,
    decisionReason,
    matchedSignals,
    missingEvidence,
    metadataFreshness: freshness,
  });

  if (!providerMatch || !connectorMatch) {
    if (matchingFailure) {
      return result(
        "Needs review",
        "Low",
        38,
        "The execution event and dependency registry disagree about the provider path.",
        ["A reconciled dependency registry record"],
      );
    }
    return result(
      "Not exposed",
      "High",
      99,
      "This path does not use the affected provider and connector family.",
    );
  }

  if (matchingFailure) {
    return result(
      "Affected",
      "High",
      100,
      "A failed execution directly observed this dependency path calling the retired endpoint.",
    );
  }

  if (freshness !== "Fresh") {
    return result(
      "Needs review",
      "Medium",
      Math.min(79, 48 + matchedSignals.length * 5),
      "The dependency record is not fresh enough to authorize an automated fleet action.",
      [
        "Fresh workflow configuration",
        "A recent endpoint trace for this dependency path",
      ],
    );
  }

  if (!dependency.enabled) {
    return result(
      "Not exposed",
      "High",
      99,
      "The freshly verified workflow path is disabled.",
    );
  }

  if (!parsedVersion) {
    return result(
      "Needs review",
      "Low",
      42,
      "The connector version is missing or is not valid semantic version data.",
      ["A valid active connector version"],
    );
  }

  if (versionMatch && capabilityMatch && endpointMatch) {
    return result(
      "Exposed",
      "High",
      Math.min(98, 70 + matchedSignals.length * 5),
      "This enabled path uses the same vulnerable version range, capability, and endpoint as the observed failure.",
      ["No failed execution has been observed on this path"],
    );
  }

  const exclusions = [
    !versionMatch ? "version is outside the vulnerable range" : null,
    !capabilityMatch ? `path does not use ${fingerprint.capability}` : null,
    !endpointMatch ? `path does not call ${fingerprint.endpoint}` : null,
  ].filter((reason): reason is string => Boolean(reason));

  return result(
    "Not exposed",
    "High",
    Math.min(99, 90 + exclusions.length * 3),
    `Excluded because the ${exclusions.join(" and the ")}.`,
  );
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function earliestDate(values: string[]) {
  return values
    .filter((value) => dateValue(value) !== null)
    .sort((left, right) => left.localeCompare(right))[0] ?? "Unknown";
}

function recommendedAction(
  state: ExposureState,
  criticality: ConnectorDependency["criticality"],
  nextRunAt: string,
  evaluatedAt: string,
) {
  const next = dateValue(nextRunAt);
  const now = dateValue(evaluatedAt);
  const dueWithinDay =
    next !== null && now !== null && next >= now && next - now <= 86_400_000;

  if (state === "Affected") {
    return "Contain only the observed dependency path and use it as the replacement connector canary.";
  }
  if (state === "Exposed") {
    return dueWithinDay || criticality === "High"
      ? "Pin the vulnerable path before its next run, then enter the gated rollout after the canary passes."
      : "Schedule the path for the gated rollout before its next execution.";
  }
  if (state === "Needs review") {
    return "Refresh the dependency inventory and run a read-only probe; do not change production state yet.";
  }
  return "No incident containment is required. Keep normal monitoring in place.";
}

function aggregateTenant(
  dependencies: ConnectorDependency[],
  paths: DependencyExposureAssessment[],
  evaluatedAt: string,
): ExposureAssessment {
  const winningState = paths.reduce<ExposureState>(
    (current, path) =>
      statePriority[path.state] > statePriority[current] ? path.state : current,
    "Not exposed",
  );
  const winningPaths = paths.filter((path) => path.state === winningState);
  const dependencyById = new Map(
    dependencies.map((dependency) => [dependency.id, dependency]),
  );
  const winningDependencies = winningPaths
    .map((path) => dependencyById.get(path.dependencyId))
    .filter((dependency): dependency is ConnectorDependency => Boolean(dependency));
  const criticality = winningDependencies.reduce<ConnectorDependency["criticality"]>(
    (current, dependency) =>
      criticalityPriority[dependency.criticality] > criticalityPriority[current]
        ? dependency.criticality
        : current,
    "Low",
  );
  const nextRunAt = earliestDate(
    winningDependencies.map((dependency) => dependency.nextRunAt),
  );
  const confidenceScore = Math.max(
    ...winningPaths.map((path) => path.confidenceScore),
  );
  const confidence = winningPaths.some((path) => path.confidence === "Low")
    ? "Low"
    : winningPaths.some((path) => path.confidence === "Medium")
      ? "Medium"
      : "High";
  const tenant = dependencies[0];

  return {
    incidentId: "",
    tenantId: tenant.tenantId,
    tenantName: tenant.tenantName,
    dependencyId: winningPaths[0]?.dependencyId ?? tenant.id,
    dependencyIds: dependencies.map((dependency) => dependency.id).sort(),
    state: winningState,
    confidence,
    confidenceScore,
    decisionReason: `${winningPaths.length} of ${paths.length} dependency paths determine the tenant state. ${winningPaths[0]?.decisionReason ?? ""}`,
    matchedSignals: unique(winningPaths.flatMap((path) => path.matchedSignals)),
    missingEvidence: unique(winningPaths.flatMap((path) => path.missingEvidence)),
    recommendedAction: recommendedAction(
      winningState,
      criticality,
      nextRunAt,
      evaluatedAt,
    ),
    criticality,
    nextRunAt,
    pathAssessments: paths,
  };
}

export function evaluateExposureDecision({
  incidentId,
  fingerprint,
  dependencies,
  events,
  evaluatedAt,
  snapshotVersion = dependencySnapshotVersion(dependencies),
  evaluationMode = "At detection",
}: {
  incidentId: string;
  fingerprint: IncidentFingerprint;
  dependencies: ConnectorDependency[];
  events: RawExecutionEvent[];
  evaluatedAt: string;
  snapshotVersion?: string;
  evaluationMode?: ExposureDecision["evaluationMode"];
}): ExposureDecision {
  const dependencyById = new Map<string, ConnectorDependency>();
  for (const dependency of dependencies) {
    const existing = dependencyById.get(dependency.id);
    if (existing && stableHash(existing) !== stableHash(dependency)) {
      throw new Error(`Conflicting dependency records share id ${dependency.id}`);
    }
    dependencyById.set(dependency.id, dependency);
  }
  const uniqueDependencies = [...dependencyById.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const dependenciesByTenant = new Map<string, ConnectorDependency[]>();
  for (const dependency of uniqueDependencies) {
    const tenantPaths = dependenciesByTenant.get(dependency.tenantId) ?? [];
    tenantPaths.push(dependency);
    dependenciesByTenant.set(dependency.tenantId, tenantPaths);
  }

  const tenantAssessments = [...dependenciesByTenant.values()]
    .map((tenantDependencies) => {
      const paths = tenantDependencies.map((dependency) =>
        pathAssessment({ dependency, fingerprint, events, evaluatedAt }),
      );
      const assessment = aggregateTenant(tenantDependencies, paths, evaluatedAt);
      assessment.incidentId = incidentId;
      return assessment;
    })
    .sort((left, right) => left.tenantName.localeCompare(right.tenantName));
  const decisionInput = {
    policyVersion: fingerprint.policyVersion,
    snapshotVersion,
    fingerprint,
    dependencies: uniqueDependencies,
    events: events
      .filter((event) =>
        event.observedAt <= evaluatedAt &&
        withinWindow(
          event.observedAt,
          fingerprint.observedAt,
          fingerprint.correlationWindowMinutes,
        ),
      )
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  const inputHash = stableHash(decisionInput);

  return {
    decisionId: `decision-${incidentId}-${inputHash.split(":")[1]}`,
    incidentId,
    policyVersion: fingerprint.policyVersion,
    dependencySnapshotVersion: snapshotVersion,
    inputHash,
    createdAt: evaluatedAt,
    evaluationMode,
    fingerprint,
    tenantAssessments,
  };
}
