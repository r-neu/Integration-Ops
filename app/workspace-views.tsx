"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Boxes,
  Braces,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  Compass,
  Database,
  ExternalLink,
  FileDown,
  GitCommitHorizontal,
  KeyRound,
  MessageSquareText,
  Play,
  RefreshCcw,
  Rocket,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TimerReset,
  UserRound,
  UsersRound,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  isResolvedIncidentStatus,
  isTerminalIncidentStatus,
} from "@/lib/fleet-policy";
import type {
  ActionRequest,
  ExposureState,
  Incident,
  IntegrationFlow,
  RecoveryPlan,
  RemediationTask,
  Role,
  SupportTask,
  WorkspaceSnapshot,
} from "@/lib/types";
import { ProviderBrand } from "./provider-brand";
import {
  Button,
  EmptyState,
  HealthBadge,
  IncidentBadge,
  JobBadge,
  MappingBadge,
  Metric,
} from "./ui";

type ActionHandler = (request: ActionRequest) => Promise<void>;

const incidentLabels: Record<Incident["type"], string> = {
  data_quality: "Data quality",
  authentication: "Authentication",
  mapping: "Field mapping",
  rate_limit: "Rate limit",
  provider_change: "Provider API change",
};

const affectedUnits: Record<Incident["type"], [string, string]> = {
  data_quality: ["contact", "contacts"],
  authentication: ["contact sync", "contact syncs"],
  mapping: ["reservation event", "reservation events"],
  rate_limit: ["spreadsheet row", "spreadsheet rows"],
  provider_change: ["report attachment", "report attachments"],
};

function affectedVolume(incident: Incident) {
  const [singular, plural] = affectedUnits[incident.type];
  return `${incident.affectedRecords} ${incident.affectedRecords === 1 ? singular : plural}`;
}

const ownerStyles: Record<Incident["owner"], string> = {
  "Customer admin": "bg-amber-50 text-amber-800 border-amber-200",
  "Integration engineer":
    "bg-violet-50 text-violet-800 border-violet-200",
  System: "bg-sky-50 text-sky-700 border-sky-200",
};

const exposureStyles: Record<ExposureState, string> = {
  Affected: "border-rose-200 bg-rose-50 text-rose-800",
  Exposed: "border-amber-200 bg-amber-50 text-amber-800",
  "Needs review": "border-sky-200 bg-sky-50 text-sky-800",
  "Not exposed": "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]",
};

function ExposureBadge({ state }: { state: ExposureState }) {
  return (
    <span
      className={`inline-flex w-fit rounded-full border px-2 py-1 text-xs font-medium ${exposureStyles[state]}`}
    >
      {state}
    </span>
  );
}

function EvidenceBadge({
  matched,
  missing,
}: {
  matched: number;
  missing: number;
}) {
  return (
    <span
      className={`inline-flex w-fit rounded-full border px-2 py-1 text-xs font-medium ${
        missing
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]"
      }`}
    >
      {missing ? `${matched} matched · ${missing} missing` : `${matched} required signals matched`}
    </span>
  );
}

const scenarioDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
});

function formatScenarioTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${scenarioDateFormatter.format(date)} PT`;
}

function formatFleetHealthCheck(value: string) {
  return Number.isFinite(Date.parse(value))
    ? `Healthy at ${formatScenarioTime(value)}`
    : value;
}

function OwnerBadge({ owner }: { owner: Incident["owner"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium ${ownerStyles[owner]}`}
    >
      {owner === "System" ? (
        <Zap className="size-3" />
      ) : owner === "Customer admin" ? (
        <UserRound className="size-3" />
      ) : (
        <Wrench className="size-3" />
      )}
      {owner}
    </span>
  );
}

