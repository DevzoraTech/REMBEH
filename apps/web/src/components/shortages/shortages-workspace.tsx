"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Scale,
  Wallet,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { OwnerHeader } from "../../app/owner/owner-header";
import { formatMoneyAmount, formatNumber } from "../../app/owner/owner-common";
import { AppShell } from "../app/app-shell";
import { Money } from "../app/money";
import {
  DEFAULT_PAGE_SIZE,
  PaginationControls,
  paginateItems,
} from "../app/pagination";
import { AppBootSkeleton, TableSkeleton } from "../app/skeleton";
import { TableSearchField } from "../app/table-search-field";
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
import { resolveOperatorRole } from "../../lib/roles";

type ShortagePayment = {
  id: string;
  amount: number;
  method: string;
  notes: string | null;
  paidAt: string;
  recordedByName?: string;
};

export type CashShortageRow = {
  id: string;
  branchId: string;
  branchName?: string;
  responsibleUserId: string;
  responsibleName: string;
  responsiblePublicId: string | null;
  createdByName?: string;
  sourceType: string;
  operationDate: string;
  amountOriginal: number;
  amountOutstanding: number;
  amountPaid?: number;
  status: "OPEN" | "PARTIALLY_PAID" | "CLEARED";
  notes: string | null;
  createdAt: string;
  clearedAt: string | null;
  payments: ShortagePayment[];
};

type StatusFilter = "open" | "cleared" | "all";

const METHOD_OPTIONS = [
  { id: "CASH", label: "Cash repayment" },
  { id: "SALARY_DEDUCTION", label: "Salary deduction" },
  { id: "OTHER", label: "Other" },
] as const;

type Props = {
  mode?: "manager" | "owner";
};

