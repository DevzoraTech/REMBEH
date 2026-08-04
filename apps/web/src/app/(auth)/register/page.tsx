"use client";

import { ArrowRight, Loader2, Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import {
  AuthCardHeader,
  AuthCardSkeleton,
  AuthGhostButton,
  AuthPrimaryButton,
  AuthStepBar,
} from "../../../components/auth/auth-scene";
import {
  FormError,
  OtpInput,
  PasswordField,
  PhoneField,
  SelectField,
  TextField,
} from "../../../components/auth/form-controls";
import { SocialOAuthButtons } from "../../../components/auth/social-oauth-buttons";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import {
  RembehSession,
  RembehUser,
  RembehWorkspace,
  isSessionExpired,
  persistAuthState,
  readAuthState,
} from "../../../lib/auth-session";
import {
  PHONE_COUNTRIES,
  countryByDialCode,
  formatInternationalPhone,
} from "../../../lib/phone";

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
  owner:
    | (RembehUser & {
        phone?: string;
        emailVerified: boolean;
        phoneVerified: boolean;
      })
    | null;
  verification: {
    emailVerified: boolean;
    phoneVerified: boolean;
    activated: boolean;
  };
  session: RembehSession | null;
  message?: string | string[];
};

type OAuthOnboardingExchange = {
  kind: "onboarding";
  onboardingToken: string;
  profile: {
    provider: "GOOGLE" | "MICROSOFT";
    email: string;
    displayName: string | null;
    emailVerified: boolean;
  };
  message?: string | string[];
};

type OAuthLoginResponse = {
  workspace: RembehWorkspace;
  user: RembehUser;
  session: RembehSession;
  message?: string | string[];
};

type RegisterStep = "business" | "owner" | "account" | "verify";

const EMAIL_STEPS = ["Business", "Owner", "Account", "Verify"] as const;
const OAUTH_STEPS = ["Business", "Owner"] as const;
const OAUTH_ONBOARDING_STORAGE_KEY = "rembeh.oauth.onboarding";

type StoredOauthOnboarding = {
  onboardingToken: string;
  profile: OAuthOnboardingExchange["profile"];
};

