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
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black tracking-normal text-[var(--midnight-navy)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm font-medium leading-5 text-slate-500">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
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
      className={`rounded-xl border border-[#e2e8f0] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.045)] ${className}`}
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
    <Panel className="p-5">
      <div className="flex items-center gap-4">
        <IconBadge icon={Icon} tone={tone} />
        <div className="min-w-0">
          <p className="text-sm font-black text-[var(--midnight-navy)]">
            {title}
          </p>
          <p className="mt-1 text-2xl font-black text-[var(--midnight-navy)]">
            {value}
          </p>
          {subtitle ? (
            <p className="mt-1 text-xs font-semibold text-slate-500">
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
      ? "bg-blue-50 text-blue-700"
      : tone === "gold"
        ? "bg-amber-50 text-amber-700"
        : tone === "purple"
          ? "bg-violet-50 text-violet-700"
          : tone === "red"
            ? "bg-red-50 text-red-700"
            : tone === "slate"
              ? "bg-slate-100 text-slate-700"
              : "bg-emerald-50 text-[var(--forest-emerald)]";

  return (
    <span
      className={`grid size-12 shrink-0 place-items-center rounded-xl ${toneClass} ${className}`}
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
    (["ACTIVE", "COMPLETED", "SENT"].includes(normalized)
      ? "green"
      : ["TRIAL", "GRACE", "PENDING"].includes(normalized)
        ? "blue"
        : ["PAST_DUE", "LOCKED", "SUSPENDED", "FAILED"].includes(normalized)
          ? "red"
          : ["CUSTOM", "DEFAULT"].includes(normalized)
            ? "green"
            : "slate");
  const toneClass =
    resolved === "blue"
      ? "bg-blue-50 text-blue-700"
      : resolved === "gold"
        ? "bg-amber-50 text-amber-700"
        : resolved === "red"
          ? "bg-red-50 text-red-700"
          : resolved === "slate"
            ? "bg-slate-100 text-slate-700"
            : "bg-emerald-50 text-[var(--forest-emerald)]";

  return (
    <span
      className={`inline-flex h-6 items-center rounded-md px-2 text-[11px] font-black ${toneClass}`}
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
      className={`h-10 min-w-[220px] flex-1 rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm font-semibold text-[var(--midnight-navy)] outline-none placeholder:text-slate-400 focus:border-[var(--forest-emerald)] focus:shadow-[0_0_0_3px_rgba(15,138,108,0.11)] ${className}`}
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
      className={`h-10 rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm font-bold text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] ${className}`}
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
    <div className="rounded-xl border border-dashed border-[#cbd5e1] bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-black text-[var(--midnight-navy)]">{title}</p>
      {subtitle ? (
        <p className="mx-auto mt-1 max-w-md text-xs font-semibold leading-5 text-slate-500">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
