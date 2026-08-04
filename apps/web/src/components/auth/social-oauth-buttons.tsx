"use client";

import { useEffect, useState } from "react";
import { apiBaseUrl, readApiJson } from "../../lib/api";
import { beginOAuth, type OAuthProviderId } from "../../lib/oauth";

type ProvidersStatus = {
  google: boolean;
  microsoft: boolean;
};

export function useOAuthProviders() {
  const [status, setStatus] = useState<ProvidersStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/auth/oauth/providers`);
        const payload = await readApiJson<ProvidersStatus>(response);
        if (!cancelled && response.ok) {
          setStatus(payload);
        }
      } catch {
        if (!cancelled) {
          setStatus({ google: false, microsoft: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}

export function SocialOAuthButtons({
  intent,
  next,
  onError,
}: {
  intent: "login" | "register";
  next?: string | null;
  onError?: (message: string) => void;
}) {
  const status = useOAuthProviders();

  function handleClick(provider: OAuthProviderId) {
    const enabled =
      provider === "google" ? status?.google : status?.microsoft;
    if (status && !enabled) {
      onError?.(
        `${provider === "google" ? "Google" : "Microsoft"} sign-in is not configured yet.`,
      );
      return;
    }
    beginOAuth(provider, intent, next);
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => handleClick("google")}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#d7dee6] bg-white text-[12px] font-semibold normal-case tracking-normal text-[var(--midnight-navy)] transition hover:border-[var(--forest-emerald)] hover:bg-[#f7fbf9]"
      >
        <GoogleMark />
        Google
      </button>
      <button
        type="button"
        onClick={() => handleClick("microsoft")}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#d7dee6] bg-white text-[12px] font-semibold normal-case tracking-normal text-[var(--midnight-navy)] transition hover:border-[var(--forest-emerald)] hover:bg-[#f7fbf9]"
      >
        <MicrosoftMark />
        Microsoft
      </button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16.1 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l.1.1 6.2 5.2C39.2 36.3 44 31 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 23 23" className="size-3.5" aria-hidden>
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}
