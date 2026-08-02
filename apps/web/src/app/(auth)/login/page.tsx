"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { FormEvent, Suspense, useEffect, useState } from "react";
import {
  AuthCardHeader,
  AuthCardSkeleton,
} from "../../../components/auth/auth-scene";
import { FormError } from "../../../components/auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  isSessionExpired,
  persistAuthState,
  readAuthState,
  resolveSafeNextPath,
} from "../../../lib/auth-session";
import { resolveWebDeviceIdentity } from "../../../lib/device-identity";
import { resolveOperatorRole } from "../../../lib/roles";

const REMEMBER_EMAIL_KEY = "rembeh.login.email";

type LoginResponse = {
  workspace: RembehWorkspace;
  user: RembehUser;
  branch?: RembehBranch | null;
  session: RembehSession;
  message?: string | string[];
};

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const { session, user } = readAuthState();

      if (session && !isSessionExpired(session)) {
        const fallback =
          resolveOperatorRole(session, user) === "owner"
            ? "/owner"
            : "/dashboard";
        router.replace(resolveSafeNextPath(searchParams.get("next"), fallback));
        return;
      }

      try {
        const savedEmail = window.localStorage.getItem(REMEMBER_EMAIL_KEY);
        if (savedEmail) {
          setFormData((current) => ({ ...current, email: savedEmail }));
          setRememberMe(true);
        }
      } catch {
        // ignore storage errors
      }

      setCheckingSession(false);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [router, searchParams]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const email = formData.email.trim();
      const device = resolveWebDeviceIdentity();
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: formData.password,
          ...device,
        }),
      });
      const payload = await readApiJson<LoginResponse>(response);

      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }

      try {
        if (rememberMe) {
          window.localStorage.setItem(REMEMBER_EMAIL_KEY, email);
        } else {
          window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
        }
      } catch {
        // ignore storage errors
      }

      persistAuthState({
        session: payload.session,
        workspace: payload.workspace,
        user: payload.user,
        branch: payload.branch,
      });
      const fallback =
        resolveOperatorRole(payload.session, payload.user) === "owner"
          ? "/owner"
          : "/dashboard";
      router.replace(resolveSafeNextPath(searchParams.get("next"), fallback));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Login failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (checkingSession) {
    return <AuthCardSkeleton />;
  }

  return (
    <>
      <AuthCardHeader
        title="Welcome back"
        subtitle="Sign in to your REMBEH account"
      />

      <form className="mt-3.5 space-y-2.5 text-left" onSubmit={handleLogin}>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--midnight-navy)]">
            Work email
          </span>
          <span className="relative block">
            <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              value={formData.email}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              placeholder="you@company.com"
              autoComplete="email"
              required
              className="h-9 w-full rounded-xl border border-[#d7dee6] bg-white pl-8 pr-3 text-sm text-[var(--midnight-navy)] outline-none transition placeholder:text-slate-400 focus:border-[var(--forest-emerald)] focus:shadow-[0_0_0_3px_rgba(15,138,108,0.12)]"
            />
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--midnight-navy)]">
            Password
          </span>
          <span className="relative block">
            <Lock className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="h-9 w-full rounded-xl border border-[#d7dee6] bg-white pl-8 pr-9 text-sm text-[var(--midnight-navy)] outline-none transition placeholder:text-slate-400 focus:border-[var(--forest-emerald)] focus:shadow-[0_0_0_3px_rgba(15,138,108,0.12)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </button>
          </span>
        </label>

        <div className="flex items-center justify-between gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600">
            <span className="relative inline-flex size-3.5 items-center justify-center">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="peer absolute inset-0 cursor-pointer opacity-0"
              />
              <span className="flex size-3.5 items-center justify-center rounded-[3px] border border-[#c9d2db] bg-white peer-checked:border-[var(--forest-emerald)] peer-checked:bg-[var(--forest-emerald)]">
                {rememberMe ? (
                  <Check className="size-2 text-white" strokeWidth={3} />
                ) : null}
              </span>
            </span>
            Remember me
          </label>
          <button
            type="button"
            onClick={() =>
              setError(
                "Password reset is managed by your institution admin. Contact support if you need help.",
              )
            }
            className="text-[11px] font-semibold normal-case tracking-normal text-[var(--forest-emerald)] hover:underline"
          >
            Forgot password?
          </button>
        </div>

        <FormError error={error} />

        <button
          type="submit"
          disabled={isSubmitting}
          className="group flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[linear-gradient(90deg,#14a87a_0%,#0f8a6c_100%)] text-[13px] font-bold normal-case tracking-normal text-white shadow-[0_8px_18px_rgba(15,138,108,0.28)] transition hover:brightness-[1.04] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
            </>
          )}
        </button>

        <div className="relative py-0.5 text-center">
          <div className="absolute inset-x-0 top-1/2 h-px bg-[#e8eef2]" />
          <span className="relative bg-white px-2 text-[10px] text-slate-400">
            or continue with
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SocialButton provider="google" />
          <SocialButton provider="microsoft" />
        </div>
      </form>

      <p className="mt-3 text-center text-[11px] text-slate-500">
        New to REMBEH?{" "}
        <Link
          href="/register"
          className="font-semibold text-[var(--forest-emerald)] hover:underline"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}

function SocialButton({ provider }: { provider: "google" | "microsoft" }) {
  const label = provider === "google" ? "Google" : "Microsoft";

  return (
    <button
      type="button"
      disabled
      title={`${label} sign-in coming soon`}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#d7dee6] bg-white text-[12px] font-semibold normal-case tracking-normal text-[var(--midnight-navy)] opacity-90"
    >
      {provider === "google" ? <GoogleMark /> : <MicrosoftMark />}
      {label}
    </button>
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
