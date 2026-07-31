"use client";

import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AuthCardHeader,
  AuthCardSkeleton,
  AuthGhostButton,
  AuthPrimaryButton,
  AuthStepBar,
} from "../../../../components/auth/auth-scene";
import {
  FormError,
  PasswordField,
  PhoneField,
} from "../../../../components/auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../../lib/api";
import { RembehSession, persistAuthState } from "../../../../lib/auth-session";
import { formatInternationalPhone } from "../../../../lib/phone";

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

const STEPS = ["Review", "Credentials", "Enter"];

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

    const phone = formatInternationalPhone(
      phoneCountryCode,
      phoneNationalNumber,
    );
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
    return <AuthCardSkeleton />;
  }

  if (!lookup) {
    return (
      <div key="unavailable">
        <AuthCardHeader
          title="Link unavailable"
          subtitle="Ask your admin for a new invitation."
        />
        <div className="mt-3">
          <FormError error={error} />
        </div>
        <Link
          href="/login"
          className="mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-[linear-gradient(90deg,#14a87a_0%,#0f8a6c_100%)] text-[13px] font-bold normal-case tracking-normal text-white"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  const invitation = lookup.invitation;
  const isManager = invitation.roleName === "Branch Manager";
  const stepIndex =
    step === "review" ? 0 : step === "credentials" || step === "activating" ? 1 : 2;

  return (
    <div key={step}>
      <AuthStepBar steps={STEPS} current={stepIndex} />
      <AuthCardHeader
        title={isManager ? "Manager access" : "Activate access"}
        subtitle={`Join ${invitation.workspaceName}`}
      />

      {step === "review" ? (
        <div className="mt-3.5 space-y-2.5 text-left">
          <div className="overflow-hidden rounded-xl border border-[#e2e8ee] bg-[#f8fafb]">
            <InfoRow label="Branch" value={invitation.branchName} />
            <InfoRow label="Role" value={invitation.roleName} />
            <InfoRow label="Email" value={invitation.email} />
            <InfoRow label="Expires" value={expiresAt ?? "Soon"} last />
          </div>

          <AuthPrimaryButton type="button" onClick={() => setStep("credentials")}>
            Continue
            <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </AuthPrimaryButton>
        </div>
      ) : null}

      {step === "credentials" || step === "activating" ? (
        <form className="mt-3.5 space-y-2.5 text-left" onSubmit={handleAccept}>
          <p className="text-[11px] text-slate-500">
            Hello,{" "}
            <span className="font-semibold text-[var(--midnight-navy)]">
              {invitation.name}
            </span>
          </p>

          <PhoneField
            compact
            label="Phone"
            countryCode={phoneCountryCode}
            nationalNumber={phoneNationalNumber}
            onCountryCodeChange={setPhoneCountryCode}
            onNationalNumberChange={setPhoneNationalNumber}
            required
          />
          <PasswordField
            compact
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <PasswordField
            compact
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            placeholder="Re-enter password"
          />

          <FormError error={error} />

          <div className="flex gap-2">
            <AuthGhostButton
              onClick={() => setStep("review")}
              disabled={isSubmitting}
            >
              Back
            </AuthGhostButton>
            <div className="flex-[1.6]">
              <AuthPrimaryButton loading={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Activating…
                  </>
                ) : (
                  <>
                    Activate
                    <CheckCircle2 className="size-3.5" />
                  </>
                )}
              </AuthPrimaryButton>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function InfoRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] ${
        last ? "" : "border-b border-[#e8eef2]"
      }`}
    >
      <span className="text-slate-500">{label}</span>
      <p className="truncate font-semibold text-[var(--midnight-navy)]">
        {value}
      </p>
    </div>
  );
}
