"use client";

import {
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  MapPin,
  Phone,
  Plus,
  UserPlus,
  X,
} from "lucide-react";
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
import { AppShell } from "../../components/app/app-shell";
import {
  FormError,
  PhoneField,
  PrimaryButton,
  TextField,
} from "../../components/auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
  isSessionExpired,
  readAuthState,
} from "../../lib/auth-session";
import { formatInternationalPhone } from "../../lib/phone";
import { OWNER_INVITE_ROLES, resolveOperatorRole } from "../../lib/roles";

type InviteStatus =
  | "ACTIVE"
  | "INVITE_PENDING"
  | "INVITE_EXPIRED"
  | "SUSPENDED"
  | "PENDING_VERIFICATION";

type StaffMember = {
  id: string;
  branchId: string;
  roleName: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  inviteStatus: InviteStatus;
  invitedAt: string | null;
  inviteExpiresAt: string | null;
};

type Branch = {
  id: string;
  name: string;
  address: string;
  gpsLatitude?: string | number | null;
  gpsLongitude?: string | number | null;
  phone?: string | null;
  createdAt: string;
  manager: StaffMember | null;
  staff: StaffMember[];
  staffSummary: {
    total: number;
    active: number;
    pendingInvites: number;
    expiredInvites: number;
  };
};

type StaffInvitationResponse = {
  staffUser: {
    id: string;
    roleName: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
  };
  emailDelivery: {
    delivered: boolean;
    message: string;
  };
  invitation?: {
    status: string;
    expiresAt: string;
    acceptUrl?: string;
  };
  message?: string | string[];
};

