"use client";

import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ProviderBrand } from "@/app/provider-brand";
import type { WorkspaceSnapshot } from "@/lib/types";

const requiredScope = "crm.objects.contacts.read";

export default function HubSpotAuthorization() {
  const [accountId, setAccountId] = useState("hubspot-easy-spaces");
  const [contactsScope, setContactsScope] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [incidentVersion, setIncidentVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/access?returnTo=/demo/hubspot/authorize");
          return null;
        }
        if (!response.ok) {
          throw new Error(
            "The Integration Ops connection request is unavailable.",
          );
        }
        return (await response.json()) as WorkspaceSnapshot;
      })
      .then((workspace) => {
        if (!workspace) return;
        setIncidentVersion(
          workspace.incidents.find((incident) => incident.id === "inc-auth-001")
            ?.updatedAt ?? null,
        );
        setReady(true);
      })
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The Integration Ops connection request is unavailable.",
        );
      });
  }, []);

  async function authorize() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete_oauth",
          targetId: "inc-auth-001",
          commandId: crypto.randomUUID(),
          expectedUpdatedAt: incidentVersion,
          payload: {
            oauthAccountId: accountId,
            oauthScopes: contactsScope ? [requiredScope] : [],
          },
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "HubSpot could not authorize this app.");
      }
      window.location.assign("/portal?oauth=success");
    } catch (authorizeError) {
      setError(
        authorizeError instanceof Error
          ? authorizeError.message
          : "HubSpot could not authorize this app.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f8fa] text-[#33475b]">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">
        HubSpot-style authorization demo · app.hubspot.com
      </div>
      <header className="border-b border-[#cbd6e2] bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <ProviderBrand provider="HubSpot" />
            <p className="text-lg font-semibold text-[#33475b]">HubSpot</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#516f90]">
            <LockKeyhole className="size-4" />
            Secure authorization
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <a
          href="/portal"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#0091ae] hover:underline"
        >
          <ArrowLeft className="size-4" />
          Cancel and return
        </a>

        <section className="mt-5 overflow-hidden rounded-md border border-[#cbd6e2] bg-white shadow-sm">
          <div className="border-b border-[#dfe3eb] px-6 py-6 text-center">
            <div className="mx-auto flex w-fit items-center gap-3">
              <span className="inline-flex size-12 items-center justify-center rounded-md bg-[#16888a] text-sm font-semibold text-white">
                IO
              </span>
              <span className="text-[#99acc2]">→</span>
              <ProviderBrand provider="HubSpot" className="size-12" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold text-[#33475b]">
              Connect Integration Ops to HubSpot
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#516f90]">
              Integration Ops needs renewed access for the Easy Spaces contact
              sync. Choose the right HubSpot account and confirm the contact-read
              permission.
            </p>
          </div>

          <div className="space-y-6 px-6 py-6">
            <label className="block">
              <span className="text-sm font-semibold text-[#33475b]">
                Choose a HubSpot account
              </span>
              <span className="relative mt-2 block">
                <Building2 className="pointer-events-none absolute left-3 top-3 size-4 text-[#7c98b6]" />
                <select
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className="h-11 w-full appearance-none rounded border border-[#cbd6e2] bg-white pl-10 pr-10 text-sm outline-none focus:border-[#00a4bd] focus:ring-2 focus:ring-[#00a4bd]/15"
                >
                  <option value="hubspot-easy-spaces">
                    Easy Spaces Production · 4829107
                  </option>
                  <option value="hubspot-northwind">
                    Northwind Sandbox · 7720184
                  </option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-[#7c98b6]" />
              </span>
            </label>

            <div>
              <p className="text-sm font-semibold text-[#33475b]">
                Integration Ops needs permission to:
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-md border border-[#dfe3eb] bg-[#f5f8fa] p-4">
                <input
                  type="checkbox"
                  checked={contactsScope}
                  onChange={(event) => setContactsScope(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-[#33475b]">
                    View CRM contacts
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[#516f90]">
                    Read contact properties used by Customer 360. This demo does
                    not request contact write access.
                  </span>
                  <code className="mt-2 block text-xs text-[#7c98b6]">
                    {requiredScope}
                  </code>
                </span>
              </label>
            </div>

            <div className="flex items-start gap-3 rounded-md border border-[#cbd6e2] p-4">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#00a4bd]" />
              <p className="text-xs leading-5 text-[#516f90]">
                After authorization, Integration Ops verifies the account and
                granted scope before resuming the paused sync.
              </p>
            </div>

            {error ? (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              >
                <AlertCircle className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-semibold">Authorization not accepted</p>
                  <p className="mt-1 leading-6">{error}</p>
                </div>
              </div>
            ) : null}
          </div>

          <footer className="flex flex-col-reverse gap-3 border-t border-[#dfe3eb] bg-[#f5f8fa] px-6 py-5 sm:flex-row sm:justify-end">
            <a
              href="/portal"
              className="inline-flex min-h-10 items-center justify-center rounded border border-[#cbd6e2] bg-white px-4 text-sm font-semibold text-[#33475b] hover:bg-[#edf2f7]"
            >
              Cancel
            </a>
            <button
              onClick={authorize}
              disabled={!ready || busy}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-[#ff7a59] bg-[#ff7a59] px-4 text-sm font-semibold text-white hover:bg-[#e66e50] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Connect app
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
