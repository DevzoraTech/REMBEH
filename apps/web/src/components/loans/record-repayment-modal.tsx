"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoneyAmount } from "../../app/owner/owner-common";
import { Money } from "../app/money";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";

type RecordRepaymentModalProps = {
  open: boolean;
  loan: {
    id: string;
    borrowerName: string;
    phone: string;
    balance: number;
    currency: string;
  } | null;
  accessToken: string;
  tokenType: string;
  onClose: () => void;
  onRecorded: () => void;
};

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "OTHER", label: "Other" },
] as const;

export function RecordRepaymentModal({
  open,
  loan,
  accessToken,
  tokenType,
  onClose,
  onRecorded,
}: RecordRepaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("CASH");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !loan) return;
    setAmount(loan.balance > 0 ? String(Math.round(loan.balance)) : "");
    setMethod("CASH");
    setNote("");
    setError(null);
  }, [loan, open]);

  if (!open || !loan) return null;

  const currency = loan.currency || "UGX";

  async function submit() {
    if (submitting || !loan) return;
    const activeLoan = loan;
    const nextAmount = Number(amount);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      setError("Enter a valid repayment amount.");
      return;
    }
    if (nextAmount > activeLoan.balance + 0.001) {
      setError(
        `Amount exceeds outstanding balance of ${currency} ${formatMoneyAmount(activeLoan.balance)}.`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/collections/repayments`, {
        method: "POST",
        headers: {
          Authorization: `${tokenType} ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loanId: activeLoan.id,
          amount: nextAmount,
          method,
          note: note.trim() || undefined,
        }),
      });
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(
          formatApiError(payload.message) || "Could not record repayment.",
        );
      }
      onRecorded();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not record repayment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(8,15,31,0.4)] p-3 backdrop-blur-[2px] sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close record repayment"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#e6ebf0] bg-white shadow-[0_22px_50px_rgba(15,23,42,0.22)]">
        <header className="flex items-start justify-between gap-3 border-b border-[#edf1f5] px-4 py-3.5">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#0b1220]">
              Record repayment
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {loan.borrowerName} · {loan.phone}
            </p>
          </div>
          <button
            type="button"
            className="grid size-8 place-items-center rounded-xl border border-[#e6ebf0]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-4">
          <div className="rounded-xl bg-[#f8faf9] px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              Outstanding
            </p>
            <p className="mt-1 font-bold text-[#0b1220]">
              <Money value={loan.balance} currency={currency} />
            </p>
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-600">
              Amount ({currency})
            </span>
            <input
              type="number"
              min={0.01}
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold outline-none focus:border-[var(--forest-emerald)]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-600">
              Method
            </span>
            <select
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as typeof method)
              }
              className="h-11 w-full rounded-xl border border-[#e6ebf0] bg-white px-3 text-sm font-semibold outline-none"
            >
              {METHODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-600">
              Note (optional)
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-[#e6ebf0] px-3 py-2 text-sm outline-none focus:border-[var(--forest-emerald)]"
              placeholder="Optional note"
            />
          </label>
        </div>

        <footer className="flex gap-2 border-t border-[#edf1f5] px-4 py-3">
          <button
            type="button"
            className="h-11 flex-1 rounded-xl border border-[#e6ebf0] text-xs font-semibold text-[#0b1220]"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] text-xs font-semibold text-white disabled:opacity-60"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Save repayment
          </button>
        </footer>
      </div>
    </div>
  );
}
