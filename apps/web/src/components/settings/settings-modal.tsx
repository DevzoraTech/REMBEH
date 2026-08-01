"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

export function SettingsModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  stepIndex,
  stepCount,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  stepIndex?: number;
  stepCount?: number;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const progress =
    stepIndex != null && stepCount && stepCount > 0
      ? ((stepIndex + 1) / stepCount) * 100
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1220]/45 px-0 sm:items-center sm:px-4 sm:py-6">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="relative z-10 flex max-h-[min(94vh,760px)] w-full max-w-[720px] flex-col overflow-hidden rounded-t-[22px] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.28)] sm:rounded-[22px]"
      >
        <div className="relative shrink-0 overflow-hidden bg-[#013f35] px-5 pb-4 pt-4 text-white">
          <div className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-emerald-400/15" />
          <div className="pointer-events-none absolute -bottom-12 left-16 size-28 rounded-full bg-white/5" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200/90">
                Loan product
              </p>
              <h2
                id="settings-modal-title"
                className="mt-1 text-lg font-bold tracking-[-0.02em]"
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1 text-xs leading-snug text-emerald-100/85">
                  {subtitle}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          {progress != null ? (
            <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-emerald-300 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7faf8] px-4 py-4 sm:px-5">
          {children}
        </div>

        {footer ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#e6ebf0] bg-white px-4 py-3 sm:px-5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
