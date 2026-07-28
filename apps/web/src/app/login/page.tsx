"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { AuthShell } from "../../components/auth/auth-shell";
import { AuthPageSkeleton } from "../../components/app/skeleton";
import {
  FormError,
  PasswordField,
  PrimaryButton,
  TextField,
} from "../../components/auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  isSessionExpired,
  persistAuthState,
  readAuthState,
  resolveSafeNextPath,
} from "../../lib/auth-session";

type LoginResponse = {
  workspace: RembehWorkspace;
  user: RembehUser;
  branch?: RembehBranch | null;
  session: RembehSession;
  message?: string | string[];
};

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageSkeleton />}>
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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const { session } = readAuthState();

      if (session && !isSessionExpired(session)) {
        router.replace(resolveSafeNextPath(searchParams.get("next")));
        return;
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
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email.trim(),
          password: formData.password,
        }),
      });
      const payload = await readApiJson<LoginResponse>(response);

      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }

      persistAuthState({
        session: payload.session,
        workspace: payload.workspace,
        user: payload.user,
        branch: payload.branch,
      });
      router.replace(resolveSafeNextPath(searchParams.get("next")));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Login failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (checkingSession) {
    return <AuthPageSkeleton />;
  }

  return (
    <AuthShell
      eyebrow="REMBEH"
      title="sign in"
      footer={
        <p className="text-center text-sm text-slate-500">
          new account?{" "}
          <Link
            href="/register"
            className="font-bold text-[var(--forest-emerald)] hover:underline"
          >
            create an account
          </Link>
        </p>
      }
    >
      <form className="space-y-5" onSubmit={handleLogin}>
        <div>
          <p className="text-xs font-semibold capitalize tracking-[0.18em] text-[var(--forest-emerald)]">
            sign in
          </p>
          <h2 className="mt-2 text-3xl font-bold text-[var(--midnight-navy)]">
            welcome back
          </h2>
        </div>

        <TextField
          label="Work email"
          type="email"
          value={formData.email}
          onChange={(value) =>
            setFormData((current) => ({ ...current, email: value }))
          }
          placeholder="you@institution.com"
          autoComplete="email"
          required
        />

        <PasswordField
          label="Password"
          value={formData.password}
          onChange={(value) =>
            setFormData((current) => ({ ...current, password: value }))
          }
          autoComplete="current-password"
        />

        <FormError error={error} />

        <PrimaryButton type="submit" loading={isSubmitting}>
          sign in
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