const COUNTRY_OPTIONS = PHONE_COUNTRIES.map((country) => ({
  value: country.name,
  label: `${country.flag} ${country.name}`,
}));

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<RegisterStep>("business");
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
  const [oauthOnboardingToken, setOauthOnboardingToken] = useState<string | null>(
    null,
  );
  const [oauthProfile, setOauthProfile] = useState<
    OAuthOnboardingExchange["profile"] | null
  >(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loadingOauthTicket, setLoadingOauthTicket] = useState(false);

  const isOauthSignup = Boolean(oauthOnboardingToken && oauthProfile);
  const stepLabels = isOauthSignup ? OAUTH_STEPS : EMAIL_STEPS;

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

      const oauthError = searchParams.get("oauthError");
      if (oauthError?.trim()) {
        setError(oauthError.trim());
      }

      if (!searchParams.get("oauthTicket")) {
        try {
          const raw = window.sessionStorage.getItem(OAUTH_ONBOARDING_STORAGE_KEY);
          if (raw) {
            const stored = JSON.parse(raw) as StoredOauthOnboarding;
            if (stored?.onboardingToken && stored.profile?.email) {
              setOauthOnboardingToken(stored.onboardingToken);
              setOauthProfile(stored.profile);
              setFormData((current) => ({
                ...current,
                email: stored.profile.email,
                ownerName:
                  stored.profile.displayName?.trim() || current.ownerName,
              }));
            }
          }
        } catch {
          // ignore storage errors
        }
      }

      setCheckingSession(false);
    }, 0);

    return () => window.clearTimeout(boot);
  }, [router, searchParams]);

  useEffect(() => {
    const ticket = searchParams.get("oauthTicket")?.trim();
    if (!ticket || checkingSession) {
      return;
    }

    let cancelled = false;
    setLoadingOauthTicket(true);
    setError(null);

    (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/auth/oauth/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId: ticket }),
        });
        const payload = await readApiJson<OAuthOnboardingExchange>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        if (payload.kind !== "onboarding" || !payload.onboardingToken) {
          throw new Error("Unexpected OAuth response. Please try again.");
        }
        if (cancelled) return;

        setOauthOnboardingToken(payload.onboardingToken);
        setOauthProfile(payload.profile);
        setFormData((current) => ({
          ...current,
          email: payload.profile.email,
          ownerName: payload.profile.displayName?.trim() || current.ownerName,
        }));
        try {
          window.sessionStorage.setItem(
            OAUTH_ONBOARDING_STORAGE_KEY,
            JSON.stringify({
              onboardingToken: payload.onboardingToken,
              profile: payload.profile,
            } satisfies StoredOauthOnboarding),
          );
        } catch {
          // ignore
        }
        if (searchParams.get("reason") === "new_account") {
          setError(
            "No REMBEH account found for that email. Finish organisation setup to create one.",
          );
        }
        router.replace("/register");
      } catch (caughtError) {
        if (cancelled) return;
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Google / Microsoft sign-up failed.",
        );
      } finally {
        if (!cancelled) {
          setLoadingOauthTicket(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [checkingSession, router, searchParams]);

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
    const match = PHONE_COUNTRIES.find(
      (country) => country.name === countryName,
    );

    setFormData((current) => ({
      ...current,
      country: countryName,
      currency: match?.currency ?? current.currency,
      phoneCountryCode: match?.dialCode ?? current.phoneCountryCode,
    }));
  }

  function goNextFromBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!formData.businessName.trim()) {
      setError("Enter your business name.");
      return;
    }
    setStep("owner");
  }

  function goNextFromOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!formData.ownerName.trim()) {
      setError("Enter the owner full name.");
      return;
    }
    const phone = formatInternationalPhone(
      formData.phoneCountryCode,
      formData.phoneNationalNumber,
    );
    if (!phone) {
      setError("Enter a valid phone number.");
      return;
    }
    if (isOauthSignup) {
      void completeOauthRegister(phone);
      return;
    }
    setStep("account");
  }

  async function completeOauthRegister(phone: string) {
    if (!oauthOnboardingToken) {
      setError("OAuth session expired. Continue with Google or Microsoft again.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/auth/workspace/complete-oauth-register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            onboardingToken: oauthOnboardingToken,
            businessName: formData.businessName.trim(),
            country: formData.country.trim(),
            currency: formData.currency.trim().toUpperCase(),
            ownerName: formData.ownerName.trim(),
            phone,
          }),
        },
      );
      const payload = await readApiJson<OAuthLoginResponse>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }

      persistAuthState({
        session: payload.session,
        workspace: payload.workspace,
        user: {
          ...payload.user,
          roleName: payload.user.roleName ?? "Account Owner",
        },
      });
      try {
        window.sessionStorage.removeItem(OAUTH_ONBOARDING_STORAGE_KEY);
      } catch {
        // ignore
      }
      router.replace("/branches?setup=1&create=1");
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
        throw new Error(
          "Account verification completed, but no session was issued.",
        );
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

  if (checkingSession || loadingOauthTicket) {
    return <AuthCardSkeleton />;
  }

  if (step === "verify" && registration) {
    return (
      <div key="verify">
        <AuthStepBar steps={[...EMAIL_STEPS]} current={3} />
        <AuthCardHeader
          title="Verify email"
          subtitle={`Code sent to ${registration.emailChallenge.destination}${expiresAt ? ` · ${expiresAt}` : ""}`}
        />

        <form className="mt-3.5 space-y-2.5 text-left" onSubmit={handleVerifyEmail}>
          <div className="flex items-center gap-2 rounded-xl border border-[#e2e8ee] bg-[#f8fafb] px-2.5 py-2 text-[11px] text-slate-600">
            <Mail className="size-3.5 shrink-0 text-[var(--forest-emerald)]" />
            <span className="font-medium text-[var(--midnight-navy)]">
              {registration.emailDelivery.delivered
                ? "Check inbox & spam"
                : "Code pending"}
            </span>
          </div>

          <OtpInput value={emailOtpCode} onChange={setEmailOtpCode} />
          <FormError error={error} />

          <AuthPrimaryButton loading={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Verifying…
              </>
            ) : (
              <>
                Verify & continue
                <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
              </>
            )}
          </AuthPrimaryButton>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <Link
              href="/login"
              className="text-[11px] font-semibold text-slate-500 hover:text-[var(--midnight-navy)]"
            >
              Sign in instead
            </Link>
            <button
              type="button"
              disabled={
                isResending ||
                resendSeconds > 0 ||
                registration.emailChallenge.resendCount >=
                  registration.emailChallenge.maxResends
              }
              className="inline-flex items-center gap-1 text-[11px] font-bold normal-case tracking-normal text-[var(--forest-emerald)] disabled:opacity-50"
              onClick={handleResendEmailOtp}
            >
              <RefreshCw
                className={`size-3 ${isResending ? "animate-spin" : ""}`}
              />
              {resendSeconds > 0 ? `${resendSeconds}s` : "Resend"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (step === "account") {
    return (
      <div key="account">
        <AuthStepBar steps={[...EMAIL_STEPS]} current={2} />
        <AuthCardHeader
          title="Create login"
          subtitle="Email and password for your owner account"
        />

        <form className="mt-3.5 space-y-2.5 text-left" onSubmit={handleRegister}>
          <TextField
            compact
            label="Work email"
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
            compact
            label="Password"
            value={formData.password}
            onChange={(value) =>
              setFormData((current) => ({ ...current, password: value }))
            }
            autoComplete="new-password"
          />
          <FormError error={error} />
          <div className="flex gap-2">
            <AuthGhostButton
              onClick={() => {
                setError(null);
                setStep("owner");
              }}
              disabled={isSubmitting}
            >
              Back
            </AuthGhostButton>
            <div className="flex-[1.6]">
              <AuthPrimaryButton loading={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                  </>
                )}
              </AuthPrimaryButton>
            </div>
          </div>
        </form>
      </div>
    );
  }

  if (step === "owner") {
    return (
      <div key="owner">
        <AuthStepBar steps={[...stepLabels]} current={1} />
        <AuthCardHeader
          title="Owner details"
          subtitle={
            isOauthSignup
              ? "Confirm who will manage this institution"
              : "Who will manage this institution"
          }
        />

        <form
          className="mt-3.5 space-y-2.5 text-left"
          onSubmit={goNextFromOwner}
        >
          {oauthProfile ? (
            <div className="rounded-xl border border-[#e2e8ee] bg-[#f8fafb] px-2.5 py-2 text-[11px] text-slate-600">
              Signing up with{" "}
              <span className="font-semibold text-[var(--midnight-navy)]">
                {oauthProfile.provider === "GOOGLE" ? "Google" : "Microsoft"}
              </span>
              {" · "}
              <span className="font-medium text-[var(--midnight-navy)]">
                {oauthProfile.email}
              </span>
            </div>
          ) : null}
          <TextField
            compact
            label="Full name"
            value={formData.ownerName}
            onChange={(value) =>
              setFormData((current) => ({ ...current, ownerName: value }))
            }
            placeholder="Legal owner name"
            autoComplete="name"
            required
          />
          <PhoneField
            compact
            label="Phone"
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
          <FormError error={error} />
          <div className="flex gap-2">
            <AuthGhostButton
              onClick={() => {
                setError(null);
                setStep("business");
              }}
              disabled={isSubmitting}
            >
              Back
            </AuthGhostButton>
            <div className="flex-[1.6]">
              <AuthPrimaryButton loading={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    {isOauthSignup ? "Create account" : "Continue"}
                    <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                  </>
                )}
              </AuthPrimaryButton>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div key="business">
      <AuthStepBar steps={[...stepLabels]} current={0} />
      <AuthCardHeader
        title="Create account"
        subtitle={
          isOauthSignup
            ? "Tell us about your lending institution"
            : "Tell us about your lending institution"
        }
      />

      <form
        className="mt-3.5 space-y-2.5 text-left"
        onSubmit={goNextFromBusiness}
      >
        {oauthProfile ? (
          <div className="rounded-xl border border-[#e2e8ee] bg-[#f8fafb] px-2.5 py-2 text-[11px] text-slate-600">
            Continue as{" "}
            <span className="font-medium text-[var(--midnight-navy)]">
              {oauthProfile.email}
            </span>
          </div>
        ) : null}
        <TextField
          compact
          label="Business name"
          value={formData.businessName}
          onChange={(value) =>
            setFormData((current) => ({ ...current, businessName: value }))
          }
          placeholder="Registered company name"
          required
        />
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            compact
            label="Country"
            value={formData.country}
            onChange={syncCountryCurrency}
            options={COUNTRY_OPTIONS}
            required
          />
          <SelectField
            compact
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
        <FormError error={error} />
        <AuthPrimaryButton>
          Continue
          <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
        </AuthPrimaryButton>
      </form>

      {!isOauthSignup ? (
        <>
          <div className="relative mt-3 py-0.5 text-center">
            <div className="absolute inset-x-0 top-1/2 h-px bg-[#e8eef2]" />
            <span className="relative bg-white px-2 text-[10px] text-slate-400">
              or sign up with
            </span>
          </div>
          <div className="mt-2">
            <SocialOAuthButtons intent="register" onError={setError} />
          </div>
        </>
      ) : null}

      <p className="mt-3 text-center text-[11px] text-slate-500">
        Already registered?{" "}
        <Link
          href="/login"
          className="font-semibold text-[var(--forest-emerald)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
