"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  Cable,
  Clock3,
  Compass,
  Database,
  FileWarning,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  ActionRequest,
  ConsoleRoute,
  DemoSession,
  Role,
  View,
  WorkspaceSnapshot,
} from "@/lib/types";
import { IconButton } from "./ui";
import {
  ConnectionsView,
  CustomerPortalView,
  DataLineageView,
  FleetView,
  GuidedReviewView,
  IncidentView,
  InsightsView,
  IntegrationView,
  JobsView,
  MappingView,
  OverviewView,
  PolicyCenterView,
} from "./workspace-views";

const roles: Record<Role, { label: string; organization: string }> = {
  support: { label: "Support admin", organization: "SaaS provider" },
  customer: { label: "Customer admin", organization: "Easy Spaces" },
  engineer: { label: "Integration engineer", organization: "SaaS provider" },
};

const baseNavigation: {
  id: View;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: "overview", label: "Incidents", icon: LayoutDashboard },
  { id: "fleet", label: "Recovery control", icon: Boxes },
  { id: "integration", label: "Integrations", icon: GitBranch },
  { id: "connection", label: "Connections", icon: Cable },
  { id: "mapping", label: "Mappings", icon: SlidersHorizontal },
  { id: "jobs", label: "Run history", icon: Activity },
  { id: "policy", label: "Policy center", icon: ShieldCheck },
  { id: "insights", label: "Insights", icon: BarChart3 },
];

function routePath(
  view: View,
  flowId: string,
  jobId: string,
  tenantId: string,
  guided = false,
) {
  if (view === "overview") return guided ? "/?guided=1&view=incidents" : "/";
  if (view === "fleet") return "/fleet";
  if (view === "guided") return "/?guided=1";
  if (view === "portal") return "/portal";
  if (view === "insights") return "/insights";
  if (view === "policy") return "/policy";
  if (view === "failure") return `/jobs/${encodeURIComponent(jobId)}`;
  if (view === "connection") {
    return `/customers/${encodeURIComponent(tenantId)}/connections`;
  }
  const base = `/customers/${encodeURIComponent(tenantId)}/integrations/${encodeURIComponent(flowId)}`;
  if (view === "mapping") return `${base}/mappings`;
  if (view === "jobs") return `${base}/jobs`;
  return base;
}

function WorkspaceError({ message }: { message: string }) {
  return (
    <div className="app-shell flex min-h-screen items-center justify-center p-6">
      <div className="glass-panel max-w-md p-6 text-center">
        <FileWarning className="mx-auto size-6 text-red-600" />
        <h1 className="mt-3 text-lg font-semibold text-slate-950">
          Workspace could not be opened
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        <a
          href="/access"
          className="brand-button mt-5 inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-semibold"
        >
          Return to demo access
        </a>
      </div>
    </div>
  );
}

