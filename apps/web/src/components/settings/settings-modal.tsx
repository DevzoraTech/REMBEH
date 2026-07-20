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
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-3 py-6 sm:items-center sm:px-4">
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
        className="relative z-10 flex max-h-[min(92vh,820px)] w-full max-w-2xl flex-col border border-[var(--line)] bg-white shadow-[0_16px_40px_rgba(20,33,61,0.18)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            <h2
              id="settings-modal-title"
              className="text-base font-bold text-[var(--midnight-navy)]"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-ghost h-8 w-8 shrink-0 p-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
