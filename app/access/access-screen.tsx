"use client";

import {
  ArrowRight,
  Building2,
  Cable,
  Check,
  Compass,
  Headphones,
  LoaderCircle,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { demoTenant } from "@/lib/demo-public";
import type { DemoSession, Role } from "@/lib/types";

const personas: {
  id: Role;
  label: string;
  organization: string;
  destination: string;
  detail: string;
  icon: typeof Headphones;
}[] = [
  {
    id: "support",
    label: "Support admin",
    organization: "SaaS provider",
    destination: "Internal Ops Console",
    detail: "See customer impact, track recovery, and send clear updates.",
    icon: Headphones,
  },
  {
    id: "customer",
    label: "Customer admin",
    organization: "Easy Spaces",
    destination: "Customer Integration Portal",
    detail: "Fix customer-owned data and reconnect apps when access expires.",
    icon: ShieldCheck,
  },
  {
    id: "engineer",
    label: "Integration engineer",
    organization: "SaaS provider",
    destination: "Internal Ops Console",
    detail: "Validate fixes, ship mapping changes, and control rollout by cohort.",
    icon: Wrench,
  },
];

function returnPath(role: Role) {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  if (value?.startsWith("/") && !value.startsWith("//")) {
    const customerRoute =
      value.startsWith("/portal") ||
      value.startsWith("/demo/salesforce/") ||
      value.startsWith("/demo/hubspot/");
    if (role === "customer" && !customerRoute) return "/portal";
    if (role !== "customer" && customerRoute) {
      return role === "support" ? "/" : "/fleet";
    }
    if (role === "support" && /\/mappings$/.test(value)) return "/";
    return value;
  }
  if (role === "customer") return "/portal";
  return role === "support" ? "/" : "/fleet";
}

export default function AccessScreen() {
  const [role, setRole] = useState<Role>("support");
  const [current, setCurrent] = useState<DemoSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { session: DemoSession })
          : null,
      )
      .then((result) => setCurrent(result?.session ?? null))
      .catch(() => setCurrent(null));
  }, []);

  async function enterWorkspace(
    mode: "role" | "guided" = "role",
    freshRun = false,
  ) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: mode === "guided" ? "support" : role,
          mode,
          freshRun,
          customerId:
            mode === "role" && role === "customer" ? demoTenant.id : null,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Demo access could not be created.");
      }
      window.location.assign(mode === "guided" ? "/?guided=1" : returnPath(role));
    } catch (accessError) {
      setError(
        accessError instanceof Error
          ? accessError.message
          : "Demo access could not be created.",
      );
      setBusy(false);
    }
  }

  const selected = personas.find((persona) => persona.id === role)!;

  return (
    <main className="app-shell min-h-screen">
      <header className="glass-bar border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="brand-button inline-flex size-9 items-center justify-center rounded-md border">
              <Cable className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Integration Ops
              </p>
              <p className="text-xs text-slate-500">Live demo environment</p>
            </div>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
            Replayable demo
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(520px,1.08fr)] lg:py-12">
        <section className="flex flex-col justify-between gap-8">
          <div>
            <p className="text-sm font-semibold text-[#16888a]">
              Integration failure recovery
            </p>
            <h1 className="mt-3 max-w-xl text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
              Fix integration failures without touching more than you need
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              This demo follows a B2B SaaS team running Salesforce, HubSpot,
              Google Sheets, and Slack integrations for multiple customers.
              When something breaks, the console shows who should act, what can
              recover automatically, and how far a fix is allowed to roll out.
            </p>
          </div>

          <div className="soft-panel overflow-hidden">
            <div className="border-b border-[var(--line)] px-4 py-3">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Demo relationship
              </p>
            </div>
            <div className="grid gap-px bg-[var(--line)] sm:grid-cols-3">
              <div className="bg-white/70 p-4">
                <Building2 className="size-5 text-[#16888a]" />
                <p className="mt-3 text-sm font-semibold text-slate-950">
                  Easy Spaces
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Customer account that owns the connected CRM data
                </p>
              </div>
              <div className="bg-white/70 p-4">
                <Cable className="size-5 text-[#e9624c]" />
                <p className="mt-3 text-sm font-semibold text-slate-950">
                  Integration Ops
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Recovery workspace for the SaaS provider
                </p>
              </div>
              <div className="bg-white/70 p-4">
                <Check className="size-5 text-[#16888a]" />
                <p className="mt-3 text-sm font-semibold text-slate-950">
                  Customer 360
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Destination app used by customer-success teams
                </p>
              </div>
            </div>
          </div>

          <div className="border-l-2 border-[#16888a] pl-4">
            <p className="text-sm font-semibold text-slate-900">
              What data is real?
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              The 180 fictional business records come from Salesforce&apos;s
              official CC0 Easy Spaces sample application. Provider errors,
              timing, and recovery events are simulated so the walkthrough can
              be replayed safely.
            </p>
          </div>
        </section>

        <section className="glass-panel self-start overflow-hidden">
          <div className="border-b border-[var(--line)] p-5">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Demo launcher
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Choose a point of view
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Pick a role to see the same incident from different seats. In a
              real product, each person would sign in through their own company.
            </p>
          </div>

          <fieldset className="divide-y divide-[var(--line)]">
            <legend className="sr-only">Choose a role</legend>
            {personas.map((persona) => {
              const Icon = persona.icon;
              const active = role === persona.id;
              return (
                <label
                  key={persona.id}
                  className={`grid cursor-pointer grid-cols-[20px_40px_minmax(0,1fr)] gap-3 p-5 transition-colors ${
                    active ? "bg-[#e9624c]/8" : "hover:bg-white/55"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={persona.id}
                    checked={active}
                    onChange={() => setRole(persona.id)}
                    className="mt-3"
                  />
                  <span
                    className={`inline-flex size-10 items-center justify-center rounded-md ${
                      active
                        ? "bg-[#e9624c] text-white shadow-sm"
                        : "border border-[var(--line)] bg-white/70 text-slate-600"
                    }`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-slate-950">
                        {persona.label}
                      </span>
                      <span className="text-xs text-slate-500">
                        {persona.organization}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-slate-600">
                      {persona.detail}
                    </span>
                    <span className="mt-2 block text-xs font-medium text-[#16888a]">
                      Opens: {persona.destination}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="border-t border-[var(--line)] bg-[#16888a]/6 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-[#16888a] text-white">
                  <Compass className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    Guided review
                  </p>
                  <p className="mt-1 max-w-md text-xs leading-5 text-slate-600">
                    Walk through five tenant issues, one Slack fleet release, and
                    the handoffs between Support, Customer Admin, and Engineering.
                    Starting creates a fresh run.
                  </p>
                </div>
              </div>
              <button
                onClick={() => enterWorkspace("guided", true)}
                disabled={busy}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-[#16888a] bg-white/75 px-4 text-sm font-semibold text-[#0f6f71] hover:bg-white disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Compass className="size-4" />
                )}
                Start guided review
              </button>
              {current?.mode === "guided" ? (
                <button
                  onClick={() => window.location.assign("/?guided=1")}
                  disabled={busy}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-white/75 px-4 text-sm font-semibold text-slate-700 hover:bg-white disabled:cursor-wait disabled:opacity-60"
                >
                  <ArrowRight className="size-4" />
                  Continue current run
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-white/38 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {current ? (
                <>
                  <p className="text-xs font-medium text-slate-500">
                    Current demo session
                  </p>
                  <p className="text-sm font-semibold text-slate-800">
                    {current.displayName} · {current.customerName ?? current.role}
                  </p>
                </>
              ) : (
                <p className="max-w-xs text-xs leading-5 text-slate-500">
                  The demo enforces what each role is allowed to do.
                </p>
              )}
            </div>
            <button
              onClick={() => enterWorkspace("role")}
              disabled={busy}
              className="brand-button inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <ArrowRight className="size-4" />
              )}
              Open as {selected.label}
            </button>
          </div>

          {error ? (
            <p className="border-t border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
