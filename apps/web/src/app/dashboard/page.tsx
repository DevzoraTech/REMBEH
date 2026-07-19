"use client";

import { Building2, Loader2, Smartphone, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app/app-shell";
import { LiveApplicationsPanel } from "../../components/app/live-applications-panel";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  canRefreshSession,
  clearAuthState,
  isSessionExpired,
  readAuthState,
  refreshAuthSession,
} from "../../lib/auth-session";
import { resolveOperatorRole } from "../../lib/roles";

type Branch = {
  id: string;
  name: string;
  address: string;
  manager?: {
    name: string;
    inviteStatus: string;
  } | null;
  staffSummary?: {
    active: number;
    pendingInvites: number;
  };
};

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const operatorRole = useMemo(
    () => (session ? resolveOperatorRole(session, user) : "staff"),
    [session, user],
  );

  const clearSessionAndRedirect = useCallback(() => {
    clearAuthState();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void (async () => {
        const auth = readAuthState();
        let activeSession = auth.session;

        if (!activeSession) {
          clearSessionAndRedirect();
          return;
        }

        if (isSessionExpired(activeSession)) {
          if (canRefreshSession(activeSession)) {
            activeSession =
              (await refreshAuthSession(activeSession, apiBaseUrl)) ?? null;
          } else {
            activeSession = null;
          }
        }

        if (!activeSession) {
          clearSessionAndRedirect();
          return;
        }

        setSession(activeSession);
        setWorkspace(auth.workspace);
        setUser(auth.user);
        setBranch(auth.branch);

        const role = resolveOperatorRole(activeSession, auth.user);

        // Agents / field staff: no console data.
        if (role === "staff") {
          setIsLoading(false);
          return;
        }

        void Promise.all([
          activeSession.permissions.includes("branch.read")
            ? fetch(`${apiBaseUrl}/branches`, {
                headers: {
                  Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
                },
              }).then(async (response) => {
                const payload = await readApiJson<{
                  branches?: Branch[];
                  message?: string | string[];
                }>(response);
                if (!response.ok) {
                  throw new Error(formatApiError(payload.message));
                }
                setBranches(payload.branches ?? []);
              })
            : Promise.resolve(),
          activeSession.permissions.includes("customer.read")
            ? fetch(`${apiBaseUrl}/customers`, {
                headers: {
                  Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
                },
              }).then(async (response) => {
                const payload = await readApiJson<{
                  customers?: unknown[];
                }>(response);
                if (response.ok) {
                  setCustomerCount(payload.customers?.length ?? 0);
                }
              })
            : Promise.resolve(),
        ])
          .catch((caughtError: unknown) => {
            setError(
              caughtError instanceof Error
                ? caughtError.message
                : "Could not load console.",
            );
          })
          .finally(() => {
            setIsLoading(false);
          });
      })();
    }, 0);

    return () => window.clearTimeout(boot);
  }, [clearSessionAndRedirect]);

  useEffect(() => {
    if (isLoading || !session || operatorRole !== "owner") {
      return;
    }

    if (branches.length === 0) {
      router.replace("/branches?setup=1&create=1");
    }
  }, [branches.length, isLoading, operatorRole, router, session]);

  if (!session || isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-[var(--forest-emerald)]" />
      </main>
    );
  }

  const shellBranch =
    branch ??
    (branches[0]
      ? {
          id: branches[0].id,
          name: branches[0].name,
          address: branches[0].address,
        }
      : null);

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={shellBranch}
    >
      <div className="mx-auto max-w-5xl space-y-3 animate-rise">
        {error ? (
          <div className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {operatorRole === "owner" ? (
          <OwnerView
            branches={branches}
            customerCount={customerCount}
            session={session}
          />
        ) : operatorRole === "manager" ? (
          <ManagerView
            branch={
              branches[0] ??
              (branch
                ? {
                    id: branch.id ?? "",
                    name: branch.name ?? "Branch",
                    address: branch.address ?? "",
                  }
                : null)
            }
            customerCount={customerCount}
            session={session}
          />
        ) : (
          <StaffView />
        )}
      </div>
    </AppShell>
  );
}

function OwnerView({
  branches,
  customerCount,
  session,
}: {
  branches: Branch[];
  customerCount: number | null;
  session: RembehSession;
}) {
  return (
    <>
      <section className="grid gap-2 sm:grid-cols-3">
        <Stat label="Branches" value={String(branches.length)} />
        <Stat
          label="Customers"
          value={customerCount === null ? "—" : String(customerCount)}
        />
        <Stat
          label="Pending managers"
          value={String(
            branches.filter(
              (item) => item.manager?.inviteStatus === "INVITE_PENDING",
            ).length,
          )}
        />
      </section>

      <LiveApplicationsPanel
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        canRead={session.permissions.includes("loan.read")}
      />

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
          <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
            Branches
          </h2>
          <Link href="/branches" className="btn btn-ghost h-8 text-xs">
            Manage
          </Link>
        </div>
        {branches.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                {item.name}
              </p>
              <p className="truncate text-xs text-slate-500">
                {item.manager
                  ? `${item.manager.name} · ${statusLabel(item.manager.inviteStatus)}`
                  : "No manager"}
              </p>
            </div>
            <Link
              href={`/branches?invite=manager&branchId=${item.id}`}
              className="btn btn-ghost h-8 shrink-0 text-xs"
            >
              <UserPlus className="size-3.5" />
              {item.manager ? "Manager" : "Invite"}
            </Link>
          </div>
        ))}
      </section>
    </>
  );
}

function ManagerView({
  branch,
  customerCount,
  session,
}: {
  branch: Branch | null;
  customerCount: number | null;
  session: RembehSession;
}) {
  return (
    <>
      <section className="grid gap-2 sm:grid-cols-3">
        <Stat
          label="Customers"
          value={customerCount === null ? "—" : String(customerCount)}
        />
        <Stat
          label="Active staff"
          value={String(branch?.staffSummary?.active ?? 0)}
        />
        <Stat
          label="Pending invites"
          value={String(branch?.staffSummary?.pendingInvites ?? 0)}
        />
      </section>

      <section className="flex flex-wrap gap-2">
        <Link href="/onboarding" className="btn btn-primary h-9 text-xs">
          <UserPlus className="size-3.5" />
          Invite agent
        </Link>
      </section>

      <LiveApplicationsPanel
        accessToken={session.accessToken}
        tokenType={session.tokenType}
        canRead={session.permissions.includes("loan.read")}
      />
    </>
  );
}

function StaffView() {
  return (
    <section className="mx-auto max-w-md border border-[var(--line)] bg-white px-5 py-10 text-center">
      <span className="mx-auto grid size-12 place-items-center border border-[var(--line)] bg-[var(--soft-mist)] text-[var(--forest-emerald)]">
        <Smartphone className="size-5" />
      </span>
      <h2 className="mt-4 font-[family-name:var(--font-display)] text-2xl tracking-[-0.02em] text-[var(--midnight-navy)]">
        Use REMBEH mobile
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Agents work in the REMBEH mobile app. This web console is for owners and
        branch managers only — no field data is shown here.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-[var(--midnight-navy)]">
        <Building2 className="size-3.5 text-[var(--forest-emerald)]" />
        Open REMBEH on your phone to continue
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--line)] bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold text-[var(--midnight-navy)]">
        {value}
      </p>
    </div>
  );
}

function statusLabel(status: string) {
  if (status === "ACTIVE") return "Active";
  if (status === "INVITE_PENDING") return "Pending";
  if (status === "INVITE_EXPIRED") return "Expired";
  return status;
}
