"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";
import { SettingsCard } from "./settings-chrome";

type BranchSettings = {
  id: string;
  name: string;
  agentFieldExpensesEnabled?: boolean;
};

export function FieldExpenseSettingsCard({
  session,
  branchId,
}: {
  session: RembehSession;
  branchId: string;
}) {
  const [enabled, setEnabled] = useState(true);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/branches`, {
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
        },
      });
      const payload = await readApiJson<{
        branches?: BranchSettings[];
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      const branch =
        payload.branches?.find((item) => item.id === branchId) ??
        payload.branches?.[0] ??
        null;
      if (!branch) {
        throw new Error("Your branch settings could not be loaded.");
      }
      setBranchName(branch.name);
      setEnabled(branch.agentFieldExpensesEnabled !== false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load field expense settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [branchId, session.accessToken, session.tokenType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(next: boolean) {
    setSaving(true);
    setError(null);
    const previous = enabled;
    setEnabled(next);
    try {
      const response = await fetch(`${apiBaseUrl}/branches/${branchId}/settings`, {
        method: "PATCH",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ agentFieldExpensesEnabled: next }),
      });
      const payload = await readApiJson<{
        branch?: BranchSettings;
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setEnabled(payload.branch?.agentFieldExpensesEnabled ?? next);
    } catch (caught) {
      setEnabled(previous);
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update field expense settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Field expenses"
      description="Allow field officers to record expenses from their remaining float."
    >
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[12px] border border-[#edf1f5] bg-[#f8faf9] px-3.5 py-3">
            <span>
              <span className="block text-sm font-semibold text-[#0b1220]">
                Officers can record expenses in the field
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                When this is off, field officers cannot post expenses from remaining
                cash
                {branchName ? ` at ${branchName}` : ""}. Branch cash expenses are
                not affected.
              </span>
            </span>
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[#07885f]"
              checked={enabled}
              disabled={saving}
              onChange={(event) => void toggle(event.target.checked)}
            />
          </label>
          {error ? (
            <p className="text-sm font-semibold text-red-700">{error}</p>
          ) : null}
        </div>
      )}
    </SettingsCard>
  );
}
