"use client";

import {
  ArrowLeft,
  CircleSlash2,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ProviderBrand } from "@/app/provider-brand";
import type { RecordEvidence, WorkspaceSnapshot } from "@/lib/types";

const sourcePolicyId = "default-no-reservation-not-started-v1";
const quarantinePolicyId = "keep-blank-records-quarantined-v1";

export default function SalesforceSourceRecords() {
  const [records, setRecords] = useState<RecordEvidence[]>([]);
  const [policyConfirmed, setPolicyConfirmed] = useState(false);
  const [incidentVersion, setIncidentVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign(
            "/access?returnTo=/demo/salesforce/source-records",
          );
          return null;
        }
        if (!response.ok) throw new Error("Salesforce records are unavailable.");
        return (await response.json()) as WorkspaceSnapshot;
      })
      .then((workspace) => {
        if (!workspace) return;
        const affected = workspace.evidence["inc-data-001"] ?? [];
        setIncidentVersion(
          workspace.incidents.find((incident) => incident.id === "inc-data-001")
            ?.updatedAt ?? null,
        );
        setRecords(affected);
        setPolicyConfirmed(false);
        setBusy(false);
      })
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Salesforce records are unavailable.",
        );
        setBusy(false);
      });
  }, []);

  async function saveAndRecheck() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_source_fix",
          targetId: "inc-data-001",
          commandId: crypto.randomUUID(),
          expectedUpdatedAt: incidentVersion,
          payload: { sourcePolicyId },
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "The Salesforce updates were not saved.");
      }
      window.location.assign("/portal");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The Salesforce updates were not saved.",
      );
      setSaving(false);
    }
  }

  async function keepQuarantined() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decline_source_fix",
          targetId: "inc-data-001",
          commandId: crypto.randomUUID(),
          expectedUpdatedAt: incidentVersion,
          payload: { sourcePolicyId: quarantinePolicyId },
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "The policy exception was not saved.");
      }
      window.location.assign("/portal");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The policy exception was not saved.",
      );
      setSaving(false);
      setExceptionOpen(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f3f3] text-slate-900">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">
        Salesforce-style demo page · no external account is contacted
      </div>
      <header className="border-b border-[#0b5cab] bg-[#0176d3] text-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <ProviderBrand provider="Salesforce" className="border-white/30 bg-white" />
            <div>
              <p className="text-sm font-semibold">Salesforce</p>
              <p className="text-xs text-blue-100">Easy Spaces Production</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-50">
            <LockKeyhole className="size-4" />
            Customer-owned data
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <a
          href="/portal"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#0b5cab] hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to Integration Center
        </a>

        <section className="mt-5 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Contact list view
                </p>
                <h1 className="mt-1 text-2xl font-semibold">
                  Contacts missing reservation status
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Customer 360 rejected these six records because the reservation
                  status is blank. Review the evidence, then either apply the
                  scoped default or leave the records quarantined.
                </p>
              </div>
              <a
                href="https://github.com/trailheadapps/easy-spaces-lwc"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-xs font-medium text-[#0b5cab] hover:underline"
              >
                Open sample source
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>

          <div className="border-b border-blue-100 bg-blue-50/70 px-5 py-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#0176d3]" />
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  Suggested field rule
                </p>
                <p className="mt-1 font-mono text-xs text-[#0b5cab]">
                  IF Reservation_Status__c is blank AND no Reservation__c is linked,
                  THEN set Not Started
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Comparable contacts in the sample data have no linked
                  reservation and already use Not Started. This rule applies only
                  to the six blank records below.
                </p>
              </div>
            </div>
          </div>

          {busy ? (
            <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-slate-500">
              <LoaderCircle className="size-5 animate-spin" />
              Loading source records
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-200 sm:hidden">
                {records.map((record) => (
                  <div key={record.id} className="space-y-4 p-4">
                    <div>
                      <p className="text-sm font-semibold text-[#0b5cab]">
                        {record.label}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {record.id}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="font-medium text-slate-500">Account</dt>
                        <dd className="mt-1 text-slate-700">
                          {record.accountName}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-slate-500">
                          Current value
                        </dt>
                        <dd className="mt-1 font-mono text-red-700">blank</dd>
                      </div>
                    </dl>
                    <div className="rounded border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-slate-700">
                      <p className="font-medium text-slate-900">Business evidence</p>
                      <p className="mt-1">{record.businessContext}</p>
                      <p className="mt-2 font-medium text-[#0b5cab]">
                        Suggested: {record.suggestedValue}
                      </p>
                      <p>{record.suggestionReason}</p>
                      <p className="mt-2 text-slate-500">
                        {record.verificationRequired}
                      </p>
                    </div>
                    <div className="rounded border border-[#2e844a]/20 bg-[#2e844a]/8 p-3 text-xs">
                      <p className="font-medium text-slate-600">Proposed source update</p>
                      <p className="mt-1 font-mono font-semibold text-[#2e844a]">
                        blank -&gt; {record.cleanedValue}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[1120px] text-left">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Contact</th>
                    <th className="px-5 py-3">Account</th>
                    <th className="px-5 py-3">Current value</th>
                    <th className="px-5 py-3">Business evidence</th>
                    <th className="px-5 py-3">Proposed update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-[#0b5cab]">
                          {record.label}
                        </p>
                        <p className="mt-1 font-mono text-xs text-slate-500">
                          {record.id}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {record.accountName}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded bg-red-50 px-2 py-1 font-mono text-xs text-red-700">
                          blank
                        </span>
                      </td>
                      <td className="max-w-sm px-5 py-4 text-xs leading-5 text-slate-600">
                        <p>{record.businessContext}</p>
                        <p className="mt-2 font-medium text-[#0b5cab]">
                          Suggested: {record.suggestedValue}
                        </p>
                        <p>{record.suggestionReason}</p>
                        <p className="mt-2 text-slate-500">
                          {record.verificationRequired}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded border border-[#2e844a]/20 bg-[#2e844a]/8 px-2 py-1 font-mono text-xs font-semibold text-[#2e844a]">
                          blank -&gt; {record.cleanedValue}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}

          <footer className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex max-w-2xl cursor-pointer items-start gap-3 text-xs leading-5 text-slate-700">
              <input
                type="checkbox"
                checked={policyConfirmed}
                onChange={(event) => setPolicyConfirmed(event.target.checked)}
                className="mt-0.5 size-4 rounded border-slate-300 text-[#0176d3] focus:ring-[#0176d3]"
              />
              <span>
                I approve this scoped default for Easy Spaces: set Not Started
                only for the {records.length} blank contacts with no linked
                reservation, then validate with a fresh source read.
              </span>
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setExceptionOpen(true)}
                disabled={saving || records.length === 0}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CircleSlash2 className="size-4" />
                Leave blanks quarantined
              </button>
              <button
                onClick={saveAndRecheck}
                disabled={!policyConfirmed || saving || records.length === 0}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-[#0176d3] bg-[#0176d3] px-4 text-sm font-semibold text-white hover:bg-[#0b5cab] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Apply default and recheck
              </button>
            </div>
          </footer>
          {error ? (
            <p className="border-t border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </section>
      </div>
      {exceptionOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="quarantine-title"
            className="w-full max-w-lg rounded border border-slate-200 bg-white shadow-xl"
          >
            <div className="p-5">
              <h2 id="quarantine-title" className="text-base font-semibold text-slate-950">
                Keep the blank contacts quarantined?
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Not Started will not be written. These {records.length} contacts will stay excluded under an Easy Spaces exception, while unaffected records continue.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button
                onClick={() => setExceptionOpen(false)}
                disabled={saving}
                className="min-h-10 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={keepQuarantined}
                disabled={saving}
                className="inline-flex min-h-10 items-center gap-2 rounded border border-[#0176d3] bg-[#0176d3] px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? <LoaderCircle className="size-4 animate-spin" /> : <CircleSlash2 className="size-4" />}
                Keep quarantined
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
