"use client";

import {
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app/app-shell";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
  isSessionExpired,
  readAuthState,
} from "../../lib/auth-session";

type ListType = "BLACKLISTED" | "WATCHLIST";
type ListTab = "all" | ListType;

type BorrowerListEntry = {
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

type BorrowerRow = {
  id: string;
  fullName: string;
  phone: string;
  nationalId: string | null;
  collateralType: string | null;
  loanCount: number;
};

export default function BlacklistWatchlistPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [entries, setEntries] = useState<BorrowerListEntry[]>([]);
  const [borrowers, setBorrowers] = useState<BorrowerRow[]>([]);
  const [tab, setTab] = useState<ListTab>("all");
  const [search, setSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [listType, setListType] = useState<ListType>("WATCHLIST");
  const [borrowerSearch, setBorrowerSearch] = useState("");
  const [selectedBorrowerId, setSelectedBorrowerId] = useState("");
  const [fullName, setFullName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [borrowersLoading, setBorrowersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<{
    entryId: string;
    top: number;
    left: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);

  const canManage = Boolean(session?.permissions.includes("customer.update"));
  const actionMenuEntry = actionMenu
    ? entries.find((entry) => entry.id === actionMenu.entryId)
    : null;

  const loadEntries = useCallback(async (activeSession: RembehSession) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/borrower-lists`, {
        headers: {
          Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
        },
      });
      const payload = await readApiJson<{
        entries?: BorrowerListEntry[];
        message?: string | string[];
      }>(response);
      if (!response.ok) throw new Error(formatApiError(payload.message));
      setEntries(payload.entries ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load list.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBorrowers = useCallback(async (activeSession: RembehSession) => {
    setBorrowersLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/customers`, {
        headers: {
          Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
        },
      });
      const payload = await readApiJson<{
        customers?: BorrowerRow[];
        message?: string | string[];
      }>(response);
      if (!response.ok) throw new Error(formatApiError(payload.message));
      setBorrowers(payload.customers ?? []);
    } catch (caught) {
      setPanelError(
        caught instanceof Error ? caught.message : "Could not load borrowers.",
      );
    } finally {
      setBorrowersLoading(false);
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        clearAuthState();
        router.replace("/login");
        return;
      }

      setSession(auth.session);
      setWorkspace(auth.workspace);
      setUser(auth.user);
      setBranch(auth.branch);

      if (!auth.session.permissions.includes("customer.read")) {
        setError("You do not have permission to view this page.");
        setLoading(false);
        return;
      }

      void loadEntries(auth.session);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [loadEntries, router]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (tab !== "all" && entry.type !== tab) return false;
      if (!q) return true;
      return [
        entry.borrowerName ?? "",
        entry.nationalId,
        entry.phone ?? "",
        entry.reason ?? "",
        listLabel(entry.type),
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [entries, search, tab]);

  const filteredBorrowers = useMemo(() => {
    const q = borrowerSearch.trim().toLowerCase();
    if (!q) return borrowers.slice(0, 8);
    return borrowers
      .filter((borrower) =>
        [
          borrower.fullName,
          borrower.phone,
          borrower.nationalId ?? "",
          borrower.collateralType ?? "",
        ].some((value) => value.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [borrowerSearch, borrowers]);

  function openPanel() {
    setListType("WATCHLIST");
    setBorrowerSearch("");
    setSelectedBorrowerId("");
    setFullName("");
    setNationalId("");
    setPhone("");
    setReason("");
    setPanelError(null);
    setPanelOpen(true);
    if (session && borrowers.length === 0 && !borrowersLoading) {
      void loadBorrowers(session);
    }
  }

  function chooseBorrower(borrower: BorrowerRow) {
    setSelectedBorrowerId(borrower.id);
    setFullName(borrower.fullName);
    setNationalId(borrower.nationalId ?? "");
    setPhone(borrower.phone);
  }

  function toggleActionMenu(
    entryId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const nextMenu = {
      entryId,
      top: rect.bottom + 6,
      left: Math.max(8, rect.right - 160),
    };
    setActionMenu((current) => {
      if (current?.entryId === entryId) return null;
      return nextMenu;
    });
  }

  async function saveEntry() {
    if (!session || saving) return;
    setSaving(true);
    setPanelError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/borrower-lists`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: listType,
          customerId: selectedBorrowerId || undefined,
          fullName: fullName.trim() || undefined,
          nationalId: nationalId.trim(),
          phone: phone.trim() || undefined,
          reason: reason.trim() || undefined,
        }),
      });
      const payload = await readApiJson<{
        entry?: BorrowerListEntry;
        message?: string | string[];
      }>(response);
      if (!response.ok) throw new Error(formatApiError(payload.message));
      setPanelOpen(false);
      await loadEntries(session);
    } catch (caught) {
      setPanelError(
        caught instanceof Error ? caught.message : "Could not save entry.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeType(entry: BorrowerListEntry, type: ListType) {
    if (!session || busyId) return;
    setActionMenu(null);
    setBusyId(entry.id);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/borrower-lists/${entry.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type }),
      });
      const payload = await readApiJson<{
        entry?: BorrowerListEntry;
        message?: string | string[];
      }>(response);
      if (!response.ok) throw new Error(formatApiError(payload.message));
      await loadEntries(session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update entry.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeEntry(entry: BorrowerListEntry) {
    if (!session || busyId) return;
    setActionMenu(null);
    const confirmed = window.confirm("Remove this borrower from the list?");
    if (!confirmed) return;
    setBusyId(entry.id);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/borrower-lists/${entry.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
        },
      });
      const payload = await readApiJson<{
        removed?: boolean;
        message?: string | string[];
      }>(response);
      if (!response.ok) throw new Error(formatApiError(payload.message));
      await loadEntries(session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not remove entry.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={branch}
    >
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--midnight-navy)]">
              Blacklist & Watchlist
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {entries.length} total
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost h-9 text-xs"
              onClick={() => void loadEntries(session)}
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
                onClick={openPanel}
              >
                <Plus className="size-3.5" />
                Add borrower
              </button>
            ) : null}
          </div>
        </div>

        <section className="grid gap-2 sm:grid-cols-3">
          <SmallStat label="all" value={String(entries.length)} />
          <SmallStat
            label="blacklist"
            value={String(
              entries.filter((entry) => entry.type === "BLACKLISTED").length,
            )}
          />
          <SmallStat
            label="watchlist"
            value={String(
              entries.filter((entry) => entry.type === "WATCHLIST").length,
            )}
          />
        </section>

        <div className="panel flex flex-wrap items-center justify-between gap-2 bg-white/90 px-3 py-2 shadow-[0_8px_22px_rgba(20,33,61,0.05)]">
          <div className="flex min-w-[220px] flex-1 items-center gap-2">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search borrowers"
              className="min-w-[160px] flex-1 bg-transparent py-1.5 text-sm text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "BLACKLISTED", "WATCHLIST"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`h-8 px-3 text-xs font-bold ${
                  tab === value
                    ? "bg-[var(--midnight-navy)] text-white"
                    : "border border-[var(--line)] bg-white text-slate-600"
                }`}
                onClick={() => setTab(value)}
              >
                {value === "all" ? "All" : listLabel(value)}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {loading && entries.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading list…
          </div>
        ) : filteredEntries.length === 0 ? (
          <p className="panel px-4 py-6 text-sm text-slate-500">
            No borrowers found.
          </p>
        ) : (
          <div className="panel overflow-hidden shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] table-fixed text-left text-[12px]">
                <thead className="border-b border-[var(--line)] bg-[#e5ece8] text-[9px] lowercase tracking-[0.06em] text-slate-500">
                  <tr>
                    <th className="w-[18%] px-2.5 py-2.5 font-semibold">
                      borrower
                    </th>
                    <th className="w-[15%] px-2.5 py-2.5 font-semibold">
                      national id
                    </th>
                    <th className="w-[13%] px-2.5 py-2.5 font-semibold">
                      phone
                    </th>
                    <th className="w-[12%] px-2.5 py-2.5 font-semibold">
                      list
                    </th>
                    <th className="w-[24%] px-2.5 py-2.5 font-semibold">
                      reason
                    </th>
                    <th className="w-[10%] px-2.5 py-2.5 font-semibold">
                      updated
                    </th>
                    <th className="w-[8%] px-2.5 py-2.5 text-right font-semibold">
                      actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {filteredEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="bg-white transition odd:bg-white even:bg-[#fbfdfc] hover:bg-[var(--soft-mist)]"
                    >
                      <td className="px-2.5 py-3">
                        <p className="truncate font-semibold text-[var(--midnight-navy)]">
                          {entry.borrowerName || "—"}
                        </p>
                      </td>
                      <td className="px-2.5 py-3 text-[11px] font-semibold text-slate-700">
                        <span className="block truncate">
                          {entry.nationalId}
                        </span>
                      </td>
                      <td className="px-2.5 py-3 text-[11px] text-slate-600">
                        <span className="block truncate">
                          {entry.phone || "—"}
                        </span>
                      </td>
                      <td className="px-2.5 py-3 text-[9px] font-bold lowercase tracking-[0.04em]">
                        <span
                          className={`inline-flex border px-1.5 py-0.5 ${listTone(
                            entry.type,
                          )}`}
                        >
                          {listLabel(entry.type)}
                        </span>
                      </td>
                      <td className="px-2.5 py-3 text-[11px] text-slate-600">
                        <span className="line-clamp-2">
                          {entry.reason || "—"}
                        </span>
                      </td>
                      <td className="px-2.5 py-3 text-[11px] text-slate-500">
                        {formatDate(entry.updatedAt)}
                      </td>
                      <td className="px-2.5 py-3 text-right">
                        {canManage ? (
                          <button
                            type="button"
                            className="ml-auto grid size-8 place-items-center border border-[var(--line)] bg-white text-[var(--midnight-navy)] transition hover:bg-[var(--soft-mist)] disabled:opacity-50"
                            aria-label={`Open actions for ${
                              entry.borrowerName || entry.nationalId
                            }`}
                            aria-haspopup="menu"
                            aria-expanded={actionMenu?.entryId === entry.id}
                            disabled={busyId === entry.id}
                            onClick={(event) =>
                              toggleActionMenu(entry.id, event)
                            }
                          >
                            {busyId === entry.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <MoreVertical className="size-4" />
                            )}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {actionMenu && actionMenuEntry ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close actions"
            onClick={() => setActionMenu(null)}
          />
          <div
            role="menu"
            className="fixed z-50 w-[152px] border border-[var(--line)] bg-white p-1 text-left shadow-[0_10px_24px_rgba(20,33,61,0.18)]"
            style={{ top: actionMenu.top, left: actionMenu.left }}
          >
            <ActionMenuItem
              disabled={busyId === actionMenuEntry.id}
              onClick={() =>
                void changeType(
                  actionMenuEntry,
                  actionMenuEntry.type === "BLACKLISTED"
                    ? "WATCHLIST"
                    : "BLACKLISTED",
                )
              }
              label={
                actionMenuEntry.type === "BLACKLISTED"
                  ? "Move to watchlist"
                  : "Move to blacklist"
              }
            />
            <ActionMenuItem
              disabled={busyId === actionMenuEntry.id}
              danger
              onClick={() => void removeEntry(actionMenuEntry)}
              label="Remove"
            />
          </div>
        </>
      ) : null}

      {panelOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close panel"
            onClick={() => setPanelOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[var(--line)] bg-[var(--soft-ivory)] shadow-xl">
            <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-[var(--midnight-navy)]">
                  Add borrower
                </h2>
              </div>
              <button
                type="button"
                className="grid size-8 place-items-center border border-[var(--line)] bg-white"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {panelError ? (
                <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {panelError}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <ListChoice
                  active={listType === "WATCHLIST"}
                  label="watchlist"
                  onClick={() => setListType("WATCHLIST")}
                />
                <ListChoice
                  active={listType === "BLACKLISTED"}
                  label="blacklist"
                  onClick={() => setListType("BLACKLISTED")}
                />
              </div>

              <label className="panel flex items-center gap-2 bg-white px-3 py-2">
                <Search className="size-4 shrink-0 text-slate-400" />
                <input
                  type="search"
                  value={borrowerSearch}
                  onChange={(event) => setBorrowerSearch(event.target.value)}
                  placeholder="Search existing borrowers"
                  className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-slate-400"
                />
              </label>

              {borrowersLoading ? (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="size-4 animate-spin" />
                  Loading borrowers…
                </p>
              ) : filteredBorrowers.length > 0 ? (
                <div className="max-h-56 overflow-y-auto border border-[var(--line)] bg-white">
                  {filteredBorrowers.map((borrower) => (
                    <button
                      key={borrower.id}
                      type="button"
                      className={`flex w-full items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2.5 text-left last:border-b-0 hover:bg-[var(--soft-mist)] ${
                        selectedBorrowerId === borrower.id
                          ? "bg-emerald-50"
                          : ""
                      }`}
                      onClick={() => chooseBorrower(borrower)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[var(--midnight-navy)]">
                          {borrower.fullName}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {borrower.phone}
                          {borrower.nationalId
                            ? ` · ${borrower.nationalId}`
                            : ""}
                        </span>
                      </span>
                      <ShieldAlert className="size-4 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="grid gap-3">
                <Field
                  label="name"
                  value={fullName}
                  onChange={setFullName}
                />
                <Field
                  label="national id"
                  value={nationalId}
                  onChange={setNationalId}
                  required
                />
                <Field label="phone" value={phone} onChange={setPhone} />
                <label className="grid gap-1 text-xs font-semibold text-slate-600">
                  reason
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={4}
                    className="border border-[var(--line)] bg-white px-3 py-2 text-sm font-normal text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)]"
                  />
                </label>
              </div>
            </div>

            <div className="border-t border-[var(--line)] bg-white px-4 py-3">
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={saving || nationalId.trim().length < 5}
                onClick={() => void saveEntry()}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Save
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-slate-600">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="h-10 border border-[var(--line)] bg-white px-3 text-sm font-normal text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)]"
      />
    </label>
  );
}

function ListChoice({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`h-11 border text-sm font-bold ${
        active
          ? "border-[var(--forest-emerald)] bg-emerald-50 text-[var(--midnight-navy)]"
          : "border-[var(--line)] bg-white text-slate-600"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ActionMenuItem({
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`block w-full px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--soft-mist)] disabled:opacity-50 ${
        danger ? "text-red-700" : "text-[var(--midnight-navy)]"
      }`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel border-l-4 border-l-[var(--midnight-navy)] bg-white px-3 py-2.5 shadow-[0_8px_22px_rgba(20,33,61,0.05)]">
      <p className="text-[10px] font-semibold lowercase tracking-[0.1em] text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold text-[var(--midnight-navy)]">
        {value}
      </p>
    </div>
  );
}

function listLabel(type: ListType) {
  return type === "BLACKLISTED" ? "blacklisted" : "watchlist";
}

function listTone(type: ListType) {
  if (type === "BLACKLISTED") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-UG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
