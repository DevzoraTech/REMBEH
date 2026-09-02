"use client";

import { Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";

type LoanDetail = {
  loanId: string;
  customerId: string;
  fullName: string;
  phone: string;
  nationalId: string | null;
  customerEmail: string | null;
  principalAmount: number;
  outstanding: number;
  status: string;
  loanStartDate: string;
  paymentStartDate: string;
};

type CustomerOption = {
  id: string;
  fullName: string;
  phone: string;
  branchName: string | null;
  voidedAt?: string | null;
};

const STATUSES = [
  { value: "CURRENT", label: "Current" },
  { value: "IN_ARREARS", label: "In arrears" },
  { value: "RESTRUCTURED", label: "Restructured" },
  { value: "WRITTEN_OFF", label: "Written off" },
  { value: "CLOSED", label: "Closed" },
] as const;

function dateInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toIsoDate(value: string) {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function EditLoanRecordDialog({
  session,
  loanId,
  onClose,
  onSaved,
}: {
  session: RembehSession;
  loanId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<LoanDetail | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [email, setEmail] = useState("");
  const [principal, setPrincipal] = useState("");
  const [outstanding, setOutstanding] = useState("");
  const [status, setStatus] = useState("CURRENT");
  const [loanStartDate, setLoanStartDate] = useState("");
  const [paymentStartDate, setPaymentStartDate] = useState("");
  const [reason, setReason] = useState("");
  const [targetCustomerId, setTargetCustomerId] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [loanResponse, customersResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/collections/loans/${loanId}`, {
            headers: {
              Authorization: `${session.tokenType} ${session.accessToken}`,
            },
          }),
          fetch(`${apiBaseUrl}/customers`, {
            headers: {
              Authorization: `${session.tokenType} ${session.accessToken}`,
            },
          }),
        ]);
        const loanPayload = await readApiJson<{
          detail?: LoanDetail;
          message?: string | string[];
        }>(loanResponse);
        const customersPayload = await readApiJson<{
          customers?: CustomerOption[];
          message?: string | string[];
        }>(customersResponse);
        if (!loanResponse.ok) {
          throw new Error(formatApiError(loanPayload.message));
        }
        if (!customersResponse.ok) {
          throw new Error(formatApiError(customersPayload.message));
        }
        const next = loanPayload.detail;
        if (!next) {
          throw new Error("This loan could not be loaded.");
        }
        if (cancelled) return;
        setDetail(next);
        setFullName(next.fullName);
        setPhone(next.phone);
        setNationalId(next.nationalId ?? "");
        setEmail(next.customerEmail ?? "");
        setPrincipal(String(next.principalAmount ?? 0));
        setOutstanding(String(next.outstanding ?? 0));
        setStatus(next.status || "CURRENT");
        setLoanStartDate(dateInputValue(next.loanStartDate));
        setPaymentStartDate(dateInputValue(next.paymentStartDate));
        setCustomers(customersPayload.customers ?? []);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load this loan record.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loanId, session.accessToken, session.tokenType]);

  const targetCustomer = customers.find((item) => item.id === targetCustomerId);
  const moving = Boolean(targetCustomerId);

  const clientMatches = useMemo(() => {
    const needle = clientQuery.trim().toLowerCase();
    return customers
      .filter((item) => item.id !== detail?.customerId && !item.voidedAt)
      .filter((item) => {
        if (!needle) return false;
        return (
          item.fullName.toLowerCase().includes(needle) ||
          item.phone.toLowerCase().includes(needle)
        );
      })
      .slice(0, 8);
  }, [clientQuery, customers, detail?.customerId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        principalAmount: Number(principal),
        outstandingBalance: Number(outstanding),
        status,
        loanStartDate: toIsoDate(loanStartDate),
        paymentStartDate: toIsoDate(paymentStartDate),
        reason: reason.trim(),
      };
      if (moving && targetCustomerId) {
        body.customerId = targetCustomerId;
      } else {
        body.customerFullName = fullName.trim();
        body.phone = phone.trim();
        body.nationalId = nationalId.trim() || null;
        body.email = email.trim() || null;
      }
      const response = await fetch(
        `${apiBaseUrl}/collections/loans/${loanId}/legacy-correction`,
        {
          method: "PATCH",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save this loan record.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(8,15,31,0.45)] p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[18px] border border-[#e6ebf0] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.2)]"
      >
        <h3 className="text-base font-bold text-[#0b1220]">Edit loan record</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          Use this when names, amounts, or the client on this loan are wrong.
          The change is audited.
        </p>

        {loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading loan…
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-3.5 py-3">
              <p className="text-sm font-semibold text-[#0b1220]">
                This loan belongs to a different client
              </p>
              {targetCustomer ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">
                    Move to{" "}
                    <span className="font-semibold text-[#0b1220]">
                      {targetCustomer.fullName}
                    </span>
                    {targetCustomer.branchName
                      ? ` · ${targetCustomer.branchName}`
                      : ""}
                  </p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#07885f]"
                    onClick={() => {
                      setTargetCustomerId(null);
                      setClientQuery("");
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
                  <input
                    value={clientQuery}
                    onChange={(event) => setClientQuery(event.target.value)}
                    placeholder="Search the correct client"
                    className="h-10 w-full rounded-xl border border-[#e6ebf0] bg-white pl-9 pr-3 text-sm outline-none"
                  />
                  {clientMatches.length > 0 ? (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-[#e6ebf0] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
                      {clientMatches.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left hover:bg-[#f4f7f6]"
                          onClick={() => {
                            setTargetCustomerId(item.id);
                            setClientQuery("");
                          }}
                        >
                          <span className="block text-sm font-semibold text-[#0b1220]">
                            {item.fullName}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {item.phone}
                            {item.branchName ? ` · ${item.branchName}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {!moving ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-500">
                  Client name
                  <input
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220]"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Phone
                  <input
                    required
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220]"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  National ID
                  <input
                    value={nationalId}
                    onChange={(event) => setNationalId(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220]"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Email
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220]"
                  />
                </label>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-500">
                Principal
                <input
                  required
                  type="number"
                  min={0}
                  value={principal}
                  onChange={(event) => setPrincipal(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220]"
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Outstanding
                <input
                  required
                  type="number"
                  min={0}
                  value={outstanding}
                  onChange={(event) => setOutstanding(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220]"
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Loan start
                <input
                  type="date"
                  value={loanStartDate}
                  onChange={(event) => setLoanStartDate(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220]"
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Payment start
                <input
                  type="date"
                  value={paymentStartDate}
                  onChange={(event) => setPaymentStartDate(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220]"
                />
              </label>
              <label className="text-xs font-semibold text-slate-500 sm:col-span-2">
                Status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220]"
                >
                  {STATUSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500 sm:col-span-2">
                Reason
                <textarea
                  required
                  minLength={4}
                  maxLength={240}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why is this record being corrected?"
                  className="mt-1 min-h-[84px] w-full rounded-xl border border-[#e6ebf0] px-3 py-2 text-sm font-semibold text-[#0b1220]"
                />
              </label>
            </div>
          </div>
        )}

        {error ? (
          <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="h-10 rounded-xl px-4 text-sm font-semibold text-slate-600"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#07885f] px-4 text-sm font-semibold text-white disabled:opacity-55"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save correction
          </button>
        </div>
      </form>
    </div>
  );
}
