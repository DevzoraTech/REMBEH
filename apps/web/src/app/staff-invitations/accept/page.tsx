"use client";

import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import rembehIcon from "../../../assets/rembeh-icon.png";
import {
  FormError,
  PasswordField,
  PhoneField,
  PrimaryButton,
} from "../../../components/auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import { RembehSession, persistAuthState } from "../../../lib/auth-session";
import { formatInternationalPhone } from "../../../lib/phone";

type InvitationLookupResponse = {
  invitation: {
    email: string;
    name: string;
    roleName: string;
    branchName: string;
    branchAddress: string | null;
    workspaceName: string;
    workspaceCountry: string;
    workspaceCurrency: string;
    invitedByName: string | null;
    expiresAt: string;
    status: "OPEN";
  };
  message?: string | string[];
};

type AcceptInvitationResponse = {
  staffUser: {
    id: string;
    roleName: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
  };
  workspace: {
    id: string;
    name: string;
    status: string;
    currency: string;
    country: string;
  };
  branch: {
    id: string;
    name: string;
    address: string;
  } | null;
  session: RembehSession;
  onboarding: {
    required: boolean;
    nextStep: "invite_agents" | "operations";
  };
  message?: string | string[];
};

type Step = "review" | "credentials" | "activating";

export default function AcceptStaffInvitationPage() {
  const router = useRouter();
  const tokenRef = useRef("");
  const [step, setStep] = useState<Step>("review");
  const [lookup, setLookup] = useState<InvitationLookupResponse | null>(null);
  const [phoneCountryCode, setPhoneCountryCode] = useState("+256");
  const [phoneNationalNumber, setPhoneNationalNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const expiresAt = useMemo(() => {
    if (!lookup?.invitation.expiresAt) {
      return null;
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(lookup.invitation.expiresAt));
  }, [lookup]);

  const loadInvitation = useCallback(async (invitationToken: string) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/branch-staff/invitations/lookup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: invitationToken }),
        },
      );
      const payload = await readApiJson<InvitationLookupResponse>(response);

      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }

      setLookup(payload);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Invitation could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;

    async function readInvitation() {
      const invitationToken =
        new URLSearchParams(window.location.search).get("token") ?? "";

      await Promise.resolve();

      if (!isCurrent) {
        return;
      }

      tokenRef.current = invitationToken;

      if (!invitationToken) {
        setError("This invitation link is incomplete or invalid.");
        setIsLoading(false);
        return;
      }

      await loadInvitation(invitationToken);
    }

    void readInvitation();

    return () => {
      isCurrent = false;
    };
  }, [loadInvitation]);

  async function handleAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const phone = formatInternationalPhone(phoneCountryCode, phoneNationalNumber);
    if (!phone) {
      setError("Enter a valid international phone number.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setStep("activating");

    try {
      const response = await fetch(
        `${apiBaseUrl}/branch-staff/invitations/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: tokenRef.current,
            phone,
            password,
          }),
        },
      );
      const payload = await readApiJson<AcceptInvitationResponse>(response);

      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }

      persistAuthState({
        session: payload.session,
        workspace: payload.workspace,
        branch: payload.branch,
        user: {
          id: payload.staffUser.id,
          name: payload.staffUser.name,
          email: payload.staffUser.email,
          phone: payload.staffUser.phone,
          roleName: payload.staffUser.roleName,
          status: payload.staffUser.status,
        },
      });

      if (payload.onboarding.required) {
        router.replace("/onboarding");
      } else {
        router.replace("/dashboard");
      }
    } catch (caughtError) {
      setStep("credentials");
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Invitation acceptance failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--soft-ivory)]">
        <div className="text-center">
          <Loader2 className="mx-auto size-6 animate-spin text-[var(--forest-emerald)]" />
          <p className="mt-3 text-sm text-slate-500">Validating invitation…</p>
        </div>
      </main>
    );
  }

  if (!lookup) {
    return (
      <InviteFrame>
        <div className="border border-[var(--line)] bg-white p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-600">
            Invitation unavailable
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--midnight-navy)]">
            This link cannot be used
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            It may be expired, already accepted, or invalid. Ask your
            administrator to send a new invitation.
          </p>
          <FormError error={error} />
          <Link href="/login" className="btn btn-navy mt-5 inline-flex">
            Go to sign in
          </Link>
        </div>
      </InviteFrame>
    );
  }

  const invitation = lookup.invitation;
  const isManager = invitation.roleName === "Branch Manager";

  return (
    <InviteFrame>
      <div className="border border-[var(--line)] bg-white">
        <div className="border-b border-[var(--line)] bg-[var(--midnight-navy)] px-5 py-5 text-white">
          <div className="flex items-center gap-3">
            <Image
              src={rembehIcon}
              alt="REMBEH"
              className="size-10 object-cover"
              priority
            />
            <div>
              <p className="font-[family-name:var(--font-display)] text-2xl leading-none tracking-[-0.03em]">
                REMBEH
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/50">
                Secure staff activation
              </p>
            </div>
          </div>
          <h1 className="mt-6 font-[family-name:var(--font-display)] text-3xl tracking-[-0.03em]">
            {isManager ? "Activate branch manager access" : "Activate your access"}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
            You were invited to {invitation.workspaceName}. Confirm the
            assignment, create credentials, then enter your console.
          </p>
        </div>

        <div className="grid border-b border-[var(--line)] sm:grid-cols-3">
          <StepTab label="1. Review" active={step === "review"} done={step !== "review"} />
          <StepTab
            label="2. Credentials"
            active={step === "credentials" || step === "activating"}
            done={false}
          />
          <StepTab label="3. Enter console" active={false} done={false} />
        </div>

        {step === "review" ? (
          <div className="space-y-4 p-5">
            <div className="grid gap-0 border border-[var(--line)]">
              <InfoRow label="Institution" value={invitation.workspaceName} />
              <InfoRow
                label="Branch"
                value={invitation.branchName}
                note={invitation.branchAddress}
              />
              <InfoRow label="Role" value={invitation.roleName} />
              <InfoRow label="Invited email" value={invitation.email} />
              <InfoRow
                label="Expires"
                value={expiresAt ?? "Soon"}
                last
              />
            </div>

            <div className="flex items-start gap-2 border border-[var(--line)] bg-[var(--soft-mist)] px-3 py-3 text-sm text-slate-600">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--forest-emerald)]" />
              <p>
                This link is single-use and bound to {invitation.email}. Do not
                share it. After activation you will sign in with your own
                password.
              </p>
            </div>

            {isManager ? (
              <div className="border border-[var(--line)] px-3 py-3 text-sm text-slate-600">
                As Branch Manager you will invite field agents and run day-to-day
                operations for {invitation.branchName}. The account owner
                monitors; you operate.
              </div>
            ) : null}

            <PrimaryButton type="button" onClick={() => setStep("credentials")}>
              Continue to credentials
            </PrimaryButton>
          </div>
        ) : null}

        {step === "credentials" || step === "activating" ? (
          <form className="space-y-4 p-5" onSubmit={handleAccept}>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--forest-emerald)]">
                Create credentials
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--midnight-navy)]">
                Hello, {invitation.name}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Set a phone number and password for {invitation.email}.
              </p>
            </div>

            <PhoneField
              label="Phone number"
              countryCode={phoneCountryCode}
              nationalNumber={phoneNationalNumber}
              onCountryCodeChange={setPhoneCountryCode}
              onNationalNumberChange={setPhoneNationalNumber}
              required
            />

            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />

            <PasswordField
              label="Confirm password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              placeholder="Re-enter password"
            />

            <FormError error={error} />

            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => setStep("review")}
                disabled={isSubmitting}
              >
                Back
              </button>
              <PrimaryButton type="submit" loading={isSubmitting}>
                {isManager ? "Activate manager access" : "Activate access"}
              </PrimaryButton>
            </div>

            {step === "activating" ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin text-[var(--forest-emerald)]" />
                Securing your session and opening your console…
              </div>
            ) : null}
          </form>
        ) : null}
      </div>
    </InviteFrame>
  );
}

function InviteFrame({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--soft-ivory)] px-4 py-8 text-[var(--slate-text)] sm:px-6">
      <div className="mx-auto w-full max-w-xl animate-rise">{children}</div>
      <p className="mx-auto mt-6 max-w-xl text-center text-xs text-slate-500">
        Protected invitation · REMBEH by ANTIKRA Mechanism
      </p>
    </main>
  );
}

function StepTab({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`border-b border-[var(--line)] px-3 py-2.5 text-xs font-semibold sm:border-b-0 sm:border-r sm:last:border-r-0 ${
        active
          ? "bg-[rgba(15,138,108,0.08)] text-[var(--forest-emerald)]"
          : done
            ? "bg-white text-[var(--midnight-navy)]"
            : "bg-white text-slate-400"
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        {done ? <CheckCircle2 className="size-3.5" /> : null}
        {label}
      </span>
    </div>
  );
}

function InfoRow({
  label,
  value,
  note,
  last = false,
}: {
  label: string;
  value: string;
  note?: string | null;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 px-3 py-3 text-sm ${
        last ? "" : "border-b border-[var(--line)]"
      }`}
    >
      <span className="text-slate-500">{label}</span>
      <div className="text-right">
        <p className="font-semibold text-[var(--midnight-navy)]">{value}</p>
        {note ? <p className="mt-0.5 text-xs text-slate-500">{note}</p> : null}
      </div>
    </div>
  );
}
