"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  AuthCardHeader,
  AuthCardSkeleton,
} from "../../../../../components/auth/auth-scene";
import { FormError } from "../../../../../components/auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  persistAuthState,
  resolveSafeNextPath,
} from "../../../../../lib/auth-session";
import { resolveWebDeviceIdentity } from "../../../../../lib/device-identity";
import { resolveOperatorRole } from "../../../../../lib/roles";

type SessionExchangeResponse = {
  kind: "session";
  workspace: RembehWorkspace;
  user: RembehUser;
  branch?: RembehBranch | null;
  session: RembehSession;
  message?: string | string[];
};

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <OAuthCallbackHandler />
    </Suspense>
  );
}

function OAuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ticket = searchParams.get("ticket")?.trim();
    if (!ticket) {
      setError("Missing OAuth session. Please try signing in again.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const device = resolveWebDeviceIdentity();
        const response = await fetch(`${apiBaseUrl}/auth/oauth/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId: ticket,
            ...device,
          }),
        });
        const payload = await readApiJson<SessionExchangeResponse>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        if (payload.kind !== "session" || !payload.session) {
          throw new Error("Unexpected OAuth response. Please try again.");
        }
        if (cancelled) return;

        persistAuthState({
          session: payload.session,
          workspace: payload.workspace,
          user: payload.user,
          branch: payload.branch,
        });

        const role = resolveOperatorRole(payload.session, payload.user);
        let fallback =
          role === "owner" ? "/owner" : "/dashboard";

        if (role === "manager") {
          try {
            const billingRes = await fetch(`${apiBaseUrl}/billing/my-branch`, {
              headers: {
                Authorization: `${payload.session.tokenType} ${payload.session.accessToken}`,
              },
            });
            const billing = await readApiJson<{
              locked?: boolean;
              status?: string;
            }>(billingRes);
            if (
              billingRes.ok &&
              (billing.locked || billing.status === "LOCKED")
            ) {
              fallback = "/subscription";
            }
          } catch {
            // Fall through
          }
        }

        router.replace(
          resolveSafeNextPath(searchParams.get("next"), fallback),
        );
      } catch (caughtError) {
        if (cancelled) return;
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Google / Microsoft sign-in failed.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <>
      <AuthCardHeader
        title="Signing you in"
        subtitle="Finishing Google / Microsoft authentication"
      />
      <div className="mt-4 space-y-3">
        {error ? (
          <>
            <FormError error={error} />
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="flex h-10 w-full items-center justify-center rounded-xl bg-[linear-gradient(90deg,#14a87a_0%,#0f8a6c_100%)] text-[13px] font-bold text-white"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-600">
            <Loader2 className="size-4 animate-spin text-[var(--forest-emerald)]" />
            Completing sign-in…
          </div>
        )}
      </div>
    </>
  );
}
