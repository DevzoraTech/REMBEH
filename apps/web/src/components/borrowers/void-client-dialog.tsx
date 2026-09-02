"use client";

import { Ban, Loader2, ShieldAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";

export type VoidDisposition = "BLACKLISTED" | "WARNING";

export function VoidClientDialog({
  session,
  customerId,
  customerName,
  onClose,
  onSaved,
}: {
  session: RembehSession;
  customerId: string;
  customerName: string;
  onClose: () => void;
  onSaved: (disposition: VoidDisposition) => void;
}) {
  const [disposition, setDisposition] = useState<VoidDisposition>("WARNING");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/customers/${customerId}/void`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            disposition,
            reason: reason.trim() || undefined,
          }),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      onSaved(disposition);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not set this client aside.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(8,15,31,0.45)] p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md rounded-[18px] border border-[#e6ebf0] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.2)]"
      >
        <h3 className="text-base font-bold text-[#0b1220]">Void client</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          Set <span className="font-semibold text-[#0b1220]">{customerName}</span>{" "}
          aside from daily collections. Choose how they should be marked.
        </p>

        {error ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={() => setDisposition("WARNING")}
            className={`flex items-start gap-3 rounded-[14px] border px-3.5 py-3 text-left transition ${
              disposition === "WARNING"
                ? "border-amber-300 bg-amber-50 ring-2 ring-amber-100"
                : "border-[#e6ebf0] bg-[#f8faf9] hover:border-amber-200"
            }`}
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <span>
              <span className="block text-sm font-bold text-[#0b1220]">
                Warning
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                Caution flag. New loans may still be considered. Hidden from
                daily due lists.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDisposition("BLACKLISTED")}
            className={`flex items-start gap-3 rounded-[14px] border px-3.5 py-3 text-left transition ${
              disposition === "BLACKLISTED"
                ? "border-red-300 bg-red-50 ring-2 ring-red-100"
                : "border-[#e6ebf0] bg-[#f8faf9] hover:border-red-200"
            }`}
          >
            <Ban className="mt-0.5 size-4 shrink-0 text-red-700" />
            <span>
              <span className="block text-sm font-bold text-[#0b1220]">
                Blacklisted
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                Block new loans and keep this client out of daily collections.
              </span>
            </span>
          </button>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-slate-500">
            Reason (optional)
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Why is this client being set aside?"
            className="mt-1 w-full rounded-xl border border-[#d7dee6] px-3 py-2 text-sm text-[#0b1220] outline-none focus:border-[var(--forest-emerald)]"
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-[#e6ebf0] px-3.5 text-sm font-semibold text-[#111a2e]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex h-10 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Void client
          </button>
        </div>
      </form>
    </div>
  );
}
