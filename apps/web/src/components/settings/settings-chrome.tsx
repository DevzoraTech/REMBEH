"use client";

import type { ReactNode } from "react";

export function SettingsCard({
  title,
  description,
  children,
  bare,
  action,
}: {
  title: string;
  description: string;
  children: ReactNode;
  bare?: boolean;
  action?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.055)]">
      {!bare ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f5] px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#0b1220]">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          </div>
          {action}
        </div>
      ) : null}
      <div className={bare ? "p-4 sm:p-5" : "px-4 py-4 sm:px-5"}>{children}</div>
    </section>
  );
}

export function SettingsInfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[12px] border border-[#edf1f5] bg-[#f8faf9] px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-all text-sm font-semibold text-[#0b1220]">
        {value}
      </p>
    </div>
  );
}
