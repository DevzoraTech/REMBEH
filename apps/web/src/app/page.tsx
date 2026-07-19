"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isSessionExpired, readAuthState } from "../lib/auth-session";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const { session } = readAuthState();

    if (!session || isSessionExpired(session)) {
      router.replace("/login");
      return;
    }

    router.replace("/dashboard");
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center">
      <div className="size-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--forest-emerald)]" />
    </main>
  );
}
