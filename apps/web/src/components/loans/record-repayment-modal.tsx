"use client";

import { CalendarDays, Loader2, Wallet, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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

type LoanCollectionDetail = {
  loanId: string;
  fullName: string;
  phone: string;
  outstanding: number;
  expectedToday: number;
  dailyInstalment: number;
  loanAmount: number;
  loanStartDate: string;
};

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile money" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "OTHER", label: "Other" },
] as const;

const NOTE_MAX = 120;

export function RecordRepaymentModal({
  open,
  loan,
  accessToken,
  tokenType,
  onClose,
  onRecorded,
}: RecordRepaymentModalProps) {
  const [detail, setDetail] = useState<LoanCollectionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] =
    useState<(typeof METHODS)[number]["value"]>("CASH");
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState(() => toDateInputValue(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !loan) return;

    let cancelled = false;
    setMethod("CASH");
    setNote("");
    setPaidAt(toDateInputValue(new Date()));
    setError(null);
    setDetail(null);
    setLoadingDetail(true);
    setAmount("");

    void (async () => {
      try {
        const response = await fetch(
          `${apiBaseUrl}/collections/loans/${loan.id}`,
          {
            headers: {
              Authorization: `${tokenType} ${accessToken}`,
            },
          },
        );
        const payload = await readApiJson<{
          detail?: LoanCollectionDetail;
          message?: string | string[];
        }>(response);
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(
            formatApiError(payload.message) || "Could not load loan detail.",
          );
        }
        const next = payload.detail ?? null;
        setDetail(next);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load loan detail.",
          );
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, loan, open, tokenType]);

  const currency = loan?.currency || "UGX";
  const outstanding = detail?.outstanding ?? loan?.balance ?? 0;
  const expectedToday = detail?.expectedToday ?? null;
  const dailyInstalment = detail?.dailyInstalment ?? null;
  const paidAmount = useMemo(() => parseAmount(amount), [amount]);
  const newOutstanding = Math.max(0, outstanding - paidAmount);
  const prepaidDeposit =
    expectedToday != null && paidAmount > expectedToday
      ? roundMoney(paidAmount - expectedToday)
      : 0;

  if (!open || !loan) return null;

  async function submit() {
    if (submitting || !loan) return;
    const activeLoan = loan;
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      setError("Enter a repayment amount.");
      return;
    }
    if (paidAmount > outstanding + 0.001) {
      setError(
        `Amount exceeds outstanding balance of ${currency} ${formatMoneyAmount(outstanding)}.`,
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
          amount: paidAmount,
          method,
          note: note.trim() || undefined,
          paidAt: paidAtToIso(paidAt),
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

  const borrowerName = detail?.fullName || loan.borrowerName;
  const phone = detail?.phone || loan.phone;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(8,15,31,0.4)] p-3 backdrop-blur-[2px] sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close record repayment"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#e6ebf0] bg-white shadow-[0_22px_50px_rgba(15,23,42,0.22)]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#edf1f5] bg-white px-4 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold tracking-[-0.02em] text-[#0b1220]">
              Record Repayment
            </h2>
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

        <div className="space-y-3.5 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-[#e9f8ef] text-sm font-bold text-[#07885f]">
              {initials(borrowerName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-[#0b1220]">
                {borrowerName}
              </p>
              <p className="truncate text-[12px] text-slate-500">{phone}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] text-slate-500">Loan Amount</p>
              <p className="text-[14px] font-bold text-[#07885f]">
                {detail ? (
                  <Money value={detail.loanAmount} currency={currency} />
                ) : (
                  "—"
                )}
              </p>
              <p className="text-[10px] text-slate-500">
                {detail?.loanStartDate
                  ? `Taken on ${formatShortDate(detail.loanStartDate)}`
                  : " "}
              </p>
            </div>
          </div>

          {loadingDetail ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Loading repayment details…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <MiniStat
                icon={<Wallet className="size-4" />}
                iconClassName="text-[#c4922a]"
                label="Expected Today"
                value={
                  expectedToday != null ? (
                    <Money value={expectedToday} currency={currency} />
                  ) : (
                    "—"
                  )
                }
                valueClassName="text-[#c4922a]"
              />
              <MiniStat
                icon={<CalendarDays className="size-4" />}
                iconClassName="text-[#07885f]"
                label="Daily Instalment"
                value={
                  dailyInstalment != null ? (
                    <Money value={dailyInstalment} currency={currency} />
                  ) : (
                    "—"
                  )
                }
                valueClassName="text-[#07885f]"
              />
            </div>
          )}

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-[12px] font-semibold text-[#07885f]">
              Amount Paid
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value.replace(/[^\d]/g, ""))
              }
              className="h-12 w-full rounded-xl border-[1.4px] border-[#07885f] px-3 text-[22px] font-bold tracking-[-0.02em] text-[#0b1220] outline-none focus:border-[#067352]"
              placeholder="0"
            />
          </label>

          <div className="flex items-center justify-between rounded-xl border border-[#e6ebf0] bg-[#e9f8ef] px-3 py-3">
            <span className="text-[12px] font-semibold text-slate-600">
              New Outstanding Balance
            </span>
            <span className="text-[16px] font-bold text-[#07885f]">
              <Money value={newOutstanding} currency={currency} />
            </span>
          </div>

          {prepaidDeposit > 0 && paidAmount <= outstanding + 0.001 ? (
            <p className="rounded-xl border border-[#d9ebe2] bg-[#f4faf7] px-3 py-2.5 text-[12px] font-medium leading-relaxed text-[#0b1220]">
              Extra {currency} {formatMoneyAmount(prepaidDeposit)} above
              today&apos;s due will carry to the next day as a deposit.
            </p>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-600">
              Payment method
            </span>
            <select
              value={method}
              disabled={submitting}
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
              Payment date
            </span>
            <input
              type="date"
              value={paidAt}
              max={toDateInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000))}
              disabled={submitting}
              onChange={(event) => setPaidAt(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#e6ebf0] bg-white px-3 text-sm font-semibold outline-none"
            />
          </label>

          <label className="block space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-[#0b1220]">
                Note (optional)
              </span>
              <span className="text-[11px] text-slate-500">
                {note.length}/{NOTE_MAX}
              </span>
            </div>
            <textarea
              value={note}
              maxLength={NOTE_MAX}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              disabled={submitting}
              className="w-full resize-none rounded-xl border border-[#e6ebf0] px-3 py-2 text-sm outline-none focus:border-[var(--forest-emerald)]"
              placeholder="Add a note (e.g. promised balance tomorrow)…"
            />
          </label>
        </div>

        <footer className="sticky bottom-0 border-t border-[#edf1f5] bg-white px-4 py-3">
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] text-[13px] font-semibold text-white disabled:opacity-60"
            onClick={() => void submit()}
            disabled={submitting || loadingDetail}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitting ? "Saving…" : "Save Repayment"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  iconClassName,
  label,
  value,
  valueClassName,
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: ReactNode;
  valueClassName: string;
}) {
  return (
    <div className="rounded-xl border border-[#e6ebf0] bg-[#f7f9f8] p-3">
      <span className={iconClassName}>{icon}</span>
      <p className="mt-1.5 text-[11px] text-slate-500">{label}</p>
      <p className={`mt-1 text-[15px] font-bold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function parseAmount(value: string) {
  const raw = value.replaceAll(",", "").replaceAll(" ", "").trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round(value);
}

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function paidAtToIso(dateInput: string) {
  const [y, m, d] = dateInput.split("-").map(Number);
  if (!y || !m || !d) return new Date().toISOString();
  const now = new Date();
  const local = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), 0, 0);
  return local.toISOString();
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
