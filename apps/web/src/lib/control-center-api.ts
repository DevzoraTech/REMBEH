import { apiBaseUrl, formatApiError, readApiJson } from "./api";
import type {
  ControlCenterAdmin,
  ControlCenterSession,
} from "./control-center-session";

export type ControlCenterAuthResponse = {
  admin: ControlCenterAdmin;
  session: ControlCenterSession;
  message?: string | string[];
};

export async function controlCenterFetch<T>(
  path: string,
  session: ControlCenterSession,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/control-center${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `${session.tokenType} ${session.accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = await readApiJson<T & { message?: string | string[] }>(
    response,
  );
  if (!response.ok) {
    throw new Error(formatApiError(payload.message));
  }
  return payload;
}

export async function controlCenterPublicFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/control-center${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await readApiJson<T & { message?: string | string[] }>(
    response,
  );
  if (!response.ok) {
    throw new Error(formatApiError(payload.message));
  }
  return payload;
}
