"use client";

import { useMemo, useState } from "react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";
import { PrimaryButton } from "../auth/form-controls";

export type TransferableStaff = {
  id: string;
  name: string;
  roleName: string;
  branchId: string;
  branchName?: string | null;
};

export function TransferStaffDialog({
  session,
  staff,
  branches,
  onClose,
  onTransferred,
}: {
  session: RembehSession;
  staff: TransferableStaff;
  branches: Array<{ id: string; name: string }>;
  onClose: () => void;
  onTransferred: () => void;
}) {
  const destinations = useMemo(
    () => branches.filter((branch) => branch.id !== staff.branchId),
    [branches, staff.branchId],
  );
  const [targetBranchId, setTargetBranchId] = useState(
    destinations[0]?.id ?? "",
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!targetBranchId) {
      setError("Choose the branch they will work at.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/branches/staff/${staff.id}/transfer`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            targetBranchId,
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
      onTransferred();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not transfer this person.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,18,32,0.45)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#e6ebf0] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
        <h2 className="text-lg font-bold text-[#0b1220]">Transfer staff</h2>
        <p className="mt-1 text-sm text-slate-600">
          {staff.name} keeps the same login, then works only at the new branch.
        </p>
        <label className="mt-4 block text-xs font-semibold text-slate-600">
          Move to
          <select
            value={targetBranchId}
            onChange={(event) => setTargetBranchId(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220]"
          >
            {destinations.length === 0 ? (
              <option value="">No other branch available</option>
            ) : (
              destinations.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="mt-3 block text-xs font-semibold text-slate-600">
          Reason (optional)
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-[#e6ebf0] px-3 py-2 text-sm text-[#0b1220]"
          />
        </label>
        {error ? (
          <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl px-3 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <PrimaryButton
            type="button"
            loading={busy}
            disabled={!targetBranchId}
            onClick={() => void submit()}
          >
            Transfer
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export type StaffTransferRow = {
  id: string;
  staffName: string;
  roleName: string;
  fromBranchName: string;
  toBranchName: string;
  transferredByName: string;
  transferredAt: string;
  reason: string | null;
};

export function StaffTransfersList({
  transfers,
}: {
  transfers: StaffTransferRow[];
}) {
  if (transfers.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-[#e5ebf0] px-3 py-4 text-center text-xs text-slate-500">
        No staff transfers yet
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5ebf0] bg-white">
      {transfers.map((row) => (
        <div
          key={row.id}
          className="border-b border-[#edf1f5] px-3 py-2.5 last:border-b-0"
        >
          <p className="text-xs font-semibold text-[#0b1224]">
            {row.staffName}
            <span className="ml-1.5 font-medium text-slate-500">
              · {row.roleName}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            {row.fromBranchName} → {row.toBranchName}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {row.transferredByName} ·{" "}
            {new Date(row.transferredAt).toLocaleString()}
            {row.reason ? ` · ${row.reason}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
