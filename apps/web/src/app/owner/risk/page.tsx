"use client";

import { Plus, RefreshCw, Search, X } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OwnerPage,
  OwnerPanel,
  OwnerStat,
  OwnerStatus,
  authHeaders,
  formatDate,
  formatNumber,
  ownerFetch,
  titleCase,
  useOwnerSession,
} from "../owner-common";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import type { RembehSession } from "../../../lib/auth-session";

type RiskEntry = {
  id: string;
  type: "BLACKLISTED" | "WATCHLIST";
  borrowerName: string | null;
  nationalId: string;
  phone: string | null;
  reason: string | null;
  customerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function OwnerRiskPage() {
  const state = useOwnerSession("/owner/risk");
  const [entries, setEntries] = useState<RiskEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canManage = Boolean(
    state.session?.permissions.includes("customer.update"),
  );

  const loadEntries = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await ownerFetch<{ entries?: RiskEntry[] }>(
        state.session,
        "/borrower-lists",
      );
      setEntries(payload.entries ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load risk register.",
      );
    } finally {
      setLoading(false);
    }
  }, [state.session]);

  useEffect(() => {
    if (state.ready && state.session) {
      void loadEntries();
    }
  }, [loadEntries, state.ready, state.session]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) =>
      [
        entry.borrowerName ?? "",
        entry.nationalId,
        entry.phone ?? "",
        entry.reason ?? "",
        entry.type,
      ].some((value) => value.toLowerCase().includes(q)),
    );
  }, [entries, search]);

  return (
    <OwnerPage
      state={state}
      title="Risk Register"
      eyebrow="Blacklist & Watchlist"
      actions={
        <>
          <button
            type="button"
            className="btn btn-ghost h-9 text-xs"
            onClick={() => void loadEntries()}
            disabled={loading}
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
          {canManage ? (
            <button
              type="button"
              className="btn btn-primary h-9 text-xs"
              onClick={() => setPanelOpen(true)}
            >
              <Plus className="size-3.5" />
              Add Entry
            </button>
          ) : null}
        </>
      }
    >
      {notice ? (
        <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-[var(--forest-emerald)]">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <OwnerStat label="Total entries" value={formatNumber(entries.length)} />
        <OwnerStat
          label="Blacklisted"
          value={formatNumber(
            entries.filter((entry) => entry.type === "BLACKLISTED").length,
          )}
          tone="red"
        />
        <OwnerStat
          label="Watchlist"
          value={formatNumber(
            entries.filter((entry) => entry.type === "WATCHLIST").length,
          )}
          tone="gold"
        />
      </div>

      <OwnerPanel title="Risk Entries" meta={`${filtered.length} shown`}>
        <div className="border-b border-[var(--line)] bg-white p-3">
          <label className="flex h-10 items-center gap-2 border border-[var(--line)] px-3 text-sm">
            <Search className="size-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none"
              placeholder="Search name, national id, phone or reason"
            />
          </label>
        </div>
        <table className="w-full table-fixed text-left text-xs">
          <thead className="bg-[#e5ece8] text-[10px] font-bold text-slate-500">
            <tr>
              <th className="w-[24%] px-3 py-2">Borrower</th>
              <th className="w-[16%] px-3 py-2">National Id</th>
              <th className="w-[14%] px-3 py-2">Phone</th>
              <th className="w-[14%] px-3 py-2">List</th>
              <th className="w-[20%] px-3 py-2">Reason</th>
              <th className="w-[12%] px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] bg-white">
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  Loading risk register...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  No entries match this view.
                </td>
              </tr>
            ) : (
              filtered.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-3 font-bold text-[var(--midnight-navy)]">
                    {entry.borrowerName ?? "Unregistered borrower"}
                  </td>
                  <td className="px-3 py-3">{entry.nationalId}</td>
                  <td className="px-3 py-3">{entry.phone ?? "-"}</td>
                  <td className="px-3 py-3">
                    <OwnerStatus value={entry.type} />
                  </td>
                  <td className="px-3 py-3">
                    <span className="line-clamp-2">{entry.reason ?? "-"}</span>
                  </td>
                  <td className="px-3 py-3">{formatDate(entry.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </OwnerPanel>

      {panelOpen && state.session ? (
        <RiskEntryPanel
          session={state.session}
          onClose={() => setPanelOpen(false)}
          onSaved={() => {
            setPanelOpen(false);
            setNotice("Risk entry saved.");
            void loadEntries();
          }}
        />
      ) : null}
    </OwnerPage>
  );
}

function RiskEntryPanel({
  session,
  onClose,
  onSaved,
}: {
  session: RembehSession;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    type: "WATCHLIST" as "BLACKLISTED" | "WATCHLIST",
    fullName: "",
    nationalId: "",
    phone: "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/borrower-lists`, {
        method: "POST",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: form.type,
          fullName: form.fullName.trim() || undefined,
          nationalId: form.nationalId.trim(),
          phone: form.phone.trim() || undefined,
          reason: form.reason.trim() || undefined,
        }),
      });
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) throw new Error(formatApiError(payload.message));
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save entry.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title="Add Risk Entry" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm font-semibold text-[var(--midnight-navy)]">
          List
          <select
            value={form.type}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                type: event.target.value as "BLACKLISTED" | "WATCHLIST",
              }))
            }
            className="mt-1 h-10 w-full border border-[var(--line)] px-3 text-sm outline-none"
          >
            <option value="WATCHLIST">{titleCase("watchlist")}</option>
            <option value="BLACKLISTED">{titleCase("blacklisted")}</option>
          </select>
        </label>
        <PanelInput
          label="Borrower name"
          value={form.fullName}
          onChange={(value) =>
            setForm((current) => ({ ...current, fullName: value }))
          }
        />
        <PanelInput
          label="National id"
          value={form.nationalId}
          onChange={(value) =>
            setForm((current) => ({ ...current, nationalId: value }))
          }
          required
        />
        <PanelInput
          label="Phone"
          value={form.phone}
          onChange={(value) =>
            setForm((current) => ({ ...current, phone: value }))
          }
        />
        <label className="block text-sm font-semibold text-[var(--midnight-navy)]">
          Reason
          <textarea
            value={form.reason}
            onChange={(event) =>
              setForm((current) => ({ ...current, reason: event.target.value }))
            }
            className="mt-1 min-h-28 w-full border border-[var(--line)] px-3 py-2 text-sm outline-none"
          />
        </label>
        {error ? (
          <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="btn btn-primary h-10 w-full"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Entry"}
        </button>
      </form>
    </SidePanel>
  );
}

function SidePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(10,18,32,0.35)]">
      <aside className="ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-lg font-bold text-[var(--midnight-navy)]">
            {title}
          </h2>
          <button
            type="button"
            className="grid size-8 place-items-center border border-[var(--line)]"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}

function PanelInput({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-[var(--midnight-navy)]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-1 h-10 w-full border border-[var(--line)] px-3 text-sm outline-none"
      />
    </label>
  );
}