function RecoveryModeBadge({ incident }: { incident: Incident }) {
  const style =
    incident.recoveryMode === "System managed"
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : incident.recoveryMode === "Customer action required"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-violet-200 bg-violet-50 text-violet-800";
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${style}`}>
      {incident.recoveryMode}
    </span>
  );
}

function currentOwnerReason(incident: Incident) {
  if (incident.status === "Contained") {
    return incident.disposition === "Fallback mitigation"
      ? "The fallback restored service. Engineering owns a separate permanent-fix work item; this release cannot be promoted."
      : "The customer accepted a bounded exception and owns its scheduled review. The affected records remain isolated from replay.";
  }
  if (incident.status === "Resolved") {
    return "The platform completed the final monitored transition and closed the incident.";
  }
  if (incident.owner === "System" && incident.type !== "rate_limit") {
    return "The accountable person completed their decision; validation and retry now belong to the platform.";
  }
  return incident.ownerReason;
}

function communicationOwner(incident: Incident) {
  if (incident.supportEngagement === "Needs support") return "Support admin";
  if (incident.supportEngagement === "Watching") return "Support monitoring";
  return "None unless escalation conditions are met";
}

function actionForViewer(
  incident: Incident,
  role: Role,
  guided: boolean,
  portalMode: boolean,
) {
  if (incident.status === "Contained") {
    return "No immediate incident action. Follow the open remediation work item before its due date.";
  }
  if (isResolvedIncidentStatus(incident.status)) return "No immediate action required.";
  if (guided) return "No production action. Play the next event to observe the workflow.";
  if (incident.owner === "System") return "No human action. The platform is running the next transition.";
  if (portalMode || role === "customer") {
    return incident.owner === "Customer admin"
      ? incident.actionRequired
      : "No action from your organization.";
  }
  if (role === "engineer") {
    return incident.owner === "Integration engineer"
      ? incident.actionRequired
      : "No Engineering action at this state.";
  }
  return incident.supportEngagement === "Needs support"
    ? "Own customer communication while the recovery owner fixes the integration."
    : "No Support action. Observe status and escalation conditions.";
}

function SeverityDot({ severity }: { severity: Incident["severity"] }) {
  const style =
    severity === "High"
      ? "bg-red-500"
      : severity === "Medium"
        ? "bg-amber-500"
        : "bg-sky-500";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`size-2 rounded-full ${style}`} />
      {severity}
    </span>
  );
}

function providerForIncident(
  workspace: WorkspaceSnapshot,
  incident: Incident,
) {
  return (
    workspace.connections.find(
      (connection) => connection.id === incident.connectionId,
    )?.provider ?? "Integration"
  );
}

function flowProviders(
  workspace: WorkspaceSnapshot,
  flow: IntegrationFlow,
) {
  return {
    source: workspace.connections.find(
      (connection) => connection.id === flow.sourceConnectionId,
    ),
    destination: workspace.connections.find(
      (connection) => connection.id === flow.destinationConnectionId,
    ),
  };
}

function SectionHeader({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase text-[#16888a]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">{title}</h1>
        {detail ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {detail}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

function IncidentTable({
  workspace,
  incidents,
  onOpenIncident,
}: {
  workspace: WorkspaceSnapshot;
  incidents: Incident[];
  onOpenIncident: (incidentId: string) => void;
}) {
  return (
    <div className="glass-panel overflow-hidden">
      <div className="hidden grid-cols-[minmax(250px,1.5fr)_140px_150px_110px_140px_36px] gap-4 border-b border-[var(--line)] bg-white/45 px-4 py-3 text-xs font-semibold uppercase text-slate-500 lg:grid">
        <span>Incident</span>
        <span>Status</span>
        <span>Current executor</span>
        <span>Impact</span>
        <span>Updated</span>
        <span />
      </div>
      <div className="divide-y divide-[var(--line)]">
        {incidents.map((incident) => {
          const provider = providerForIncident(workspace, incident);
          return (
            <button
              key={incident.id}
              onClick={() => onOpenIncident(incident.id)}
              className="grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-white/65 lg:grid-cols-[minmax(250px,1.5fr)_140px_150px_110px_140px_36px] lg:items-center lg:gap-4"
            >
              <span className="flex min-w-0 items-start gap-3">
                <ProviderBrand provider={provider} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-950">
                      {incident.title}
                    </span>
                    <SeverityDot severity={incident.severity} />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {provider} · {incidentLabels[incident.type]} ·{" "}
                    {incident.id}
                  </span>
                </span>
              </span>
              <span>
                <IncidentBadge status={incident.status} />
              </span>
              <span>
                <OwnerBadge owner={incident.owner} />
              </span>
              <span className="text-xs leading-5 text-slate-600">
                {affectedVolume(incident)}
              </span>
              <span className="text-xs leading-5 text-slate-500">
                {formatScenarioTime(incident.updatedAt)}
              </span>
              <ChevronRight className="hidden size-4 text-slate-400 lg:block" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function OverviewView({
  workspace,
  role,
  busyTarget,
  onOpenIncident,
  onOpenRecoveryControl,
  onAction,
}: {
  workspace: WorkspaceSnapshot;
  role: Role;
  busyTarget: string | null;
  onOpenIncident: (incidentId: string) => void;
  onOpenRecoveryControl: () => void;
  onAction: ActionHandler;
}) {
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState<"all" | Incident["owner"]>("all");
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const [supportQueue, setSupportQueue] = useState<
    "needs" | "watching" | "system" | "all"
  >("needs");
  const supportTaskFor = (incidentId: string) =>
    workspace.supportTasks.find((task) => task.incidentId === incidentId);
  const needsSupportAction = (task?: SupportTask) =>
    Boolean(task && ["Unassigned", "Update due", "Overdue"].includes(task.status));
  const waitingOnRecovery = (task?: SupportTask) =>
    task?.status === "Waiting for recovery";
  const hasOpenRemediation = (incidentId: string) =>
    workspace.remediationTasks.some(
      (task) => task.incidentId === incidentId && task.status === "Open",
    );
  const hasActiveWork = (incident: Incident) =>
    !isTerminalIncidentStatus(incident.status) || hasOpenRemediation(incident.id);
  const incidents = workspace.incidents.filter((incident) => {
    const task = supportTaskFor(incident.id);
    const matchesQuery =
      !query ||
      `${incident.title} ${incident.summary} ${incident.providerCode}`
        .toLowerCase()
        .includes(query.toLowerCase());
    const matchesOwner = owner === "all" || incident.owner === owner;
    const matchesStatus =
      status === "all" ||
      (status === "open" && hasActiveWork(incident)) ||
      (status === "resolved" && isResolvedIncidentStatus(incident.status));
    const matchesSupportQueue =
      role !== "support" ||
      supportQueue === "all" ||
      (supportQueue === "needs" &&
        needsSupportAction(task) &&
        hasActiveWork(incident)) ||
      (supportQueue === "watching" &&
        (waitingOnRecovery(task) || incident.supportEngagement === "Watching") &&
        hasActiveWork(incident)) ||
      (supportQueue === "system" &&
        incident.recoveryMode === "System managed");
    return matchesQuery && matchesOwner && matchesStatus && matchesSupportQueue;
  }).sort((left, right) => {
    const severityRank = { High: 0, Medium: 1, Low: 2 };
    return (
      severityRank[left.severity] - severityRank[right.severity] ||
      right.updatedAt.localeCompare(left.updatedAt)
    );
  });
  const open = workspace.incidents.filter(hasActiveWork);
  const fleetTask = workspace.supportTasks.find(
    (task) => task.fleetIncidentId === workspace.fleetIncident.id,
  );
  const fleetMatchesQuery =
    !query ||
    `${workspace.fleetIncident.title} ${workspace.fleetIncident.failureClass} ${workspace.fleetIncident.provider}`
      .toLowerCase()
      .includes(query.toLowerCase());
  const fleetMatchesOwner =
    owner === "all" || workspace.fleetIncident.recoveryOwner === owner;
  const fleetMatchesStatus =
    status === "all" ||
    (status === "open" && workspace.fleetIncident.status !== "Resolved") ||
    (status === "resolved" && workspace.fleetIncident.status === "Resolved");
  const fleetMatchesSupportQueue =
    role !== "support" ||
    supportQueue === "all" ||
    (supportQueue === "needs" && needsSupportAction(fleetTask)) ||
    (supportQueue === "watching" && waitingOnRecovery(fleetTask));
  const fleetVisible =
    fleetMatchesQuery &&
    fleetMatchesOwner &&
    fleetMatchesStatus &&
    fleetMatchesSupportQueue;
  const queueCounts = {
    needs: workspace.supportTasks.filter((task) => needsSupportAction(task)).length,
    watching: open.filter(
      (incident) =>
        waitingOnRecovery(supportTaskFor(incident.id)) ||
        incident.supportEngagement === "Watching",
    ).length,
    system: open.filter((incident) => incident.recoveryMode === "System managed")
      .length,
    all: workspace.incidents.length + 1,
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Internal operations"
        title="Incident queue"
        detail={
          role === "support"
            ? "Start here to see what broke, who owns the next step, and which customers need an update. Technical recovery and customer communication stay separate."
            : "See provider-level impact, fix the integration-owned issues, and keep the tenant evidence attached as recovery moves forward."
        }
        action={
          <div className="flex items-center gap-2">
            <HealthBadge status={workspace.tenant.health} />
            <span className="text-sm font-semibold text-slate-900">
              {workspace.tenant.name}
            </span>
          </div>
        }
      />

      <div className="glass-panel grid overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Active work"
          value={open.length}
          detail="Open recoveries and follow-up work"
          tone={open.length ? "danger" : "positive"}
        />
        <Metric
          label="Awaiting customer"
          value={
            open.filter((incident) => incident.owner === "Customer admin").length
          }
          detail="Easy Spaces owns the next step"
        />
        <Metric
          label="Awaiting engineering"
          value={
            open.filter(
              (incident) => incident.owner === "Integration engineer",
            ).length
          }
          detail="Mapping or connector work"
        />
        <Metric
          label="Automated recovery"
          value={open.filter((incident) => incident.owner === "System").length}
          detail="Retry, validation, and monitoring"
          tone="positive"
        />
      </div>

      {role === "support" ? (
        <div className="flex overflow-x-auto border-b border-[var(--line)]" aria-label="Support queues">
          {[
            ["needs", `Needs Support (${queueCounts.needs})`],
            ["watching", `Watching (${queueCounts.watching})`],
            ["system", `Automated (${queueCounts.system})`],
            ["all", `All incidents (${queueCounts.all})`],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() =>
                {
                  setSupportQueue(
                    value as "needs" | "watching" | "system" | "all",
                  );
                  setStatus(value === "all" ? "all" : "open");
                }
              }
              className={`min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium ${
                supportQueue === value
                  ? "border-[#e9624c] text-[#d9533f]"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search incidents or provider codes"
            className="brand-focus h-10 w-full rounded-md border border-[var(--line-strong)] bg-white/75 pl-9 pr-3 text-sm text-slate-800"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "open" | "resolved" | "all")
            }
            aria-label="Filter by incident status"
            className="brand-focus h-10 rounded-md border border-[var(--line-strong)] bg-white/75 px-3 text-sm text-slate-700"
          >
            <option value="open">Active work</option>
            <option value="resolved">Recovered incidents</option>
            <option value="all">All statuses</option>
          </select>
          <select
            value={owner}
            onChange={(event) =>
              setOwner(event.target.value as "all" | Incident["owner"])
            }
            aria-label="Filter by current executor"
            className="brand-focus h-10 rounded-md border border-[var(--line-strong)] bg-white/75 px-3 text-sm text-slate-700"
          >
            <option value="all">All executors</option>
            <option value="Customer admin">Customer admin</option>
            <option value="Integration engineer">Integration engineer</option>
            <option value="System">System</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Showing {fleetVisible ? 1 : 0} of 1 provider incident and {incidents.length} of{" "}
        {workspace.incidents.length} tenant-level incidents
      </p>

      {fleetVisible ? (
        <section className="soft-panel overflow-hidden">
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <Boxes className="mt-0.5 size-5 shrink-0 text-[#e9624c]" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase text-[#16888a]">
                    Provider incident
                  </span>
                  <span
                    className={`rounded-full border px-2 py-1 text-xs font-medium ${
                      workspace.fleetIncident.status === "Resolved"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : workspace.fleetIncident.status === "Recovering"
                          ? "border-sky-200 bg-sky-50 text-sky-800"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    {workspace.fleetIncident.status}
                  </span>
                  <SeverityDot severity={workspace.fleetIncident.severity} />
                </div>
                <h2 className="mt-2 text-base font-semibold text-slate-950">
                  {workspace.fleetIncident.title}
                </h2>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-600">
                  {workspace.fleetIncident.actionState}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-violet-800">
                    Recovery: {workspace.fleetIncident.recoveryOwner}
                  </span>
                  <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-sky-800">
                    Communication: {workspace.fleetIncident.communicationOwner}
                  </span>
                  <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-rose-800">
                    {workspace.fleetIncident.affectedTenantIds.length} affected{" "}
                    {workspace.fleetIncident.affectedTenantIds.length === 1 ? "tenant" : "tenants"}
                  </span>
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                    {workspace.fleetIncident.exposedTenantIds.length} exposed{" "}
                    {workspace.fleetIncident.exposedTenantIds.length === 1
                      ? "tenant"
                      : "tenants"}
                  </span>
                  <span className={`rounded-md border px-2 py-1 ${
                    workspace.fleetIncident.responseSlaStatus === "Breached"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : workspace.fleetIncident.responseSlaStatus === "Due soon"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : workspace.fleetIncident.responseSlaStatus === "Closed"
                          ? "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]"
                          : "border-slate-200 bg-white/70 text-slate-600"
                  }`}>
                    Response {workspace.fleetIncident.responseSlaStatus.toLowerCase()} · {formatScenarioTime(workspace.fleetIncident.responseDueAt)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-80 lg:justify-end">
              {role === "support" ? (
                workspace.fleetIncident.acknowledgedAt ? (
                  <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-800">
                    <CheckCheck className="size-4" />
                    Acknowledged {formatScenarioTime(workspace.fleetIncident.acknowledgedAt)}
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    busy={busyTarget === workspace.fleetIncident.id}
                    onClick={() =>
                      onAction({
                        action: "acknowledge_fleet_incident",
                        targetId: workspace.fleetIncident.id,
                      })
                    }
                  >
                    <CheckCheck className="size-4" />
                    Acknowledge provider incident
                  </Button>
                )
              ) : null}
              <Button variant="secondary" onClick={() => onOpenIncident("inc-api-001")}>
                Open affected child
              </Button>
              <Button onClick={onOpenRecoveryControl}>
                <Boxes className="size-4" />
                Open recovery control
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">
          Tenant incident children
        </p>
        <h2 className="mt-1 text-sm font-semibold text-slate-950">
          Easy Spaces recovery work
        </h2>
      </div>

      {incidents.length ? (
        <IncidentTable
          workspace={workspace}
          incidents={incidents}
          onOpenIncident={onOpenIncident}
        />
      ) : (
        <EmptyState
          title="No incidents match"
          detail="Try a different search or owner filter."
        />
      )}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">
              Recent operating activity
            </h2>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {workspace.activity.slice(0, 5).map((event) => (
              <div key={event.id} className="flex gap-3 px-5 py-4">
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#16888a]/10 text-[#16888a]">
                  {event.actorRole === "system" ? (
                    <Zap className="size-3.5" />
                  ) : (
                    <UserRound className="size-3.5" />
                  )}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {event.action}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-600">
                    {event.detail}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {event.actorLabel} · {formatScenarioTime(event.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-5">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Tenant context
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-950">
            Easy Spaces
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Enterprise · Event management SaaS
          </p>
          <dl className="mt-5 space-y-3 border-t border-[var(--line)] pt-4">
            <div className="flex justify-between gap-4">
              <dt className="text-sm text-slate-500">Source records</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {workspace.tenant.sourceRecordCount}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-sm text-slate-500">CC0 sample records</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {workspace.quality.salesforceCc0Records}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-sm text-slate-500">Connected apps</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {workspace.connections.length - 1}
              </dd>
            </div>
          </dl>
          <p className="mt-5 border-l-2 border-[#e9624c] pl-3 text-xs leading-5 text-slate-600">
            Salesforce Accounts are business records inside the Easy Spaces
            tenant, not separate SaaS customers.
          </p>
        </div>
      </section>
    </div>
  );
}

function RecoveryDecisionChain({
  plan,
}: {
  plan: RecoveryPlan;
}) {
  return (
    <ol
      aria-label="Recovery decision chain"
      className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-6"
    >
      {plan.decisionStages.map((stage, index) => (
        <li key={stage.id} className="min-w-0 bg-white/68 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase text-slate-500">
              {index + 1}. {stage.label}
            </p>
            {stage.status === "Completed" ? (
              <CheckCircle2 className="size-4 shrink-0 text-[#16888a]" />
            ) : stage.status === "Current" ? (
              <CircleDot className="size-4 shrink-0 text-[#e9624c]" />
            ) : (
              <ShieldCheck className="size-4 shrink-0 text-slate-400" />
            )}
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-900">
            {stage.summary}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-600">
            {stage.detail}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function GuidedReviewView({
  workspace,
  busyTarget,
  onOpenIncident,
  onOpenRecoveryControl,
  onAction,
  onReset,
}: {
  workspace: WorkspaceSnapshot;
  busyTarget: string | null;
  onOpenIncident: (incidentId: string) => void;
  onOpenRecoveryControl: () => void;
  onAction: ActionHandler;
  onReset: () => void;
}) {
  const resolved = workspace.incidents.filter((incident) =>
    isResolvedIncidentStatus(incident.status),
  ).length;
  const contained = workspace.incidents.filter(
    (incident) => incident.status === "Contained",
  ).length;
  return (
    <div className="space-y-7">
      <SectionHeader
        eyebrow="Guided walkthrough"
        title="Recovery walkthrough"
        detail="Step through the incident as it moves between Customer Admin, Support, Engineering, and automated platform work. This mode lets you observe the full flow without switching roles."
        action={
          <Button
            variant="secondary"
            busy={busyTarget === "workspace"}
            onClick={onReset}
          >
            <RefreshCcw className="size-4" />
            Reset run
          </Button>
        }
      />

      <section className="grid gap-px overflow-hidden rounded-md border border-[var(--line)] bg-[var(--line)] md:grid-cols-3">
        <div className="bg-white/68 p-5">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Product principle
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">
            Fix only the affected scope, then gate the rollout
          </p>
        </div>
        <div className="bg-white/68 p-5">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Review progress
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {resolved}/5
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Tenant paths recovered{contained ? ` · ${contained} contained` : ""}
          </p>
        </div>
        <div className="bg-white/68 p-5">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Cross-team path
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">
            Slack requires Engineering and Support
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Engineering recovers; Support communicates
          </p>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <Compass className="size-4 text-[#16888a]" />
          <h2 className="text-sm font-semibold text-slate-950">
            Five recovery paths
          </h2>
          <span className="text-xs text-slate-500">
            The Slack issue also drives a provider-level fleet release
          </span>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {workspace.incidents.map((incident) => {
            const provider = providerForIncident(workspace, incident);
            const plan = workspace.recoveryPlans[incident.id];
            const supportTask = workspace.supportTasks.find(
              (task) => task.incidentId === incident.id,
            );
            const fleetScoped = plan.blastRadius === "Connector fleet";
            const incidentRecovered = isResolvedIncidentStatus(incident.status);
            const incidentContained = incident.status === "Contained";
            const releaseDone = workspace.fleetRelease.status === "Completed";
            const done = incidentRecovered && (!fleetScoped || releaseDone);
            const playRelease =
              fleetScoped &&
              incidentRecovered &&
              !releaseDone &&
              workspace.fleetRelease.status !== "Rolled back";
            const playbackStopped = done || incidentContained;
            const reviewDependencyId = plan.tenantAssessments
              .flatMap((assessment) => assessment.pathAssessments)
              .find((path) => path.state === "Needs review")?.dependencyId;
            const activeFleetProbe = workspace.evidenceProbes.find(
              (probe) =>
                probe.dependencyId === reviewDependencyId &&
                ["Queued", "Running"].includes(probe.status),
            );
            const queueFleetEvidence =
              playRelease && Boolean(reviewDependencyId) && !activeFleetProbe;
            const playFleetProbe = playRelease && Boolean(activeFleetProbe);
            const parallelSupportUpdate =
              incident.type === "provider_change" &&
              incident.status === "Awaiting engineering" &&
              supportTask?.status === "Unassigned";
            const nextEventActor = (() => {
              if (parallelSupportUpdate) return "Support admin";
              if (queueFleetEvidence) return "Integration engineer";
              if (playFleetProbe) return "System worker";
              if (playRelease) {
                return ["Early access running", "General rollout running"].includes(
                  workspace.fleetRelease.status,
                )
                  ? "System worker"
                  : "Integration engineer";
              }
              return incident.owner === "System" ? "System worker" : incident.owner;
            })();
            const nextEventLabel = (() => {
              if (queueFleetEvidence) return "Queue Harbor evidence check";
              if (playFleetProbe) {
                return activeFleetProbe?.status === "Queued"
                  ? "Start Harbor check"
                  : "Record Harbor result";
              }
              if (playRelease) {
                if (["Early access running", "General rollout running"].includes(workspace.fleetRelease.status)) {
                  return `Record health check ${workspace.fleetRelease.observedHealthyRuns + 1} of ${workspace.fleetRelease.requiredHealthyRuns}`;
                }
                return "Promote next cohort";
              }
              if (incident.type === "data_quality" && incident.status === "Awaiting customer") {
                return "Apply customer correction";
              }
              if (incident.type === "authentication" && incident.status === "Awaiting customer") {
                return "Reconnect HubSpot";
              }
              if (incident.type === "mapping" && incident.status === "Awaiting engineering") {
                return "Publish mapping fix";
              }
              if (incident.status === "Backoff scheduled") return "Run scheduled retry";
              if (incident.type === "provider_change") {
                if (incident.status === "Ready to deploy") return "Deploy canary";
                if (incident.status === "Awaiting engineering") {
                  return !parallelSupportUpdate
                    ? "Run connector tests"
                    : "Send support update";
                }
              }
              if (incident.status === "Validating") return "Finish validation";
              if (incident.status === "Retry queued") return "Start retry";
              if (incident.status === "Running") return "Verify recovery";
              if (incident.status === "Monitoring") {
                return `Record canary check ${workspace.fleetRelease.observedHealthyRuns + 1} of ${workspace.fleetRelease.requiredHealthyRuns}`;
              }
              return "Run next automated step";
            })();
            return (
              <article key={incident.id} className="glass-panel overflow-hidden">
                <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <ProviderBrand provider={provider} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">
                        {incident.title}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <RecoveryModeBadge incident={incident} />
                        <IncidentBadge status={incident.status} />
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onOpenIncident(incident.id)}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--line-strong)] bg-white/70 text-slate-600 hover:bg-white"
                    aria-label={`Open ${incident.title}`}
                    title="Open incident detail"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
                <dl className="grid gap-px bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-[1.25fr_0.875fr_0.875fr]">
                  {[
                    { label: "Signal", value: incident.providerCode, code: true },
                    { label: "Safe scope", value: plan.blastRadius },
                    { label: "Recovery owner", value: plan.accountableOwner },
                    {
                      label: "Communication owner",
                      value: communicationOwner(incident),
                    },
                    { label: "Current recovery executor", value: incident.owner },
                    {
                      label: "Next owner",
                      value: playbackStopped ? "None" : nextEventActor,
                    },
                  ].map(({ label, value, code }) => (
                    <div key={label} className="min-w-0 bg-white/68 p-4">
                      <dt className="text-[11px] font-semibold uppercase text-slate-500">
                        {label}
                      </dt>
                      <dd
                        className={`mt-2 break-words font-semibold leading-5 text-slate-900 ${
                          code ? "font-mono text-[11px]" : "text-xs"
                        }`}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <details className="border-t border-[var(--line)] bg-white/48">
                  <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-[#0f6f71]">
                    Show decision evidence
                  </summary>
                  <RecoveryDecisionChain plan={plan} />
                </details>
                {fleetScoped ? (
                  <div className="border-t border-[var(--line)] bg-white/45 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          Fleet recovery path
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {workspace.fleetMetrics.atRiskTenants} at risk, {workspace.fleetMetrics.needsReviewTenants} held for review, then {workspace.fleetRelease.status.toLowerCase()} through gated cohorts.
                        </p>
                      </div>
                      <Button variant="secondary" onClick={onOpenRecoveryControl}>
                        <Boxes className="size-4" />
                        Review fleet recovery
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-col gap-3 bg-white/38 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-slate-500">
                    {done
                      ? "Incident recovery and every required downstream gate are complete."
                      : incidentContained
                        ? incident.disposition === "Fallback mitigation"
                          ? "Impact contained: rollback restored the fallback. Promotion is stopped and Engineering owns permanent remediation."
                          : "Impact contained: the approved exception is active and its review remains assigned to the customer admin."
                      : queueFleetEvidence
                        ? "Next: collect fresh Harbor evidence before Early access promotion."
                      : playFleetProbe
                        ? `Next: Harbor evidence check is ${activeFleetProbe?.status.toLowerCase()}.`
                      : playRelease
                        ? `Next: ${workspace.fleetRelease.status}.`
                      : parallelSupportUpdate
                          ? "Support sends the customer update while Engineering keeps recovery ownership."
                        : `Next: ${incident.actionState}.`}
                  </p>
                  <Button
                    variant={playbackStopped ? "secondary" : "primary"}
                    disabled={playbackStopped}
                    busy={
                      busyTarget === incident.id ||
                      busyTarget === workspace.fleetRelease.id ||
                      busyTarget === reviewDependencyId
                    }
                    onClick={() =>
                      queueFleetEvidence && reviewDependencyId
                        ? onAction({
                            action: "refresh_dependency_evidence",
                            targetId: reviewDependencyId,
                          })
                        : playRelease
                        ? onAction({
                            action: "run_guided_release_step",
                            targetId: workspace.fleetRelease.id,
                            expectedUpdatedAt: workspace.fleetRelease.updatedAt,
                          })
                        : onAction({
                            action: "run_guided_step",
                            targetId: incident.id,
                          })
                    }
                  >
                    {playbackStopped ? (
                      incidentContained ? (
                        <ShieldCheck className="size-4" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )
                    ) : (
                      <Play className="size-4" />
                    )}
                    {done
                      ? "Recovery complete"
                      : incidentContained
                        ? incident.disposition === "Fallback mitigation"
                          ? "Rollback complete"
                          : "Impact contained"
                      : nextEventLabel}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

    </div>
  );
}

export function IntegrationView({
  workspace,
  onOpenIncident,
}: {
  workspace: WorkspaceSnapshot;
  onOpenIncident: (incidentId: string) => void;
}) {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Integration catalog"
        title="Easy Spaces data flows"
        detail="Each flow shows where data starts, where it lands, how often it runs, and which mapping version is active."
      />
      <div className="space-y-3">
        {workspace.flows.map((flow) => {
          const providers = flowProviders(workspace, flow);
          const incident = workspace.incidents.find(
            (item) => item.flowId === flow.id && !isTerminalIncidentStatus(item.status),
          );
          return (
            <section key={flow.id} className="glass-panel overflow-hidden">
              <div className="grid gap-4 p-5 lg:grid-cols-[minmax(300px,1fr)_minmax(300px,0.8fr)_150px] lg:items-center">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-1">
                      {providers.source ? (
                        <ProviderBrand provider={providers.source.provider} />
                      ) : null}
                      {providers.destination ? (
                        <ProviderBrand
                          provider={providers.destination.provider}
                          className="relative"
                        />
                      ) : null}
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-slate-950">
                        {flow.name}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {flow.sourceObject} → {flow.destinationObject}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                    {flow.description}
                  </p>
                  <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
                    <span className="font-semibold text-slate-700">
                      Match rule:
                    </span>{" "}
                    {flow.identityRule}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Schedule</dt>
                    <dd className="mt-1 font-medium text-slate-800">
                      {flow.schedule}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Mapping</dt>
                    <dd className="mt-1 font-medium text-slate-800">
                      {flow.mappingVersion}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Last run</dt>
                    <dd className="mt-1 font-medium text-slate-800">
                      {formatScenarioTime(flow.lastRunAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Next run</dt>
                    <dd className="mt-1 font-medium text-slate-800">
                      {formatScenarioTime(flow.nextRunAt)}
                    </dd>
                  </div>
                </dl>
                <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end">
                  <HealthBadge status={flow.status} />
                  {incident ? (
                    <Button
                      variant="secondary"
                      onClick={() => onOpenIncident(incident.id)}
                    >
                      Open incident
                      <ArrowRight className="size-4" />
                    </Button>
                  ) : (
                    <span className="text-xs text-[#16888a]">On schedule</span>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function ConnectionsView({
  workspace,
  onOpenIncident,
}: {
  workspace: WorkspaceSnapshot;
  onOpenIncident: (incidentId: string) => void;
}) {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Connection inventory"
        title="Connected applications"
        detail="Connection health reflects auth status, provider availability, and any active incidents."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {workspace.connections.map((connection) => {
          const incidents = workspace.incidents.filter(
            (incident) =>
              incident.connectionId === connection.id &&
              !isTerminalIncidentStatus(incident.status),
          );
          const runs = workspace.jobs.filter(
            (job) => job.connectionId === connection.id,
          );
          const succeededRuns = runs.filter(
            (job) => job.status === "Succeeded",
          ).length;
          return (
            <section key={connection.id} className="glass-panel p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <ProviderBrand provider={connection.provider} />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">
                      {connection.provider}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {connection.category} · {connection.direction}
                    </p>
                  </div>
                </div>
                <HealthBadge status={connection.status} />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-[var(--line)] pt-4 text-xs">
                <div>
                  <dt className="text-slate-500">Authorization</dt>
                  <dd className="mt-1 font-medium text-slate-800">
                    {connection.authStatus}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Demo runs</dt>
                  <dd className="mt-1 font-medium text-slate-800">
                    {runs.length
                      ? `${succeededRuns}/${runs.length} succeeded`
                      : "No direct run"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Last activity</dt>
                  <dd className="mt-1 font-medium text-slate-800">
                    {formatScenarioTime(connection.lastSync)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Owner</dt>
                  <dd className="mt-1 font-medium text-slate-800">
                    {connection.owner}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 rounded-md border border-[var(--line)] bg-white/48 p-3">
                <p className="text-xs font-medium text-slate-800">
                  {connection.nextAction}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Scopes: {connection.scopes}
                </p>
              </div>
              {incidents.length ? (
                <div className="mt-3 space-y-2">
                  {incidents.map((incident) => (
                    <button
                      key={incident.id}
                      onClick={() => onOpenIncident(incident.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-white/55 px-3 py-2 text-left hover:bg-white"
                    >
                      <span className="truncate text-xs font-medium text-slate-800">
                        {incident.title}
                      </span>
                      <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function MappingView({
  workspace,
  onOpenIncident,
}: {
  workspace: WorkspaceSnapshot;
  onOpenIncident: (incidentId: string) => void;
}) {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Schema contracts"
        title="Field mappings"
        detail="Mappings have their own versions. Before publishing, the console checks affected samples so a retry does not repeat the same failure."
      />
      <div className="glass-panel overflow-hidden">
        <div className="hidden grid-cols-[1fr_40px_1fr_130px_100px_40px] gap-3 border-b border-[var(--line)] bg-white/45 px-4 py-3 text-xs font-semibold uppercase text-slate-500 md:grid">
          <span>Source field</span>
          <span />
          <span>Destination field</span>
          <span>Transform</span>
          <span>Status</span>
          <span />
        </div>
        <div className="divide-y divide-[var(--line)]">
          {workspace.mappings.map((mapping) => (
            <div
              key={mapping.id}
              className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_40px_1fr_130px_100px_40px] md:items-center"
            >
              <div>
                <p className="text-xs text-slate-500">{mapping.sourceObject}</p>
                <p className="mt-1 font-mono text-sm text-slate-900">
                  {mapping.sourceField}
                </p>
              </div>
              <ArrowRight className="hidden size-4 text-slate-400 md:block" />
              <div>
                <p className="text-xs text-slate-500">{mapping.dataType}</p>
                <p className="mt-1 font-mono text-sm text-slate-900">
                  {mapping.destinationField}
                </p>
              </div>
              <p className="text-xs leading-5 text-slate-600">
                {mapping.transform}
              </p>
              <MappingBadge status={mapping.status} />
              {mapping.relatedIncidentId ? (
                <button
                  onClick={() => onOpenIncident(mapping.relatedIncidentId!)}
                  aria-label="Open mapping incident"
                  title="Open mapping incident"
                  className="inline-flex size-8 items-center justify-center rounded-md text-[#e9624c] hover:bg-[#e9624c]/8"
                >
                  <ChevronRight className="size-4" />
                </button>
              ) : (
                <Check className="size-4 text-[#16888a]" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function JobsView({
  workspace,
  onOpenIncident,
}: {
  workspace: WorkspaceSnapshot;
  onOpenIncident: (incidentId: string) => void;
}) {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Run history"
        title="Sync attempts"
        detail="Failed runs are kept as evidence. A recovery creates a linked retry and resumes from the saved checkpoint."
      />
      <div className="glass-panel overflow-hidden">
        <div className="hidden grid-cols-[150px_minmax(220px,1fr)_140px_100px_110px_36px] gap-4 border-b border-[var(--line)] bg-white/45 px-4 py-3 text-xs font-semibold uppercase text-slate-500 lg:grid">
          <span>Attempt</span>
          <span>Flow</span>
          <span>Provider</span>
          <span>Status</span>
          <span>Records</span>
          <span />
        </div>
        <div className="divide-y divide-[var(--line)]">
          {workspace.jobs.map((job) => {
            const flow = workspace.flows.find((item) => item.id === job.flowId);
            return (
              <button
                key={job.id}
                disabled={!job.incidentId}
                onClick={() =>
                  job.incidentId ? onOpenIncident(job.incidentId) : undefined
                }
                className="grid w-full gap-3 px-4 py-4 text-left enabled:hover:bg-white/65 disabled:cursor-default lg:grid-cols-[150px_minmax(220px,1fr)_140px_100px_110px_36px] lg:items-center lg:gap-4"
              >
                <span>
                  <span className="block font-mono text-xs font-medium text-slate-800">
                    {job.id}
                  </span>
                  {job.retryOf ? (
                    <span className="mt-1 block text-xs text-[#16888a]">
                      retry of {job.retryOf}
                    </span>
                  ) : null}
                </span>
                <span>
                  <span className="block text-sm font-medium text-slate-900">
                    {flow?.name ?? job.objectType}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {job.summary}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <ProviderBrand provider={job.provider} className="size-8" />
                  {job.provider}
                </span>
                <JobBadge status={job.status} />
                <span className="text-xs text-slate-600">
                  {job.processed} processed
                  {job.failed ? ` · ${job.failed} failed` : ""}
                </span>
                {job.incidentId ? (
                  <ChevronRight className="hidden size-4 text-slate-400 lg:block" />
                ) : (
                  <Check className="hidden size-4 text-[#16888a] lg:block" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActionModal({
  title,
  detail,
  children,
  confirmLabel,
  confirmDisabled = false,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#202426]/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-modal-title"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="glass-panel max-h-[92vh] w-full max-w-xl overflow-y-auto shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] p-5">
          <div>
            <h2
              id="action-modal-title"
              className="text-lg font-semibold text-slate-950"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-white"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
        <footer className="flex justify-end gap-2 border-t border-[var(--line)] bg-white/38 p-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </footer>
      </section>
    </div>
  );
}

function CustomerAction({
  incident,
}: {
  incident: Incident;
}) {
  if (incident.status !== "Awaiting customer") return null;

  if (incident.type === "data_quality") {
    return (
      <a
        href="/demo/salesforce/source-records"
        className="brand-button inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium"
      >
        <Database className="size-4" />
        Open records in Salesforce
        <ExternalLink className="size-3.5" />
      </a>
    );
  }

  if (incident.type === "authentication") {
    return (
      <a
        href="/demo/hubspot/authorize"
        className="brand-button inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium"
      >
        <KeyRound className="size-4" />
        Continue to HubSpot
        <ExternalLink className="size-3.5" />
      </a>
    );
  }

  return null;
}

function SupportAction({
  incident,
  task,
  busy,
  onAction,
}: {
  incident: Incident;
  task?: SupportTask;
  busy: boolean;
  onAction: ActionHandler;
}) {
  const [updateOpen, setUpdateOpen] = useState(false);
  const terminal = isTerminalIncidentStatus(incident.status);
  const fallbackMitigation = incident.disposition === "Fallback mitigation";
  const defaultMessage =
    incident.status === "Contained"
      ? fallbackMitigation
        ? "Slack report delivery is running on the text-only fallback after rollback. Service is restored, file attachments remain unavailable, and Engineering owns the permanent fix."
        : "The integration is running under an approved exception. Six invalid records remain quarantined, and unaffected records continue."
      : incident.status === "Resolved"
        ? "The integration has recovered and the workflow completed successfully. No action is needed from your team."
        : incident.owner === "Customer admin"
      ? "We found the issue. An Easy Spaces admin needs to complete the action in Integration Center; after that, we'll monitor recovery."
      : incident.owner === "System"
        ? "The platform is recovering this issue automatically. No action is needed from your team; we'll confirm when the next run completes."
        : "Our integration engineering team is working on the provider-side issue. No action is needed from your team; we'll post another update after validation.";
  const defaultCustomerAction =
    incident.owner === "Customer admin" && !terminal
      ? incident.actionRequired
      : "No customer action is required.";
  const [message, setMessage] = useState(defaultMessage);
  const [impact, setImpact] = useState(incident.impact);
  const [customerAction, setCustomerAction] = useState(defaultCustomerAction);
  const [nextUpdateMinutes, setNextUpdateMinutes] = useState(30);
  if (!task) return null;

  const slaStyle =
    task.slaStatus === "Breached"
      ? "text-red-700"
      : task.slaStatus === "Due soon"
        ? "text-amber-700"
        : task.slaStatus === "Closed"
          ? "text-[#0f6f71]"
          : "text-slate-600";

  function openUpdateModal() {
    setMessage(defaultMessage);
    setImpact(incident.impact);
    setCustomerAction(defaultCustomerAction);
    setNextUpdateMinutes(30);
    setUpdateOpen(true);
  }

  return (
    <>
      <div className="mb-2 text-right text-[11px] leading-4 text-slate-500">
        <p className="font-semibold text-slate-700">Customer update: {task.status}</p>
        <p className={`font-semibold ${slaStyle}`}>
          Update SLA: {task.slaStatus}
        </p>
        {task.nextUpdateBy ? (
          <p>
            {task.slaStatus === "Breached" ? "Internal deadline breached" : "Internal deadline"}{" "}
            {formatScenarioTime(task.nextUpdateBy)}
          </p>
        ) : null}
        <p>{task.slaReason}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {task.status !== "Resolved" ? (
          <div>
            <Button
              variant="secondary"
              busy={busy}
              disabled={Boolean(task.acknowledgedAt)}
              onClick={() =>
                onAction({
                  action: "acknowledge_incident",
                  targetId: incident.id,
                  expectedTaskUpdatedAt: task.updatedAt,
                  payload: { recipientTenantId: task.tenantId },
                })
              }
            >
              <CheckCheck className="size-4" />
              {task.acknowledgedAt ? "Task accepted" : "Accept communication task"}
            </Button>
            {task.acknowledgedAt ? (
              <p className="mt-1 max-w-48 text-right text-[11px] leading-4 text-slate-500">
                {task.assignee} · {formatScenarioTime(task.acknowledgedAt)}
              </p>
            ) : null}
          </div>
        ) : null}
        <Button
          disabled={
            !task.acknowledgedAt ||
            (terminal && task.status === "Resolved")
          }
          onClick={openUpdateModal}
        >
          <MessageSquareText className="size-4" />
          {incident.status === "Contained"
            ? task.status === "Resolved"
              ? "Containment sent"
              : "Send containment update"
            : incident.status === "Resolved"
            ? task.status === "Resolved"
              ? "Resolution sent"
              : "Send resolution update"
            : "Send customer update"}
        </Button>
      </div>
      {updateOpen ? (
        <ActionModal
          title={
            incident.status === "Contained"
              ? "Send the Easy Spaces containment update"
              : incident.status === "Resolved"
              ? "Send the Easy Spaces resolution"
              : "Send an Easy Spaces update"
          }
          detail={
            incident.status === "Contained"
              ? fallbackMitigation
                ? "Confirm that fallback service is running, name the remaining limitation, and identify Engineering as the owner of the permanent fix."
                : "Confirm what is working, what remains quarantined, who owns the exception, and that follow-up is still open."
              : incident.status === "Resolved"
                ? "Confirm the recovered workflow and make clear that no customer action remains."
              : "Keep the update customer-safe: what is affected, who owns the next step, and when they will hear back."
          }
          confirmLabel={
            incident.status === "Contained"
              ? "Send containment update"
              : incident.status === "Resolved"
                ? "Send resolution"
                : "Send update"
          }
          busy={busy}
          onClose={() => setUpdateOpen(false)}
          onConfirm={async () => {
            await onAction({
              action: "send_customer_update",
              targetId: incident.id,
              payload: {
                customerMessage: message,
                customerImpact: impact,
                customerAction,
                nextUpdateMinutes: terminal ? undefined : nextUpdateMinutes,
                recipientTenantId: task.tenantId,
              },
              expectedTaskUpdatedAt: task.updatedAt,
            });
            setUpdateOpen(false);
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-slate-500">
              Message visible in the customer portal
            </span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              maxLength={360}
              className="brand-focus mt-2 w-full resize-y rounded-md border border-[var(--line-strong)] bg-white px-3 py-2 text-sm leading-6 text-slate-800"
            />
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Customer impact</span>
              <textarea
                value={impact}
                onChange={(event) => setImpact(event.target.value)}
                rows={3}
                maxLength={240}
                className="brand-focus mt-2 w-full resize-y rounded-md border border-[var(--line-strong)] bg-white px-3 py-2 text-sm leading-5 text-slate-800"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Customer action</span>
              <textarea
                value={customerAction}
                onChange={(event) => setCustomerAction(event.target.value)}
                rows={3}
                maxLength={200}
                className="brand-focus mt-2 w-full resize-y rounded-md border border-[var(--line-strong)] bg-white px-3 py-2 text-sm leading-5 text-slate-800"
              />
            </label>
          </div>
          {!terminal ? (
            <label className="mt-4 block">
              <span className="text-xs font-medium text-slate-500">Next update commitment</span>
              <select
                value={nextUpdateMinutes}
                onChange={(event) => setNextUpdateMinutes(Number(event.target.value))}
                className="brand-focus mt-2 min-h-10 w-full rounded-md border border-[var(--line-strong)] bg-white px-3 text-sm text-slate-800"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </label>
          ) : null}
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              Recipient: {task.tenantName} · Do not include secrets or raw payloads.
            </span>
            <span>{message.length}/360</span>
          </div>
        </ActionModal>
      ) : null}
    </>
  );
}

function EngineerAction({
  incident,
  busy,
  onAction,
}: {
  incident: Incident;
  busy: boolean;
  onAction: ActionHandler;
}) {
  const [mappingModal, setMappingModal] = useState(false);
  const [connectorModal, setConnectorModal] = useState<
    "tests" | "deploy" | null
  >(null);
  const [transform, setTransform] = useState("Keep Draft as-is");
  const mappingPasses = transform === "Map Draft to Planning";

  if (
    incident.type === "mapping" &&
    incident.status === "Awaiting engineering"
  ) {
    return (
      <>
        <Button onClick={() => setMappingModal(true)}>
          <GitCommitHorizontal className="size-4" />
          Preview mapping change
        </Button>
        {mappingModal ? (
          <ActionModal
            title="Publish mapping v6.1"
            detail="Review the tenant scope, contract diff, and affected values before a new mapping version can be published."
            confirmLabel="Publish v6.1"
            confirmDisabled={!mappingPasses}
            busy={busy}
            onClose={() => setMappingModal(false)}
            onConfirm={async () => {
              await onAction({
                action: "publish_mapping",
                targetId: incident.id,
                payload: { transform },
              });
              setMappingModal(false);
            }}
          >
            <label className="block">
              <span className="text-xs font-medium text-slate-500">
                Transform
              </span>
              <select
                value={transform}
                onChange={(event) => setTransform(event.target.value)}
                className="brand-focus mt-2 h-10 w-full rounded-md border border-[var(--line-strong)] bg-white px-3 text-sm"
              >
                <option>Keep Draft as-is</option>
                <option>Map Draft to Planning</option>
              </select>
            </label>
            <div className="mt-4 grid gap-px overflow-hidden rounded-md border border-[var(--line)] bg-[var(--line)] sm:grid-cols-3">
              <div className="bg-white/70 p-3">
                <p className="text-xs text-slate-500">Publish scope</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  Easy Spaces only
                </p>
              </div>
              <div className="bg-white/70 p-3">
                <p className="text-xs text-slate-500">Version diff</p>
                <p className="mt-1 font-mono text-sm text-slate-900">
                  v6.0 → v6.1
                </p>
              </div>
              <div className="bg-white/70 p-3">
                <p className="text-xs text-slate-500">Blocked events</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  2 reservations
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_40px_1fr] items-center gap-3 rounded-md border border-[var(--line)] bg-white/55 p-4">
              <div>
                <p className="text-xs text-slate-500">Source sample</p>
                <p className="mt-1 font-mono text-sm text-slate-900">Draft</p>
              </div>
              <ArrowRight className="size-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Destination preview</p>
                <p
                  className={`mt-1 font-mono text-sm ${
                    mappingPasses ? "text-[#16888a]" : "text-red-700"
                  }`}
                >
                  {mappingPasses ? "Planning" : "Draft"}
                </p>
              </div>
            </div>
            <div
              className={`mt-3 flex items-start gap-2 rounded-md border p-3 text-xs ${
                mappingPasses
                  ? "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {mappingPasses ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <AlertTriangle className="size-4 shrink-0" />
              )}
              <span>
                {mappingPasses
                  ? "6 of 6 checks pass: two affected reservation samples and four destination contract cases."
                  : "2 sample cases fail. Draft is not accepted by the destination enum, so publishing stays blocked."}
              </span>
            </div>
          </ActionModal>
        ) : null}
      </>
    );
  }

  if (
    incident.type === "provider_change" &&
    incident.status === "Awaiting engineering"
  ) {
    return (
      <>
        <Button onClick={() => setConnectorModal("tests")}>
          <Code2 className="size-4" />
          Review contract tests
        </Button>
        {connectorModal === "tests" ? (
          <ActionModal
            title="Validate Slack connector v4.4.0-rc1"
            detail="The release candidate replaces the retired files.upload call with Slack's three-step external upload sequence."
            confirmLabel="Run 6 contract tests"
            busy={busy}
            onClose={() => setConnectorModal(null)}
            onConfirm={async () => {
              await onAction({
                action: "test_connector_patch",
                targetId: incident.id,
              });
              setConnectorModal(null);
            }}
          >
            <div className="overflow-hidden rounded-md border border-[var(--line)]">
              {[
                "Request an external upload URL",
                "Upload binary content to the signed URL",
                "Complete the external upload",
                "Post the message after the file is available",
                "Reject any files.upload fallback",
                "Preserve correlation and idempotency identifiers",
              ].map((test, index) => (
                <div
                  key={test}
                  className="flex items-center justify-between gap-4 border-b border-[var(--line)] bg-white/65 px-4 py-3 last:border-b-0"
                >
                  <span className="text-sm text-slate-700">{test}</span>
                  <span className="font-mono text-xs text-slate-500">
                    CT-{String(index + 1).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              These tests use a pinned Slack contract sample. No real workspace
              or token is touched.
            </p>
          </ActionModal>
        ) : null}
      </>
    );
  }

  if (
    incident.type === "provider_change" &&
    incident.status === "Ready to deploy"
  ) {
    return (
      <>
        <Button onClick={() => setConnectorModal("deploy")}>
          <Play className="size-4" />
          Review canary release
        </Button>
        {connectorModal === "deploy" ? (
          <ActionModal
            title="Deploy connector v4.4.0"
            detail="Start with the Easy Spaces canary. After two healthy risk-digest runs, the next cohort can be promoted."
            confirmLabel="Deploy Easy Spaces canary"
            busy={busy}
            onClose={() => setConnectorModal(null)}
            onConfirm={async () => {
              await onAction({
                action: "deploy_connector_patch",
                targetId: incident.id,
              });
              setConnectorModal(null);
            }}
          >
            <div className="grid gap-px overflow-hidden rounded-md border border-[var(--line)] bg-[var(--line)] sm:grid-cols-3">
              <div className="bg-white/70 p-4">
                <p className="text-xs text-slate-500">Environment</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  Demo canary
                </p>
              </div>
              <div className="bg-white/70 p-4">
                <p className="text-xs text-slate-500">Tenant scope</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  Easy Spaces
                </p>
              </div>
              <div className="bg-white/70 p-4">
                <p className="text-xs text-slate-500">Rollback</p>
                <p className="mt-1 font-mono text-sm text-slate-900">
                  slack-4.3.1-text-only
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <p className="text-xs leading-5 text-amber-900">
                The release stays in Monitoring until two scheduled digests pass.
                If a gate fails, active cohorts can roll back to the fallback
                connector before rollout expands.
              </p>
            </div>
          </ActionModal>
        ) : null}
      </>
    );
  }

  return null;
}

function stateTimeline(incident: Incident) {
  if (incident.status === "Contained" && incident.type === "data_quality") {
    return ["Detected", "Awaiting customer", "Validating", "Contained"];
  }
  if (incident.type === "provider_change") {
    return [
      "Detected",
      "Awaiting engineering",
      "Ready to deploy",
      "Monitoring",
      incident.status === "Contained" ? "Contained" : "Resolved",
    ];
  }
  if (incident.type === "rate_limit") {
    return ["Detected", "Backoff scheduled", "Running", "Resolved"];
  }
  return [
    "Detected",
    incident.type === "mapping"
      ? "Awaiting engineering"
      : "Awaiting customer",
    "Validating",
    "Retry queued",
    "Running",
    "Resolved",
  ];
}

function currentTimelineIndex(incident: Incident, timeline: string[]) {
  const found = timeline.indexOf(incident.status);
  if (found >= 0) return found;
  return Math.min(incident.step + 1, timeline.length - 1);
}

function RecoveryActionPanel({
  incident,
  remediationTask,
  supportTask,
  role,
  guided,
  busy,
  onAction,
}: {
  incident: Incident;
  remediationTask?: RemediationTask;
  supportTask?: SupportTask;
  role: Role;
  guided: boolean;
  busy: boolean;
  onAction: ActionHandler;
}) {
  if (isTerminalIncidentStatus(incident.status)) {
    const contained = incident.status === "Contained";
    return (
      <div className={`rounded-md border p-4 ${contained ? "border-amber-200 bg-amber-50/80" : "border-[#16888a]/20 bg-[#16888a]/8"}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            {contained ? (
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-700" />
            ) : (
              <BadgeCheck className="mt-0.5 size-5 shrink-0 text-[#16888a]" />
            )}
            <div>
              <p className="text-sm font-semibold text-slate-950">
                {contained
                  ? incident.disposition === "Fallback mitigation"
                    ? "Impact contained; fallback mitigation is active"
                    : "Impact contained; exception remains active"
                  : "Recovery completed"}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {incident.resolution}
              </p>
            </div>
          </div>
          {!guided &&
          role === "support" &&
          incident.supportEngagement === "Needs support" ? (
            <SupportAction
              incident={incident}
              task={supportTask}
              busy={busy}
              onAction={onAction}
            />
          ) : null}
        </div>
        {contained && remediationTask ? (
          <dl className="mt-4 grid gap-3 border-t border-amber-200 pt-4 text-xs sm:grid-cols-3">
            <div>
              <dt className="font-medium text-amber-800">Permanent remediation</dt>
              <dd className="mt-1 leading-5 text-slate-800">{remediationTask.title}</dd>
            </div>
            <div>
              <dt className="font-medium text-amber-800">Owner and due date</dt>
              <dd className="mt-1 leading-5 text-slate-800">
                {remediationTask.ownerLabel} · {formatScenarioTime(remediationTask.dueAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-amber-800">Completion condition</dt>
              <dd className="mt-1 leading-5 text-slate-800">
                {remediationTask.completionCondition}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>
    );
  }

  const roleCanAct =
    !guided &&
    ((role === "customer" && incident.owner === "Customer admin") ||
      (role === "engineer" && incident.owner === "Integration engineer"));

  return (
    <div className="rounded-md border border-[var(--line)] bg-white/55 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">
            Next action
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-950">
            {incident.actionState}
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            {guided
              ? "In guided mode, Play advances the next owner or automated step. It does not give the reviewer extra permissions."
              : roleCanAct
              ? incident.runbook
              : role === "support"
                ? incident.supportNote
              : incident.owner === "System"
                ? "The platform owns this step. A person can monitor it, but should not force the outcome."
                : `This step belongs to ${incident.owner}. Your role can watch progress, but cannot take the action.`}
          </p>
        </div>
        <div className="shrink-0">
          {!guided && role === "customer" ? (
            <CustomerAction incident={incident} />
          ) : null}
          {!guided && role === "engineer" ? (
            <EngineerAction
              incident={incident}
              busy={busy}
              onAction={onAction}
            />
          ) : null}
          {!guided &&
          role === "support" &&
          incident.supportEngagement === "Needs support" ? (
            <SupportAction
              incident={incident}
              task={supportTask}
              busy={busy}
              onAction={onAction}
            />
          ) : !guided && role === "support" ? (
            <span className="inline-flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">
              <ShieldCheck className="size-4" />
              {incident.supportEngagement === "Watching"
                ? "Watching only"
                : "No Support action"}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DemoControls({
  incident,
  busy,
  onAction,
}: {
  incident: Incident;
  busy: boolean;
  onAction: ActionHandler;
}) {
  const canAdvance = !isTerminalIncidentStatus(incident.status);
  return (
    <details className="rounded-md border border-dashed border-[var(--line-strong)] bg-white/38">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Sparkles className="size-4 text-[#e9624c]" />
          Walkthrough controls
        </span>
        <span className="text-xs text-slate-500">
          Guided mode only
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-dashed border-[var(--line-strong)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-xs leading-5 text-slate-600">
          Advance the next owner or automated step. Role-based workspaces do not
          show this control.
        </p>
        <Button
          variant="secondary"
          disabled={!canAdvance}
          busy={busy}
          onClick={() =>
            onAction({
              action: "run_guided_step",
              targetId: incident.id,
            })
          }
        >
          <TimerReset className="size-4" />
          Run next step
        </Button>
      </div>
    </details>
  );
}

export function IncidentView({
  workspace,
  incident,
  role,
  busy,
  onAction,
  onBack,
  onOpenRecoveryControl,
  portalMode = false,
  guided = false,
}: {
  workspace: WorkspaceSnapshot;
  incident: Incident;
  role: Role;
  busy: boolean;
  onAction: ActionHandler;
  onBack: () => void;
  onOpenRecoveryControl?: () => void;
  portalMode?: boolean;
  guided?: boolean;
}) {
  const provider = providerForIncident(workspace, incident);
  const flow = workspace.flows.find((item) => item.id === incident.flowId);
  const trace = workspace.traces[incident.id];
  const evidence = workspace.evidence[incident.id] ?? [];
  const visibleEvidence =
    portalMode && incident.type !== "data_quality" ? [] : evidence;
  const activity = workspace.activity.filter(
    (event) => event.incidentId === incident.id,
  );
  const timeline = stateTimeline(incident);
  const timelineIndex = currentTimelineIndex(incident, timeline);
  const recoveryPlan = workspace.recoveryPlans[incident.id];

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
      >
        <ArrowLeft className="size-4" />
        {portalMode ? "Back to Integration Center" : "Back to previous view"}
      </button>

      <section className="glass-panel overflow-hidden">
        <div className="border-b border-[var(--line)] p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <ProviderBrand provider={provider} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    {incidentLabels[incident.type]}
                  </p>
                  <SeverityDot severity={incident.severity} />
                </div>
                <h1 className="mt-2 text-2xl font-semibold text-slate-950">
                  {incident.title}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  {incident.summary}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <IncidentBadge status={incident.status} />
              {portalMode && incident.owner !== "Customer admin" ? (
                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800">
                  Platform team
                </span>
              ) : (
                <OwnerBadge owner={incident.owner} />
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-[var(--line)] sm:grid-cols-3">
          <div className="bg-white/68 p-4">
            <p className="text-xs font-medium text-slate-500">Business impact</p>
            <p className="mt-2 text-sm leading-6 text-slate-800">
              {incident.impact}
            </p>
          </div>
          <div className="bg-white/68 p-4">
            <p className="text-xs font-medium text-slate-500">Integration flow</p>
            <p className="mt-2 text-sm font-medium text-slate-800">
              {flow?.name}
            </p>
          </div>
          <div className="bg-white/68 p-4">
            <p className="text-xs font-medium text-slate-500">
              {portalMode ? "Current recovery owner" : "Provider response"}
            </p>
            <p
              className={`mt-2 text-sm text-slate-800 ${
                portalMode ? "font-medium" : "font-mono"
              }`}
            >
              {portalMode
                ? incident.owner === "Customer admin"
                  ? "Easy Spaces admin"
                  : "Platform team"
                : incident.providerCode}
            </p>
          </div>
        </div>
      </section>

      {recoveryPlan ? (
      <section className="overflow-hidden rounded-md border border-[var(--line)] bg-white/55">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Recovery decision chain
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              Signal to verified recovery, with one policy action authority
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RecoveryModeBadge incident={incident} />
            <EvidenceBadge
              matched={recoveryPlan.classificationBasis.length}
              missing={recoveryPlan.missingEvidence.length}
            />
          </div>
        </div>
        <RecoveryDecisionChain plan={recoveryPlan} />
        <div className="grid gap-px border-t border-[var(--line)] bg-[var(--line)] lg:grid-cols-[1fr_1fr_auto]">
          <div className="bg-white/68 p-4">
            <p className="text-xs font-medium text-slate-500">Action for this viewer</p>
            <p className="mt-2 text-xs leading-5 text-slate-800">
              {actionForViewer(incident, role, guided, portalMode)}
            </p>
          </div>
          <div className="bg-white/68 p-4">
            <p className="text-xs font-medium text-slate-500">Runtime handoff</p>
            <p className="mt-2 text-xs leading-5 text-slate-800">
              Current executor: {incident.owner}. {currentOwnerReason(incident)}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Communication owner: {communicationOwner(incident)}.
            </p>
          </div>
          {recoveryPlan.blastRadius === "Connector fleet" &&
          !portalMode &&
          onOpenRecoveryControl ? (
            <div className="flex items-center bg-white/68 p-4">
              <Button variant="secondary" onClick={onOpenRecoveryControl}>
                <Boxes className="size-4" />
                Review fleet recovery
              </Button>
            </div>
          ) : null}
        </div>
      </section>
      ) : null}

      {!portalMode && recoveryPlan ? (
        <details className="glass-panel overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5">
            <span>
              <span className="block text-xs font-semibold uppercase text-[#16888a]">
                Decision evidence and safeguards
              </span>
              <span className="mt-1 block text-sm font-semibold text-slate-950">
                Scope rationale, containment, rollback, and verification contract
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-slate-400" />
          </summary>
          <div className="flex flex-col gap-3 border-b border-[var(--line)] p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-[#16888a]">
                Recovery safeguards
              </p>
              <h2 className="mt-1 text-sm font-semibold text-slate-950">
                Contain first, then recover the smallest safe scope
              </h2>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-600">
                {recoveryPlan.scopeReason}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[#16888a]/20 bg-[#16888a]/8 px-2 py-1 text-xs font-medium text-[#0f6f71]">
                {recoveryPlan.blastRadius} scope
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                {recoveryPlan.risk} risk
              </span>
              <EvidenceBadge
                matched={recoveryPlan.classificationBasis.length}
                missing={recoveryPlan.missingEvidence.length}
              />
            </div>
          </div>
          <dl className="grid gap-px bg-[var(--line)] md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Containment", recoveryPlan.containment],
              ["Authorized actor", recoveryPlan.actionAuthority],
              ["Recovery action", recoveryPlan.proposedAction],
              ["Rollback", recoveryPlan.rollback],
            ].map(([label, value]) => (
              <div key={label} className="bg-white/68 p-4">
                <dt className="text-xs font-medium text-slate-500">{label}</dt>
                <dd className="mt-2 text-xs leading-5 text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-px border-t border-[var(--line)] bg-[var(--line)] md:grid-cols-2">
            <div className="bg-white/68 p-4">
              <p className="text-xs font-medium text-slate-500">
                Classification evidence
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-800">
                {recoveryPlan.classificationBasis.join(" · ")}
              </p>
            </div>
            <div className="bg-white/68 p-4">
              <p className="text-xs font-medium text-slate-500">
                Evidence still required
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-800">
                {recoveryPlan.missingEvidence.length
                  ? recoveryPlan.missingEvidence.join(" · ")
                  : "None. The current policy has enough evidence to choose the next safe action."}
              </p>
            </div>
          </div>
          <div className="grid gap-4 border-t border-[var(--line)] p-5 lg:grid-cols-[1fr_1fr_1.2fr]">
            <div>
              <p className="text-xs font-medium text-slate-500">Checkpoint</p>
              <p className="mt-2 break-all font-mono text-xs text-slate-800">
                {recoveryPlan.checkpoint}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Operation identity</p>
              <p className="mt-2 break-all font-mono text-xs text-slate-800">
                {recoveryPlan.idempotencyKey}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Verification gate</p>
              <p className="mt-2 text-xs leading-5 text-slate-800">
                {recoveryPlan.verification.join(" · ")}
              </p>
            </div>
          </div>
        </details>
      ) : null}

      <RecoveryActionPanel
        incident={incident}
        remediationTask={workspace.remediationTasks.find(
          (task) => task.incidentId === incident.id && task.status === "Open",
        )}
        supportTask={workspace.supportTasks.find(
          (task) => task.incidentId === incident.id,
        )}
        role={role}
        guided={guided}
        busy={busy}
        onAction={onAction}
      />

      {incident.type === "data_quality" ? (
        <QuarantinePanel workspace={workspace} />
      ) : null}

      <section className="glass-panel p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              Recovery state
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Explicit asynchronous transitions; no direct success setter
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {incident.id}
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {timeline.map((state, index) => {
            const completed = index < timelineIndex;
            const current = index === timelineIndex;
            return (
              <div key={state} className="relative">
                <div
                  className={`flex min-h-20 flex-col justify-between rounded-md border p-3 ${
                    current
                      ? "border-[#e9624c]/40 bg-[#e9624c]/8"
                      : completed
                        ? "border-[#16888a]/20 bg-[#16888a]/8"
                        : "border-[var(--line)] bg-white/45"
                  }`}
                >
                  {completed ? (
                    <CheckCircle2 className="size-4 text-[#16888a]" />
                  ) : current ? (
                    <CircleDot className="size-4 text-[#e9624c]" />
                  ) : (
                    <Clock3 className="size-4 text-slate-400" />
                  )}
                  <p className="mt-3 text-xs font-medium leading-4 text-slate-700">
                    {state}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {!portalMode &&
      incident.type === "mapping" &&
      workspace.mappingRelease.cases.length ? (
        <section className="glass-panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                Mapping release contract
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {workspace.mappingRelease.scope} · rollback {workspace.mappingRelease.rollbackVersion}
              </p>
            </div>
            <span className="font-mono text-xs text-slate-600">
              {incident.mappingVersion}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="bg-white/38 font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Input</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Evidence</th>
                  <th className="px-4 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {workspace.mappingRelease.cases.map((testCase) => (
                  <tr key={testCase.id}>
                    <td className="px-4 py-3 font-mono text-slate-600">{testCase.id}</td>
                    <td className="px-4 py-3 font-mono text-slate-800">{testCase.input}</td>
                    <td className="px-4 py-3 font-mono text-slate-800">{testCase.expected}</td>
                    <td className="px-4 py-3 text-slate-600">{testCase.provenance}</td>
                    <td className={`px-4 py-3 font-semibold ${testCase.result === "Pass" ? "text-[#16888a]" : "text-red-700"}`}>
                      {testCase.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="glass-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                Affected evidence
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Each row states whether it comes from sample data, a provider
                contract, or a demo event.
              </p>
            </div>
            {visibleEvidence.length ? (
              <a
                href={`/api/export?jobId=${encodeURIComponent(incident.jobId)}`}
                className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--line-strong)] bg-white/75 text-slate-600 hover:bg-white"
                aria-label="Export affected records"
                title="Export affected records"
              >
                <FileDown className="size-4" />
              </a>
            ) : null}
          </div>
          {visibleEvidence.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left">
                <thead className="bg-white/38 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Record</th>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Field</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Proposed</th>
                    <th className="px-4 py-3">Provenance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)] text-sm">
                  {visibleEvidence.slice(0, 6).map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{row.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.id}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.accountName ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {row.field}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-red-700">
                        {row.rawValue || "blank"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#16888a]">
                        {row.cleanedValue}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <span className="font-medium text-slate-800">
                          {row.provenance}
                        </span>
                        <span className="mt-1 block leading-5">
                          {row.sourceLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title={
                  portalMode
                    ? "No customer record action is required"
                    : "No business records were read"
                }
                detail={
                  portalMode
                    ? "The SaaS provider or integration platform owns this recovery step."
                    : "Authentication failed before the provider returned customer data."
                }
              />
            </div>
          )}
        </section>

        <section className="glass-panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">
              Operating log
            </h2>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {activity.length ? (
              activity.map((event) => (
                <div key={event.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-slate-900">
                      {event.action}
                    </p>
                    <span className="text-xs text-slate-400">
                      {event.actorRole}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {event.detail}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                    <span>{event.actorLabel}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={event.createdAt}>
                      {formatScenarioTime(event.createdAt)}
                    </time>
                  </p>
                </div>
              ))
            ) : (
              <p className="p-5 text-sm text-slate-500">
                {portalMode
                  ? "No customer-facing update has been posted yet."
                  : "No operator action has been recorded yet."}
              </p>
            )}
          </div>
        </section>
      </div>

      {!portalMode && trace ? (
        <details className="glass-panel overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <span className="flex items-center gap-3">
              <Braces className="size-4 text-[#16888a]" />
              <span>
                <span className="block text-sm font-semibold text-slate-950">
                  Provider trace and retry contract
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  Deterministic provider event · payload values are redacted
                </span>
              </span>
            </span>
            <ChevronRight className="size-4 text-slate-400" />
          </summary>
          <div className="border-t border-[var(--line)] p-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-md bg-slate-950 p-4 text-xs text-slate-200">
                <p className="font-mono leading-6">
                  endpoint: {trace.endpoint}
                  <br />
                  http_status: {trace.httpStatus ?? "none"}
                  <br />
                  response: {trace.providerResponse}
                  <br />
                  correlation_id: {trace.correlationId}
                  <br />
                  idempotency_key: {trace.idempotencyKey}
                  <br />
                  mapping: {trace.mappingVersion}
                  <br />
                  retry_policy: {trace.retryPolicy}
                </p>
              </div>
              <div className="space-y-3">
                {trace.steps.map((step) => (
                  <div
                    key={`${step.stage}-${step.timestamp}`}
                    className="flex gap-3 rounded-md border border-[var(--line)] bg-white/55 p-3"
                  >
                    <span
                      className={`mt-1 size-2 shrink-0 rounded-full ${
                        step.status === "Completed"
                          ? "bg-[#16888a]"
                          : step.status === "Scheduled"
                            ? "bg-sky-500"
                            : "bg-red-500"
                      }`}
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        {step.stage} · {step.status}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {step.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {incident.providerReferenceUrl ? (
              <a
                href={incident.providerReferenceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-xs font-medium brand-link hover:underline"
              >
                Open official provider reference
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
        </details>
      ) : null}
      {!portalMode && role === "support" && !trace ? (
        <section className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-white/55 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#16888a]" />
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              Engineering trace restricted
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Support can use the classified provider code and redacted evidence.
              Request temporary engineering access only when deeper payload or
              network inspection is required.
            </p>
          </div>
        </section>
      ) : null}

      {!portalMode && guided ? (
        <DemoControls incident={incident} busy={busy} onAction={onAction} />
      ) : null}
    </div>
  );
}

export function CustomerPortalView({
  workspace,
  onOpenIncident,
}: {
  workspace: WorkspaceSnapshot;
  onOpenIncident: (incidentId: string) => void;
}) {
  const active = workspace.incidents.filter(
    (incident) => !isTerminalIncidentStatus(incident.status),
  );
  const customerActions = active.filter(
    (incident) => incident.owner === "Customer admin",
  );
  const platformManaged = active.filter(
    (incident) => incident.owner !== "Customer admin",
  );
  const recentlyRecovered = workspace.incidents
    .filter((incident) => incident.status === "Resolved")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 3);
  const containedExceptions = workspace.incidents
    .filter((incident) => incident.status === "Contained")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const scheduledCustomerReviews = workspace.remediationTasks.filter(
    (task) => task.status === "Open" && task.owner === "Customer admin",
  );
  const customerConnections = workspace.connections.filter(
    (connection) =>
      connection.provider === "Salesforce" ||
      connection.provider === "HubSpot" ||
      connection.provider === "Google Sheets" ||
      connection.provider === "Slack",
  );
  return (
    <div className="space-y-7">
      <section className="border-b border-[var(--line)] pb-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-[#16888a]">
              Easy Spaces · Integration Center
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">
              Connected apps
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              See app health and handle the steps only Easy Spaces can complete,
              such as fixing source data or reconnecting an app.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <HealthBadge status={workspace.tenant.health} />
            <span className="text-sm text-slate-600">
              {customerActions.length} immediate action
              {customerActions.length === 1 ? "" : "s"}
              {scheduledCustomerReviews.length
                ? ` · ${scheduledCustomerReviews.length} scheduled review${scheduledCustomerReviews.length === 1 ? "" : "s"}`
                : ""}
            </span>
          </div>
        </div>
      </section>

      {customerActions.length ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-slate-950">
              Your attention is needed
            </h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {customerActions.map((incident) => {
              const provider = providerForIncident(workspace, incident);
              return (
                <button
                  key={incident.id}
                  onClick={() => onOpenIncident(incident.id)}
                  className="glass-panel flex items-start justify-between gap-4 p-5 text-left transition-colors hover:bg-white"
                >
                  <span className="flex min-w-0 gap-3">
                    <ProviderBrand provider={provider} />
                    <span>
                      <span className="text-sm font-semibold text-slate-950">
                        {incident.title}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">
                        {incident.impact}
                      </span>
                      <span className="mt-3 flex flex-wrap items-center gap-2">
                        <IncidentBadge status={incident.status} />
                        <span className="text-xs font-medium text-[#16888a]">
                          Action needed
                        </span>
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="mt-2 size-4 shrink-0 text-slate-400" />
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <EmptyState
          title="All customer actions are complete"
          detail="The platform will keep monitoring retries and scheduled syncs."
        />
      )}

      {platformManaged.length ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <RefreshCcw className="size-4 text-[#16888a]" />
            <h2 className="text-sm font-semibold text-slate-950">
              Updates from the platform
            </h2>
          </div>
          <div className="divide-y divide-[var(--line)] overflow-hidden rounded-md border border-[var(--line)] bg-white/65">
            {platformManaged.map((incident) => {
              const provider = providerForIncident(workspace, incident);
              const latestUpdate = workspace.customerCommunications.find(
                (communication) => communication.incidentId === incident.id,
              );
              return (
                <button
                  key={incident.id}
                  onClick={() => onOpenIncident(incident.id)}
                  className="grid w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-white md:grid-cols-[minmax(0,1fr)_180px_24px] md:items-center"
                >
                  <span className="flex min-w-0 gap-3">
                    <ProviderBrand provider={provider} />
                    <span>
                      <span className="text-sm font-semibold text-slate-950">
                        {incident.title}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">
                        {latestUpdate?.message ?? incident.impact}
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 md:justify-end">
                    <IncidentBadge status={incident.status} />
                    <span className="text-xs font-medium text-[#16888a]">
                      No action needed
                    </span>
                  </span>
                  <ChevronRight className="hidden size-4 text-slate-400 md:block" />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {workspace.customerCommunications.length ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <MessageSquareText className="size-4 text-[#16888a]" />
            <h2 className="text-sm font-semibold text-slate-950">Customer updates</h2>
          </div>
          <div className="divide-y divide-[var(--line)] overflow-hidden rounded-md border border-[var(--line)] bg-white/65">
            {workspace.customerCommunications.map((communication) => (
              <article key={communication.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-[#16888a]">{communication.kind}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-800">{communication.message}</p>
                  </div>
                  <time className="text-xs text-slate-500" dateTime={communication.postedAt}>
                    {formatScenarioTime(communication.postedAt)}
                  </time>
                </div>
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="font-medium text-slate-500">Impact</dt>
                    <dd className="mt-1 leading-5 text-slate-700">{communication.impact}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Your action</dt>
                    <dd className="mt-1 leading-5 text-slate-700">{communication.customerAction}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Recovery owner</dt>
                    <dd className="mt-1 leading-5 text-slate-700">{communication.recoveryOwner}</dd>
                    <dd className="mt-1 text-slate-500">
                      {communication.nextUpdateBy
                        ? `Next update by ${formatScenarioTime(communication.nextUpdateBy)}`
                        : "Final update"}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {containedExceptions.length ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="size-4 text-amber-700" />
            <h2 className="text-sm font-semibold text-slate-950">Active exceptions and mitigations</h2>
          </div>
          <div className="divide-y divide-[var(--line)] overflow-hidden rounded-md border border-amber-200 bg-amber-50/65">
            {containedExceptions.map((incident) => {
              const remediation = workspace.remediationTasks.find(
                (task) => task.incidentId === incident.id && task.status === "Open",
              );
              return (
                <button
                  key={incident.id}
                  onClick={() => onOpenIncident(incident.id)}
                  className="grid w-full gap-3 px-5 py-4 text-left hover:bg-amber-50 md:grid-cols-[minmax(0,1fr)_230px] md:items-center"
                >
                  <span>
                    <span className="text-sm font-semibold text-slate-950">{incident.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-700">{incident.resolution}</span>
                  </span>
                  <span className="text-xs leading-5 text-slate-600 md:text-right">
                    <span className="block font-medium text-amber-800">
                      Follow-up still open
                    </span>
                    <span className="block">
                      Owner: {remediation?.ownerLabel ?? "Platform team"}
                    </span>
                    {remediation ? (
                      <span className="block">
                        Due {formatScenarioTime(remediation.dueAt)}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {recentlyRecovered.length ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <BadgeCheck className="size-4 text-[#16888a]" />
            <h2 className="text-sm font-semibold text-slate-950">
              Recently recovered
            </h2>
          </div>
          <div className="divide-y divide-[var(--line)] overflow-hidden rounded-md border border-[var(--line)] bg-white/65">
            {recentlyRecovered.map((incident) => (
              <button
                key={incident.id}
                onClick={() => onOpenIncident(incident.id)}
                className="grid w-full gap-3 px-5 py-4 text-left hover:bg-white md:grid-cols-[minmax(0,1fr)_210px] md:items-center"
              >
                <span>
                  <span className="text-sm font-semibold text-slate-950">
                    {incident.title}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">
                    {incident.resolution}
                  </span>
                </span>
                <span className="md:text-right">
                  <span className="block text-xs font-medium text-[#0f6f71]">
                    No further action
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Completed {formatScenarioTime(incident.updatedAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold text-slate-950">
          Application health
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {customerConnections.map((connection) => (
            <div key={connection.id} className="glass-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <ProviderBrand provider={connection.provider} />
                <HealthBadge status={connection.status} />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-950">
                {connection.provider}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {connection.authStatus}
              </p>
              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <p className="text-xs text-slate-500">Last sync</p>
                <p className="mt-1 text-xs font-medium text-slate-800">
                  {formatScenarioTime(connection.lastSync)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="soft-panel grid gap-5 p-5 md:grid-cols-[1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[#16888a]" />
            <h2 className="text-sm font-semibold text-slate-950">
              What Easy Spaces controls
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Source data, app authorization, and which scopes to grant.
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <RefreshCcw className="size-4 text-[#e9624c]" />
            <h2 className="text-sm font-semibold text-slate-950">
              What the platform controls
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Validation, retries, checkpoints, mapping code, and connector
            changes.
          </p>
        </div>
      </section>
    </div>
  );
}

function QuarantinePanel({ workspace }: { workspace: WorkspaceSnapshot }) {
  return (
    <section className="glass-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Boxes className="mt-0.5 size-5 shrink-0 text-[#16888a]" />
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              Selective replay quarantine
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Only the six invalid Salesforce sample records are held. Their
              recovery state stays separate from the six valid records that
              already continued.
            </p>
          </div>
        </div>
        <span className="text-xs font-medium text-slate-500">
          {workspace.quarantine.length} source records
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-white/45 text-slate-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Source record</th>
              <th className="px-5 py-3 font-semibold">Checkpoint</th>
              <th className="px-5 py-3 font-semibold">Operation identity</th>
              <th className="px-5 py-3 font-semibold">Replay status</th>
              <th className="px-5 py-3 font-semibold">Attempt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] bg-white/55">
            {workspace.quarantine.map((record) => (
              <tr key={record.id}>
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-900">{record.label}</p>
                  <p className="mt-1 font-mono text-slate-500">
                    {record.sourceRecordId}
                  </p>
                </td>
                <td className="px-5 py-3 font-mono text-slate-600">
                  {record.checkpoint}
                </td>
                <td
                  className="max-w-64 truncate px-5 py-3 font-mono text-slate-600"
                  title={record.idempotencyKey}
                >
                  {record.idempotencyKey}
                </td>
                <td className="px-5 py-3">
                  <span className="rounded-full border border-[#16888a]/20 bg-[#16888a]/8 px-2 py-1 font-medium text-[#0f6f71]">
                    {record.status}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-slate-500">
                  {record.replayAttemptId ?? "Not created"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function FleetView({
  workspace,
  role,
  guided,
  busyTarget,
  onAction,
  onOpenIncident,
}: {
  workspace: WorkspaceSnapshot;
  role: Role;
  guided: boolean;
  busyTarget: string | null;
  onAction: ActionHandler;
  onOpenIncident: (incidentId: string) => void;
}) {
  const [rollbackReason, setRollbackReason] = useState("");
  const release = workspace.fleetRelease;
  const providerIncident = workspace.incidents.find(
    (incident) => incident.id === "inc-api-001",
  );
  const fleetPlan = workspace.recoveryPlans["inc-api-001"];
  const fingerprint = workspace.incidentFingerprints["inc-api-001"];
  const exposureDecision = workspace.exposureDecisions["inc-api-001"];
  const decisionHistory =
    workspace.exposureDecisionHistory["inc-api-001"] ?? [];
  const harborProbes = workspace.evidenceProbes.filter(
    (probe) => probe.dependencyId === "dep-harbor-slack-digest",
  );
  const activeProbe = harborProbes.find((probe) =>
    ["Queued", "Running"].includes(probe.status),
  );
  const heldTargetCount = release.targets.filter(
    (target) => target.rolloutStatus === "Held for review",
  ).length;
  const releaseStopped = release.status === "Rolled back";
  const fleetRemediation = workspace.remediationTasks.find(
    (task) => task.incidentId === "inc-api-001" && task.status === "Open",
  );
  const canPromote =
    ["Canary passed", "Early access passed"].includes(release.status) &&
    !(release.status === "Canary passed" && heldTargetCount > 0);
  const guidedCanAdvance = [
    "Canary passed",
    "Health gate blocked",
    "Early access running",
    "Early access passed",
    "General rollout running",
  ].includes(release.status) || (Boolean(activeProbe) && !releaseStopped);
  const canRollback = ![
    "Ready for canary",
    "Completed",
    "Rolled back",
  ].includes(release.status);
  const exposureLabel = `${workspace.fleetMetrics.atRiskTenants} at risk`;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Fleet recovery"
        title="Recover the Slack connector safely"
        detail="Use this view to confirm which tenants are affected, clear evidence holds, roll out the fix by cohort, and keep rollback ready."
        action={
          <button
            onClick={() => onOpenIncident("inc-api-001")}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--line-strong)] bg-white/80 px-3 text-sm font-medium text-slate-700 hover:bg-white"
          >
            <ShieldAlert className="size-4 text-[#e9624c]" />
            Open Slack incident
          </button>
        }
      />

      <section className="soft-panel grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase text-[#16888a]">
              Provider incident
            </span>
            <span
              className={`rounded-full border px-2 py-1 text-xs font-medium ${
                workspace.fleetIncident.status === "Resolved"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : workspace.fleetIncident.status === "Recovering"
                    ? "border-sky-200 bg-sky-50 text-sky-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {workspace.fleetIncident.status}
            </span>
            <SeverityDot severity={workspace.fleetIncident.severity} />
          </div>
          <h2 className="mt-2 text-base font-semibold text-slate-950">
            {workspace.fleetIncident.title}
          </h2>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {workspace.fleetIncident.actionState}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-violet-800">
              Recovery: {workspace.fleetIncident.recoveryOwner}
            </span>
            <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-sky-800">
              Communication: {workspace.fleetIncident.communicationOwner}
            </span>
            <span className={`rounded-md border px-2 py-1 ${
              workspace.fleetIncident.responseSlaStatus === "Breached"
                ? "border-red-200 bg-red-50 text-red-700"
                : workspace.fleetIncident.responseSlaStatus === "Due soon"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : workspace.fleetIncident.responseSlaStatus === "Closed"
                    ? "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]"
                    : "border-slate-200 bg-white/70 text-slate-600"
            }`}>
              Response {workspace.fleetIncident.responseSlaStatus.toLowerCase()} · {formatScenarioTime(workspace.fleetIncident.responseDueAt)}
            </span>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-md border border-[var(--line)] bg-white/65 p-3">
            <dt className="text-slate-500">Affected tenants</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-950">
              {workspace.fleetIncident.affectedTenantIds.length}
            </dd>
          </div>
          <div className="rounded-md border border-[var(--line)] bg-white/65 p-3">
            <dt className="text-slate-500">Exposed tenants</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-950">
              {workspace.fleetIncident.exposedTenantIds.length}
            </dd>
          </div>
          <div className="rounded-md border border-[var(--line)] bg-white/65 p-3">
            <dt className="text-slate-500">Tenants held</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-950">
              {workspace.fleetIncident.heldForEvidenceTenantIds.length}
            </dd>
          </div>
        </dl>
      </section>

      {releaseStopped && fleetRemediation ? (
        <section className="grid gap-4 rounded-md border border-amber-200 bg-amber-50/75 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)]">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Impact is contained; this release will not be promoted
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-700">
                {fleetRemediation.scope} A new patch must create a separate release
                before cohort gates can run again.
              </p>
            </div>
          </div>
          <dl className="text-xs leading-5 text-slate-700 lg:text-right">
            <div>
              <dt className="font-medium text-amber-800">Permanent remediation owner</dt>
              <dd>{fleetRemediation.ownerLabel}</dd>
            </div>
            <div className="mt-2">
              <dt className="font-medium text-amber-800">Target date</dt>
              <dd>{formatScenarioTime(fleetRemediation.dueAt)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="flex flex-col gap-3 rounded-md border border-sky-200 bg-sky-50/80 px-4 py-3 text-xs text-sky-950 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Automated demo worker</p>
          <p className="mt-1 leading-5 text-sky-800">
            Page loads do not change state. Automated work advances only when a
            retry, check, or release gate is due.
          </p>
        </div>
        <div className="sm:text-right">
          <p className="font-medium">
            {workspace.scenarioWorker.pendingWork.length} pending automated step
            {workspace.scenarioWorker.pendingWork.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-sky-700">
            {guided
              ? "Guided mode waits for Play"
              : workspace.scenarioWorker.nextEligibleAt
                ? `Next eligible ${formatScenarioTime(workspace.scenarioWorker.nextEligibleAt)}`
                : "No system work is due"}
          </p>
        </div>
      </section>

      <div className="flex items-start gap-3">
        <Boxes className="mt-0.5 size-5 shrink-0 text-[#e9624c]" />
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">
            Active fleet recovery path
          </p>
          <h2 className="mt-1 text-sm font-semibold text-slate-950">
            Slack file-upload capability recovery
          </h2>
        </div>
      </div>

      <div className="glass-panel grid overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Current exposure"
          value={exposureLabel}
          detail={`${workspace.fleetMetrics.affectedTenants} affected · ${workspace.fleetMetrics.atRiskTenants - workspace.fleetMetrics.affectedTenants} exposed`}
          tone="danger"
        />
        <Metric
          label="Needs review"
          value={workspace.fleetMetrics.needsReviewTenants}
          detail="Stale dependency metadata"
        />
        <Metric
          label="Safely excluded"
          value={workspace.fleetMetrics.notExposedTenants}
          detail="Capability or endpoint does not match"
          tone="positive"
        />
        <Metric
          label="Release outcome"
          value={release.status}
          detail={`${release.observedHealthyRuns}/${release.requiredHealthyRuns} healthy runs at current gate`}
          tone={
            release.status === "Completed"
              ? "positive"
              : release.status === "Health gate blocked"
                ? "danger"
                : "neutral"
          }
        />
      </div>

      {fleetPlan && fingerprint && exposureDecision ? (
        <section className="glass-panel overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-[var(--line)] p-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-3">
              <Search className="mt-0.5 size-5 shrink-0 text-[#16888a]" />
              <div>
                <p className="text-xs font-semibold uppercase text-[#16888a]">
                  Latest exposure assessment
                </p>
                <h2 className="mt-1 text-base font-semibold text-slate-950">
                  {fingerprint.classification}
                </h2>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-600">
                  The policy checks each active workflow path against execution
                  evidence and the current dependency snapshot. If evidence is
                  missing or stale, the system creates review work instead of
                  taking a fleet-wide action.
                </p>
              </div>
            </div>
            <EvidenceBadge
              matched={fleetPlan.classificationBasis.length}
              missing={fleetPlan.missingEvidence.length}
            />
          </div>

          <dl className="grid gap-px bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Observed signal", `${fingerprint.errorCode} · ${fingerprint.endpoint} · ${fingerprint.capability}`],
              ["Vulnerable range", fingerprint.vulnerableVersionRange],
              ["Correlation", `${fingerprint.correlatedFailureCount} failure · ${fingerprint.correlatedTenantCount} tenant · ${fingerprint.correlationWindowMinutes} min`],
              ["Decision mode", exposureDecision.evaluationMode],
              ["Policy revision", exposureDecision.policyVersion],
              ["Decision ID", exposureDecision.decisionId],
              ["Dependency snapshot", exposureDecision.dependencySnapshotVersion],
            ].map(([label, value]) => (
              <div key={label} className="bg-white/68 p-4">
                <dt className="text-xs font-medium text-slate-500">{label}</dt>
                <dd className="mt-2 break-words font-mono text-xs leading-5 text-slate-800">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {decisionHistory.length > 1 ? (
            <div className="border-t border-[var(--line)] bg-[#16888a]/6 px-5 py-4">
              <p className="text-xs font-semibold text-[#0f6f71]">
                Evidence refreshed; original detection kept
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Revision {decisionHistory.length} refreshed the stale dependency and recalculated scope without changing the original incident evidence.
              </p>
            </div>
          ) : null}

          {harborProbes.length ? (
            <div className="border-t border-[var(--line)] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-900">
                    Harbor evidence checks
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    A failed check keeps the existing decision. Only a successful
                    check can update dependency metadata and scope.
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {harborProbes.length} attempt{harborProbes.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {harborProbes.map((probe) => (
                  <div key={probe.id} className="rounded-md border border-[var(--line)] bg-white/65 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-slate-900">
                        Attempt {probe.attempt} · {probe.status}
                      </p>
                      <span className="font-mono text-[11px] text-slate-500">
                        {probe.traceId}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      {probe.failureReason ??
                        (probe.result
                          ? `Verified ${probe.result.capabilities.join(", ")} on ${probe.result.endpoints.join(", ")}.`
                          : `${probe.source} is ${probe.status.toLowerCase()}.`)}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Requested {formatScenarioTime(probe.requestedAt)}
                      {probe.completedAt
                        ? ` · completed ${formatScenarioTime(probe.completedAt)}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="divide-y divide-[var(--line)] border-t border-[var(--line)] sm:hidden">
            {fleetPlan.tenantAssessments.map((assessment) => {
              const reviewDependencyId = assessment.pathAssessments.find(
                (path) => path.state === "Needs review",
              )?.dependencyId;
              const communication = workspace.fleetIncident.communications.find(
                (item) => item.tenantId === assessment.tenantId,
              );
              return (
                <div key={assessment.tenantId} className="space-y-4 bg-white/55 p-4 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">{assessment.tenantName}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ExposureBadge state={assessment.state} />
                      <EvidenceBadge
                        matched={assessment.matchedSignals.length}
                        missing={assessment.missingEvidence.length}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-slate-500">Why</p>
                    <p className="mt-1 leading-5 text-slate-700">
                      {assessment.decisionReason}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-500">Safe next action</p>
                    <p className="mt-1 leading-5 text-slate-700">
                      {assessment.recommendedAction}
                    </p>
                    {assessment.state === "Needs review" &&
                    reviewDependencyId &&
                    (role === "engineer" || guided) &&
                    !releaseStopped ? (
                      activeProbe && !guided ? (
                        <span className="mt-3 inline-flex rounded-md border border-sky-200 bg-sky-50 px-3 py-2 font-medium text-sky-800">
                          Check {activeProbe.status.toLowerCase()} · automated step next
                        </span>
                      ) : (
                        <Button
                          variant="secondary"
                          busy={
                            busyTarget === reviewDependencyId ||
                            busyTarget === release.id
                          }
                          className="mt-3"
                          onClick={() =>
                            activeProbe
                              ? onAction({
                                  action: "run_guided_release_step",
                                  targetId: release.id,
                                  expectedUpdatedAt: release.updatedAt,
                                })
                              : onAction({
                                  action: "refresh_dependency_evidence",
                                  targetId: reviewDependencyId,
                                })
                          }
                        >
                          {activeProbe ? <Play className="size-4" /> : <RefreshCcw className="size-4" />}
                          {activeProbe
                            ? activeProbe.status === "Queued"
                              ? "Start check"
                              : "Record result"
                            : "Refresh evidence"}
                        </Button>
                      )
                    ) : null}
                  </div>
                  {communication ? (
                    <div>
                      <p className="font-medium text-slate-500">Customer communication</p>
                      <p className="mt-1 font-semibold text-slate-800">
                        {communication.status} · {communication.requirement}
                      </p>
                      <p className="mt-1 leading-5 text-slate-600">
                        {communication.reason}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto border-t border-[var(--line)] sm:block">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-white/45 text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Tenant decision</th>
                  <th className="px-5 py-3 font-semibold">Active dependency</th>
                  <th className="px-5 py-3 font-semibold">Why</th>
                  <th className="px-5 py-3 font-semibold">Safe next action</th>
                  <th className="px-5 py-3 font-semibold">Customer communication</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] bg-white/55">
                {fleetPlan.tenantAssessments.map((assessment) => {
                  const reviewDependencyId = assessment.pathAssessments.find(
                    (path) => path.state === "Needs review",
                  )?.dependencyId;
                  const communication = workspace.fleetIncident.communications.find(
                    (item) => item.tenantId === assessment.tenantId,
                  );
                  return (
                    <tr key={assessment.tenantId} className="align-top">
                      <td className="min-w-48 px-5 py-4">
                        <p className="font-semibold text-slate-900">
                          {assessment.tenantName}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <ExposureBadge state={assessment.state} />
                          <EvidenceBadge
                            matched={assessment.matchedSignals.length}
                            missing={assessment.missingEvidence.length}
                          />
                        </div>
                      </td>
                      <td className="min-w-56 px-5 py-4">
                        <p className="mb-2 text-[11px] font-semibold uppercase text-slate-500">
                          {assessment.pathAssessments.length} registered {assessment.pathAssessments.length === 1 ? "path" : "paths"}
                        </p>
                        <div className="space-y-2">
                          {assessment.pathAssessments.map((path) => {
                            const dependency = workspace.connectorDependencies.find(
                              (item) => item.id === path.dependencyId,
                            );
                            return (
                              <div
                                key={path.dependencyId}
                                className="border-l-2 border-slate-200 pl-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-slate-800">
                                    {path.workflowName}
                                  </p>
                                  <ExposureBadge state={path.state} />
                                </div>
                                <p className="mt-1 font-mono leading-5 text-slate-500">
                                  {dependency
                                    ? `${dependency.connectorVersion} · ${dependency.endpoints.join(", ") || "endpoint unknown"}`
                                    : path.dependencyId}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="min-w-72 px-5 py-4">
                        <p className="leading-5 text-slate-700">
                          {assessment.decisionReason}
                        </p>
                        <p className="mt-2 leading-5 text-slate-500">
                          Evidence: {assessment.matchedSignals.join(" · ") || "No exact match"}
                        </p>
                        {assessment.missingEvidence.length ? (
                          <p className="mt-1 leading-5 text-sky-800">
                            Missing: {assessment.missingEvidence.join(" · ")}
                          </p>
                        ) : null}
                      </td>
                      <td className="min-w-72 px-5 py-4 leading-5 text-slate-700">
                        <p>{assessment.recommendedAction}</p>
                        {assessment.state === "Needs review" &&
                        reviewDependencyId &&
                        (role === "engineer" || guided) &&
                        !releaseStopped ? (
                          activeProbe ? (
                            guided ? (
                              <Button
                                variant="secondary"
                                busy={busyTarget === release.id}
                                className="mt-3"
                                onClick={() =>
                                  onAction({
                                    action: "run_guided_release_step",
                                    targetId: release.id,
                                    expectedUpdatedAt: release.updatedAt,
                                  })
                                }
                              >
                                <Play className="size-4" />
                                {activeProbe.status === "Queued"
                                  ? "Start check"
                                  : "Record result"}
                              </Button>
                            ) : (
                              <span className="mt-3 inline-flex rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">
                                Check {activeProbe.status.toLowerCase()} · automated step next
                              </span>
                            )
                          ) : (
                            <Button
                              variant="secondary"
                              busy={busyTarget === reviewDependencyId}
                              className="mt-3"
                              onClick={() =>
                                onAction({
                                  action: "refresh_dependency_evidence",
                                  targetId: reviewDependencyId,
                                })
                              }
                            >
                              <RefreshCcw className="size-4" />
                              Refresh evidence
                            </Button>
                          )
                        ) : null}
                      </td>
                      <td className="min-w-64 px-5 py-4 align-top">
                        {communication ? (
                          <div>
                            <span
                              className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${
                                communication.status === "Resolved"
                                  ? "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]"
                                  : ["Unassigned", "Update due", "Overdue"].includes(
                                        communication.status,
                                      )
                                    ? "border-amber-200 bg-amber-50 text-amber-800"
                                    : ["Monitoring", "Waiting for recovery"].includes(
                                          communication.status,
                                        )
                                      ? "border-sky-200 bg-sky-50 text-sky-700"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                              }`}
                            >
                              {communication.status}
                            </span>
                            <p className="mt-2 font-medium text-slate-800">
                              {communication.requirement}
                            </p>
                            <p className="mt-1 leading-5 text-slate-500">
                              {communication.reason}
                            </p>
                            {communication.lastUpdateAt ? (
                              <p className="mt-2 text-[11px] text-slate-400">
                                Last sent {formatScenarioTime(communication.lastUpdateAt)}
                              </p>
                            ) : null}
                            {communication.nextUpdateBy ? (
                              <p className="mt-1 text-[11px] text-slate-400">
                                Next update due {formatScenarioTime(communication.nextUpdateBy)}
                              </p>
                            ) : null}
                            <p className={`mt-1 text-[11px] font-medium ${
                              communication.slaStatus === "Breached"
                                ? "text-red-700"
                                : communication.slaStatus === "Due soon"
                                  ? "text-amber-700"
                                  : "text-slate-500"
                            }`}>
                              SLA {communication.slaStatus.toLowerCase()}
                            </p>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[var(--line)] p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <ProviderBrand provider={release.provider} />
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Active connector release
              </p>
              <h2 className="mt-1 text-base font-semibold text-slate-950">
                {release.connector} · {release.toVersion}
              </h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600">
                The next cohort stays pinned until the current cohort passes
                {` ${release.requiredHealthyRuns} `}
                healthy runs. Brightline is outside the impact area, so
                its upgrade is routine version convergence. The text-only
                connector remains the rollback fallback.
              </p>
            </div>
          </div>
          <span className="inline-flex w-fit rounded-full border border-[#16888a]/20 bg-[#16888a]/8 px-2.5 py-1 text-xs font-semibold text-[#0f6f71]">
            {release.status}
          </span>
        </div>

        <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
          {release.targets.map((tenant) => (
            <div key={tenant.id} className="bg-white/68 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    {tenant.cohort}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {tenant.name}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2 py-1 text-xs font-medium ${
                    tenant.rolloutStatus === "Healthy"
                      ? "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]"
                      : tenant.rolloutStatus === "Monitoring"
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : tenant.rolloutStatus === "Held for review"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                        : tenant.rolloutStatus === "Rolled back"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  {tenant.rolloutStatus}
                </span>
              </div>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-slate-500">Active</dt>
                  <dd className="font-mono text-slate-800">
                    {tenant.activeConnectorVersion}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">Health gate</dt>
                  <dd className="max-w-[190px] text-right leading-5 text-slate-700">
                    {formatFleetHealthCheck(tenant.lastHealthCheck)}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 border-t border-[var(--line)] pt-3 text-xs leading-5 text-slate-500">
                {tenant.scenarioData}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--line)] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-900">
                Health gate evidence
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Gate status comes from saved measurements, not a manually
                entered pass count.
              </p>
            </div>
            <p className="font-mono text-[11px] leading-5 text-slate-600 lg:text-right">
              success ≥ {(release.healthPolicy.minimumSuccessRate * 100).toFixed(1)}% · error ≤ {(release.healthPolicy.maximumErrorRate * 100).toFixed(1)}% · p95 ≤ {release.healthPolicy.maximumP95LatencyMs} ms · duplicates ≤ {release.healthPolicy.maximumDuplicateWrites}
            </p>
          </div>
          {release.healthEvidence.length ? (
            <div className="mt-4 overflow-x-auto rounded-md border border-[var(--line)]">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-white/50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Cohort / run</th>
                    <th className="px-4 py-3 font-semibold">Success</th>
                    <th className="px-4 py-3 font-semibold">Error</th>
                    <th className="px-4 py-3 font-semibold">p95 latency</th>
                    <th className="px-4 py-3 font-semibold">Duplicates</th>
                    <th className="px-4 py-3 font-semibold">Gate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)] bg-white/65">
                  {release.healthEvidence.map((evidence) => (
                    <tr key={evidence.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {evidence.cohort} · run {evidence.runNumber}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-slate-500">
                          {evidence.traceIds.length} trace{evidence.traceIds.length === 1 ? "" : "s"} · {evidence.policyVersion}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {(evidence.successRate * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {(evidence.errorRate * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {evidence.p95LatencyMs} ms
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {evidence.duplicateWrites}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-1 font-medium ${evidence.status === "Passed" ? "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]" : "border-red-200 bg-red-50 text-red-700"}`}>
                          {evidence.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500">
              No cohort measurements yet. Deploy the affected canary to begin collecting evidence.
            </p>
          )}
        </div>

        <div className="border-t border-[var(--line)] p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Release controls</p>
              <p className="mt-1 text-xs leading-5 text-slate-700">
                {release.status === "Ready for canary"
                  ? "Run the Slack tests and deploy the canary before promotion begins."
                  : release.status === "Canary passed" && heldTargetCount > 0
                    ? `${heldTargetCount} early-access target is held until dependency evidence succeeds.`
                  : release.status === "Rolled back"
                    ? `${release.rollbackReason} This release cannot be promoted; permanent remediation is tracked separately.`
                    : release.status === "Health gate blocked"
                      ? "A saved health measurement failed policy. Promotion is blocked; review the evidence and roll back before continuing."
                    : "Promotion is manual; health checks and gate completion are automated."}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              {role === "engineer" && !guided && canRollback ? (
                <label className="block min-w-64">
                  <span className="text-xs font-medium text-slate-500">Rollback reason</span>
                  <input
                    value={rollbackReason}
                    onChange={(event) => setRollbackReason(event.target.value)}
                    placeholder="Why is rollback safer than continuing?"
                    className="mt-1 h-9 w-full rounded-md border border-[var(--line-strong)] bg-white/80 px-3 text-xs text-slate-800 outline-none focus:border-[#16888a]"
                  />
                </label>
              ) : null}
              {role === "engineer" && !guided && canRollback ? (
                <Button
                  variant="danger"
                  busy={busyTarget === release.id}
                  disabled={rollbackReason.trim().length < 12}
                  onClick={() =>
                    onAction({
                      action: "rollback_fleet_release",
                      targetId: release.id,
                      expectedUpdatedAt: release.updatedAt,
                      payload: { rollbackReason },
                    })
                  }
                >
                  <RotateCcw className="size-4" />
                  Roll back
                </Button>
              ) : null}
              {role === "engineer" && !guided && canPromote ? (
                <Button
                  busy={busyTarget === release.id}
                  onClick={() =>
                    onAction({
                      action: "promote_fleet_release",
                      targetId: release.id,
                      expectedUpdatedAt: release.updatedAt,
                    })
                  }
                >
                  <Rocket className="size-4" />
                  Promote next cohort
                </Button>
              ) : null}
              {guided && guidedCanAdvance ? (
                <Button
                  busy={busyTarget === release.id}
                  onClick={() =>
                    onAction({
                      action: "run_guided_release_step",
                      targetId: release.id,
                      expectedUpdatedAt: release.updatedAt,
                    })
                  }
                >
                  <Play className="size-4" />
                  {activeProbe
                    ? activeProbe.status === "Queued"
                      ? "Start check"
                      : "Record result"
                    : ["Early access running", "General rollout running"].includes(release.status)
                      ? `Record health run ${release.observedHealthyRuns + 1} of ${release.requiredHealthyRuns}`
                      : release.status === "Health gate blocked"
                        ? "Run engineering rollback"
                        : "Promote next cohort"}
                </Button>
              ) : null}
              {guided &&
              release.status === "Canary running" &&
              providerIncident?.status === "Monitoring" ? (
                <Button
                  variant="secondary"
                  busy={busyTarget === providerIncident.id}
                  onClick={() =>
                    onAction({
                      action: "run_guided_degraded_canary",
                      targetId: providerIncident.id,
                      expectedUpdatedAt: providerIncident.updatedAt,
                    })
                  }
                >
                  <ShieldAlert className="size-4 text-[#e9624c]" />
                  Simulate degraded canary
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

export function InsightsView({
  workspace,
}: {
  workspace: WorkspaceSnapshot;
}) {
  const resolved = workspace.incidents.filter(
    (incident) => incident.status === "Resolved",
  ).length;
  const retryAttempts = workspace.jobs.filter((job) => job.retryOf).length;
  const supportActions = workspace.activity.filter(
    (event) =>
      event.action === "Acknowledged incident" ||
      ["Sent customer update", "Sent resolution update", "Sent containment update"].includes(
        event.action,
      ),
  ).length;
  const healthyCohorts = workspace.fleetRelease.targets.filter(
    (tenant) => tenant.rolloutStatus === "Healthy",
  ).length;
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Demo metrics"
        title="Recovery metrics"
        detail="These numbers come from the current demo run. They show what the product would measure, without claiming real production impact."
      />
      <section>
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-950">
            Decision indicators
          </h2>
          <p className="text-xs text-slate-500">
            Calculated from timestamps, policy decisions, and audit events in this run
          </p>
        </div>
        <div className="glass-panel grid overflow-hidden sm:grid-cols-2 lg:grid-cols-5">
          <Metric
            label="Median classification latency"
            value={`${workspace.insights.decisionMetrics.medianTimeToOwnerMinutes} min`}
            detail="Detection to policy classification in this run"
            tone="positive"
          />
          <Metric
            label="Multi-role paths"
            value={workspace.insights.decisionMetrics.multiRolePathsObserved}
            detail="Shows cross-role participation, not handoff volume"
            tone={workspace.insights.decisionMetrics.multiRolePathsObserved ? "neutral" : "positive"}
          />
          <Metric
            label="Demo MTTR"
            value={
              workspace.insights.decisionMetrics.medianTimeToResolveMinutes === null
                ? "Pending"
                : `${workspace.insights.decisionMetrics.medianTimeToResolveMinutes} min`
            }
            detail={`${workspace.insights.decisionMetrics.resolvedIncidents} resolved decision paths`}
          />
          <Metric
            label="System-owned paths"
            value={`${workspace.insights.decisionMetrics.systemManagedPaths}/${workspace.insights.decisionMetrics.totalDecisionPaths}`}
            detail="The platform owns the first recovery step"
          />
          <Metric
            label="Bounded-scope decisions"
            value={workspace.insights.decisionMetrics.boundedScopeDecisions}
            detail={`${workspace.insights.decisionMetrics.excludedFleetPaths} fleet path excluded · ${workspace.insights.decisionMetrics.guardedDecisions} held for review`}
            tone="positive"
          />
        </div>
      </section>
      <section className="soft-panel grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">
            Outcome validation
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            Needs real-user validation
          </p>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          A real pilot should compare this workflow against the current process: task success, time to correct action, unsafe action attempts, and escalation rate. The numbers above only describe this demo run.
        </p>
      </section>
      <div className="glass-panel grid overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Human recovery actions"
          value={workspace.insights.humanActionsCompleted}
          detail="Customer or Engineering decisions"
        />
        <Metric
          label="System transitions"
          value={workspace.insights.systemTransitionsCompleted}
          detail="Validation, retry, monitoring"
          tone="positive"
        />
        <Metric
          label="Recovered paths"
          value={`${resolved}/${workspace.incidents.length}`}
          detail={`${workspace.insights.decisionMetrics.containedIncidents} contained exception${workspace.insights.decisionMetrics.containedIncidents === 1 ? "" : "s"} excluded from MTTR`}
          tone={resolved ? "positive" : "neutral"}
        />
        <Metric
          label="Support interventions"
          value={supportActions}
          detail="Communication on severe incidents"
          tone={supportActions ? "neutral" : "positive"}
        />
      </div>
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-950">
          Recovery outcomes
        </h2>
        <div className="glass-panel grid overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Quarantine state"
            value={`${workspace.fleetMetrics.replayedRecords}/${workspace.quarantine.length}`}
            detail="Sample-backed records selectively replayed"
            tone={workspace.fleetMetrics.replayedRecords ? "positive" : "neutral"}
          />
          <Metric
            label="Unaffected work continued"
            value={workspace.fleetMetrics.unaffectedRecordsContinued}
            detail="Valid records were not held"
            tone="positive"
          />
          <Metric
            label="Healthy cohorts"
            value={`${healthyCohorts}/${workspace.fleetRelease.targets.length}`}
            detail={workspace.fleetRelease.status}
            tone={healthyCohorts ? "positive" : "neutral"}
          />
          <Metric
            label="Rollbacks"
            value={workspace.fleetMetrics.rollbacks}
            detail="Persisted release outcomes in this run"
          />
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="glass-panel p-5">
          <h2 className="text-sm font-semibold text-slate-950">
            Recovery policy mix
          </h2>
          <div className="mt-4 divide-y divide-[var(--line)]">
            {workspace.insights.recoveryMix.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4 py-4">
                <span className="text-sm text-slate-700">{item.label}</span>
                <span className="text-lg font-semibold text-slate-950">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="glass-panel p-5">
          <h2 className="text-sm font-semibold text-slate-950">
            Runtime evidence
          </h2>
          <dl className="mt-4 divide-y divide-[var(--line)]">
            <div className="flex items-center justify-between gap-4 py-4">
              <dt className="text-sm text-slate-700">Retry attempts created</dt>
              <dd className="text-lg font-semibold text-slate-950">{retryAttempts}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-4">
              <dt className="text-sm text-slate-700">Open-source business records</dt>
              <dd className="text-lg font-semibold text-slate-950">{workspace.quality.totalRecords}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-4">
              <dt className="text-sm text-slate-700">Provider contracts referenced</dt>
              <dd className="text-lg font-semibold text-slate-950">{workspace.providerContracts.length}</dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="glass-panel p-5">
        <div className="flex items-start gap-3">
          <UsersRound className="mt-0.5 size-5 shrink-0 text-[#e9624c]" />
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              What a real pilot should measure
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              A production pilot should measure waiting time by owner, time to
              verified recovery, handoffs between people, exhausted retry
              budgets, repeated incidents, rollback rate, and customer-update
              SLA. In this demo, multi-role paths show participation, not actual
              handoff volume; fleet exclusions and evidence holds are tracked
              separately.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PolicyCenterView({ workspace }: { workspace: WorkspaceSnapshot }) {
  const [selectedPolicyId, setSelectedPolicyId] = useState(
    workspace.policyCatalog.find((policy) => policy.failureClass === "provider_change")
      ?.id ?? workspace.policyCatalog[0]?.id ?? "",
  );
  const [signalOverrides, setSignalOverrides] = useState<Record<string, boolean>>({});
  const [counterexampleActive, setCounterexampleActive] = useState(false);
  const selected =
    workspace.policyCatalog.find((policy) => policy.id === selectedPolicyId) ??
    workspace.policyCatalog[0];
  const fallbackPolicy = workspace.policyCatalog.find(
    (policy) => policy.failureClass === "unknown",
  );
  const missingSignals = selected
    ? selected.matchSignals.filter((signal) => signalOverrides[signal] === false)
    : [];
  const usesFallback = Boolean(
    selected &&
      (selected.failureClass === "unknown" ||
        missingSignals.length > 0 ||
        counterexampleActive),
  );
  const simulated = usesFallback ? (fallbackPolicy ?? selected) : selected;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Recovery policy"
        title="Policy sandbox"
        detail="Test how a recovery policy behaves when evidence is complete, missing, or contradicted. This sandbox does not change the active demo run."
      />

      <section className="glass-panel overflow-hidden">
        <div className="grid gap-px bg-[var(--line)] md:grid-cols-[360px_minmax(0,1fr)]">
          <div className="bg-white/65 p-5">
            <label className="block text-xs font-semibold text-slate-700" htmlFor="policy-scenario">
              Policy case
            </label>
            <select
              id="policy-scenario"
              value={selectedPolicyId}
              onChange={(event) => {
                setSelectedPolicyId(event.target.value);
                setSignalOverrides({});
                setCounterexampleActive(false);
              }}
              className="brand-focus mt-2 h-10 w-full rounded-md border border-[var(--line-strong)] bg-white px-3 text-sm text-slate-900"
            >
              {workspace.policyCatalog.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.failureClass === "unknown"
                    ? "Unknown / incomplete evidence"
                    : policy.classification}
                </option>
              ))}
            </select>
            {selected?.matchSignals.length ? (
              <fieldset className="mt-5">
                <legend className="text-xs font-semibold text-slate-700">
                  Evidence available
                </legend>
                <div className="mt-2 space-y-2">
                  {selected.matchSignals.map((signal) => (
                    <label
                      key={signal}
                      className="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--line)] bg-white/70 p-3 text-xs leading-5 text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={signalOverrides[signal] !== false}
                        onChange={(event) =>
                          setSignalOverrides((current) => ({
                            ...current,
                            [signal]: event.target.checked,
                          }))
                        }
                        className="mt-0.5 size-4 accent-[#16888a]"
                      />
                      <span>{signal}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {selected && selected.failureClass !== "unknown" ? (
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-amber-50/80 p-3 text-xs leading-5 text-amber-900">
                <input
                  type="checkbox"
                  checked={counterexampleActive}
                  onChange={(event) => setCounterexampleActive(event.target.checked)}
                  className="mt-0.5 size-4 accent-amber-700"
                />
                <span>Add counterexample: {selected.counterexample}</span>
              </label>
            ) : null}
            <p className="mt-4 text-xs leading-5 text-slate-600">
              This sandbox starts from one selected policy case. The full event
              classifier still lives in the exposure engine.
            </p>
          </div>

          {selected && simulated ? (
            <div className="bg-white/75 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#16888a]">
                    {usesFallback ? "Manual review decision" : "Matched policy"}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-slate-950">
                    {simulated.classification}
                  </h2>
                </div>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${simulated.productionMutationAllowed ? "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]" : "border-red-200 bg-red-50 text-red-700"}`}>
                  {simulated.productionMutationAllowed
                    ? `Eligible with ${simulated.approval.toLowerCase()} approval`
                    : "Production action blocked"}
                </span>
              </div>
              {usesFallback ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/75 px-4 py-3 text-xs leading-5 text-amber-900">
                  {missingSignals.length
                    ? `Missing required evidence: ${missingSignals.join(" · ")}.`
                    : counterexampleActive
                      ? "A counterexample conflicts with the otherwise matching signature."
                      : "The observed evidence does not match a published recovery rule."}
                  {" "}Production action stops here, and the case moves to manual investigation.
                </div>
              ) : null}
              <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ["Policy version", simulated.version],
                  ["Failure class", simulated.failureClass],
                  ["Who can act", simulated.actionAuthority],
                  ["Accountable owner", simulated.accountableOwner],
                  ["Maximum scope", simulated.scope],
                  ["Approval", simulated.approval],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-slate-500">{label}</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 grid gap-5 border-t border-[var(--line)] pt-5 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-slate-900">Evidence basis</p>
                  <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-600">
                    {simulated.evidenceBasis.map((evidence) => (
                      <li key={evidence} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#16888a]" />
                        {evidence}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900">Policy outcome</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    {simulated.recoveryAction}
                  </p>
                  <p className="mt-3 text-xs font-medium text-amber-800">Escalation</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {simulated.escalation}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="glass-panel overflow-hidden">
        <div className="border-b border-[var(--line)] p-5">
          <h2 className="text-sm font-semibold text-slate-950">Published policies</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Known failures can proceed only within their allowed owner, scope, and approval rules. Anything unknown routes to manual investigation.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-white/45 text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Failure class</th>
                <th className="px-5 py-3 font-semibold">Owner</th>
                <th className="px-5 py-3 font-semibold">Scope</th>
                <th className="px-5 py-3 font-semibold">Approval</th>
                <th className="px-5 py-3 font-semibold">Production action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] bg-white/65">
              {workspace.policyCatalog.map((policy) => (
                <tr key={policy.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">{policy.classification}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">{policy.id}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{policy.accountableOwner}</td>
                  <td className="px-5 py-3 text-slate-700">{policy.scope}</td>
                  <td className="px-5 py-3 text-slate-700">{policy.approval}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full border px-2 py-1 font-medium ${policy.productionMutationAllowed ? "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]" : "border-red-200 bg-red-50 text-red-700"}`}>
                      {policy.productionMutationAllowed
                        ? `Eligible with ${policy.approval.toLowerCase()} approval`
                        : "Blocked"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function DataLineageView({
  workspace,
}: {
  workspace: WorkspaceSnapshot;
}) {
  const relationshipCount =
    workspace.quality.resolvedContactAccountLinks +
    workspace.quality.resolvedReservationContactLinks +
    workspace.quality.resolvedSpaceMarketLinks;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="soft-panel p-4">
          <p className="text-xs text-slate-500">Open-licensed records</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {workspace.quality.salesforceCc0Records}
          </p>
        </div>
        <div className="soft-panel p-4">
          <p className="text-xs text-slate-500">Relationships resolved</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {relationshipCount}
          </p>
        </div>
        <div className="soft-panel p-4">
          <p className="text-xs text-slate-500">Phones normalized</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {workspace.quality.normalizedPhones}
          </p>
        </div>
      </div>
      <section>
        <h3 className="text-sm font-semibold text-slate-950">
          Business record source
        </h3>
        <div className="mt-3 divide-y divide-[var(--line)] rounded-md border border-[var(--line)] bg-white/55">
          {workspace.sources.map((source) => (
            <div
              key={source.id}
              className="grid gap-2 p-4 sm:grid-cols-[1fr_180px]"
            >
              <div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold brand-link hover:underline"
                >
                  {source.name}
                </a>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {source.use}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-slate-500">{source.license}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {source.version.slice(0, 12)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-slate-950">
          Provider contract references
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {workspace.providerContracts.map((contract) => (
            <a
              key={contract.id}
              href={contract.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-[var(--line)] bg-white/55 p-4 hover:bg-white"
            >
              <p className="text-xs font-semibold uppercase text-slate-500">
                {contract.provider}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {contract.title}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {contract.use}
              </p>
            </a>
          ))}
        </div>
      </section>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">
          Simulation boundary
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-800">
          OAuth expiry, HTTP responses, timing, retries, and audit events are
          simulated for this demo. They follow official provider contracts, but
          they are not real production events. Quarantine, replay, release, and
          rollback still update real demo state, so the walkthrough is repeatable
          and inspectable.
        </p>
      </div>
    </div>
  );
}
