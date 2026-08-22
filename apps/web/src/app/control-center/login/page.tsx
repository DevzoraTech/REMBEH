"use client";

import { ArrowRight, Check, Loader2, Lock, Mail, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  AuthCardHeader,
  AuthCardSkeleton,
  AuthScene,
} from "../../../components/auth/auth-scene";
import { FormError } from "../../../components/auth/form-controls";
import {
  type ControlCenterAuthResponse,
  controlCenterPublicFetch,
} from "../../../lib/control-center-api";
import {
  isControlCenterSessionValid,
  persistControlCenterAuth,
  readControlCenterAuth,
} from "../../../lib/control-center-session";

type AuthMode = "CHECK" | "LOGIN" | "SETUP";

type AuthStatus = {
  allowedEmails: string[];
  allowed: boolean;
  setupRequired: boolean;
  configured: boolean;
  message?: string | string[];
};

export default function ControlCenterLoginPage() {
  return (
    <AuthScene panelKey="control-center-login">
      <ControlCenterLoginForm />
    </AuthScene>
  );
}

function ControlCenterLoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("CHECK");
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    displayName: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const { session } = readControlCenterAuth();
      if (isControlCenterSessionValid(session)) {
        router.replace("/control-center");
        return;
      }
      setCheckingSession(false);
    }, 0);
    return () => window.clearTimeout(boot);
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "CHECK") {
        const status = await controlCenterPublicFetch<AuthStatus>(
          `/auth/status?email=${encodeURIComponent(form.email.trim())}`,
        );
        if (!status.allowed) {
          throw new Error("This email is not allowed in the control center.");
        }
        setMode(status.setupRequired ? "SETUP" : "LOGIN");
        return;
      }

      if (mode === "SETUP") {
        if (form.password !== form.confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        await completeAuth(
          await controlCenterPublicFetch<ControlCenterAuthResponse>(
            "/auth/setup",
            {
              method: "POST",
              body: JSON.stringify({
                email: form.email.trim(),
                displayName: form.displayName.trim(),
                password: form.password,
              }),
            },
          ),
        );
        return;
      }

      await completeAuth(
        await controlCenterPublicFetch<ControlCenterAuthResponse>(
          "/auth/login",
          {
            method: "POST",
            body: JSON.stringify({
              email: form.email.trim(),
              password: form.password,
            }),
          },
        ),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Control center login failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function completeAuth(response: ControlCenterAuthResponse) {
    persistControlCenterAuth({
      session: response.session,
      admin: response.admin,
    });
    router.replace("/control-center");
  }

  if (checkingSession) {
    return <AuthCardSkeleton />;
  }

  return (
    <>
      <AuthCardHeader
        title="Control Center"
        subtitle={
          mode === "SETUP"
            ? "Create the first password for this approved admin email."
            : "ANTIKRA administrator access only."
        }
      />

      <form className="mt-5 space-y-3 text-left" onSubmit={submit}>
        <label className="block">
          <span className="mb-1.5 block text-xs font-black text-[var(--midnight-navy)]">
            Admin email
          </span>
          <span className="relative block">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              value={form.email}
              disabled={mode !== "CHECK"}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              required
              autoComplete="email"
              placeholder="antikra.ug@gmail.com"
              className="h-10 w-full rounded-xl border border-[#d7dee6] bg-white pl-10 pr-3 text-sm font-semibold text-[var(--midnight-navy)] outline-none placeholder:text-slate-400 focus:border-[var(--forest-emerald)] focus:shadow-[0_0_0_3px_rgba(15,138,108,0.12)] disabled:bg-slate-50"
            />
          </span>
        </label>

        {mode === "SETUP" ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-[var(--midnight-navy)]">
              Display name
            </span>
            <span className="relative block">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={form.displayName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                className="h-10 w-full rounded-xl border border-[#d7dee6] bg-white pl-10 pr-3 text-sm font-semibold text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] focus:shadow-[0_0_0_3px_rgba(15,138,108,0.12)]"
              />
            </span>
          </label>
        ) : null}

        {mode !== "CHECK" ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-[var(--midnight-navy)]">
              Password
            </span>
            <span className="relative block">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                required
                minLength={8}
                maxLength={128}
                autoComplete={
                  mode === "SETUP" ? "new-password" : "current-password"
                }
                className="h-10 w-full rounded-xl border border-[#d7dee6] bg-white pl-10 pr-3 text-sm font-semibold text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] focus:shadow-[0_0_0_3px_rgba(15,138,108,0.12)]"
              />
            </span>
          </label>
        ) : null}

        {mode === "SETUP" ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-[var(--midnight-navy)]">
              Confirm password
            </span>
            <span className="relative block">
              <Check className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    confirmPassword: event.target.value,
                  }))
                }
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                className="h-10 w-full rounded-xl border border-[#d7dee6] bg-white pl-10 pr-3 text-sm font-semibold text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] focus:shadow-[0_0_0_3px_rgba(15,138,108,0.12)]"
              />
            </span>
          </label>
        ) : null}

        <FormError error={error} />

        {mode !== "CHECK" ? (
          <button
            type="button"
            onClick={() => {
              setMode("CHECK");
              setForm((current) => ({
                ...current,
                password: "",
                confirmPassword: "",
              }));
              setError(null);
            }}
            className="text-xs font-black normal-case text-slate-500 hover:text-[var(--forest-emerald)]"
          >
            Use another email
          </button>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="group flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] text-sm font-black normal-case text-white shadow-[0_8px_18px_rgba(15,138,108,0.24)] transition hover:bg-[#0b765e] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Working...
            </>
          ) : mode === "CHECK" ? (
            <>
              Continue
              <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </>
          ) : mode === "SETUP" ? (
            "Create password"
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </>
  );
}
