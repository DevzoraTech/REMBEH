"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { titleText } from "./formatters";

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-black tracking-[-0.025em] text-[var(--midnight-navy)]">
          {title}
        </h1>

        {subtitle ? (
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">
            {subtitle}
          </p>
        ) : null}
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[#e2e8f0] bg-white ${className}`}
    >
      {children}
    </section>
  );
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "green",
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  tone?: "green" | "blue" | "gold" | "purple" | "red";
}) {
  return (
    <Panel className="min-h-[112px] p-4">
      <div className="flex h-full items-start gap-4">
        <IconBadge icon={Icon} tone={tone} />

        <div className="min-w-0 pt-0.5">
          <p className="text-xs font-bold text-slate-600">{title}</p>

          <p className="mt-1 text-[25px] font-black leading-none tracking-[-0.02em] text-[var(--midnight-navy)]">
            {value}
          </p>

          {subtitle ? (
            <p className="mt-2 text-xs font-medium leading-4 text-slate-500">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

export function IconBadge({
  icon: Icon,
  tone = "green",
  className = "",
}: {
  icon: LucideIcon;
  tone?: "green" | "blue" | "gold" | "purple" | "red" | "slate";
  className?: string;
}) {
  const toneClass =
    tone === "blue"
      ? "bg-[#eaf2ff] text-[#2563eb]"
      : tone === "gold"
        ? "bg-[#fff3dc] text-[#d97706]"
        : tone === "purple"
          ? "bg-[#f1ebff] text-[#7c3aed]"
          : tone === "red"
            ? "bg-[#feecec] text-[#dc2626]"
            : tone === "slate"
              ? "bg-slate-100 text-slate-600"
              : "bg-[#e8f5ec] text-[var(--forest-emerald)]";

  return (
    <span
      className={`grid size-12 shrink-0 place-items-center rounded-[11px] ${toneClass} ${className}`}
    >
      <Icon className="size-5" />
    </span>
  );
}

export function StatusPill({
  value,
  tone,
}: {
  value: string;
  tone?: "green" | "blue" | "gold" | "red" | "slate";
}) {
  const normalized = value.toUpperCase();

  const resolved =
    tone ??
    ([
      "ACTIVE",
      "COMPLETED",
      "SENT",
      "DELIVERED",
      "CUSTOM",
      "CUSTOM PRICING",
    ].includes(normalized)
      ? "green"
      : [
            "TRIAL",
            "GRACE",
            "PENDING",
            "DEFAULT",
            "DEFAULT PRICING",
          ].includes(normalized)
        ? "blue"
        : [
              "PAST_DUE",
              "PAST DUE",
              "LOCKED",
              "SUSPENDED",
              "FAILED",
              "EXPIRED",
            ].includes(normalized)
          ? "red"
          : ["EXPIRING", "EXPIRING SOON", "SCHEDULED"].includes(normalized)
            ? "gold"
            : "slate");

  const toneClass =
    resolved === "blue"
      ? "bg-[#eef4ff] text-[#2563eb]"
      : resolved === "gold"
        ? "bg-[#fff5df] text-[#b86606]"
        : resolved === "red"
          ? "bg-[#fff0f0] text-[#c83232]"
          : resolved === "slate"
            ? "bg-slate-100 text-slate-600"
            : "bg-[#eaf6ed] text-[#1d7d40]";

  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-md px-2 text-[11px] font-bold ${toneClass}`}
    >
      {titleText(value)}
    </span>
  );
}

export function InlineSearch({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`h-10 min-w-[220px] flex-1 rounded-lg border border-[#dde4eb] bg-white px-3 text-sm font-medium text-[var(--midnight-navy)] outline-none transition placeholder:text-slate-400 focus:border-[var(--forest-emerald)] focus:ring-2 focus:ring-emerald-100 ${className}`}
    />
  );
}

export function SelectControl({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className={`h-10 rounded-lg border border-[#dde4eb] bg-white px-3 text-sm font-semibold text-[var(--midnight-navy)] outline-none transition focus:border-[var(--forest-emerald)] focus:ring-2 focus:ring-emerald-100 ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function EmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[#cbd5e1] bg-[#fafbfc] px-4 py-10 text-center">
      <p className="text-sm font-bold text-[var(--midnight-navy)]">{title}</p>

      {subtitle ? (
        <p className="mx-auto mt-1 max-w-md text-xs font-medium leading-5 text-slate-500">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}