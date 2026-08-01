"use client";

import { Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app/app-shell";
import { AppBootSkeleton } from "../../components/app/skeleton";
import { OverviewDashboard } from "../../components/overview/overview-dashboard";
import {
  RembehSession,
  RembehUser,
  canRefreshSession,
  clearAuthState,
  isSessionExpired,
  readAuthState,
  refreshAuthSession,
} from "../../lib/auth-session";
import { apiBaseUrl } from "../../lib/api";
import { resolveOperatorRole } from "../../lib/roles";

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [ready, setReady] = useState(false);

  const operatorRole = useMemo(
    () => (session ? resolveOperatorRole(session, user) : "staff"),
    [session, user],
  );

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void (async () => {
        const auth = readAuthState();
        let activeSession = auth.session;

        if (!activeSession) {
          clearAuthState();
          router.replace("/login");
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
          clearAuthState();
          router.replace("/login");
          return;
        }

        setSession(activeSession);
        setUser(auth.user);
        setReady(true);

        const role = resolveOperatorRole(activeSession, auth.user);
        if (role === "owner") {
          router.replace("/owner");
        }
      })();
    }, 0);

    return () => window.clearTimeout(boot);
  }, [router]);

  if (!ready || !session) return <AppBootSkeleton />;

  if (operatorRole === "manager") {
    return <OverviewDashboard mode="manager" />;
  }

  if (operatorRole === "owner") {
    return <AppBootSkeleton />;
  }

  return (
    <AppShell session={session} workspace={null} user={user} branch={null}>
      <div className="mx-auto max-w-lg animate-rise rounded-[18px] border border-[#e6ebf0] bg-white px-6 py-10 text-center shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-[var(--forest-emerald)]">
          <Smartphone className="size-7" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-[#0b1220]">
          Use the REMBEH mobile app
        </h1>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
          Agent and field staff work happens in the mobile app. Sign out here if
          you need to switch accounts.
        </p>
        <button
          type="button"
          onClick={() => {
            clearAuthState();
            router.replace("/login");
          }}
          className="btn btn-primary mt-6 h-10 rounded-xl px-5 text-sm"
        >
          Sign out
        </button>
      </div>
    </AppShell>
  );
}
