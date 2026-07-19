"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app/app-shell";
import {
  FormError,
  PrimaryButton,
  SelectField,
  TextField,
} from "../../components/auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
  isSessionExpired,
  readAuthState,
} from "../../lib/auth-session";
import { MANAGER_INVITE_ROLES, resolveOperatorRole } from "../../lib/roles";

type Branch = { id: string; name: string };
type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    roleName: "Agent",
    displayName: "",
    email: "",
  });

  const activeBranch = useMemo(() => {
    if (branch?.id) {
      return branches.find((item) => item.id === branch.id) ?? branches[0] ?? null;
    }
    return branches[0] ?? null;
  }, [branch, branches]);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        clearAuthState();
        router.replace("/login");
        return;
      }
      if (resolveOperatorRole(auth.session, auth.user) !== "manager") {
        router.replace("/dashboard");
        return;
      }

      setSession(auth.session);
      setWorkspace(auth.workspace);
      setUser(auth.user);
      setBranch(auth.branch);

      void fetch(`${apiBaseUrl}/branches`, {
        headers: {
          Authorization: `${auth.session.tokenType} ${auth.session.accessToken}`,
        },
      })
        .then(async (response) => {
          const payload = await readApiJson<{ branches?: Branch[] }>(response);
          setBranches(payload.branches ?? []);
        })
        .finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(boot);
  }, [router]);

  async function handleInviteAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !activeBranch) {
      setError("No branch assigned.");
      return;
    }

    setError(null);
    setIsInviting(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/branches/${activeBranch.id}/staff-invitations`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roleName: inviteForm.roleName,
            displayName: inviteForm.displayName.trim(),
            email: inviteForm.email.trim(),
          }),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setStep(3);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Invite failed.",
      );
    } finally {
      setIsInviting(false);
    }
  }

  if (!session || isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-[var(--forest-emerald)]" />
      </main>
    );
  }

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={branch}
    >
      <div className="mx-auto max-w-xl space-y-4 animate-rise">
        <section className="panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h1 className="text-lg font-bold text-[var(--midnight-navy)]">
              {activeBranch?.name ?? "Branch"} setup
            </h1>
          </div>

          <div className="grid grid-cols-3 border-b border-[var(--line)] text-xs font-semibold">
            <Tab n={1} current={step} label="Branch" />
            <Tab n={2} current={step} label="Invite" />
            <Tab n={3} current={step} label="Done" />
          </div>

          {step === 1 ? (
            <div className="space-y-3 p-4">
              <p className="text-sm text-slate-600">
                Invite agents. They work in the mobile app.
              </p>
              <PrimaryButton type="button" onClick={() => setStep(2)}>
                Continue
                <ArrowRight className="size-4" />
              </PrimaryButton>
            </div>
          ) : null}

          {step === 2 ? (
            <form className="space-y-3 p-4" onSubmit={handleInviteAgent}>
              <SelectField
                label="Role"
                value={inviteForm.roleName}
                onChange={(value) =>
                  setInviteForm((current) => ({ ...current, roleName: value }))
                }
                options={MANAGER_INVITE_ROLES.map((role) => ({
                  value: role,
                  label: role,
                }))}
                required
              />
              <TextField
                label="Name"
                value={inviteForm.displayName}
                onChange={(value) =>
                  setInviteForm((current) => ({
                    ...current,
                    displayName: value,
                  }))
                }
                required
              />
              <TextField
                label="Email"
                type="email"
                value={inviteForm.email}
                onChange={(value) =>
                  setInviteForm((current) => ({ ...current, email: value }))
                }
                required
              />
              <FormError error={error} />
              <PrimaryButton type="submit" loading={isInviting} variant="navy">
                Send invite
              </PrimaryButton>
              <button
                type="button"
                className="w-full text-sm font-semibold text-slate-500"
                onClick={() => setStep(3)}
              >
                Skip
              </button>
            </form>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3 p-4">
              <p className="text-sm text-slate-600">
                Agents capture customers in the field. Your console follows that
                data.
              </p>
              <PrimaryButton
                type="button"
                onClick={() => router.replace("/dashboard")}
              >
                Open console
              </PrimaryButton>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

function Tab({
  n,
  current,
  label,
}: {
  n: Step;
  current: Step;
  label: string;
}) {
  const active = current === n;
  return (
    <div
      className={`border-r border-[var(--line)] px-2 py-2 last:border-r-0 ${
        active
          ? "bg-[rgba(15,138,108,0.08)] text-[var(--forest-emerald)]"
          : "text-slate-400"
      }`}
    >
      {n}. {label}
    </div>
  );
}
