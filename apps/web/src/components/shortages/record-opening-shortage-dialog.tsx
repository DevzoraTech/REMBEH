"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { formatMoneyAmount, ownerFetch } from "../../app/owner/owner-common";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";
import { invalidateLiveQueries } from "../../lib/live-query-cache";
import type { CashShortageRow } from "./shortages-workspace";

type SalaryEmployeeOption = {
  id: string;
  fullName: string;
  branchId: string | null;
  status: string;
  roleName: string | null;
  shortageOutstanding: number;
};

type Props = {
  session: RembehSession;
  branchId: string;
  onClose: () => void;
  onCreated: (shortage: CashShortageRow, employeeName: string) => void;
};

export function RecordOpeningShortageDialog({
  session,
  branchId,
  onClose,
  onCreated,
}: Props) {
  const [employees, setEmployees] = useState<SalaryEmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [operationDate, setOperationDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingEmployees(true);
      setError(null);
      try {
        const payload = await ownerFetch<{
          employees?: SalaryEmployeeOption[];
        }>(session, "/salaries", {
          branchId: branchId || null,
          fresh: true,
        });
        if (cancelled) return;
        const rows = (payload.employees ?? [])
          .filter((row) => Boolean(row.branchId))
          .sort((left, right) => left.fullName.localeCompare(right.fullName));
        setEmployees(rows);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load employees.",
          );
        }
      } finally {
        if (!cancelled) setLoadingEmployees(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId, session]);

  const selectedEmployee = useMemo(
    () => employees.find((row) => row.id === employeeId) ?? null,
    [employees, employeeId],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedEmployee) {
      setError("Select the employee this shortage belongs to.");
      return;
    }
    const value = Number(amount);
    if (!(value > 0)) {
      setError("Enter the shortage amount from the previous system.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/cash-shortages/opening`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: selectedEmployee.id,
          amount: value,
          notes: notes.trim() || undefined,
          operationDate: operationDate.trim() || undefined,
        }),
      });
      const payload = await readApiJson<{
        shortage?: CashShortageRow;
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      if (!payload.shortage) {
        throw new Error("Opening shortage could not be recorded.");
      }
      invalidateLiveQueries("/cash-shortages", { notify: false });
      invalidateLiveQueries("/salaries", { notify: false });
      onCreated(payload.shortage, selectedEmployee.fullName);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not record this shortage.",
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0b1220]">
              Record shortage
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Enter a prior shortage an employee still owes from the previous
              system.
            </p>
          </div>
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-xl border border-[#e6ebf0]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {loadingEmployees ? (
          <div className="mt-5 flex items-center gap-2 text-sm font-medium text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading employees…
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                Employee
              </span>
              <select
                required
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220] outline-none"
              >
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                    {employee.roleName ? ` · ${employee.roleName}` : ""}
                    {employee.status !== "ACTIVE"
                      ? ` · ${employee.status.toLowerCase()}`
                      : ""}
                    {employee.shortageOutstanding > 0
                      ? ` · already owes UGX ${formatMoneyAmount(employee.shortageOutstanding)}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            {selectedEmployee && selectedEmployee.shortageOutstanding > 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {selectedEmployee.fullName} already has UGX{" "}
                {formatMoneyAmount(selectedEmployee.shortageOutstanding)}{" "}
                outstanding. This adds another shortage record.
              </p>
            ) : null}

            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                Amount outstanding
              </span>
              <input
                required
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="UGX"
                className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220] outline-none"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                Date (optional)
              </span>
              <input
                type="date"
                value={operationDate}
                onChange={(event) => setOperationDate(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220] outline-none"
              />
              <span className="mt-1 block text-[11px] font-medium text-slate-500">
                Leave blank to use today.
              </span>
            </label>

            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                Notes (optional)
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. carried from previous books"
                className="mt-1 w-full rounded-xl border border-[#e6ebf0] px-3 py-2 text-sm font-medium text-[#0b1220] outline-none"
              />
            </label>
          </div>
        )}

        {error ? (
          <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>
        ) : null}

        {employees.length === 0 && !loadingEmployees ? (
          <p className="mt-3 text-sm font-medium text-slate-500">
            No branch-assigned employees were found. Assign the person to a
            branch first.
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl px-3 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || loadingEmployees || employees.length === 0}
            className="h-10 rounded-xl bg-[var(--forest-emerald)] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save shortage"}
          </button>
        </div>
      </form>
    </div>
  );
}
