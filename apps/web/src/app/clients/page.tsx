"use client";

import { RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app/app-shell";
import {
  DEFAULT_PAGE_SIZE,
  PaginationControls,
  paginateItems,
} from "../../components/app/pagination";
import { RowActions } from "../../components/app/row-actions";
import { AppBootSkeleton, TableSkeleton } from "../../components/app/skeleton";
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

type ClientRow = {
  id: string;
  branchId: string;
  branchName: string | null;
  fullName: string;
  phone: string;
  nationalId: string | null;
  email: string | null;
  collateralType: string | null;
  city: string | null;
  loanCount: number;
  verifiedAt: string | null;
  createdAt: string;
};

type ClientsResponse = {
  customers: ClientRow[];
  message?: string | string[];
};

export default function ClientsPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClients = useCallback(async (activeSession: RembehSession) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/customers`, {
        headers: {
          Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
        },
      });
      const payload = await readApiJson<ClientsResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setClients(payload.customers ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load borrowers.",
      );
    } finally {
      setLoading(false);
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
        setError("You do not have permission to view borrowers.");
        setLoading(false);
        return;
      }

      void loadClients(auth.session);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [router, loadClients]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) =>
      [
        client.fullName,
        client.phone,
        client.collateralType ?? "",
        client.branchName ?? "",
        client.city ?? "",
        client.email ?? "",
        client.nationalId ?? "",
      ].some((value) => value.toLowerCase().includes(q)),
    );
  }, [clients, search]);

  const pagedClients = useMemo(
    () => paginateItems(filteredClients, page, pageSize),
    [filteredClients, page, pageSize],
  );

  if (!session) {
    return <AppBootSkeleton />;
  }

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={branch}
    >
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--midnight-navy)]">
              Borrowers
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {clients.length} total
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost h-9 text-xs"
            onClick={() => void loadClients(session)}
            disabled={loading}
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        <div className="panel flex flex-wrap items-center gap-2 bg-white/90 px-3 py-2 shadow-[0_8px_22px_rgba(20,33,61,0.05)]">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search borrowers"
            className="min-w-[200px] flex-1 bg-transparent py-1.5 text-sm text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {loading && clients.length === 0 ? (
          <TableSkeleton rows={6} columns={6} />
        ) : filteredClients.length === 0 ? (
          <p className="panel px-4 py-6 text-sm text-slate-500">
            No borrowers found.
          </p>
        ) : (
          <div className="panel overflow-hidden shadow-[0_10px_28px_rgba(20,33,61,0.06)]">
            <table className="w-full table-fixed text-left text-[11px]">
              <thead className="border-b border-[var(--line)] bg-[#e5ece8] text-[9px] capitalize tracking-[0.06em] text-slate-500">
                <tr>
                  <th className="w-[24%] px-2 py-2.5 font-semibold">name</th>
                  <th className="hidden w-[15%] px-2 py-2.5 font-semibold sm:table-cell">
                    phone
                  </th>
                  <th className="w-[18%] px-2 py-2.5 font-semibold">
                    collateral
                  </th>
                  <th className="hidden w-[17%] px-2 py-2.5 font-semibold md:table-cell">
                    national id
                  </th>
                  <th className="hidden w-[12%] px-2 py-2.5 font-semibold lg:table-cell">
                    city
                  </th>
                  <th className="w-[13%] px-2 py-2.5 font-semibold">status</th>
                  <th className="w-[8%] px-2 py-2.5 text-right font-semibold">
                    actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {pagedClients.items.map((client) => (
                  <tr
                    key={client.id}
                    className="cursor-pointer bg-white transition odd:bg-white even:bg-[#fbfdfc] hover:bg-[var(--soft-mist)]"
                    onClick={() => router.push(`/clients/${client.id}`)}
                  >
                    <td className="px-2 py-3">
                      <p className="truncate font-semibold text-[var(--midnight-navy)]">
                        {client.fullName}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        {client.loanCount} loan
                        {client.loanCount === 1 ? "" : "s"}
                      </p>
                    </td>
                    <td className="hidden px-2 py-3 text-[11px] text-slate-600 sm:table-cell">
                      <span className="block truncate">{client.phone}</span>
                    </td>
                    <td className="px-2 py-3 text-[11px] text-slate-600">
                      <span className="block truncate">
                        {client.collateralType || "—"}
                      </span>
                    </td>
                    <td className="hidden px-2 py-3 text-[11px] text-slate-600 md:table-cell">
                      <span className="block truncate">
                        {client.nationalId || "—"}
                      </span>
                    </td>
                    <td className="hidden px-2 py-3 text-[11px] text-slate-600 lg:table-cell">
                      <span className="block truncate">
                        {client.city || "—"}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-[9px] font-bold capitalize tracking-[0.04em]">
                      <span
                        className={`inline-flex border px-1.5 py-0.5 ${
                          client.verifiedAt
                            ? "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]"
                            : "border-[var(--line)] bg-[var(--soft-mist)] text-slate-500"
                        }`}
                      >
                        {client.verifiedAt ? "verified" : "registered"}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right">
                      <RowActions
                        label={`Open actions for ${client.fullName}`}
                        items={[
                          {
                            label: "View borrower",
                            href: `/clients/${client.id}`,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls
              page={pagedClients.currentPage}
              pageSize={pageSize}
              total={filteredClients.length}
              itemLabel="borrowers"
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
