"use client";

import { Loader2, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Money } from "../app/money";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";
import type { CashShortageRow } from "../shortages/shortages-workspace";

type Props = {
  session: RembehSession;
  branchId: string | null;
  canRecordPayment: boolean;
  onPaymentRecorded?: () => void;
};

const METHOD_OPTIONS = [
  { id: "CASH", label: "Cash repayment" },
  { id: "SALARY_DEDUCTION", label: "Salary deduction" },
  { id: "OTHER", label: "Other" },
] as const;

export function CashShortagesPanel({
  session,
  branchId,
  canRecordPayment,
  onPaymentRecorded,
}: Props) {
  const [shortages, setShortages] = useState<CashShortageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] =
    useState<(typeof METHOD_OPTIONS)[number]["id"]>("CASH");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!branchId) {
      setShortages([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/cash-shortages?branchId=${encodeURIComponent(branchId)}`,
        {
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
          },
        },
      );
      const payload = await readApiJson<{
        shortages?: CashShortageRow[];
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }

      const rows = (payload.shortages ?? []).filter(
        (row) => row.status !== "CLEARED",
      );
      setShortages(rows);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load shortages.",
      );
    } finally {
      setLoading(false);
    }
  }, [branchId, session.accessToken, session.tokenType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recordPayment(shortage: CashShortageRow) {
    const value = Number(amount);
    if (!(value > 0)) {
      setError("Enter a valid payment amount.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/cash-shortages/${shortage.id}/payments`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: value,
            method,
            notes: notes.trim() || undefined,
          }),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setPayingId(null);
      setAmount("");
      setNotes("");
      setMethod("CASH");
      setNotice("Shortage paid recorded as today’s cash in.");
      await load();
      onPaymentRecorded?.();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not record shortage payment.",
      );
    } finally {
      setSaving(false);
    }
  }

  const outstandingTotal = shortages.reduce(
    (sum, row) => sum + row.amountOutstanding,
    0,
  );

  return (
    <section
      id="ops-cash-shortages"
      className="rounded-[14px] border border-[#e6ebf0] bg-white px-3.5 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#0a6b55]">
            Accountability
          </p>
          <h3 className="mt-0.5 text-sm font-bold text-[#0b1220]">
            Cash shortages
          </h3>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Open shortages for this branch. Full tracking is on the Shortages
            page.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
              Outstanding
            </p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-[#0b1220]">
              <Money value={outstandingTotal} currency="UGX" />
            </p>
          </div>
          <Link
            href="/shortages"
            className="text-[11px] font-bold text-[#0a6b55] hover:underline"
          >
            Open shortages page →
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Loader2 className="size-3.5 animate-spin" />
          Loading shortages…
        </div>
      ) : shortages.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[#e6ebf0] bg-[#f8faf9] px-3 py-4 text-center text-xs font-medium text-slate-500">
          No open shortages for this branch.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shortages.slice(0, 5).map((row) => {
            const isPaying = payingId === row.id;
            return (
              <li
                key={row.id}
                className="rounded-xl border border-[#e6ebf0] bg-[#fbfcfc] px-3 py-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#0b1220]">
                      {row.responsibleName}
                      {row.responsiblePublicId ? (
                        <span className="ml-1.5 text-[11px] font-semibold text-slate-500">
                          {row.responsiblePublicId}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                      {row.operationDate} · {row.status.replace("_", " ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase text-slate-500">
                      Outstanding
                    </p>
                    <p className="text-sm font-bold tabular-nums text-red-700">
                      <Money value={row.amountOutstanding} currency="UGX" />
                    </p>
                  </div>
                </div>

                {canRecordPayment ? (
                  <div className="mt-2.5">
                    {!isPaying ? (
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#d7e3de] bg-white px-2.5 text-[11px] font-semibold text-[#003f35] hover:bg-[#f4f7f6]"
                        onClick={() => {
                          setPayingId(row.id);
                          setAmount(String(row.amountOutstanding));
                          setError(null);
                          setNotice(null);
                        }}
                      >
                        <Wallet className="size-3.5" />
                        Record shortage paid
                      </button>
                    ) : (
                      <div className="space-y-2 rounded-xl border border-[#e6ebf0] bg-white p-2.5">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-[10px] font-semibold uppercase text-slate-500">
                              Amount
                            </span>
                            <input
                              type="number"
                              min={0.01}
                              step="0.01"
                              value={amount}
                              onChange={(event) => setAmount(event.target.value)}
                              className="mt-1 h-9 w-full rounded-lg border border-[#e6ebf0] px-2.5 text-sm font-semibold outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-semibold uppercase text-slate-500">
                              Method
                            </span>
                            <select
                              value={method}
                              onChange={(event) =>
                                setMethod(
                                  event.target
                                    .value as (typeof METHOD_OPTIONS)[number]["id"],
                                )
                              }
                              className="mt-1 h-9 w-full rounded-lg border border-[#e6ebf0] px-2.5 text-sm font-semibold outline-none"
                            >
                              {METHOD_OPTIONS.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label className="block">
                          <span className="text-[10px] font-semibold uppercase text-slate-500">
                            Notes
                          </span>
                          <input
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            className="mt-1 h-9 w-full rounded-lg border border-[#e6ebf0] px-2.5 text-sm font-medium outline-none"
                            placeholder="Optional"
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="h-8 flex-1 rounded-lg border border-[#e6ebf0] text-[11px] font-semibold"
                            onClick={() => setPayingId(null)}
                            disabled={saving}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 flex-[1.4] items-center justify-center gap-1.5 rounded-lg bg-[#003f35] text-[11px] font-semibold text-white disabled:opacity-50"
                            disabled={saving}
                            onClick={() => void recordPayment(row)}
                          >
                            {saving ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : null}
                            Save payment
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
