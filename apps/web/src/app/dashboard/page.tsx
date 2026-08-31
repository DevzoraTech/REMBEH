"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app/app-shell";
import { AppBootSkeleton } from "../../components/app/skeleton";
import { OverviewDashboard } from "../../components/overview/overview-dashboard";
import { StaffReconciliationWorkspace } from "../../components/staff/staff-reconciliation-workspace";
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
      <StaffReconciliationWorkspace session={session} user={user} />
    </AppShell>
  );
}
