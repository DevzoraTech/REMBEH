"use client";

import { Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthShell } from "../../components/auth/auth-shell";
import {
  FormError,
  OtpInput,
  PasswordField,
  PhoneField,
  PrimaryButton,
  SelectField,
  TextField,
} from "../../components/auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehSession,
  RembehUser,
  RembehWorkspace,
  isSessionExpired,
  persistAuthState,
  readAuthState,
} from "../../lib/auth-session";
import {
  PHONE_COUNTRIES,
  countryByDialCode,
  formatInternationalPhone,
} from "../../lib/phone";

type OtpChallenge = {
  id: string;
  channel: string;
  destination: string;
  expiresAt: string;
  resendAvailableAt: string;
  resendCount: number;
  maxResends: number;
};

type OtpDelivery = {
  channel: "EMAIL" | "PHONE";
  provider: "resend" | "development";
  delivered: boolean;
  destination: string;
  message: string;
};

type RegistrationResponse = {
  workspace: RembehWorkspace;
  owner: RembehUser & {
    phone: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
  };
  emailChallenge: OtpChallenge;
  emailDelivery: OtpDelivery;
  message?: string | string[];
};

type ResendOtpResponse = {
  emailChallenge?: OtpChallenge;
  emailDelivery?: OtpDelivery;
  message?: string | string[];
};

type VerificationResponse = {
  workspace: RembehWorkspace;
  owner: RembehUser & {
    phone?: string;
    emailVerified: boolean;
    phoneVerified: boolean;
  } | null;
  verification: {
    emailVerified: boolean;
    phoneVerified: boolean;
    activated: boolean;
  };
  session: RembehSession | null;
  message?: string | string[];
};

