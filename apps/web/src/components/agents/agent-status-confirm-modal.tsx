"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

export const SUSPEND_REASONS = [
  "Temporary leave",
  "Account security concern",
  "Performance issue",
  "Misconduct",
  "No longer working with branch",
] as const;

export type SuspendReason = (typeof SUSPEND_REASONS)[number];

export type AgentStatusConfirm =
  | { action: "suspend"; agentId: string; agentName: string }
  | { action: "activate"; agentId: string; agentName: string };

export function AgentStatusConfirmModal({
  confirm,
  busy,
  onClose,
  onConfirm,
}: {
  confirm: AgentStatusConfirm | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    agentId: string;
    status: "ACTIVE" | "SUSPENDED";
    reason?: SuspendReason;
  }) => void;
}) {
  const [reason, setReason] = useState<SuspendReason | "">("");

  useEffect(() => {
    if (!confirm) return;
    setReason("");
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [busy, confirm, onClose]);

  if (!confirm) return null;

  const isSuspend = confirm.action === "suspend";
  const canSubmit = isSuspend ? Boolean(reason) : true;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0b1220]/45 px-0 sm:items-center sm:px-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close Dialog"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-status-confirm-title"
        className="relative z-10 w-full max-w-[440px] overflow-hidden rounded-t-[20px] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.28)] sm:rounded-[20px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#edf1f5] px-5 py-4">
          <div className="min-w-0">
            <h2
              id="agent-status-confirm-title"
              className="text-base font-bold tracking-[-0.02em] text-[#0b1220]"
            >
              {isSuspend
                ? `Suspend ${confirm.agentName}?`
                : `Activate ${confirm.agentName}?`}
            </h2>
            <p className="mt-1.5 text-sm font-medium leading-relaxed text-slate-500">
              {isSuspend
                ? `${confirm.agentName} will no longer be able to access the system or carry out agent activities until reactivated.`
                : `${confirm.agentName} will regain access to the system and will be able to carry out agent activities.`}
            </p>
          </div>
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-xl border border-[#e6ebf0] text-[#0b1220] transition hover:bg-[#f8faf9] disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {isSuspend ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-[#0b1220]">
                Reason For Suspension
              </span>
              <select
                value={reason}
                onChange={(event) =>
                  setReason(event.target.value as SuspendReason | "")
                }
                disabled={busy}
                className="h-10 w-full rounded-xl border border-[#e6ebf0] bg-white px-3 text-sm font-medium text-[#0b1220] outline-none shadow-[0_8px_18px_rgba(15,23,42,0.035)]"
              >
                <option value="">Select A Reason</option>
                {SUSPEND_REASONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[#e6ebf0] bg-white px-4 text-sm font-semibold text-[#0b1220] transition hover:bg-[#f8faf9] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !canSubmit}
              onClick={() =>
                onConfirm(
                  isSuspend
                    ? {
                        agentId: confirm.agentId,
                        status: "SUSPENDED",
                        reason: reason as SuspendReason,
                      }
                    : {
                        agentId: confirm.agentId,
                        status: "ACTIVE",
                      },
                )
              }
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50 ${
                isSuspend
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-[var(--forest-emerald)] hover:brightness-105"
              }`}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {isSuspend ? "Suspend Field Officer" : "Activate Field Officer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
