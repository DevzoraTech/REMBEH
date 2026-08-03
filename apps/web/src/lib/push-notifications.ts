"use client";

import { getToken, onMessage, type MessagePayload } from "firebase/messaging";
import { apiBaseUrl, readApiJson } from "./api";
import { getFirebaseMessaging } from "./firebase";
import { playNotificationSound } from "./notification-sound";
import { readAuthState } from "./auth-session";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";

export type PushPermissionResult = {
  permission: NotificationPermission | "unsupported";
  token: string | null;
  registered: boolean;
};

export async function ensureWebPushRegistration(options?: {
  /** When true, may show the browser permission dialog (needs a user gesture). */
  requestPermission?: boolean;
}): Promise<PushPermissionResult> {
  const requestPermission = options?.requestPermission ?? true;

  if (typeof window === "undefined" || !("Notification" in window)) {
    return { permission: "unsupported", token: null, registered: false };
  }

  if (!window.isSecureContext) {
    console.warn("[push] Secure context required (https or localhost)");
    return { permission: "unsupported", token: null, registered: false };
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    console.warn("[push] Firebase Messaging not supported here");
    return { permission: "unsupported", token: null, registered: false };
  }

  let permission = Notification.permission;
  if (permission === "default" && requestPermission) {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    return { permission, token: null, registered: false };
  }

  if (!VAPID_KEY) {
    console.warn(
      "[push] NEXT_PUBLIC_FIREBASE_VAPID_KEY missing — generate Web Push certs in Firebase Console (rembeh-web → Cloud Messaging).",
    );
    return { permission, token: null, registered: false };
  }

  try {
    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
    );
    await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      console.warn("[push] getToken returned empty");
      return { permission, token: null, registered: false };
    }

    const registered = await syncPushTokenToApi(token);
    return { permission, token, registered };
  } catch (error) {
    console.error("[push] token registration failed", error);
    return { permission, token: null, registered: false };
  }
}

export async function syncPushTokenToApi(token: string): Promise<boolean> {
  const { session } = readAuthState();
  if (!session?.accessToken) {
    console.warn("[push] No session — cannot sync token");
    return false;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/notifications/push/tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${session.tokenType} ${session.accessToken}`,
      },
      body: JSON.stringify({
        token,
        platform: "WEB",
        projectKey: "WEB",
      }),
    });
    await readApiJson(response);
    if (!response.ok) {
      console.warn("[push] API token sync failed", response.status);
    }
    return response.ok;
  } catch (error) {
    console.error("[push] API token sync error", error);
    return false;
  }
}

/** Foreground messages while the tab is open. */
export async function listenForForegroundPush(
  onPayload: (title: string, body: string, href?: string) => void,
): Promise<() => void> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return () => undefined;
  }

  return onMessage(messaging, (payload: MessagePayload) => {
    const title = payload.notification?.title ?? payload.data?.title ?? "REMBEH";
    const body =
      payload.notification?.body ?? payload.data?.body ?? "New notification";
    const href = payload.data?.href;
    playNotificationSound();
    onPayload(title, body, href);
    if (Notification.permission === "granted") {
      const note = new Notification(title, {
        body,
        icon: "/rembeh-icon.png",
        data: { href },
      });
      note.onclick = () => {
        if (href) {
          window.focus();
          window.location.assign(href);
        }
      };
    }
  });
}
