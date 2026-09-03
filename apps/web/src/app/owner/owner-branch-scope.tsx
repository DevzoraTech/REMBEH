"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";
import { liveQuery } from "../../lib/live-query-cache";

const STORAGE_KEY = "rembehOwnerBranchScope";

export type OwnerScopeBranch = {
  id: string;
  name: string;
};

type OwnerBranchScopeValue = {
  selectedBranchId: string | null;
  selectedBranchName: string;
  branches: OwnerScopeBranch[];
  setSelectedBranchId: (branchId: string | null) => void;
  matchesBranch: (branchId: string | null | undefined) => boolean;
  ready: boolean;
};

const OwnerBranchScopeContext = createContext<OwnerBranchScopeValue | null>(
  null,
);

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
  return readStoredBranchId();
}

function persistBranchId(branchId: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ branchId }));
  } catch {
    // ignore quota / private mode
  }
}

export function OwnerBranchScopeProvider({
  session,
  children,
}: {
  session: RembehSession;
  children: ReactNode;
}) {
  const [branches, setBranches] = useState<OwnerScopeBranch[]>([]);
  const [selectedBranchId, setSelectedBranchIdState] = useState<string | null>(
    null,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
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
              branches?: Array<{ id?: string; name?: string }>;
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
            }))
            .filter((branch) => branch.id.length > 0)
            .sort((a, b) => a.name.localeCompare(b.name));
          const stored = readStoredBranchId();
          const validStored =
            stored && next.some((branch) => branch.id === stored)
              ? stored
              : null;
          if (stored && !validStored) {
            persistBranchId(null);
          }
          setBranches(next);
          setSelectedBranchIdState(validStored);
        } catch {
          if (!cancelled) {
            persistBranchId(null);
            setSelectedBranchIdState(null);
          }
        } finally {
          if (!cancelled) setReady(true);
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(boot);
    };
  }, [session.accessToken, session.tokenType]);

  const setSelectedBranchId = useCallback((branchId: string | null) => {
    const next = branchId && branchId.length > 0 ? branchId : null;
    setSelectedBranchIdState(next);
    persistBranchId(next);
  }, []);

  const selectedBranchName = useMemo(() => {
    if (!selectedBranchId) return "All branches";
    return (
      branches.find((branch) => branch.id === selectedBranchId)?.name ??
      "All branches"
    );
  }, [branches, selectedBranchId]);

  const matchesBranch = useCallback(
    (branchId: string | null | undefined) => {
      if (!selectedBranchId) return true;
      return branchId === selectedBranchId;
    },
    [selectedBranchId],
  );

  const value = useMemo<OwnerBranchScopeValue>(
    () => ({
      selectedBranchId,
      selectedBranchName,
      branches,
      setSelectedBranchId,
      matchesBranch,
      ready,
    }),
    [
      branches,
      matchesBranch,
      ready,
      selectedBranchId,
      selectedBranchName,
      setSelectedBranchId,
    ],
  );

  return (
    <OwnerBranchScopeContext.Provider value={value}>
      {children}
    </OwnerBranchScopeContext.Provider>
  );
}

const fallbackScope: OwnerBranchScopeValue = {
  selectedBranchId: null,
  selectedBranchName: "All branches",
  branches: [],
  setSelectedBranchId: () => undefined,
  matchesBranch: () => true,
  ready: true,
};

export function useOwnerBranchScope() {
  return useContext(OwnerBranchScopeContext) ?? fallbackScope;
}
