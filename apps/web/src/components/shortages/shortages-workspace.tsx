"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Scale,
  Search,
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
import { AppShell } from "../app/app-shell";
import { Money } from "../app/money";
import {
  DEFAULT_PAGE_SIZE,
  PaginationControls,
  paginateItems,
} from "../app/pagination";
import { AppBootSkeleton, TableSkeleton } from "../app/skeleton";
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

  const loadBranches = useCallback(async (active: RembehSession) => {
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
    setBranchId((current) => current || next[0]?.id || "");
  }, [isOwner]);

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
        await load(session, isOwner ? branchId : branch?.id ?? branchId);
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
      await load(
        session,
        isOwner ? branchId : branch?.id ?? branchId,
      );
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
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#0a6b55]">
              Accountability
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl tracking-[-0.03em] text-[#0b1220]">
              Cash shortages
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Track who must account for a shortage and record payments until
              cleared.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold text-[#0b1220] hover:bg-[#f8faf9]"
            onClick={() =>
              session &&
              void load(
                session,
                isOwner ? branchId : branch?.id ?? branchId,
              )
            }
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {notice}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Open shortages"
            value={String(summary.openCount)}
            hint="Still to be accounted for"
          />
          <SummaryCard
            label="Outstanding"
            value={<Money value={summary.outstandingTotal} currency="UGX" />}
            hint="Total not yet paid"
            tone="red"
          />
          <SummaryCard
            label="Cleared"
            value={String(summary.clearedCount)}
            hint="Fully repaid"
            tone="green"
          />
        </div>

        <section className="rounded-[16px] border border-[#e6ebf0] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-[#e6ebf0] bg-[#f8faf9] p-1">
              {(
                [
                  { id: "open", label: "Open" },
                  { id: "cleared", label: "Cleared" },
                  { id: "all", label: "All" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(item.id);
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    statusFilter === item.id
                      ? "bg-white text-[#0b1220] shadow-sm"
                      : "text-slate-500 hover:text-[#0b1220]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {isOwner ? (
              <select
                value={branchId}
                onChange={(event) => {
                  setBranchId(event.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold outline-none"
              >
                <option value="">All branches</option>
                {branches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : null}
            <label className="ml-auto flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 sm:max-w-xs">
              <Search className="size-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search officer, notes…"
                className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none"
              />
            </label>
          </div>

          {loading ? (
            <div className="mt-4">
              <TableSkeleton rows={6} columns={5} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-[#e6ebf0] bg-[#f8faf9] px-4 py-10 text-center">
              <Scale className="mx-auto size-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-600">
                No shortages in this view
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Shortages appear when a float return or day close has a short
                cash variance.
              </p>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#e6ebf0] text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    <th className="py-2 pr-3">Officer</th>
                    {isOwner ? <th className="py-2 pr-3">Branch</th> : null}
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3 text-right">Original</th>
                    <th className="py-2 pr-3 text-right">Outstanding</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[#eef2f4] last:border-0"
                    >
                      <td className="py-3 pr-3">
                        <p className="font-bold text-[#0b1220]">
                          {row.responsibleName}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500">
                          {row.responsiblePublicId ?? "—"}
                        </p>
                      </td>
                      {isOwner ? (
                        <td className="py-3 pr-3 font-medium text-slate-600">
                          {row.branchName ?? "—"}
                        </td>
                      ) : null}
                      <td className="py-3 pr-3 tabular-nums text-slate-600">
                        {row.operationDate}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">
                        {sourceLabel(row.sourceType)}
                      </td>
                      <td className="py-3 pr-3 text-right font-semibold tabular-nums">
                        <Money value={row.amountOriginal} currency="UGX" />
                      </td>
                      <td className="py-3 pr-3 text-right font-bold tabular-nums text-red-700">
                        <Money value={row.amountOutstanding} currency="UGX" />
                      </td>
                      <td className="py-3 pr-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          className="rounded-lg border border-[#e6ebf0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#003f35] hover:bg-[#f4f7f6]"
                          onClick={() => {
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
          )}
        </section>
      </div>

      {selectedId ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(8,16,28,0.48)] backdrop-blur-[2px]">
          <button
            type="button"
            className="hidden flex-1 cursor-default sm:block"
            aria-label="Close"
            onClick={() => setSelectedId(null)}
          />
          <aside className="flex h-full w-full max-w-[440px] flex-col bg-[#f4f7f6] shadow-[-28px_0_70px_rgba(15,23,42,0.22)]">
            <header className="bg-[linear-gradient(135deg,#003f35_0%,#0a6b55_58%,#12805f_100%)] px-5 pb-5 pt-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/65">
                    Shortage detail
                  </p>
                  <h2 className="mt-1 text-lg font-bold">
                    {selected?.responsibleName ?? "Loading…"}
                  </h2>
                  <p className="mt-1 text-xs text-white/75">
                    {selected
                      ? `${selected.operationDate} · ${sourceLabel(selected.sourceType)}`
                      : " "}
                  </p>
                </div>
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-full border border-white/20 bg-white/10"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
              {selected ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase text-white/65">
                      Outstanding
                    </p>
                    <p className="mt-1 text-sm font-bold tabular-nums">
                      <Money
                        value={selected.amountOutstanding}
                        currency="UGX"
                      />
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase text-white/65">
                      Paid so far
                    </p>
                    <p className="mt-1 text-sm font-bold tabular-nums">
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
              ) : null}
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {detailLoading || !selected ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[#e6ebf0] bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={selected.status} />
                      {selected.branchName ? (
                        <span className="text-[11px] font-semibold text-slate-500">
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
                    <div className="rounded-2xl border border-[#e6ebf0] bg-white p-4">
                      <p className="text-sm font-bold text-[#0b1220]">
                        Record payment
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Cash or salary deduction against this shortage.
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
                            className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm font-semibold outline-none"
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
                        <span className="text-[10px] font-semibold uppercase text-slate-500">
                          Notes
                        </span>
                        <input
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          className="mt-1 h-10 w-full rounded-xl border border-[#e6ebf0] px-3 text-sm outline-none"
                          placeholder="Optional"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void recordPayment()}
                        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#003f35] text-xs font-semibold text-white disabled:opacity-50"
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

                  <div className="rounded-2xl border border-[#e6ebf0] bg-white p-4">
                    <p className="text-sm font-bold text-[#0b1220]">
                      Payment history
                    </p>
                    {selected.payments.length === 0 ? (
                      <p className="mt-3 text-xs font-medium text-slate-500">
                        No payments recorded yet.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {selected.payments.map((payment) => (
                          <li
                            key={payment.id}
                            className="rounded-xl border border-[#eef2f4] bg-[#fbfcfc] px-3 py-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-bold tabular-nums text-[#0b1220]">
                                  <Money
                                    value={payment.amount}
                                    currency="UGX"
                                  />
                                </p>
                                <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                                  {methodLabel(payment.method)} ·{" "}
                                  {payment.paidAt.slice(0, 16).replace("T", " ")}
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
                              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
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

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  tone?: "red" | "green";
}) {
  return (
    <div className="rounded-[16px] border border-[#e6ebf0] bg-white px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-bold tabular-nums ${
          tone === "red"
            ? "text-red-700"
            : tone === "green"
              ? "text-emerald-700"
              : "text-[#0b1220]"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-500">{hint}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#eef2f4] pb-2 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-[#0b1220]">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: CashShortageRow["status"] }) {
  if (status === "CLEARED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-emerald-700">
        <CheckCircle2 className="size-3" />
        Cleared
      </span>
    );
  }
  if (status === "PARTIALLY_PAID") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-amber-700">
        <AlertTriangle className="size-3" />
        Partial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-red-700">
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
