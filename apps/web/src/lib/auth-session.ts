export type RembehSession = {
  accessToken: string;
  expiresAt: string;
  tokenType: "Bearer";
  permissions: string[];
  refreshToken?: string;
  refreshExpiresAt?: string;
};

export type RembehWorkspace = {
  id?: string;
  name?: string;
  status?: string;
  currency?: string;
  country?: string;
};

export type RembehUser = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  roleName?: string;
  status?: string;
};

export type RembehBranch = {
  id?: string;
  name?: string;
  address?: string;
};

const SESSION_KEY = "rembehSession";
const WORKSPACE_KEY = "rembehWorkspace";
const USER_KEY = "rembehUser";
const BRANCH_KEY = "rembehBranch";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

/** One-time migrate sessionStorage → localStorage so refresh keeps the session. */
function migrateFromSessionStorage() {
  if (typeof window === "undefined") return;
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return;
    const legacy = window.sessionStorage.getItem(SESSION_KEY);
    if (!legacy) return;
    for (const key of [SESSION_KEY, WORKSPACE_KEY, USER_KEY, BRANCH_KEY]) {
      const value = window.sessionStorage.getItem(key);
      if (value) {
        window.localStorage.setItem(key, value);
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // ignore quota / private mode failures
  }
}

export function persistAuthState(input: {
  session: RembehSession;
  workspace?: RembehWorkspace | null;
  user?: RembehUser | null;
  branch?: RembehBranch | null;
}) {
  const store = storage();
  if (!store) return;

  store.setItem(SESSION_KEY, JSON.stringify(input.session));

  if (input.workspace) {
    store.setItem(WORKSPACE_KEY, JSON.stringify(input.workspace));
  }

  if (input.user) {
    store.setItem(USER_KEY, JSON.stringify(input.user));
  }

  if (input.branch) {
    store.setItem(BRANCH_KEY, JSON.stringify(input.branch));
  }
}

export function clearAuthState() {
  const store = storage();
  if (!store) return;
  store.removeItem(SESSION_KEY);
  store.removeItem(WORKSPACE_KEY);
  store.removeItem(USER_KEY);
  store.removeItem(BRANCH_KEY);
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(WORKSPACE_KEY);
    window.sessionStorage.removeItem(USER_KEY);
    window.sessionStorage.removeItem(BRANCH_KEY);
  }
}

export function readStoredJson<T>(key: string): T | null {
  migrateFromSessionStorage();
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readAuthState() {
  migrateFromSessionStorage();
  return {
    session: readStoredJson<RembehSession>(SESSION_KEY),
    workspace: readStoredJson<RembehWorkspace>(WORKSPACE_KEY),
    user: readStoredJson<RembehUser>(USER_KEY),
    branch: readStoredJson<RembehBranch>(BRANCH_KEY),
  };
}

export function isSessionExpired(session: RembehSession) {
  const expiresAt = Date.parse(session.expiresAt);

  if (!Number.isFinite(expiresAt)) {
    return true;
  }

  return expiresAt <= Date.now() + 30_000;
}

export function canRefreshSession(session: RembehSession) {
  if (!session.refreshToken) return false;
  if (!session.refreshExpiresAt) return true;
  const expiresAt = Date.parse(session.refreshExpiresAt);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt > Date.now() + 30_000;
}

export async function refreshAuthSession(
  session: RembehSession,
  apiBase: string,
): Promise<RembehSession | null> {
  if (!canRefreshSession(session)) return null;
  try {
    const response = await fetch(`${apiBase}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      session?: RembehSession;
    };
    if (!payload.session?.accessToken) return null;
    const next: RembehSession = {
      ...session,
      ...payload.session,
    };
    persistAuthState({ session: next });
    return next;
  } catch {
    return null;
  }
}

export function resolveSafeNextPath(nextPath: string | null, fallback = "/dashboard") {
  if (
    nextPath &&
    nextPath.startsWith("/") &&
    !nextPath.startsWith("//") &&
    nextPath !== "/login" &&
    nextPath !== "/register"
  ) {
    return nextPath;
  }

  return fallback;
}
