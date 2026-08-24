"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  LoaderCircle,
  XCircle,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type {
  Health,
  IncidentStatus,
  JobStatus,
  MappingStatus,
} from "@/lib/types";

export function Button({
  children,
  className = "",
  variant = "primary",
  busy = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  busy?: boolean;
}) {
  const styles = {
    primary:
      "brand-button",
    secondary:
      "border-[var(--line-strong)] bg-white/80 text-slate-700 hover:border-[#16888a]/40 hover:bg-white",
    danger:
      "border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50",
    ghost:
      "border-transparent bg-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900",
  };

  return (
    <button
      {...props}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${styles[variant]} ${className}`}
      disabled={props.disabled || busy}
    >
      {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--line-strong)] bg-white/80 text-slate-600 transition-colors hover:border-[#16888a]/40 hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

export function HealthBadge({
  status,
  label,
}: {
  status: Health;
  label?: string;
}) {
  const styles = {
    healthy:
      "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    broken: "border-red-200 bg-red-50 text-red-700",
  };
  const icons = {
    healthy: <CheckCircle2 className="size-3.5" />,
    warning: <AlertTriangle className="size-3.5" />,
    broken: <XCircle className="size-3.5" />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium capitalize ${styles[status]}`}
    >
      {icons[status]}
      {label ?? status}
    </span>
  );
}

export function JobBadge({ status }: { status: JobStatus }) {
  const styles: Record<JobStatus, string> = {
    Succeeded: "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]",
    Failed: "border-red-200 bg-red-50 text-red-700",
    Running: "border-sky-200 bg-sky-50 text-sky-700",
    Queued: "border-[#e9624c]/20 bg-[#e9624c]/8 text-[#c94e3a]",
    "Backoff scheduled": "border-amber-200 bg-amber-50 text-amber-800",
    Blocked: "border-red-200 bg-red-50 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium ${styles[status]}`}
    >
      <Circle className="size-2 fill-current" />
      {status}
    </span>
  );
}

export function IncidentBadge({ status }: { status: IncidentStatus }) {
  const styles: Record<IncidentStatus, string> = {
    "Awaiting customer": "border-amber-200 bg-amber-50 text-amber-800",
    "Awaiting engineering": "border-violet-200 bg-violet-50 text-violet-800",
    "Backoff scheduled": "border-sky-200 bg-sky-50 text-sky-700",
    Validating: "border-sky-200 bg-sky-50 text-sky-700",
    "Ready to deploy": "border-violet-200 bg-violet-50 text-violet-800",
    "Retry queued": "border-[#e9624c]/20 bg-[#e9624c]/8 text-[#c94e3a]",
    Running: "border-sky-200 bg-sky-50 text-sky-700",
    Monitoring: "border-indigo-200 bg-indigo-50 text-indigo-700",
    Contained: "border-amber-200 bg-amber-50 text-amber-800",
    Resolved: "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium ${styles[status]}`}
    >
      <Circle className="size-2 fill-current" />
      {status}
    </span>
  );
}

export function MappingBadge({ status }: { status: MappingStatus }) {
  const styles: Record<MappingStatus, string> = {
    Mapped: "border-[#16888a]/20 bg-[#16888a]/8 text-[#0f6f71]",
    Review: "border-amber-200 bg-amber-50 text-amber-800",
    Missing: "border-red-200 bg-red-50 text-red-700",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function Metric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "danger" | "positive";
}) {
  const valueStyle = {
    neutral: "text-slate-950",
    danger: "text-red-700",
    positive: "text-[#0f7779]",
  };
  return (
    <div className="border-b border-r border-[var(--line)] bg-white/52 p-5 last:border-r-0 lg:border-b-0">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueStyle[tone]}`}>
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--line-strong)] bg-white/45 px-6 text-center">
      <CheckCircle2 className="size-7 text-[#16888a]" />
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{detail}</p>
    </div>
  );
}
