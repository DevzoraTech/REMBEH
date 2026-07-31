"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import {
  ensureWebPushRegistration,
  listenForForegroundPush,
} from "../../lib/push-notifications";

/**
 * Registers FCM after login. Shows an enable banner when the browser
 * needs a user gesture (common on Chromium) or permission is still default.
 */
export function PushNotificationsBootstrap({ enabled }: { enabled: boolean }) {
  const started = useRef(false);
  const [banner, setBanner] = useState<"ask" | "denied" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled || started.current) {
      return;
    }
    started.current = true;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        // Don't auto-call requestPermission — many browsers suppress it without a gesture.
        const result = await ensureWebPushRegistration({
          requestPermission: false,
        });
        if (cancelled) {
          return;
        }

        if (result.permission === "unsupported") {
          console.info("[push] Notifications unsupported in this browser/context");
          return;
        }

        if (result.permission === "default") {
          setBanner("ask");
          return;
        }

        if (result.permission === "denied") {
          setBanner("denied");
          return;
        }

        if (result.registered) {
          console.info("[push] FCM token registered");
        } else if (result.token) {
          console.warn("[push] Got FCM token but API registration failed");
        } else {
          console.warn("[push] Permission granted but no FCM token (check VAPID / SW)");
        }

        unsubscribe = await listenForForegroundPush((title, body) => {
          console.info("[push]", title, body);
        });
      } catch (error) {
        console.error("[push] bootstrap failed", error);
      }
    })();

    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [enabled]);

  async function enableNotifications() {
    setBusy(true);
    try {
      const result = await ensureWebPushRegistration({
        requestPermission: true,
      });
      if (result.permission === "granted" && (result.registered || result.token)) {
        setBanner(null);
        await listenForForegroundPush((title, body) => {
          console.info("[push]", title, body);
        });
        return;
      }
      if (result.permission === "denied") {
        setBanner("denied");
        return;
      }
      if (result.permission === "granted") {
        // Granted but token failed — dismiss ask banner, log already in ensure*
        setBanner(null);
      }
    } catch (error) {
      console.error("[push] enable failed", error);
    } finally {
      setBusy(false);
    }
  }

  if (!banner) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[80] w-[min(100%-2rem,22rem)] rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef4ff] text-[#1d4ed8]">
          <Bell className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          {banner === "ask" ? (
            <>
              <p className="text-sm font-semibold text-[var(--midnight-navy)]">
                Enable notifications?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--slate-text)]">
                Get alerts for collections, loan updates, and approvals — even when
                this tab is closed.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void enableNotifications()}
                  className="btn btn-primary h-9 rounded-xl px-3 text-xs"
                >
                  {busy ? "Enabling…" : "Allow notifications"}
                </button>
                <button
                  type="button"
                  onClick={() => setBanner(null)}
                  className="btn btn-ghost h-9 rounded-xl px-3 text-xs"
                >
                  Not now
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-[var(--midnight-navy)]">
                Notifications blocked
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--slate-text)]">
                Allow notifications for this site in your browser settings, then
                refresh.
              </p>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="btn btn-ghost mt-3 h-9 rounded-xl px-3 text-xs"
              >
                Dismiss
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setBanner(null)}
          className="rounded-lg p-1 text-[var(--slate-text)] hover:bg-black/5"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
