"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";
import { liveQuery } from "../../lib/live-query-cache";

const STORAGE_KEY = "rembehOwnerBranchScope";

export type OwnerScopeBranch = {
  id: string;
  name: string;
  managerName?: string | null;
};

type OwnerBranchScopeValue = {
  selectedBranchId: string | null;
  selectedBranchName: string;
  branches: OwnerScopeBranch[];
  setSelectedBranchId: (branchId: string | null) => void;
  matchesBranch: (branchId: string | null | undefined) => boolean;
  ready: boolean;
};

type ScopeSnapshot = {
  selectedBranchId: string | null;
  branches: OwnerScopeBranch[];
  ready: boolean;
};

/**
 * Module store so branch selection works even when pages call
 * useOwnerBranchScope() *outside* AppShell (provider only wraps children).
 * Manager UIs must ignore this store — it is owner-only viewing scope.
 */
let snapshot: ScopeSnapshot = {
  selectedBranchId: null,
  branches: [],
  ready: false,
};
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function readStoredBranchId() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { branchId?: string | null };
    return parsed.branchId ?? null;
  } catch {
    return null;
  }
}

export function readStoredOwnerBranchId() {
  ensureHydrated();
  return snapshot.selectedBranchId;
}

function persistBranchId(branchId: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ branchId }));
  } catch {
    // ignore quota / private mode
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  snapshot = {
    ...snapshot,
    selectedBranchId: readStoredBranchId(),
  };
}

function getSnapshot() {
  ensureHydrated();
  return snapshot;
}

function getServerSnapshot(): ScopeSnapshot {
  return {
    selectedBranchId: null,
    branches: [],
    ready: false,
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function writeSnapshot(next: ScopeSnapshot) {
  snapshot = next;
  emit();
}

export function setOwnerSelectedBranchId(branchId: string | null) {
  ensureHydrated();
  const next = branchId && branchId.length > 0 ? branchId : null;
  persistBranchId(next);
  writeSnapshot({
    ...snapshot,
    selectedBranchId: next,
  });
}

function setOwnerScopeBranches(
  branches: OwnerScopeBranch[],
  selectedBranchId: string | null,
) {
  writeSnapshot({
    selectedBranchId,
    branches,
    ready: true,
  });
}

export function OwnerBranchScopeProvider({
  session,
  children,
}: {
  session: RembehSession;
  children: ReactNode;
}) {
  useEffect(() => {
    let cancelled = false;
    ensureHydrated();
    const boot = window.setTimeout(() => {
      void (async () => {
        try {
          const payload = await liveQuery("/branches", async () => {
            const response = await fetch(`${apiBaseUrl}/branches`, {
              headers: {
                Authorization: `${session.tokenType} ${session.accessToken}`,
              },
              cache: "no-store",
            });
            const body = await readApiJson<{
              branches?: Array<{
                id?: string;
                name?: string;
                manager?: { name?: string | null } | null;
              }>;
              message?: string | string[];
            }>(response);
            if (!response.ok) {
              throw new Error(formatApiError(body.message));
            }
            return body;
          });
          if (cancelled) return;
          const next = (payload.branches ?? [])
            .map((branch) => ({
              id: branch.id ?? "",
              name: branch.name ?? "Branch",
              managerName: branch.manager?.name ?? null,
            }))
            .filter((branch) => branch.id.length > 0)
            .sort((a, b) => a.name.localeCompare(b.name));
          const stored = readStoredBranchId();
          const current = snapshot.selectedBranchId;
          const validCurrent =
            current && next.some((branch) => branch.id === current)
              ? current
              : null;
          const validStored =
            stored && next.some((branch) => branch.id === stored)
              ? stored
              : null;
          const nextSelected = validCurrent ?? validStored;
          if ((current || stored) && !nextSelected) {
            persistBranchId(null);
          } else if (nextSelected !== stored) {
            persistBranchId(nextSelected);
          }
          setOwnerScopeBranches(next, nextSelected);
        } catch {
          if (!cancelled) {
            // Keep the user's selection; only clear branches list.
            setOwnerScopeBranches([], snapshot.selectedBranchId);
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(boot);
    };
  }, [session.accessToken, session.tokenType]);

  return children;
}

export function useOwnerBranchScope(): OwnerBranchScopeValue {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setSelectedBranchId = useCallback((branchId: string | null) => {
    setOwnerSelectedBranchId(branchId);
  }, []);

  const selectedBranchName = useMemo(() => {
    if (!snap.selectedBranchId) return "All Branches";
    return (
      snap.branches.find((branch) => branch.id === snap.selectedBranchId)
        ?.name ?? "All Branches"
    );
  }, [snap.branches, snap.selectedBranchId]);

  const matchesBranch = useCallback(
    (branchId: string | null | undefined) => {
      if (!snap.selectedBranchId) return true;
      return branchId === snap.selectedBranchId;
    },
    [snap.selectedBranchId],
  );

  return {
    selectedBranchId: snap.selectedBranchId,
    selectedBranchName,
    branches: snap.branches,
    setSelectedBranchId,
    matchesBranch,
    ready: snap.ready,
  };
}