function DataLineageModal({
  workspace,
  onClose,
}: {
  workspace: WorkspaceSnapshot;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#202426]/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="data-lineage-title"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="glass-panel max-h-[92vh] w-full max-w-4xl overflow-y-auto shadow-2xl">
        <header className="glass-bar sticky top-0 z-10 flex items-start justify-between gap-4 border-b p-5">
          <div>
            <p className="text-xs font-semibold uppercase text-[#16888a]">
              Data notes
            </p>
            <h2
              id="data-lineage-title"
              className="mt-1 text-xl font-semibold text-slate-950"
            >
              What comes from sample data
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              CRM records come from an open sample dataset. Provider errors,
              retries, and timing are simulated so the demo is safe to replay.
            </p>
          </div>
          <IconButton label="Close data notes" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </header>
        <div className="p-5">
          <DataLineageView workspace={workspace} />
        </div>
      </section>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="app-shell flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <RefreshCcw className="size-4 animate-spin text-[#e9624c]" />
        Opening demo workspace
      </div>
    </div>
  );
}

export default function IntegrationOpsConsole({
  initialRoute,
}: {
  initialRoute: ConsoleRoute;
}) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [session, setSession] = useState<DemoSession | null>(null);
  const [view, setView] = useState<View>(initialRoute.view);
  const [selectedFlowId, setSelectedFlowId] = useState(
    initialRoute.flowId ?? "",
  );
  const [selectedIncidentId, setSelectedIncidentId] = useState(
    initialRoute.incidentId ?? "",
  );
  const [authReady, setAuthReady] = useState(false);
  const [busyTarget, setBusyTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopNavigation, setDesktopNavigation] = useState(false);
  const [incidentOrigin, setIncidentOrigin] = useState<View>(
    initialRoute.view === "failure" ? "overview" : initialRoute.view,
  );
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const syncNavigationMode = () => setDesktopNavigation(media.matches);
    syncNavigationMode();
    media.addEventListener("change", syncNavigationMode);
    return () => media.removeEventListener("change", syncNavigationMode);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      try {
        const sessionResponse = await fetch("/api/session", {
          cache: "no-store",
        });
        if (sessionResponse.status === 401) {
          const returnTo = `${window.location.pathname}${window.location.search}`;
          window.location.replace(
            `/access?returnTo=${encodeURIComponent(returnTo)}`,
          );
          return;
        }
        if (!sessionResponse.ok) throw new Error("Demo session unavailable");
        const sessionResult = (await sessionResponse.json()) as {
          session: DemoSession;
        };
        const routeQuery = new URLSearchParams(window.location.search);
        const incidentOriginParam = routeQuery.get("from") as View | null;
        const validIncidentOrigins: View[] = [
          "guided",
          "overview",
          "fleet",
          "integration",
          "connection",
          "mapping",
          "jobs",
          "policy",
          "insights",
        ];
        if (
          initialRoute.view === "failure" &&
          incidentOriginParam &&
          validIncidentOrigins.includes(incidentOriginParam)
        ) {
          setIncidentOrigin(incidentOriginParam);
        }
        const endpoint = initialRoute.customerId
          ? `/api/workspace?customerId=${encodeURIComponent(initialRoute.customerId)}`
          : "/api/workspace";
        const workspaceResponse = await fetch(endpoint, {
          cache: "no-store",
        });
        if (!workspaceResponse.ok) {
          const result = (await workspaceResponse.json()) as { error?: string };
          throw new Error(result.error ?? "Persistent workspace unavailable");
        }
        const snapshot =
          (await workspaceResponse.json()) as WorkspaceSnapshot;
        if (!active) return;
        setSession(sessionResult.session);
        setWorkspace(snapshot);
        setError(null);
        setAuthReady(true);

        const routeJob = initialRoute.jobId
          ? snapshot.jobs.find((job) => job.id === initialRoute.jobId)
          : null;
        const routeIncident =
          snapshot.incidents.find(
            (incident) => incident.id === initialRoute.incidentId,
          ) ??
          snapshot.incidents.find(
            (incident) => incident.id === routeJob?.incidentId,
          );
        const initialFlow =
          snapshot.flows.find((flow) => flow.id === initialRoute.flowId) ??
          snapshot.flows.find((flow) => flow.id === routeIncident?.flowId) ??
          snapshot.flows[0];
        setSelectedFlowId(initialFlow.id);
        setSelectedIncidentId(routeIncident?.id ?? snapshot.incidents[0].id);

        if (sessionResult.session.mode === "guided") {
          setView(
            initialRoute.view === "overview"
              ? routeQuery.get("view") === "incidents"
                ? "overview"
                : "guided"
              : initialRoute.view,
          );
        } else if (sessionResult.session.role === "customer") {
          setView(initialRoute.view === "failure" ? "failure" : "portal");
          if (
            initialRoute.view !== "portal" &&
            initialRoute.view !== "failure"
          ) {
            router.replace("/portal");
          }
        } else if (initialRoute.view === "portal") {
          setView("overview");
          router.replace("/");
        }
      } catch (loadError) {
        if (!active) return;
        setAuthReady(true);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The persistent workspace is unavailable.",
        );
      }
    }
    void loadWorkspace();
    return () => {
      active = false;
    };
  }, [
    initialRoute.customerId,
    initialRoute.flowId,
    initialRoute.incidentId,
    initialRoute.jobId,
    initialRoute.view,
    router,
  ]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!authReady || !session || !workspace) return;
    const refresh = window.setInterval(async () => {
      if (busyTarget || document.visibilityState !== "visible") return;
      try {
        const query = initialRoute.customerId
          ? `?customerId=${encodeURIComponent(initialRoute.customerId)}`
          : "";
        const shouldRunWorker =
          session.mode !== "guided" &&
          workspace.scenarioWorker.pendingWork.length > 0;
        const endpoint =
          shouldRunWorker
            ? `/api/scenario/tick${query}`
            : `/api/workspace${query}`;
        const response = await fetch(endpoint, {
          method: shouldRunWorker ? "POST" : "GET",
          cache: "no-store",
        });
        if (response.ok) {
          setWorkspace((await response.json()) as WorkspaceSnapshot);
        }
      } catch {
        // Keep the last good snapshot; the next interval will retry.
      }
    }, 2500);
    return () => window.clearInterval(refresh);
  }, [authReady, busyTarget, initialRoute.customerId, session, workspace]);

  if (!authReady) return <LoadingScreen />;
  if (!workspace || !session) {
    return <WorkspaceError message={error ?? "Demo workspace unavailable."} />;
  }
  const loadedWorkspace = workspace;

  const role: Role = session?.role ?? "support";
  const activeRole = roles[role];
  const guided = session.mode === "guided";
  const navigation =
    !guided && role === "support"
      ? baseNavigation.filter((item) => item.id !== "mapping")
      : baseNavigation;
  const releaseCohortCount = new Set(
    workspace.fleetTenants.map((tenant) => tenant.cohort),
  ).size;
  const selectedIncident =
    workspace.incidents.find(
      (incident) => incident.id === selectedIncidentId,
    ) ?? workspace.incidents[0];
  const selectedFlow =
    workspace.flows.find((flow) => flow.id === selectedFlowId) ??
    workspace.flows.find((flow) => flow.id === selectedIncident?.flowId) ??
    workspace.flows[0];

  const breadcrumb = (() => {
    if (view === "failure") {
      return `Incidents / ${selectedIncident?.title ?? "Incident"}`;
    }
    if (view === "fleet") return "Recovery control / Execute and verify";
    if (view === "overview") return "Incidents / Detect and triage";
    if (view === "guided") return "Guided walkthrough / Recovery orchestration";
    if (view === "integration") return "Easy Spaces / Integrations";
    if (view === "connection") return "Easy Spaces / Connections";
    if (view === "mapping") return "Easy Spaces / Mappings";
    if (view === "jobs") return "Easy Spaces / Run history";
    if (view === "policy") return "Governance / Recovery policy";
    return "Easy Spaces / Operational insights";
  })();

  function navigate(nextView: View) {
    if (role === "customer") {
      setView("portal");
      router.push("/portal");
      return;
    }
    setView(nextView);
    setMobileMenuOpen(false);
    router.push(
      routePath(
        nextView,
        selectedFlow.id,
        selectedIncident?.jobId ?? loadedWorkspace.jobs[0].id,
        loadedWorkspace.tenant.id,
        guided,
      ),
    );
  }

  function openIncident(incidentId: string) {
    const incident = loadedWorkspace.incidents.find(
      (item) => item.id === incidentId,
    );
    if (!incident) return;
    if (view !== "failure") setIncidentOrigin(view);
    setSelectedIncidentId(incident.id);
    setSelectedFlowId(incident.flowId);
    setView("failure");
    if (role !== "customer") {
      const query = new URLSearchParams({ from: view });
      if (guided) query.set("guided", "1");
      router.push(`/jobs/${encodeURIComponent(incident.jobId)}?${query}`);
    }
  }

  async function performAction(request: ActionRequest) {
    setBusyTarget(request.targetId);
    setError(null);
    try {
      const incidentVersion = loadedWorkspace.incidents.find(
        (incident) => incident.id === request.targetId,
      )?.updatedAt;
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...request,
          commandId: request.commandId ?? crypto.randomUUID(),
          expectedUpdatedAt: request.expectedUpdatedAt ?? incidentVersion,
        }),
      });
      const result = (await response.json()) as
        | WorkspaceSnapshot
        | { error?: string };
      if (!response.ok || !("tenant" in result)) {
        throw new Error(
          "error" in result && result.error
            ? result.error
            : "The action could not be completed.",
        );
      }
      setWorkspace(result);
      const notices: Record<ActionRequest["action"], string> = {
        approve_source_fix:
          "Salesforce field policy approved. Validation now belongs to the platform.",
        decline_source_fix:
          "The policy exception was recorded. Blank contacts remain quarantined while unaffected records continue.",
        complete_oauth:
          "HubSpot authorization returned. The platform is verifying the grant.",
        acknowledge_incident:
          "Tenant communication task accepted. The initial update is now due.",
        acknowledge_fleet_incident:
          "Provider incident acknowledged. Tenant communication tasks remain separately routed.",
        send_customer_update:
          "Customer update sent to the Easy Spaces Integration Center.",
        publish_mapping:
          "Mapping v6.1 published. Sample validation is running.",
        test_connector_patch:
          "Connector contract tests passed. The patch is ready to deploy.",
        deploy_connector_patch:
          "Slack connector v4.4.0 deployed. The next run is being monitored.",
        refresh_dependency_evidence:
          "Dependency probe queued. The current decision stays unchanged until the worker verifies fresh evidence.",
        promote_fleet_release:
          "The next fleet cohort is live. Its health gate is now collecting run evidence.",
        rollback_fleet_release:
          "Active cohorts returned to the fallback connector. Promotion is stopped.",
        run_guided_release_step:
          "The next fleet release event has been added to this guided run.",
        run_guided_degraded_canary:
          "Degraded canary telemetry failed the health gate. Broader promotion is blocked.",
        run_guided_step:
          "The next owner or system event has been added to this guided run.",
        reset_demo: "Demo run restored to its starting state.",
      };
      setNotice(notices[request.action]);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The action could not be completed.",
      );
    } finally {
      setBusyTarget(null);
    }
  }

  async function resetDemo() {
    await performAction({ action: "reset_demo", targetId: "workspace" });
    setSelectedIncidentId(loadedWorkspace.incidents[0].id);
    setSelectedFlowId(loadedWorkspace.flows[0].id);
    setView("guided");
    router.push("/?guided=1");
    setResetConfirmOpen(false);
  }

  function requestReset() {
    setResetConfirmOpen(true);
  }

  async function signOut() {
    await fetch("/api/session", { method: "DELETE" });
    window.location.assign("/access");
  }

  if (role === "customer") {
    return (
      <div className="app-shell">
        <header className="glass-bar sticky top-0 z-20 border-b">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <button
              onClick={() => {
                setView("portal");
                router.push("/portal");
              }}
              className="flex items-center gap-3 text-left"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-md border border-[#16888a]/20 bg-[#16888a] text-white">
                <Cable className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-950">
                  Easy Spaces
                </span>
                <span className="block text-xs text-slate-500">
                  Integration Center
                </span>
              </span>
            </button>
            <div className="flex items-center gap-2">
              <a
                href="/access?returnTo=/portal"
                className="hidden rounded-md border border-[var(--line-strong)] bg-white/75 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white sm:block"
              >
                {activeRole.label} · Demo
              </a>
              <IconButton label="Sign out" onClick={signOut}>
                <LogOut className="size-4" />
              </IconButton>
            </div>
          </div>
        </header>
        {error ? (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        <div className="border-b border-sky-200 bg-sky-50/80 px-4 py-2.5 text-xs text-sky-900 sm:px-6">
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            <Clock3 className="size-3.5 shrink-0" />
            <span>
              Accelerated demo clock · system-owned recovery events advance every 2.5 seconds
            </span>
          </div>
        </div>
        <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:py-9">
          {view === "failure" && selectedIncident ? (
            <IncidentView
              workspace={workspace}
              incident={selectedIncident}
              role={role}
              busy={busyTarget === selectedIncident.id}
              onAction={performAction}
              onBack={() => {
                setView("portal");
                router.push("/portal");
              }}
              portalMode
            />
          ) : (
            <CustomerPortalView
              workspace={workspace}
              onOpenIncident={openIncident}
            />
          )}
        </main>
        {notice ? (
          <div
            role="status"
            className="glass-panel fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 px-4 py-3 text-sm font-medium text-slate-800"
          >
            <ShieldCheck className="size-4 shrink-0 text-[#16888a]" />
            {notice}
          </div>
        ) : null}
      </div>
    );
  }

  const navigationVisible = desktopNavigation || mobileMenuOpen;

  return (
    <div className="app-shell">
      <aside
        aria-hidden={!navigationVisible}
        inert={!navigationVisible}
        className={`glass-rail fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r transition-transform lg:w-[216px] lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/70 px-4">
          <button
            className="flex items-center gap-3 text-left"
            onClick={() => navigate(guided ? "guided" : "fleet")}
          >
            <span className="brand-button inline-flex size-9 items-center justify-center rounded-md border">
              <Cable className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-950">
                Integration Ops
              </span>
              <span className="block text-xs text-slate-500">
                Internal console
              </span>
            </span>
          </button>
          <button
            aria-label="Close navigation"
            title="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
            className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="border-b border-white/70 px-4 py-4">
          <p className="text-xs font-semibold uppercase text-slate-400">
            Active recovery
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {workspace.fleetTenants.length} release targets
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {releaseCohortCount} cohorts · Slack connector family
              </p>
            </div>
            <span className="size-2 rounded-full bg-amber-500" />
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {guided ? (
            <>
              <p className="px-3 pb-2 pt-2 text-xs font-semibold uppercase text-slate-400">
                Demo mode
              </p>
              <button
                onClick={() => navigate("guided")}
                className={`relative flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                  view === "guided" ? "nav-active" : "nav-idle"
                }`}
              >
                <Compass className="size-4" />
                <span>Guided review</span>
              </button>
            </>
          ) : null}
          <p className="px-3 pb-2 pt-2 text-xs font-semibold uppercase text-slate-400">
            Workspace
          </p>
          {navigation.map((item) => {
            const Icon = item.icon;
            const active =
              view === item.id ||
              (item.id === "overview" && view === "failure");
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`relative flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                  active ? "nav-active" : "nav-idle"
                }`}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
                {item.id === "overview" &&
                (workspace.tenant.openIncidents > 0 ||
                  workspace.fleetIncident.status !== "Resolved") ? (
                  <span className="ml-auto min-w-5 rounded-full bg-red-100 px-1.5 py-0.5 text-center text-xs text-red-700">
                    <span
                      title={`${workspace.tenant.openIncidents} tenant work items and ${workspace.fleetIncident.status === "Resolved" ? 0 : 1} provider incident`}
                      aria-label={`${workspace.tenant.openIncidents} tenant work items plus ${workspace.fleetIncident.status === "Resolved" ? 0 : 1} provider incident`}
                    >
                      {workspace.tenant.openIncidents}+
                      {workspace.fleetIncident.status === "Resolved" ? 0 : 1}
                    </span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/70 p-3">
          <button
            onClick={() => setDataModalOpen(true)}
            className="nav-idle flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm"
          >
            <Database className="size-4" />
            <span>
              <span className="block font-medium">Data notes</span>
              <span className="block text-xs text-slate-500">
                {workspace.quality.totalRecords} source records
              </span>
            </span>
          </button>
          {guided ? (
            <button
              onClick={requestReset}
              disabled={busyTarget === "workspace"}
              className="nav-idle mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm disabled:opacity-45"
            >
              <RefreshCcw
                className={`size-4 ${
                  busyTarget === "workspace" ? "animate-spin" : ""
                }`}
              />
              Reset guided run
            </button>
          ) : null}
        </div>
      </aside>

      {mobileMenuOpen ? (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <div className="lg:pl-[216px]">
        <header className="glass-bar sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 border-b px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Open navigation"
              title="Open navigation"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--line-strong)] bg-white/70 text-slate-600 hover:bg-white lg:hidden"
            >
              <Menu className="size-4" />
            </button>
            <p className="truncate text-sm text-slate-500">{breadcrumb}</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs text-[#0f7779] sm:inline-flex">
              <span className="size-2 rounded-full bg-[#16888a]" />
              {guided ? "Isolated guided run" : "Scenario state saved"}
            </span>
            <a
              href={`/access?returnTo=${encodeURIComponent(
                routePath(
                  view,
                  selectedFlow.id,
                  selectedIncident?.jobId ?? workspace.jobs[0].id,
                  workspace.tenant.id,
                  guided,
                ),
              )}`}
              className="hidden h-9 items-center rounded-md border border-[var(--line-strong)] bg-white/75 px-3 text-xs font-medium text-slate-700 hover:bg-white md:inline-flex"
            >
              {guided
                ? "Guided walkthrough"
                : `${activeRole.label} · ${activeRole.organization}`}
            </a>
            <IconButton label="Sign out" onClick={signOut}>
              <LogOut className="size-4" />
            </IconButton>
          </div>
        </header>

        {error ? (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-[1320px] items-start justify-between gap-4">
              <div className="flex items-start gap-2 text-sm text-red-800">
                <FileWarning className="mt-0.5 size-4 shrink-0" />
                <p>{error}</p>
              </div>
              <button
                aria-label="Dismiss error"
                title="Dismiss error"
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-900"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        ) : null}

        <div className="border-b border-sky-200 bg-sky-50/80 px-4 py-2.5 text-xs text-sky-900 sm:px-6">
          <div className="mx-auto flex max-w-[1320px] items-center gap-2">
            <Clock3 className="size-3.5 shrink-0" />
            <span>
              {guided
                ? "Guided mode · use Play to advance each step"
                : "Demo clock is accelerated · automated steps run every 2.5 seconds"}
            </span>
          </div>
        </div>

        <main className="mx-auto max-w-[1320px] p-4 sm:p-6 lg:p-8">
          {view === "guided" ? (
            <GuidedReviewView
              workspace={workspace}
              busyTarget={busyTarget}
              onOpenIncident={openIncident}
              onOpenRecoveryControl={() => navigate("fleet")}
              onAction={performAction}
              onReset={requestReset}
            />
          ) : null}
          {view === "fleet" ? (
            <FleetView
              workspace={workspace}
              role={role}
              guided={guided}
              busyTarget={busyTarget}
              onAction={performAction}
              onOpenIncident={openIncident}
            />
          ) : null}
          {view === "overview" ? (
            <OverviewView
              workspace={workspace}
              role={role}
              busyTarget={busyTarget}
              onOpenIncident={openIncident}
              onOpenRecoveryControl={() => navigate("fleet")}
              onAction={performAction}
            />
          ) : null}
          {view === "integration" ? (
            <IntegrationView
              workspace={workspace}
              onOpenIncident={openIncident}
            />
          ) : null}
          {view === "connection" ? (
            <ConnectionsView
              workspace={workspace}
              onOpenIncident={openIncident}
            />
          ) : null}
          {view === "mapping" ? (
            <MappingView
              workspace={workspace}
              onOpenIncident={openIncident}
            />
          ) : null}
          {view === "jobs" ? (
            <JobsView
              workspace={workspace}
              onOpenIncident={openIncident}
            />
          ) : null}
          {view === "insights" ? (
            <InsightsView workspace={workspace} />
          ) : null}
          {view === "policy" ? (
            <PolicyCenterView workspace={workspace} />
          ) : null}
          {view === "failure" && selectedIncident ? (
            <IncidentView
              workspace={workspace}
              incident={selectedIncident}
              role={role}
              busy={busyTarget === selectedIncident.id}
              onAction={performAction}
              onBack={() => navigate(incidentOrigin)}
              onOpenRecoveryControl={() => navigate("fleet")}
              guided={guided}
            />
          ) : null}
        </main>
      </div>

      {notice ? (
        <div
          role="status"
          className="glass-panel fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 px-4 py-3 text-sm font-medium text-slate-800"
        >
          <ShieldCheck className="size-4 shrink-0 text-[#16888a]" />
          {notice}
        </div>
      ) : null}

      {resetConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-demo-title"
            className="glass-panel w-full max-w-md overflow-hidden"
          >
            <div className="flex items-start gap-3 p-5">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-800">
                <AlertTriangle className="size-5" />
              </span>
              <div>
                <h2 id="reset-demo-title" className="text-base font-semibold text-slate-950">
                  Reset this guided run?
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This clears the current walkthrough and restarts the incident from the beginning: decisions, release gates, customer updates, and audit events.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--line)] bg-white/55 px-5 py-4">
              <button
                onClick={() => setResetConfirmOpen(false)}
                disabled={busyTarget === "workspace"}
                className="min-h-9 rounded-md border border-[var(--line-strong)] bg-white px-3 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={resetDemo}
                disabled={busyTarget === "workspace"}
                className="inline-flex min-h-9 items-center gap-2 rounded-md border border-amber-700 bg-amber-700 px-3 text-sm font-medium text-white disabled:opacity-50"
              >
                <RefreshCcw className={`size-4 ${busyTarget === "workspace" ? "animate-spin" : ""}`} />
                Reset run
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {dataModalOpen ? (
        <DataLineageModal
          workspace={workspace}
          onClose={() => setDataModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
