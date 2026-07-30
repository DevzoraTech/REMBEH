"use client";

import { RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OwnerBorrower,
  OwnerPage,
  OwnerPanel,
  OwnerStat,
  OwnerStatus,
  formatDate,
  formatNumber,
  ownerFetch,
  useOwnerSession,
} from "../owner-common";

export default function OwnerBorrowersPage() {
  const state = useOwnerSession("/owner/borrowers");
  const [borrowers, setBorrowers] = useState<OwnerBorrower[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBorrowers = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await ownerFetch<{ customers?: OwnerBorrower[] }>(
        state.session,
        "/customers",
      );
      setBorrowers(payload.customers ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load borrowers.",
      );
    } finally {
      setLoading(false);
    }
  }, [state.session]);

  useEffect(() => {
    if (state.ready && state.session) {
      void loadBorrowers();
    }
  }, [loadBorrowers, state.ready, state.session]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return borrowers;
    return borrowers.filter((borrower) =>
      [
        borrower.fullName,
        borrower.phone,
        borrower.nationalId ?? "",
        borrower.collateralType ?? "",
        borrower.city ?? "",
        borrower.branchName ?? "",
      ].some((value) => value.toLowerCase().includes(q)),
    );
  }, [borrowers, search]);

  return (
    <OwnerPage
      state={state}
      title="Borrowers"
      eyebrow="Account Register"
      actions={
        <button
          type="button"
          className="btn btn-ghost h-9 text-xs"
          onClick={() => void loadBorrowers()}
          disabled={loading}
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      {error ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OwnerStat label="Borrowers" value={formatNumber(borrowers.length)} />
        <OwnerStat
          label="Verified"
          value={formatNumber(
            borrowers.filter((borrower) => borrower.verifiedAt).length,
          )}
          tone="green"
        />
        <OwnerStat
          label="With loans"
          value={formatNumber(
            borrowers.filter((borrower) => borrower.loanCount > 0).length,
          )}
          tone="blue"
        />
        <OwnerStat
          label="New this month"
          value={formatNumber(borrowers.filter(isThisMonth).length)}
          tone="gold"
        />
      </div>

      <OwnerPanel title="Borrower Register" meta={`${filtered.length} shown`}>
        <div className="border-b border-[var(--line)] bg-white p-3">
          <label className="flex h-10 items-center gap-2 border border-[var(--line)] px-3 text-sm">
            <Search className="size-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none"
              placeholder="Search borrower, phone, national id or branch"
            />
          </label>
        </div>
        <table className="w-full table-fixed text-left text-xs">
          <thead className="bg-[#e5ece8] text-[10px] font-bold text-slate-500">
            <tr>
              <th className="w-[20%] px-3 py-2">Borrower</th>
              <th className="w-[14%] px-3 py-2">Phone</th>
              <th className="w-[15%] px-3 py-2">National Id</th>
              <th className="w-[15%] px-3 py-2">Collateral</th>
              <th className="w-[14%] px-3 py-2">Branch</th>
              <th className="w-[10%] px-3 py-2 text-right">Loans</th>
              <th className="w-[12%] px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] bg-white">
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  Loading borrowers...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-slate-500"
                >
                  No borrowers match this view.
                </td>
              </tr>
            ) : (
              filtered.slice(0, 80).map((borrower) => (
                <tr key={borrower.id}>
                  <td className="px-3 py-3">
                    <p className="truncate font-bold text-[var(--midnight-navy)]">
                      {borrower.fullName}
                    </p>
                    <p className="mt-1 truncate text-slate-500">
                      {formatDate(borrower.createdAt)}
                    </p>
                  </td>
                  <td className="px-3 py-3">{borrower.phone}</td>
                  <td className="px-3 py-3">{borrower.nationalId ?? "-"}</td>
                  <td className="px-3 py-3">
                    {borrower.collateralType ?? "-"}
                  </td>
                  <td className="px-3 py-3">{borrower.branchName ?? "-"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {borrower.loanCount}
                  </td>
                  <td className="px-3 py-3">
                    <OwnerStatus
                      value={borrower.verifiedAt ? "VERIFIED" : "PENDING"}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </OwnerPanel>
    </OwnerPage>
  );
}

function isThisMonth(borrower: OwnerBorrower) {
  const createdAt = new Date(borrower.createdAt);
  const now = new Date();
  return (
    createdAt.getFullYear() === now.getFullYear() &&
    createdAt.getMonth() === now.getMonth()
  );
}
