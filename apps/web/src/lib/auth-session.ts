export type RembehSession = {
  accessToken: string;
  expiresAt: string;
  tokenType: "Bearer";
  permissions: string[];
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

export function persistAuthState(input: {
  session: RembehSession;
  workspace?: RembehWorkspace | null;
  user?: RembehUser | null;
  branch?: RembehBranch | null;
}) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(input.session));

  if (input.workspace) {
    sessionStorage.setItem(WORKSPACE_KEY, JSON.stringify(input.workspace));
  }

  if (input.user) {
    sessionStorage.setItem(USER_KEY, JSON.stringify(input.user));
  }

  if (input.branch) {
    sessionStorage.setItem(BRANCH_KEY, JSON.stringify(input.branch));
  }
}

export function clearAuthState() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(WORKSPACE_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(BRANCH_KEY);
}

export function readStoredJson<T>(key: string): T | null {
  const raw = sessionStorage.getItem(key);

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