export function ShortagesWorkspace({ mode = "manager" }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [branchId, setBranchId] = useState<string>("");
  const [shortages, setShortages] = useState<CashShortageRow[]>([]);
  const [summary, setSummary] = useState({
    openCount: 0,
    outstandingTotal: 0,
    clearedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CashShortageRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] =
    useState<(typeof METHOD_OPTIONS)[number]["id"]>("CASH");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const canRecordPayment = Boolean(
    session?.permissions.includes("operation.close") ||
    session?.permissions.includes("operation.float.return"),
  );
  const isOwner = mode === "owner";

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        clearAuthState();
        router.replace("/login");
        return;
      }
      const role = resolveOperatorRole(auth.session, auth.user);
      if (role === "staff") {
        router.replace("/dashboard");
        return;
      }
      if (isOwner && role !== "owner") {
        router.replace("/shortages");
        return;
      }
      if (!isOwner && role === "owner") {
        router.replace("/owner/shortages");
        return;
      }
      setSession(auth.session);
      setWorkspace(auth.workspace);
      setUser(auth.user);
      setBranch(auth.branch);
      if (auth.branch?.id) setBranchId(auth.branch.id);
    }, 0);
    return () => window.clearTimeout(boot);
  }, [isOwner, router]);

  const loadBranches = useCallback(
    async (active: RembehSession) => {
      if (!isOwner) return;
      const response = await fetch(`${apiBaseUrl}/branches`, {
        headers: {
          Authorization: `${active.tokenType} ${active.accessToken}`,
        },
      });
      const payload = await readApiJson<{
        branches?: Array<{ id: string; name: string }>;
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      const next = payload.branches ?? [];
      setBranches(next);
    },
    [isOwner],
  );

  const load = useCallback(
    async (active: RembehSession, selectedBranchId: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (selectedBranchId) params.set("branchId", selectedBranchId);
        const response = await fetch(
          `${apiBaseUrl}/cash-shortages?${params.toString()}`,
          {
            headers: {
              Authorization: `${active.tokenType} ${active.accessToken}`,
            },
          },
        );
        const payload = await readApiJson<{
          shortages?: CashShortageRow[];
          summary?: {
            openCount: number;
            outstandingTotal: number;
            clearedCount: number;
          };
          message?: string | string[];
        }>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        setShortages(payload.shortages ?? []);
        setSummary(
          payload.summary ?? {
            openCount: 0,
            outstandingTotal: 0,
            clearedCount: 0,
          },
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load shortages.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!session) return;
    void (async () => {
      try {
        if (isOwner) await loadBranches(session);
        await load(session, isOwner ? branchId : (branch?.id ?? branchId));
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load shortages.",
        );
        setLoading(false);
      }
    })();
  }, [session, isOwner, branchId, branch?.id, load, loadBranches]);

  useEffect(() => {
    if (!session || !selectedId) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setDetailLoading(true);
      try {
        const response = await fetch(
          `${apiBaseUrl}/cash-shortages/${selectedId}`,
          {
            headers: {
              Authorization: `${session.tokenType} ${session.accessToken}`,
            },
          },
        );
        const payload = await readApiJson<{
          shortage?: CashShortageRow;
          message?: string | string[];
        }>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        if (!cancelled) {
          setSelected(payload.shortage ?? null);
          if (payload.shortage) {
            setAmount(String(payload.shortage.amountOutstanding));
          }
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load shortage.",
          );
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, session]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return shortages.filter((row) => {
      if (statusFilter === "open" && row.status === "CLEARED") return false;
      if (statusFilter === "cleared" && row.status !== "CLEARED") return false;
      if (!needle) return true;
      return (
        row.responsibleName.toLowerCase().includes(needle) ||
        (row.responsiblePublicId ?? "").toLowerCase().includes(needle) ||
        (row.branchName ?? "").toLowerCase().includes(needle) ||
        (row.notes ?? "").toLowerCase().includes(needle) ||
        sourceLabel(row.sourceType).toLowerCase().includes(needle)
      );
    });
  }, [shortages, statusFilter, search]);

  const paged = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  async function recordPayment() {
    if (!session || !selected) return;
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
        `${apiBaseUrl}/cash-shortages/${selected.id}/payments`,
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
      const payload = await readApiJson<{
        shortage?: CashShortageRow;
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      if (payload.shortage) {
        setSelected(payload.shortage);
        setAmount(
          payload.shortage.amountOutstanding > 0
            ? String(payload.shortage.amountOutstanding)
            : "",
        );
        setNotes("");
        setMethod("CASH");
      }
      setNotice("Shortage payment recorded.");
      await load(session, isOwner ? branchId : (branch?.id ?? branchId));
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

  if (!session) return <AppBootSkeleton />;

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={branch}
    >
      <div className="mx-auto max-w-[1400px] space-y-5 animate-rise">
        <OwnerHeader
          eyebrow={isOwner ? "All Branches" : undefined}
          title="Shortages"
          showReportsButton={false}
          settingsHref={isOwner ? "/owner/settings" : "/settings"}
          notificationScope={isOwner ? "owner" : "manager"}
          actions={
            <button
              type="button"
              onClick={() =>
                void load(
                  session,
                  isOwner ? branchId : (branch?.id ?? branchId),
                )
              }
              disabled={loading}
              aria-label="Refresh shortages"
              className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-emerald-50 disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          }
        />
        <p className="-mt-2 text-sm font-medium text-slate-500">
          Track who must account for a shortage and record payments until
          cleared.
        </p>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--forest-emerald)]">
            {notice}
          </p>
        ) : null}

        <section className="grid gap-2.5 sm:grid-cols-3">
          <ShortageSummaryCard
            title="Open shortages"
            icon={<AlertTriangle className="size-4" />}
            value={formatNumber(summary.openCount)}
            context="still to be accounted for"
            tone="warn"
          />
          <ShortageSummaryCard
            title="Outstanding"
            icon={<Scale className="size-4" />}
            value={formatMoneyAmount(summary.outstandingTotal)}
            context="total not yet paid"
            prefix="UGX"
            tone="warn"
          />
          <ShortageSummaryCard
            title="Cleared"
            icon={<CheckCircle2 className="size-4" />}
            value={formatNumber(summary.clearedCount)}
            context="fully repaid"
            tone="good"
          />
        </section>

        <section className="rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-4 py-3.5">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2 className="text-[15px] font-semibold text-[#0b1220]">
                Shortage Records
              </h2>
              <TableSearchField
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                placeholder="Search Shortages..."
                title="Search by officer, ID, branch, notes, or source."
              />
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as StatusFilter);
                  setPage(1);
                }}
                className="h-9 w-full rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold outline-none sm:w-[170px]"
              >
                <option value="open">Open</option>
                <option value="cleared">Cleared</option>
                <option value="all">All</option>
              </select>
              {isOwner ? (
                <select
                  value={branchId}
                  onChange={(event) => {
                    setBranchId(event.target.value);
                    setPage(1);
                  }}
                  className="h-9 w-full rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold outline-none sm:w-[180px]"
                >
                  <option value="">All branches</option>
                  {branches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div className="p-4">
              <TableSkeleton rows={6} columns={5} />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-[11px] text-slate-500">
              No shortages match this view.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed text-left text-[11px]">
                <thead className="border-b border-[#dfe5eb] bg-[#e8edf2] text-[10px] font-semibold text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5">Officer</th>
                    {isOwner ? <th className="px-2 py-2.5">Branch</th> : null}
                    <th className="px-2 py-2.5">Date</th>
                    <th className="px-2 py-2.5">Source</th>
                    <th className="px-2 py-2.5 text-right">Original</th>
                    <th className="px-2 py-2.5 text-right">Outstanding</th>
                    <th className="px-2 py-2.5">Status</th>
                    <th className="px-1 py-2.5 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1f5]">
                  {paged.items.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer transition-colors hover:bg-[#eef7f2] ${
                        selectedId === row.id
                          ? "bg-[#eef7f2] shadow-[inset_3px_0_0_0_#07885f]"
                          : ""
                      }`}
                      onClick={() => {
                        setNotice(null);
                        setSelectedId(row.id);
                      }}
                    >
                      <td className="px-3 py-2.5 align-top">
                        <p className="break-words font-semibold leading-snug text-[#0b1220]">
                          {row.responsibleName}
                        </p>
                        <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">
                          {row.responsiblePublicId ?? "—"}
                        </p>
                      </td>
                      {isOwner ? (
                        <td className="px-2 py-2.5 align-top text-slate-600">
                          {row.branchName ?? "—"}
                        </td>
                      ) : null}
                      <td className="px-2 py-2.5 align-top tabular-nums text-slate-600">
                        {row.operationDate}
                      </td>
                      <td className="px-2 py-2.5 align-top text-slate-600">
                        {sourceLabel(row.sourceType)}
                      </td>
                      <td className="px-2 py-2.5 align-top text-right">
                        <p className="break-all font-bold tabular-nums text-[#0b1220]">
                          <Money value={row.amountOriginal} currency="UGX" />
                        </p>
                      </td>
                      <td className="px-2 py-2.5 align-top text-right">
                        <p className="break-all font-bold tabular-nums text-[#c23b3b]">
                          <Money value={row.amountOutstanding} currency="UGX" />
                        </p>
                      </td>
                      <td className="px-2 py-2.5 align-top">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-2 py-2.5 align-top text-right">
                        <button
                          type="button"
                          className="rounded-lg border border-[#e6ebf0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#111a2e] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8faf9]"
                          onClick={(event) => {
                            event.stopPropagation();
                            setNotice(null);
                            setSelectedId(row.id);
                          }}
                        >
                          Track
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-[#edf1f5] px-3 py-2">
                <PaginationControls
                  page={paged.currentPage}
                  pageSize={pageSize}
                  total={filtered.length}
                  itemLabel="shortages"
                  onPageChange={setPage}
                  onPageSizeChange={(next) => {
                    setPageSize(next);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {selectedId ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,15,31,0.36)] backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close shortage panel"
            onClick={() => setSelectedId(null)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[#e6ebf0] bg-white shadow-[-18px_0_44px_rgba(15,23,42,0.18)]">
            <header className="flex items-start justify-between gap-3 border-b border-[#edf1f5] px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-[#0b1220]">
                  {selected?.responsibleName ?? "Shortage detail"}
                </h2>
                <p className="text-xs text-slate-500">
                  {selected
                    ? `${selected.operationDate} · ${sourceLabel(selected.sourceType)}`
                    : "Loading shortage details…"}
                </p>
              </div>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-xl border border-[#e6ebf0]"
                onClick={() => setSelectedId(null)}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {detailLoading || !selected ? (
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                        Outstanding
                      </p>
                      <p className="mt-1 text-[15px] font-bold tabular-nums text-[#c23b3b]">
                        <Money
                          value={selected.amountOutstanding}
                          currency="UGX"
                        />
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#e6ebf0] bg-[#f8faf9] px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                        Paid so far
                      </p>
                      <p className="mt-1 text-[15px] font-bold tabular-nums text-[#0b1220]">
                        <Money
                          value={
                            selected.amountPaid ??
                            selected.amountOriginal - selected.amountOutstanding
                          }
                          currency="UGX"
                        />
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#e6ebf0] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={selected.status} />
                      {selected.branchName ? (
                        <span className="text-[11px] font-medium text-slate-500">
                          {selected.branchName}
                        </span>
                      ) : null}
                    </div>
                    <dl className="mt-3 space-y-2 text-xs">
                      <DetailRow
                        label="Original shortage"
                        value={
                          <Money
                            value={selected.amountOriginal}
                            currency="UGX"
                          />
                        }
                      />
                      <DetailRow
                        label="Officer ID"
                        value={selected.responsiblePublicId ?? "—"}
                      />
                      <DetailRow
                        label="Recorded by"
                        value={selected.createdByName ?? "—"}
                      />
                      {selected.notes ? (
                        <DetailRow label="Notes" value={selected.notes} />
                      ) : null}
                      {selected.clearedAt ? (
                        <DetailRow
                          label="Cleared"
                          value={selected.clearedAt.slice(0, 10)}
                        />
                      ) : null}
                    </dl>
                  </div>

                  {canRecordPayment && selected.status !== "CLEARED" ? (
                    <div className="rounded-xl border border-[#e6ebf0] p-4">
                      <p className="text-[15px] font-semibold text-[#0b1220]">
                        Record payment
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Cash or salary deduction against this shortage.
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                            Amount
                          </span>
                          <input
                            type="number"
                            min={0.01}
                            step="0.01"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold text-[#0b1220] outline-none"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
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
                            className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold outline-none"
                          >
                            {METHOD_OPTIONS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="mt-2 block">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                          Notes
                        </span>
                        <input
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-medium outline-none"
                          placeholder="Optional"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void recordPayment()}
                        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] text-xs font-semibold text-white disabled:opacity-55"
                      >
                        {saving ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Wallet className="size-3.5" />
                        )}
                        Save payment
                      </button>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-[#e6ebf0] p-4">
                    <p className="text-[15px] font-semibold text-[#0b1220]">
                      Payment history
                    </p>
                    {selected.payments.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        No payments recorded yet.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {selected.payments.map((payment) => (
                          <li
                            key={payment.id}
                            className="rounded-xl border border-[#edf1f5] bg-[#f8faf9] px-3 py-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[13px] font-bold tabular-nums text-[#0b1220]">
                                  <Money
                                    value={payment.amount}
                                    currency="UGX"
                                  />
                                </p>
                                <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                                  {methodLabel(payment.method)} ·{" "}
                                  {payment.paidAt
                                    .slice(0, 16)
                                    .replace("T", " ")}
                                </p>
                                {payment.recordedByName ? (
                                  <p className="text-[11px] text-slate-500">
                                    by {payment.recordedByName}
                                  </p>
                                ) : null}
                                {payment.notes ? (
                                  <p className="mt-1 text-[11px] text-slate-600">
                                    {payment.notes}
                                  </p>
                                ) : null}
                              </div>
                              <CheckCircle2 className="size-4 shrink-0 text-[var(--forest-emerald)]" />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </AppShell>
  );
}

function ShortageSummaryCard({
  title,
  icon,
  value,
  context,
  prefix,
  tone,
}: {
  title: string;
  icon: ReactNode;
  value: string;
  context: string;
  prefix?: string;
  tone: "good" | "warn";
}) {
  return (
    <article className="overflow-hidden rounded-[14px] border border-[#e8edf2] bg-white p-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e9f8ef] text-[#07885f] [&_svg]:size-3.5">
          {icon}
        </span>
        <h3 className="truncate text-[13px] font-bold tracking-[-0.02em] text-[#0b1220]">
          {title}
        </h3>
      </div>
      <div className="mt-2.5">
        <p
          className={`text-[clamp(0.95rem,1.35vw,1.35rem)] font-bold leading-none tracking-[-0.03em] ${
            tone === "warn" ? "text-[#c23b3b]" : "text-[#0b1220]"
          }`}
        >
          {prefix ? (
            <span className="mr-1 text-[0.85em] font-medium text-slate-500">
              {prefix}
            </span>
          ) : null}
          {value}
        </p>
        <p className="mt-1 text-[11px] font-medium leading-tight text-slate-500">
          {context}
        </p>
      </div>
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#edf1f5] pb-2 last:border-0 last:pb-0">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-[#0b1220]">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: CashShortageRow["status"] }) {
  if (status === "CLEARED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e9f8ef] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-[#07885f]">
        <CheckCircle2 className="size-3" />
        Cleared
      </span>
    );
  }
  if (status === "PARTIALLY_PAID") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3e8] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-[#d97706]">
        <AlertTriangle className="size-3" />
        Partial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#fdecec] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-[#c23b3b]">
      <AlertTriangle className="size-3" />
      Open
    </span>
  );
}

function sourceLabel(source: string) {
  switch (source) {
    case "AGENT_FLOAT_RETURN":
      return "Float return";
    case "BRANCH_CLOSE":
      return "Branch close";
    default:
      return "Manual";
  }
}

function methodLabel(method: string) {
  switch (method) {
    case "SALARY_DEDUCTION":
      return "Salary deduction";
    case "OTHER":
      return "Other";
    default:
      return "Cash";
  }
}
