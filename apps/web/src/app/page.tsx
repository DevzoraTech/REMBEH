"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { apiBaseUrl } from "../lib/api";
import {
  canRefreshSession,
  isSessionExpired,
  readAuthState,
  refreshAuthSession,
} from "../lib/auth-session";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const { session } = readAuthState();
      if (!session) {
        router.replace("/login");
        return;
      }
      if (!isSessionExpired(session)) {
        router.replace("/dashboard");
        return;
      }
      if (canRefreshSession(session)) {
        const next = await refreshAuthSession(session, apiBaseUrl);
        if (next) {
          router.replace("/dashboard");
          return;
        }
      }
      router.replace("/login");
    })();
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center">
      <div className="size-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--forest-emerald)]" />
    </main>
  );
}
