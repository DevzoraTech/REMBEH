export type ControlCenterSession = {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
};

export type ControlCenterAdmin = {
  id: string;
  email: string;
  displayName: string;
  status: string;
};

const SESSION_KEY = "rembehControlCenterSession";
const ADMIN_KEY = "rembehControlCenterAdmin";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function persistControlCenterAuth(input: {
  session: ControlCenterSession;
  admin: ControlCenterAdmin;
}) {
  const store = storage();
  if (!store) return;
  store.setItem(SESSION_KEY, JSON.stringify(input.session));
  store.setItem(ADMIN_KEY, JSON.stringify(input.admin));
}

export function clearControlCenterAuth() {
  const store = storage();
  if (!store) return;
  store.removeItem(SESSION_KEY);
  store.removeItem(ADMIN_KEY);
}

export function readControlCenterAuth() {
  return {
    session: readJson<ControlCenterSession>(SESSION_KEY),
    admin: readJson<ControlCenterAdmin>(ADMIN_KEY),
  };
}

export function isControlCenterSessionValid(
  session: ControlCenterSession | null,
) {
  if (!session?.accessToken) return false;
  const expiresAt = Date.parse(session.expiresAt);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt > Date.now();
}

function readJson<T>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