const COUNTRY_OPTIONS = PHONE_COUNTRIES.map((country) => ({
  value: country.name,
  label: `${country.flag} ${country.name}`,
}));

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"details" | "verify">("details");
  const [formData, setFormData] = useState({
    businessName: "",
    country: "Uganda",
    currency: "UGX",
    ownerName: "",
    phoneCountryCode: "+256",
    phoneNationalNumber: "",
    email: "",
    password: "",
  });
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [registration, setRegistration] = useState<RegistrationResponse | null>(
    null,
  );
  const [resendSeconds, setResendSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const expiresAt = useMemo(() => {
    if (!registration?.emailChallenge.expiresAt) {
      return null;
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(registration.emailChallenge.expiresAt));
  }, [registration]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const { session } = readAuthState();

      if (session && !isSessionExpired(session)) {
        router.replace("/dashboard");
        return;
      }

      setCheckingSession(false);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [router]);

  useEffect(() => {
    if (!registration?.emailChallenge.resendAvailableAt) {
      return;
    }

    const updateCountdown = () => {
      const remainingMs =
        Date.parse(registration.emailChallenge.resendAvailableAt) - Date.now();
      setResendSeconds(Math.max(0, Math.ceil(remainingMs / 1000)));
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [registration]);

  function syncCountryCurrency(countryName: string) {
    const match = PHONE_COUNTRIES.find((country) => country.name === countryName);

    setFormData((current) => ({
      ...current,
      country: countryName,
      currency: match?.currency ?? current.currency,
      phoneCountryCode: match?.dialCode ?? current.phoneCountryCode,
    }));
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const phone = formatInternationalPhone(
        formData.phoneCountryCode,
        formData.phoneNationalNumber,
      );

      if (!phone) {
        throw new Error("Enter a valid phone number.");
      }

      const response = await fetch(`${apiBaseUrl}/auth/workspace/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: formData.businessName.trim(),
          country: formData.country.trim(),
          currency: formData.currency.trim().toUpperCase(),
          ownerName: formData.ownerName.trim(),
          phone,
          email: formData.email.trim(),
          password: formData.password,
        }),
      });

      const payload = await readApiJson<RegistrationResponse>(response);

      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }

      setRegistration(payload);
      setStep("verify");
      setEmailOtpCode("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Account registration failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!registration) {
      return;
    }

    if (emailOtpCode.length !== 6) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/auth/workspace/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: registration.emailChallenge.id,
          code: emailOtpCode,
        }),
      });

      const payload = await readApiJson<VerificationResponse>(response);

      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }

      if (!payload.session || !payload.verification.activated) {
        throw new Error("Account verification completed, but no session was issued.");
      }

      persistAuthState({
        session: payload.session,
        workspace: payload.workspace,
        user: {
          id: payload.owner?.id,
          name: payload.owner?.name,
          email: payload.owner?.email,
          phone: payload.owner?.phone,
          status: payload.owner?.status,
          roleName: "Account Owner",
        },
      });

      router.replace("/branches?setup=1&create=1");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Email OTP verification failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendEmailOtp() {
    if (!registration || resendSeconds > 0) {
      return;
    }

    setError(null);
    setIsResending(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/auth/workspace/resend-email-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: registration.emailChallenge.id,
          }),
        },
      );

      const payload = await readApiJson<ResendOtpResponse>(response);

      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }

      setRegistration((current) =>
        current
          ? {
              ...current,
              emailChallenge: payload.emailChallenge ?? current.emailChallenge,
              emailDelivery: payload.emailDelivery ?? current.emailDelivery,
            }
          : current,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Email OTP resend failed.",
      );
    } finally {
      setIsResending(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="size-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--forest-emerald)]" />
      </main>
    );
  }

  return (
    <AuthShell
      eyebrow="Get started"
      title="Register your lending institution."
      description="Create the company account, verify the owner email, then set up branches and assign managers who will run day-to-day operations."
      footer={
        step === "details" ? (
          <p className="text-center text-sm text-slate-500">
            Already registered?{" "}
            <Link
              href="/login"
              className="font-bold text-[var(--forest-emerald)] hover:underline"
            >
              Sign in
            </Link>
          </p>
        ) : null
      }
    >
      {step === "verify" && registration ? (
        <form className="space-y-5" onSubmit={handleVerifyEmail}>
          <div>
            <div className="mb-4 flex items-center gap-2">
              <StepPill active label="1. Details" done />
              <StepPill active label="2. Verify" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--forest-emerald)]">
              Email verification
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-[-0.03em] text-[var(--midnight-navy)]">
              Enter your code
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              We sent a 6-digit code to{" "}
              <span className="font-semibold text-[var(--midnight-navy)]">
                {registration.emailChallenge.destination}
              </span>
              {expiresAt ? `. Expires at ${expiresAt}.` : "."}
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--soft-mist)] px-4 py-3 text-sm leading-6 text-slate-600">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-8 place-items-center rounded-lg bg-white text-[var(--forest-emerald)]">
                <Mail className="size-4" />
              </span>
              <div>
                <p className="font-semibold text-[var(--midnight-navy)]">
                  {registration.emailDelivery.delivered
                    ? "Verification email sent"
                    : registration.emailDelivery.provider === "development"
                      ? "Development delivery mode"
                      : "Delivery pending"}
                </p>
                <p className="mt-1">{registration.emailDelivery.message}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--midnight-navy)]">
              Verification code
            </p>
            <OtpInput value={emailOtpCode} onChange={setEmailOtpCode} />
          </div>

          <FormError error={error} />

          <PrimaryButton type="submit" loading={isSubmitting}>
            Verify and start setup
          </PrimaryButton>

          <div className="flex items-center justify-between gap-3">
            <Link
              href="/login"
              className="text-sm font-semibold text-slate-500 hover:text-[var(--midnight-navy)]"
            >
              Already verified? Sign in
            </Link>
            <button
              type="button"
              disabled={
                isResending ||
                resendSeconds > 0 ||
                registration.emailChallenge.resendCount >=
                  registration.emailChallenge.maxResends
              }
              className="inline-flex items-center gap-2 text-sm font-bold text-[var(--forest-emerald)] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleResendEmailOtp}
            >
              <RefreshCw className={`size-3.5 ${isResending ? "animate-spin" : ""}`} />
              {resendSeconds > 0
                ? `Resend in ${resendSeconds}s`
                : "Resend code"}
            </button>
          </div>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={handleRegister}>
          <div>
            <div className="mb-4 flex items-center gap-2">
              <StepPill active label="1. Details" />
              <StepPill label="2. Verify" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--forest-emerald)]">
              Company registration
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-[-0.03em] text-[var(--midnight-navy)]">
              Set up your account
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Tell us about the institution and the account owner.
            </p>
          </div>

          <TextField
            label="Business name"
            value={formData.businessName}
            onChange={(value) =>
              setFormData((current) => ({ ...current, businessName: value }))
            }
            placeholder="Registered company name"
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Country"
              value={formData.country}
              onChange={syncCountryCurrency}
              options={COUNTRY_OPTIONS}
              required
            />
            <SelectField
              label="Currency"
              value={formData.currency}
              onChange={(value) =>
                setFormData((current) => ({ ...current, currency: value }))
              }
              options={PHONE_COUNTRIES.map((country) => ({
                value: country.currency,
                label: country.currency,
              }))}
              required
            />
          </div>

          <TextField
            label="Owner full name"
            value={formData.ownerName}
            onChange={(value) =>
              setFormData((current) => ({ ...current, ownerName: value }))
            }
            placeholder="Legal owner name"
            autoComplete="name"
            required
          />

          <PhoneField
            label="Owner phone"
            countryCode={formData.phoneCountryCode}
            nationalNumber={formData.phoneNationalNumber}
            onCountryCodeChange={(value) => {
              const match = countryByDialCode(value);
              setFormData((current) => ({
                ...current,
                phoneCountryCode: value,
                country: match?.name ?? current.country,
                currency: match?.currency ?? current.currency,
              }));
            }}
            onNationalNumberChange={(value) =>
              setFormData((current) => ({
                ...current,
                phoneNationalNumber: value,
              }))
            }
            required
          />

          <TextField
            label="Owner email"
            type="email"
            value={formData.email}
            onChange={(value) =>
              setFormData((current) => ({ ...current, email: value }))
            }
            placeholder="owner@institution.com"
            autoComplete="email"
            required
          />

          <PasswordField
            label="Password"
            value={formData.password}
            onChange={(value) =>
              setFormData((current) => ({ ...current, password: value }))
            }
            autoComplete="new-password"
          />

          <FormError error={error} />

          <PrimaryButton type="submit" loading={isSubmitting} variant="navy">
            Continue to verification
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}

function StepPill({
  label,
  active = false,
  done = false,
}: {
  label: string;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <span
      className={`border px-2.5 py-1 text-xs font-semibold ${
        active || done
          ? "border-[rgba(15,138,108,0.35)] bg-[rgba(15,138,108,0.1)] text-[var(--forest-emerald)]"
          : "border-[var(--line)] bg-[var(--soft-mist)] text-slate-500"
      }`}
    >
      {label}
    </span>
  );
}
