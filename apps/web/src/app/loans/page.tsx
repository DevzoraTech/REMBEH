"use client";

import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app/app-shell";
import { ApplicationDetailDrawer } from "../../components/app/application-detail-drawer";
import { LoanApplicationFormDrawer } from "../../components/app/loan-application-form-drawer";
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

type LoanRow = {
  id: string;
  applicationId: string | null;
  customerId: string;
  borrowerName: string;
  phone: string;
  nationalId: string | null;
  loanTypeName: string | null;
  status: string;
  principal: number;
  balance: number;
  paidAmount: number;
  currency: string;
  officerName: string | null;
  officerPublicId: string | null;
  createdAt: string;
  disbursedAt: string | null;
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

type LoanApplicationResponse = {
  application?: {
    id: string;
  };
  message?: string | string[];
};

type LoanTab = "all" | "active" | "completed";

const ACTIVE_LOAN_STATUSES = new Set([
  "SUBMITTED",
  "APPROVED",
  "DISBURSED",
  "CURRENT",
  "IN_ARREARS",
  "RESTRUCTURED",
]);

const COMPLETED_LOAN_STATUSES = new Set(["CLOSED"]);

export default function LoansPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [borrowers, setBorrowers] = useState<BorrowerRow[]>([]);
  const [tab, setTab] = useState<LoanTab>("all");
  const [search, setSearch] = useState("");
  const [borrowerSearch, setBorrowerSearch] = useState("");
  const [selectedBorrowerId, setSelectedBorrowerId] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"new" | "existing">("new");
  const [detailApplicationId, setDetailApplicationId] = useState<
    string | null
  >(null);
  const [editingApplicationId, setEditingApplicationId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [borrowersLoading, setBorrowersLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canCreate = Boolean(session?.permissions.includes("loan.create"));

  const loadLoans = useCallback(async (activeSession: RembehSession) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/loans`, {
        headers: {
          Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
        },
      });
      const payload = await readApiJson<{
        loans?: LoanRow[];
        message?: string | string[];
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setLoans(payload.loans ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load loans.");
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
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
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

      if (!auth.session.permissions.includes("loan.read")) {
        setError("You do not have permission to view loans.");
        setLoading(false);
        return;
      }

      void loadLoans(auth.session);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [router, loadLoans]);

  const filteredLoans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loans.filter((loan) => {
      if (tab === "active" && !ACTIVE_LOAN_STATUSES.has(loan.status)) {
        return false;
      }
      if (tab === "completed" && !COMPLETED_LOAN_STATUSES.has(loan.status)) {
        return false;
      }
      if (!q) return true;
      return [
        loan.id,
        loan.borrowerName,
        loan.phone,
        loan.nationalId ?? "",
        loan.loanTypeName ?? "",
        loan.status,
        loan.officerName ?? "",
        loan.officerPublicId ?? "",
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [loans, search, tab]);

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

  async function startApplication() {
    if (!session || creating) return;
    setCreating(true);
    setPanelError(null);
    setNotice(null);
    try {
      const existing = createMode === "existing";
      if (existing && !selectedBorrowerId) {
        throw new Error("Choose a borrower first.");
      }

      const response = await fetch(
        existing
          ? `${apiBaseUrl}/loans/applications/from-borrower`
          : `${apiBaseUrl}/loans/applications`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            ...(existing ? { "Content-Type": "application/json" } : {}),
          },
          body: existing
            ? JSON.stringify({ customerId: selectedBorrowerId })
            : undefined,
        },
      );
      const payload = await readApiJson<LoanApplicationResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      if (!payload.application?.id) {
        throw new Error("Application was not started.");
      }
      setEditingApplicationId(payload.application.id);
      setNotice("Application started.");
      setAddOpen(false);
      setSelectedBorrowerId("");
      setBorrowerSearch("");
      await loadLoans(session);
    } catch (caught) {
      setPanelError(
        caught instanceof Error
          ? caught.message
          : "Could not start application.",
      );
    } finally {
      setCreating(false);
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
              Loans
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {loans.length} total
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost h-9 text-xs"
              onClick={() => void loadLoans(session)}
              disabled={loading}
            >
              <RefreshCw
                className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            {canCreate ? (
              <button
                type="button"
                className="btn btn-primary h-9 text-xs"
                onClick={() => {
                  setPanelError(null);
                  setCreateMode("new");
                  setAddOpen(true);
                }}
              >
                <Plus className="size-3.5" />
                New loan
              </button>
            ) : null}
          </div>
        </div>

        {notice ? (
          <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--forest-emerald)]">
            {notice}
          </p>
        ) : null}

        <div className="panel flex flex-wrap items-center justify-between gap-2 bg-white/90 px-3 py-2 shadow-[0_8px_22px_rgba(20,33,61,0.05)]">
          <div className="flex min-w-[220px] flex-1 items-center gap-2">
            <Search className="size-4 shrink-0 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search loans"
              className="min-w-[160px] flex-1 bg-transparent py-1.5 text-sm text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "active", "completed"] as const).map((value) => (
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
                {tabLabel(value)}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {loading && loans.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Loading loans…
          </div>
        ) : filteredLoans.length === 0 ? (
          <p className="panel px-4 py-6 text-sm text-slate-500">
            No loans found.
          </p>
        ) : (
          <div className="panel overflow-hidden shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] table-fixed text-left text-[12px]">
                <thead className="border-b border-[var(--line)] bg-[#e5ece8] text-[9px] lowercase tracking-[0.06em] text-slate-500">
                  <tr>
                    <th className="w-[10%] px-2.5 py-2.5 font-semibold">
                      loan id
                    </th>
                    <th className="w-[17%] px-2.5 py-2.5 font-semibold">
                      borrower
                    </th>
                    <th className="w-[13%] px-2.5 py-2.5 font-semibold">
                      loan type
                    </th>
                    <th className="w-[10%] px-2.5 py-2.5 font-semibold">
                      status
                    </th>
                    <th className="w-[11%] px-2.5 py-2.5 text-right font-semibold">
                      principal
                    </th>
                    <th className="w-[11%] px-2.5 py-2.5 text-right font-semibold">
                      paid
                    </th>
                    <th className="w-[12%] px-2.5 py-2.5 text-right font-semibold">
                      balance
                    </th>
                    <th className="w-[11%] px-2.5 py-2.5 font-semibold">
                      officer
                    </th>
                    <th className="w-[5%] px-2.5 py-2.5 text-right font-semibold">
                      actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {filteredLoans.map((loan) => (
                    <tr
                      key={loan.id}
                      className="bg-white transition odd:bg-white even:bg-[#fbfdfc] hover:bg-[var(--soft-mist)]"
                    >
                      <td className="px-2.5 py-3 font-bold text-[var(--midnight-navy)]">
                        <span className="block truncate">
                          {loan.id.slice(0, 8).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-2.5 py-3">
                        <Link
                          href={`/clients/${loan.customerId}`}
                          className="block min-w-0"
                        >
                          <span className="block truncate font-semibold text-[var(--midnight-navy)]">
                            {loan.borrowerName}
                          </span>
                          <span className="block truncate text-[10px] text-slate-500">
                            {loan.phone}
                          </span>
                        </Link>
                      </td>
                      <td className="px-2.5 py-3 text-[11px] text-slate-600">
                        <span className="block truncate">
                          {loan.loanTypeName || "standard loan"}
                        </span>
                      </td>
                      <td className="px-2.5 py-3 text-[9px] font-bold lowercase tracking-[0.04em]">
                        <span className={`inline-flex border px-1.5 py-0.5 ${loanStatusTone(loan.status)}`}>
                          {loanStatusLabel(loan.status)}
                        </span>
                      </td>
                      <td className="px-2.5 py-3 text-right text-[11px] font-bold tabular-nums text-[var(--midnight-navy)]">
                        {formatMoney(loan.principal, loan.currency)}
                      </td>
                      <td className="px-2.5 py-3 text-right text-[11px] font-bold tabular-nums text-[var(--forest-emerald)]">
                        {formatMoney(loan.paidAmount, loan.currency)}
                      </td>
                      <td className="px-2.5 py-3 text-right text-[11px] font-bold tabular-nums text-[var(--midnight-navy)]">
                        {formatMoney(loan.balance, loan.currency)}
                      </td>
                      <td className="px-2.5 py-3 text-[11px] text-slate-600">
                        <span className="block truncate">
                          {loan.officerName || "—"}
                        </span>
                      </td>
                      <td className="px-2.5 py-3 text-right">
                        {loan.applicationId ? (
                          <button
                            type="button"
                            className="btn btn-ghost h-8 px-2 text-[11px]"
                            onClick={() =>
                              setDetailApplicationId(loan.applicationId)
                            }
                          >
                            view
                          </button>
                        ) : (
                          <Link
                            href={`/clients/${loan.customerId}`}
                            className="btn btn-ghost h-8 px-2 text-[11px]"
                          >
                            view
                          </Link>
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

      {addOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close new loan panel"
            onClick={() => setAddOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-[var(--line)] bg-[var(--soft-ivory)] shadow-xl">
            <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
              <div>
                <h2 className="text-lg font-bold text-[var(--midnight-navy)]">
                  New loan
                </h2>
                <p className="text-xs text-slate-500">
                  Start from a new application or an existing borrower.
                </p>
              </div>
              <button
                type="button"
                className="grid size-8 place-items-center border border-[var(--line)] bg-white"
                onClick={() => setAddOpen(false)}
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
                <ChoiceButton
                  active={createMode === "new"}
                  icon={<Plus className="size-4" />}
                  label="new application"
                  onClick={() => setCreateMode("new")}
                />
                <ChoiceButton
                  active={createMode === "existing"}
                  icon={<UserRound className="size-4" />}
                  label="existing borrower"
                  onClick={() => {
                    setCreateMode("existing");
                    if (session && borrowers.length === 0 && !borrowersLoading) {
                      void loadBorrowers(session);
                    }
                  }}
                />
              </div>

              {createMode === "existing" ? (
                <div className="space-y-3">
                  <label className="panel flex items-center gap-2 bg-white px-3 py-2">
                    <Search className="size-4 shrink-0 text-slate-400" />
                    <input
                      type="search"
                      value={borrowerSearch}
                      onChange={(event) =>
                        setBorrowerSearch(event.target.value)
                      }
                      placeholder="Search borrowers"
                      className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-slate-400"
                    />
                  </label>

                  {borrowersLoading ? (
                    <p className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="size-4 animate-spin" />
                      Loading borrowers…
                    </p>
                  ) : filteredBorrowers.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No borrowers found.
                    </p>
                  ) : (
                    <div className="divide-y divide-[var(--line)] border border-[var(--line)] bg-white">
                      {filteredBorrowers.map((borrower) => (
                        <button
                          key={borrower.id}
                          type="button"
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--soft-mist)] ${
                            selectedBorrowerId === borrower.id
                              ? "bg-emerald-50"
                              : ""
                          }`}
                          onClick={() => setSelectedBorrowerId(borrower.id)}
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
                          <span className="text-[10px] font-semibold text-slate-500">
                            {borrower.loanCount} loan
                            {borrower.loanCount === 1 ? "" : "s"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="border-t border-[var(--line)] bg-white px-4 py-3">
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={
                  creating ||
                  (createMode === "existing" && !selectedBorrowerId)
                }
                onClick={() => void startApplication()}
              >
                {creating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Start application
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <ApplicationDetailDrawer
        applicationId={detailApplicationId}
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        onClose={() => setDetailApplicationId(null)}
      />
      <LoanApplicationFormDrawer
        applicationId={editingApplicationId}
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        onClose={() => setEditingApplicationId(null)}
        onSubmitted={() => {
          setEditingApplicationId(null);
          setNotice("Loan given.");
          void loadLoans(session);
        }}
      />
    </AppShell>
  );
}

function ChoiceButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex min-h-20 flex-col items-start justify-between border px-3 py-3 text-left text-sm font-bold ${
        active
          ? "border-[var(--forest-emerald)] bg-emerald-50 text-[var(--midnight-navy)]"
          : "border-[var(--line)] bg-white text-slate-600"
      }`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function tabLabel(tab: LoanTab) {
  if (tab === "active") return "Active loans";
  if (tab === "completed") return "Completed loans";
  return "All loans";
}

function loanStatusLabel(status: string) {
  if (COMPLETED_LOAN_STATUSES.has(status)) return "completed";
  if (ACTIVE_LOAN_STATUSES.has(status)) return "active";
  return status.toLowerCase().replaceAll("_", " ");
}

function loanStatusTone(status: string) {
  if (COMPLETED_LOAN_STATUSES.has(status)) {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }
  if (status === "IN_ARREARS") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (ACTIVE_LOAN_STATUSES.has(status)) {
    return "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]";
  }
  return "border-[var(--line)] bg-[var(--soft-mist)] text-slate-500";
}

function formatMoney(value: number, currency = "UGX") {
  return `${currency} ${new Intl.NumberFormat("en-UG", {
    maximumFractionDigits: 0,
  }).format(value)}`;
}
