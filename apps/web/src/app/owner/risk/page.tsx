"use client";

import {
  AlertTriangle,
  Ban,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../components/app/app-shell";
import {
  DEFAULT_PAGE_SIZE,
  PaginationControls,
  paginateItems,
} from "../../../components/app/pagination";
import { RowActions } from "../../../components/app/row-actions";
import { AppBootSkeleton } from "../../../components/app/skeleton";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import type { RembehSession } from "../../../lib/auth-session";
import {
  authHeaders,
  formatDate,
  formatNumber,
  ownerFetch,
  useOwnerSession,
} from "../owner-common";
import { OwnerHeader } from "../owner-header";
import { invalidateOwnerNotifications } from "../owner-notifications";

type ListType = "BLACKLISTED" | "WATCHLIST";
type ListTab = "all" | ListType;

type RiskEntry = {
  id: string;
  type: ListType;
  borrowerName: string | null;
  nationalId: string;
  phone: string | null;
  reason: string | null;
  customerId: string | null;
  createdAt: string;
  updatedAt: string;
};

const TABS: Array<{ id: ListTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "BLACKLISTED", label: "Blacklist" },
  { id: "WATCHLIST", label: "Watchlist" },
];

export default function OwnerRiskPage() {
  const state = useOwnerSession("/owner/risk");
  const [entries, setEntries] = useState<RiskEntry[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<ListTab>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const blacklisted = useMemo(
    () => entries.filter((entry) => entry.type === "BLACKLISTED"),
    [entries],
  );
  const watchlisted = useMemo(
    () => entries.filter((entry) => entry.type === "WATCHLIST"),
    [entries],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (tab !== "all" && entry.type !== tab) return false;
      if (!q) return true;
      return [
        entry.borrowerName ?? "",
        entry.nationalId,
        entry.phone ?? "",
        entry.reason ?? "",
        entry.type,
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [entries, search, tab]);

  const paged = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateTab(next: ListTab) {
    setTab(next);
    setPage(1);
  }

  async function moveEntry(entry: RiskEntry, nextType: ListType) {
    if (!state.session || !canManage) return;
    setBusyId(entry.id);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/borrower-lists/${entry.id}`,
        {
          method: "PATCH",
          headers: {
            ...authHeaders(state.session),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ type: nextType }),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) throw new Error(formatApiError(payload.message));
      setNotice(
        nextType === "BLACKLISTED"
          ? "Moved to blacklist."
          : "Moved to watchlist.",
      );
      invalidateOwnerNotifications();
      await loadEntries();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update entry.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeEntry(entry: RiskEntry) {
    if (!state.session || !canManage) return;
    if (
      !window.confirm(
        `Remove ${entry.borrowerName ?? entry.nationalId} from the risk register?`,
      )
    ) {
      return;
    }
    setBusyId(entry.id);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/borrower-lists/${entry.id}`,
        {
          method: "DELETE",
          headers: authHeaders(state.session),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) throw new Error(formatApiError(payload.message));
      setNotice("Entry removed.");
      invalidateOwnerNotifications();
      await loadEntries();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not remove entry.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!state.ready || !state.session) return <AppBootSkeleton />;

  return (
    <AppShell
      session={state.session}
      workspace={state.workspace}
      user={state.user}
      branch={null}
    >
      <div className="mx-auto max-w-[1400px] space-y-5 animate-rise">
        <OwnerHeader
          eyebrow="Risk"
          title="Risk register"
          subtitle="Blacklist and watchlist for borrowers who need extra care."
          search={search}
          onSearchChange={updateSearch}
          searchTooltip="Search by name, national ID, phone, or reason."
          searchPlaceholder="Search name, ID, phone..."
          showReportsButton={false}
          actions={
            <>
              <button
                type="button"
                onClick={() => void loadEntries()}
                disabled={loading}
                aria-label="Refresh risk register"
                className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-emerald-50 disabled:opacity-60"
              >
                <RefreshCw
                  className={`size-4 ${loading ? "animate-spin" : ""}`}
                />
              </button>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
                  className="flex h-9 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3.5 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(15,143,104,0.28)] transition hover:brightness-105"
                >
                  <Plus className="size-3.5" />
                  Add entry
                </button>
              ) : null}
            </>
          }
        />

        {error ? (
          <p className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="grid size-7 place-items-center rounded-full bg-white/70"
              aria-label="Dismiss notice"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={<ShieldAlert className="size-4" />}
            label="Total entries"
            value={formatNumber(entries.length)}
            detail="On the register"
            tone="slate"
            active={tab === "all"}
            onClick={() => updateTab("all")}
          />
          <StatCard
            icon={<Ban className="size-4" />}
            label="Blacklisted"
            value={formatNumber(blacklisted.length)}
            detail="Blocked from new loans"
            tone="red"
            active={tab === "BLACKLISTED"}
            onClick={() => updateTab("BLACKLISTED")}
          />
          <StatCard
            icon={<Eye className="size-4" />}
            label="Watchlist"
            value={formatNumber(watchlisted.length)}
            detail="Needs careful review"
            tone="gold"
            active={tab === "WATCHLIST"}
            onClick={() => updateTab("WATCHLIST")}
          />
        </section>

        <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf1f5] px-4 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[#0b1220]">
                Risk entries
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {formatNumber(filtered.length)} shown
                {tab !== "all"
                  ? ` · ${tab === "BLACKLISTED" ? "Blacklist" : "Watchlist"}`
                  : ""}
              </p>
            </div>
            <div className="flex h-9 items-center rounded-xl border border-[#e6ebf0] bg-[#f8faf9] p-1">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => updateTab(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                    tab === item.id
                      ? "bg-white text-[#013f35] shadow-[0_4px_10px_rgba(15,23,42,0.08)]"
                      : "text-slate-500 hover:text-[#0b1220]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-[#edf1f5] px-4 py-3">
            <label className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 shadow-[0_8px_18px_rgba(15,23,42,0.035)]">
              <Search className="size-3.5 shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
                placeholder="Filter this list..."
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] table-fixed text-left text-xs">
              <thead>
                <tr className="border-b border-[#dfe5eb] bg-[#e8edf2] text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-600">
                  <th className="w-[24%] px-4 py-3">Borrower</th>
                  <th className="w-[16%] px-3 py-3">National ID</th>
                  <th className="w-[14%] px-3 py-3">Phone</th>
                  <th className="w-[14%] px-3 py-3">List</th>
                  <th className="w-[20%] px-3 py-3">Reason</th>
                  <th className="w-[12%] px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f5]">
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-slate-500"
                    >
                      Loading risk register…
                    </td>
                  </tr>
                ) : paged.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center">
                      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f4f7f5] text-[var(--forest-emerald)]">
                        <AlertTriangle className="size-5" />
                      </span>
                      <p className="mt-3 text-sm font-semibold text-[#0b1220]">
                        No entries here
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {search.trim()
                          ? "Try a different search."
                          : "Add someone to the blacklist or watchlist when needed."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paged.items.map((entry) => (
                    <tr
                      key={entry.id}
                      className="bg-white transition-colors hover:bg-[#eef7f2]"
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-[#0b1220]">
                          {entry.borrowerName ?? "Unnamed borrower"}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                          Updated {formatDate(entry.updatedAt)}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 font-semibold tabular-nums text-slate-700">
                        {entry.nationalId}
                      </td>
                      <td className="px-3 py-3.5 text-slate-600">
                        {entry.phone ?? "—"}
                      </td>
                      <td className="px-3 py-3.5">
                        <ListBadge type={entry.type} />
                      </td>
                      <td className="px-3 py-3.5 text-slate-600">
                        <span className="line-clamp-2">
                          {entry.reason?.trim() || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {canManage ? (
                          <RowActions
                            label={`Actions for ${entry.borrowerName ?? entry.nationalId}`}
                            busy={busyId === entry.id}
                            items={[
                              entry.type === "WATCHLIST"
                                ? {
                                    label: "Move to blacklist",
                                    onSelect: () =>
                                      void moveEntry(entry, "BLACKLISTED"),
                                  }
                                : {
                                    label: "Move to watchlist",
                                    onSelect: () =>
                                      void moveEntry(entry, "WATCHLIST"),
                                  },
                              {
                                label: "Remove",
                                danger: true,
                                onSelect: () => void removeEntry(entry),
                              },
                            ]}
                          />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 ? (
            <div className="border-t border-[#edf1f5] px-2">
              <PaginationControls
                page={paged.currentPage}
                pageSize={pageSize}
                total={filtered.length}
                itemLabel="entries"
                onPageChange={setPage}
                onPageSizeChange={(next) => {
                  setPageSize(next);
                  setPage(1);
                }}
              />
            </div>
          ) : null}
        </section>
      </div>

      {panelOpen && state.session ? (
        <AddRiskModal
          session={state.session}
          onClose={() => setPanelOpen(false)}
          onSaved={() => {
            setPanelOpen(false);
            setNotice("Entry added to the risk register.");
            invalidateOwnerNotifications();
            void loadEntries();
          }}
        />
      ) : null}
    </AppShell>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  tone,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "slate" | "red" | "gold";
  active?: boolean;
  onClick: () => void;
}) {
  const iconTone = {
    slate: "bg-slate-100 text-slate-700",
    red: "bg-red-50 text-red-700",
    gold: "bg-amber-50 text-amber-700",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[96px] items-center gap-3 rounded-[14px] border bg-white px-4 py-3.5 text-left shadow-[0_12px_26px_rgba(15,23,42,0.045)] transition ${
        active
          ? "border-[var(--forest-emerald)] ring-2 ring-emerald-100"
          : "border-[#e6ebf0] hover:border-emerald-200"
      }`}
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-2xl ${iconTone}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
          {label}
        </p>
        <p className="mt-1 text-xl font-bold tabular-nums text-[#0b1220]">
          {value}
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-slate-500">{detail}</p>
      </div>
    </button>
  );
}

function ListBadge({ type }: { type: ListType }) {
  if (type === "BLACKLISTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">
        <Ban className="size-3" />
        Blacklist
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">
      <Eye className="size-3" />
      Watchlist
    </span>
  );
}

function AddRiskModal({
  session,
  onClose,
  onSaved,
}: {
  session: RembehSession;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    type: "WATCHLIST" as ListType,
    fullName: "",
    nationalId: "",
    phone: "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b1220]/45 sm:items-center sm:px-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(94vh,680px)] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[22px] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.28)] sm:rounded-[22px]">
        <div className="relative shrink-0 overflow-hidden bg-[#013f35] px-5 py-4 text-white">
          <div className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-emerald-400/15" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200/90">
                Risk register
              </p>
              <h2 className="mt-1 text-lg font-bold tracking-[-0.02em]">
                Add entry
              </h2>
              <p className="mt-1 text-xs text-emerald-100/85">
                Blacklist blocks new loans. Watchlist is a caution flag.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 place-items-center rounded-xl border border-white/15 bg-white/10"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#f7faf8] px-5 py-4">
            <div className="grid grid-cols-2 gap-2 rounded-[16px] border border-[#e6ebf0] bg-white p-1.5">
              {(
                [
                  {
                    id: "WATCHLIST" as const,
                    label: "Watchlist",
                    hint: "Caution only",
                  },
                  {
                    id: "BLACKLISTED" as const,
                    label: "Blacklist",
                    hint: "Block loans",
                  },
                ] as const
              ).map((option) => {
                const active = form.type === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({ ...current, type: option.id }))
                    }
                    className={`rounded-[12px] px-3 py-3 text-left transition ${
                      active
                        ? option.id === "BLACKLISTED"
                          ? "bg-red-600 text-white shadow-[0_8px_18px_rgba(220,38,38,0.28)]"
                          : "bg-amber-500 text-white shadow-[0_8px_18px_rgba(245,158,11,0.28)]"
                        : "text-slate-600 hover:bg-[#f8faf9]"
                    }`}
                  >
                    <span className="block text-xs font-bold">
                      {option.label}
                    </span>
                    <span
                      className={`mt-0.5 block text-[10px] ${
                        active ? "text-white/85" : "text-slate-500"
                      }`}
                    >
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 rounded-[16px] border border-[#e6ebf0] bg-white p-4">
              <Field
                label="Borrower name"
                value={form.fullName}
                onChange={(value) =>
                  setForm((current) => ({ ...current, fullName: value }))
                }
                placeholder="Full name"
              />
              <Field
                label="National ID"
                value={form.nationalId}
                onChange={(value) =>
                  setForm((current) => ({ ...current, nationalId: value }))
                }
                placeholder="Required"
                required
              />
              <Field
                label="Phone"
                value={form.phone}
                onChange={(value) =>
                  setForm((current) => ({ ...current, phone: value }))
                }
                placeholder="Optional"
              />
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#0b1220]">
                  Reason
                </span>
                <textarea
                  value={form.reason}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  placeholder="Why are they on this list?"
                  className="min-h-24 w-full rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-2 text-sm outline-none focus:border-[var(--forest-emerald)] focus:bg-white"
                />
              </label>
            </div>

            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#e6ebf0] bg-white px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-10 rounded-xl px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-5 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(15,143,104,0.28)] transition hover:brightness-105 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Save entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[#0b1220]">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 text-sm outline-none focus:border-[var(--forest-emerald)] focus:bg-white"
      />
    </label>
  );
}