export default function BranchesPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [devAcceptUrl, setDevAcceptUrl] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBranch, setInviteBranch] = useState<Branch | null>(null);
  const [setupMode, setSetupMode] = useState(false);

  const [createForm, setCreateForm] = useState({
    branchName: "",
    branchAddress: "",
    branchPhoneCountryCode: "+256",
    branchPhoneNationalNumber: "",
    gpsLatitude: "",
    gpsLongitude: "",
  });
  const [inviteForm, setInviteForm] = useState({
    roleName: "Branch Manager",
    displayName: "",
    email: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const autoInviteHandled = useRef(false);

  const operatorRole = useMemo(
    () => (session ? resolveOperatorRole(session, user) : "staff"),
    [session, user],
  );
  const canCreateBranch = operatorRole === "owner";
  const canInviteStaff = useMemo(
    () =>
      operatorRole === "owner" &&
      (session?.permissions.includes("branch.staff.invite") ?? false),
    [operatorRole, session],
  );

  const clearSessionAndRedirect = useCallback(() => {
    clearAuthState();
    router.replace("/login?next=/branches");
  }, [router]);

  const loadBranches = useCallback(
    async (activeSession: RembehSession) => {
      setError(null);

      try {
        if (isSessionExpired(activeSession)) {
          clearSessionAndRedirect();
          return;
        }

        const response = await fetch(`${apiBaseUrl}/branches`, {
          headers: {
            Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
          },
        });
        const payload = await readApiJson<{
          branches?: Branch[];
          message?: string | string[];
        }>(response);

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            clearSessionAndRedirect();
            return;
          }

          throw new Error(formatApiError(payload.message));
        }

        setBranches(payload.branches ?? []);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load branches.",
        );
      }
    },
    [clearSessionAndRedirect],
  );

  function openInvite(branch: Branch, roleName: string) {
    setInviteBranch(branch);
    setInviteForm({
      roleName,
      displayName: "",
      email: "",
    });
    setError(null);
    setSuccessMessage(null);
    setDevAcceptUrl(null);
    setInviteOpen(true);
  }

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      const params = new URLSearchParams(window.location.search);

      if (!auth.session || isSessionExpired(auth.session)) {
        clearSessionAndRedirect();
        return;
      }

      const role = resolveOperatorRole(auth.session, auth.user);
      if (role !== "owner") {
        router.replace("/dashboard");
        return;
      }

      setSession(auth.session);
      setWorkspace(auth.workspace);
      setUser(auth.user);
      setSetupMode(params.get("setup") === "1");

      void loadBranches(auth.session).finally(() => {
        setIsLoading(false);

        if (params.get("create") === "1") {
          setCreateOpen(true);
        }
      });
    }, 0);

    return () => window.clearTimeout(boot);
  }, [clearSessionAndRedirect, loadBranches, router]);

  useEffect(() => {
    const openFromQuery = window.setTimeout(() => {
      if (
        isLoading ||
        !session ||
        autoInviteHandled.current ||
        !canInviteStaff
      ) {
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const inviteMode = params.get("invite");
      const branchId = params.get("branchId");

      if (!inviteMode) {
        return;
      }

      const branch =
        (branchId
          ? branches.find((item) => item.id === branchId)
          : undefined) ?? branches[0];

      if (!branch) {
        if (operatorRole === "owner" && inviteMode === "manager") {
          setCreateOpen(true);
          autoInviteHandled.current = true;
        }
        return;
      }

      autoInviteHandled.current = true;

      openInvite(branch, OWNER_INVITE_ROLES[0]);
    }, 0);

    return () => window.clearTimeout(openFromQuery);
  }, [branches, canInviteStaff, isLoading, operatorRole, session]);

  async function handleCreateBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    if (isSessionExpired(session)) {
      clearSessionAndRedirect();
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const branchPhone = createForm.branchPhoneNationalNumber.trim()
        ? formatInternationalPhone(
            createForm.branchPhoneCountryCode,
            createForm.branchPhoneNationalNumber,
          )
        : undefined;

      if (createForm.branchPhoneNationalNumber.trim() && !branchPhone) {
        throw new Error("Enter a valid branch phone number.");
      }

      const response = await fetch(`${apiBaseUrl}/branches`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchName: createForm.branchName.trim(),
          branchAddress: createForm.branchAddress.trim(),
          branchPhone,
          gpsLatitude: createForm.gpsLatitude
            ? Number(createForm.gpsLatitude)
            : undefined,
          gpsLongitude: createForm.gpsLongitude
            ? Number(createForm.gpsLongitude)
            : undefined,
          workingHours: {
            timezone: "Africa/Kampala",
            days: [
              { day: "monday", opensAt: "08:00", closesAt: "17:00" },
              { day: "tuesday", opensAt: "08:00", closesAt: "17:00" },
              { day: "wednesday", opensAt: "08:00", closesAt: "17:00" },
              { day: "thursday", opensAt: "08:00", closesAt: "17:00" },
              { day: "friday", opensAt: "08:00", closesAt: "17:00" },
            ],
          },
        }),
      });

      const payload = await readApiJson<{
        branch?: Branch;
        message?: string | string[];
      }>(response);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearSessionAndRedirect();
          return;
        }

        throw new Error(formatApiError(payload.message));
      }

      setCreateOpen(false);
      setCreateForm({
        branchName: "",
        branchAddress: "",
        branchPhoneCountryCode: "+256",
        branchPhoneNationalNumber: "",
        gpsLatitude: "",
        gpsLongitude: "",
      });
      await loadBranches(session);

      if (payload.branch && canInviteStaff) {
        setSuccessMessage(
          `${payload.branch.name} created. Invite a branch manager — they will run this location.`,
        );
        const refreshed = await fetch(`${apiBaseUrl}/branches`, {
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
          },
        }).then((response) =>
          readApiJson<{ branches?: Branch[] }>(response),
        );
        const created =
          refreshed.branches?.find((item) => item.id === payload.branch?.id) ??
          payload.branch;
        openInvite(created as Branch, OWNER_INVITE_ROLES[0]);
      } else {
        setSuccessMessage(`${payload.branch?.name ?? "Branch"} created.`);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Branch creation failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleInviteStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session || !inviteBranch) {
      return;
    }

    if (isSessionExpired(session)) {
      clearSessionAndRedirect();
      return;
    }

    setError(null);
    setIsInviting(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/branches/${inviteBranch.id}/staff-invitations`,
        {
          method: "POST",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roleName:
              operatorRole === "owner"
                ? OWNER_INVITE_ROLES[0]
                : inviteForm.roleName,
            displayName: inviteForm.displayName.trim(),
            email: inviteForm.email.trim(),
          }),
        },
      );

      const payload = await readApiJson<StaffInvitationResponse>(response);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearSessionAndRedirect();
          return;
        }

        throw new Error(formatApiError(payload.message));
      }

      const isManagerInvite =
        (operatorRole === "owner"
          ? OWNER_INVITE_ROLES[0]
          : inviteForm.roleName) === "Branch Manager";

      setSuccessMessage(
        isManagerInvite
          ? `Manager invite sent to ${payload.staffUser.email}.`
          : `Invite sent to ${payload.staffUser.email}.`,
      );
      setDevAcceptUrl(payload.invitation?.acceptUrl ?? null);
      setInviteOpen(false);
      setInviteBranch(null);
      setSetupMode(false);
      await loadBranches(session);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Staff invitation failed.",
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
    <AppShell session={session} workspace={workspace} user={user}>
      <div className="mx-auto max-w-5xl space-y-3 animate-rise">
        <section className="flex flex-col gap-2 border-b border-[var(--line)] pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--forest-emerald)]">
              Branches
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-xl tracking-[-0.02em] text-[var(--midnight-navy)]">
              {branches.length} location{branches.length === 1 ? "" : "s"}
            </h2>
          </div>
          {canCreateBranch ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setCreateOpen(true);
              }}
              className="btn btn-primary h-9 text-xs"
            >
              <Plus className="size-3.5" />
              New branch
            </button>
          ) : null}
        </section>

        {setupMode ? (
          <section className="border border-[var(--line)] bg-white px-3 py-2 text-sm text-slate-600">
            Create branch → invite manager → monitor.
          </section>
        ) : null}

        {successMessage ? (
          <div className="space-y-1.5 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <p>{successMessage}</p>
            </div>
            {devAcceptUrl ? (
              <div className="flex flex-col gap-2 border border-emerald-200 bg-white px-2.5 py-1.5 sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1 truncate text-xs text-slate-600">
                  Dev link: {devAcceptUrl}
                </p>
                <button
                  type="button"
                  className="btn btn-ghost h-7 text-xs"
                  onClick={() => void navigator.clipboard.writeText(devAcceptUrl)}
                >
                  <Copy className="size-3.5" />
                  Copy
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {error && !createOpen && !inviteOpen ? (
          <div className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {branches.length === 0 ? (
          <section className="panel px-4 py-10 text-center">
            <Building2 className="mx-auto size-6 text-[var(--forest-emerald)]" />
            <h3 className="mt-3 text-base font-bold text-[var(--midnight-navy)]">
              Create your first branch
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
              Then invite a manager for that location.
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="btn btn-navy mx-auto mt-4 h-9 text-xs"
            >
              <Plus className="size-3.5" />
              Create branch
            </button>
          </section>
        ) : (
          <section className="panel overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px_72px_auto] gap-3 border-b border-[var(--line)] bg-[var(--soft-mist)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 md:grid">
              <span>Branch</span>
              <span>Manager</span>
              <span>Status</span>
              <span className="text-right">Staff</span>
              <span className="text-right">Pending</span>
              <span className="text-right">Action</span>
            </div>

            <ul className="divide-y divide-[var(--line)]">
              {branches.map((branch) => {
                const team = branch.staff.filter(
                  (member) => member.roleName !== "Branch Manager",
                );

                return (
                  <li key={branch.id} className="px-3 py-2.5">
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_72px_72px_auto] md:items-center md:gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[var(--midnight-navy)]">
                          {branch.name}
                        </p>
                        <p className="mt-0.5 flex items-start gap-1 truncate text-xs text-slate-500">
                          <MapPin className="mt-0.5 size-3 shrink-0 text-[var(--forest-emerald)]" />
                          <span className="truncate">{branch.address}</span>
                        </p>
                        {branch.phone ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                            <Phone className="size-3 text-[var(--forest-emerald)]" />
                            {branch.phone}
                          </p>
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        {branch.manager ? (
                          <>
                            <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
                              {branch.manager.name}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {branch.manager.email}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-slate-500">No manager</p>
                        )}
                      </div>

                      <div>
                        {branch.manager ? (
                          <StatusBadge
                            status={branch.manager.inviteStatus}
                            expiresAt={branch.manager.inviteExpiresAt}
                            compact
                          />
                        ) : (
                          <span className="inline-flex border border-dashed border-[var(--line)] px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                            Unassigned
                          </span>
                        )}
                      </div>

                      <p className="text-sm font-semibold text-[var(--midnight-navy)] md:text-right">
                        <span className="md:hidden text-xs font-normal text-slate-500">
                          Staff{" "}
                        </span>
                        {branch.staffSummary?.active ?? 0}/
                        {branch.staffSummary?.total ?? 0}
                      </p>

                      <p className="text-sm font-semibold text-[var(--midnight-navy)] md:text-right">
                        <span className="md:hidden text-xs font-normal text-slate-500">
                          Pending{" "}
                        </span>
                        {branch.staffSummary?.pendingInvites ?? 0}
                      </p>

                      <div className="md:justify-self-end">
                        {canInviteStaff ? (
                          <button
                            type="button"
                            onClick={() =>
                              openInvite(branch, OWNER_INVITE_ROLES[0])
                            }
                            className="btn btn-ghost h-8 text-xs"
                          >
                            <UserPlus className="size-3.5" />
                            {branch.manager ? "Manager" : "Invite"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {team.length > 0 ? (
                      <div className="mt-2 border-t border-[var(--line)] pt-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                          Team · {team.length}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {team.map((member) => (
                            <span
                              key={member.id}
                              className="inline-flex items-center gap-1.5 border border-[var(--line)] bg-[var(--soft-mist)] px-2 py-1 text-[11px]"
                            >
                              <span className="font-semibold text-[var(--midnight-navy)]">
                                {member.name}
                              </span>
                              <span className="text-slate-500">
                                {member.roleName}
                              </span>
                              <StatusBadge
                                status={member.inviteStatus}
                                expiresAt={member.inviteExpiresAt}
                                compact
                              />
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {createOpen ? (
        <Modal
          title="Create branch"
          description="Add a location, then assign a branch manager."
          onClose={() => setCreateOpen(false)}
        >
          <form className="space-y-3.5" onSubmit={handleCreateBranch}>
            <TextField
              label="Branch name"
              value={createForm.branchName}
              onChange={(value) =>
                setCreateForm((current) => ({ ...current, branchName: value }))
              }
              placeholder="Central Branch"
              required
            />
            <TextField
              label="Address"
              value={createForm.branchAddress}
              onChange={(value) =>
                setCreateForm((current) => ({
                  ...current,
                  branchAddress: value,
                }))
              }
              placeholder="Street, city"
              required
            />
            <PhoneField
              label="Branch phone"
              countryCode={createForm.branchPhoneCountryCode}
              nationalNumber={createForm.branchPhoneNationalNumber}
              onCountryCodeChange={(value) =>
                setCreateForm((current) => ({
                  ...current,
                  branchPhoneCountryCode: value,
                }))
              }
              onNationalNumberChange={(value) =>
                setCreateForm((current) => ({
                  ...current,
                  branchPhoneNationalNumber: value,
                }))
              }
            />
            <div className="grid gap-3.5 sm:grid-cols-2">
              <TextField
                label="GPS latitude"
                value={createForm.gpsLatitude}
                onChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    gpsLatitude: value,
                  }))
                }
                placeholder="Optional"
              />
              <TextField
                label="GPS longitude"
                value={createForm.gpsLongitude}
                onChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    gpsLongitude: value,
                  }))
                }
                placeholder="Optional"
              />
            </div>
            <FormError error={error} />
            <PrimaryButton type="submit" loading={isSubmitting}>
              Create branch
            </PrimaryButton>
          </form>
        </Modal>
      ) : null}

      {inviteOpen && inviteBranch ? (
        <Modal
          title="Invite branch manager"
          description={`${inviteBranch.name} — they must accept before access is active.`}
          onClose={() => {
            setInviteOpen(false);
            setInviteBranch(null);
          }}
        >
          <form className="space-y-3.5" onSubmit={handleInviteStaff}>
            <div>
              <p className="mb-2 text-sm font-semibold text-[var(--midnight-navy)]">
                Role
              </p>
              <div className="flex h-11 items-center border border-[var(--line)] bg-[var(--soft-mist)] px-3 text-sm font-semibold text-[var(--midnight-navy)]">
                Branch Manager
              </div>
            </div>
            <TextField
              label="Full name"
              value={inviteForm.displayName}
              onChange={(value) =>
                setInviteForm((current) => ({
                  ...current,
                  displayName: value,
                }))
              }
              placeholder="Person to invite"
              required
            />
            <TextField
              label="Work email"
              type="email"
              value={inviteForm.email}
              onChange={(value) =>
                setInviteForm((current) => ({ ...current, email: value }))
              }
              placeholder="name@institution.com"
              required
            />
            <FormError error={error} />
            <PrimaryButton type="submit" loading={isInviting} variant="navy">
              {operatorRole === "owner"
                ? "Send manager invitation"
                : "Send staff invitation"}
            </PrimaryButton>
          </form>
        </Modal>
      ) : null}
    </AppShell>
  );
}

function StatusBadge({
  status,
  expiresAt,
  compact = false,
}: {
  status: InviteStatus;
  expiresAt: string | null;
  compact?: boolean;
}) {
  const config = {
    ACTIVE: {
      label: "Active",
      short: "Active",
      className: "border-emerald-300 bg-emerald-50 text-emerald-800",
      icon: CheckCircle2,
    },
    INVITE_PENDING: {
      label: "Invite pending",
      short: "Pending",
      className: "border-amber-300 bg-amber-50 text-amber-900",
      icon: Clock3,
    },
    INVITE_EXPIRED: {
      label: "Invite expired",
      short: "Expired",
      className: "border-red-300 bg-red-50 text-red-800",
      icon: Clock3,
    },
    SUSPENDED: {
      label: "Suspended",
      short: "Suspended",
      className: "border-slate-300 bg-slate-100 text-slate-700",
      icon: Clock3,
    },
    PENDING_VERIFICATION: {
      label: "Pending verification",
      short: "Verify",
      className: "border-amber-300 bg-amber-50 text-amber-900",
      icon: Clock3,
    },
  }[status];

  const Icon = config.icon;
  const expiry =
    !compact && status === "INVITE_PENDING" && expiresAt
      ? ` · ${new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
        }).format(new Date(expiresAt))}`
      : "";

  return (
    <span
      className={`inline-flex items-center gap-1 border font-semibold ${
        compact
          ? "px-1.5 py-0.5 text-[10px]"
          : "px-2 py-1 text-xs"
      } ${config.className}`}
    >
      <Icon className={compact ? "size-3" : "size-3.5"} />
      {compact ? config.short : config.label}
      {expiry}
    </span>
  );
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(10,18,32,0.5)] p-3 sm:items-center">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg animate-rise border border-[var(--line)] bg-white p-4 shadow-[0_24px_60px_rgba(20,33,61,0.28)] sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--line)] pb-3">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-xl tracking-[-0.02em] text-[var(--midnight-navy)]">
              {title}
            </h3>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center border border-[var(--line)] text-[var(--midnight-navy)]"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
