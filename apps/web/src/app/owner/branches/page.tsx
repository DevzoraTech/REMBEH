"use client";

import {
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FormError,
  PhoneField,
  PrimaryButton,
  TextField,
} from "../../../components/auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import type { RembehSession } from "../../../lib/auth-session";
import { formatInternationalPhone } from "../../../lib/phone";
import {
  OwnerBorrower,
  OwnerBranch,
  OwnerLoan,
  OwnerPage,
  OwnerReport,
  OwnerStat,
  OwnerStatus,
  authHeaders,
  formatDate,
  formatMoney,
  formatNumber,
  ownerFetch,
  sumBy,
  useOwnerSession,
} from "../owner-common";

const emptyBranchForm = {
  branchName: "",
  branchAddress: "",
  branchPhoneCountryCode: "+256",
  branchPhoneNationalNumber: "",
  gpsLatitude: "",
  gpsLongitude: "",
};

export default function OwnerBranchesPage() {
  const state = useOwnerSession("/owner/branches");
  const [branches, setBranches] = useState<OwnerBranch[]>([]);
  const [loans, setLoans] = useState<OwnerLoan[]>([]);
  const [borrowers, setBorrowers] = useState<OwnerBorrower[]>([]);
  const [reports, setReports] = useState<OwnerReport[]>([]);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailBranch, setDetailBranch] = useState<OwnerBranch | null>(null);
  const [inviteBranch, setInviteBranch] = useState<OwnerBranch | null>(null);
  const [createdBranch, setCreatedBranch] = useState<OwnerBranch | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [branchForm, setBranchForm] = useState(emptyBranchForm);
  const [loading, setLoading] = useState(true);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingInvite, setSavingInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currency = state.workspace?.currency ?? "UGX";

  const loadData = useCallback(async () => {
    if (!state.session) return;
    setLoading(true);
    setError(null);
    try {
      const [branchPayload, loanPayload, borrowerPayload, reportPayload] =
        await Promise.all([
          ownerFetch<{ branches?: OwnerBranch[] }>(state.session, "/branches"),
          ownerFetch<{ loans?: OwnerLoan[] }>(state.session, "/loans"),
          ownerFetch<{ customers?: OwnerBorrower[] }>(
            state.session,
            "/customers",
          ),
          ownerFetch<{ reports?: OwnerReport[] }>(
            state.session,
            "/operations/reports",
          ),
        ]);
      const nextBranches = branchPayload.branches ?? [];
      setBranches(nextBranches);
      setLoans(loanPayload.loans ?? []);
      setBorrowers(borrowerPayload.customers ?? []);
      setReports(reportPayload.reports ?? []);
      setExpandedId((current) => current ?? nextBranches[0]?.id ?? null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load branches.",
      );
    } finally {
      setLoading(false);
    }
  }, [state.session]);

  useEffect(() => {
    if (state.ready && state.session) {
      void loadData();
    }
  }, [loadData, state.ready, state.session]);

  const filteredBranches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((branch) =>
      [
        branch.name,
        branch.address,
        branch.phone ?? "",
        branch.manager?.name ?? "",
        branch.manager?.email ?? "",
      ].some((value) => value.toLowerCase().includes(q)),
    );
  }, [branches, search]);

  const assignedManagers = branches.filter((branch) =>
    activeManager(branch),
  ).length;
  const activeStaff = sumBy(branches, (branch) => branch.staffSummary.active);
  const sentReportCount = reports.length;

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.session) return;

    setSavingBranch(true);
    setFormError(null);
    setNotice(null);
    try {
      const branchPhone = branchForm.branchPhoneNationalNumber.trim()
        ? formatInternationalPhone(
            branchForm.branchPhoneCountryCode,
            branchForm.branchPhoneNationalNumber,
          )
        : undefined;

      if (branchForm.branchPhoneNationalNumber.trim() && !branchPhone) {
        throw new Error("Enter a valid branch phone number.");
      }

      const response = await fetch(`${apiBaseUrl}/branches`, {
        method: "POST",
        headers: {
          ...authHeaders(state.session),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchName: branchForm.branchName.trim(),
          branchAddress: branchForm.branchAddress.trim(),
          branchPhone,
          gpsLatitude: branchForm.gpsLatitude
            ? Number(branchForm.gpsLatitude)
            : undefined,
          gpsLongitude: branchForm.gpsLongitude
            ? Number(branchForm.gpsLongitude)
            : undefined,
        }),
      });
      const payload = await readApiJson<{
        branch?: OwnerBranch;
        message?: string | string[];
      }>(response);
      if (!response.ok) throw new Error(formatApiError(payload.message));

      setCreateOpen(false);
      setBranchForm(emptyBranchForm);
      setNotice(`${payload.branch?.name ?? "Branch"} created.`);
      await loadData();

      if (payload.branch) {
        setCreatedBranch(payload.branch);
        setInviteBranch(payload.branch);
      }
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : "Could not create branch.",
      );
    } finally {
      setSavingBranch(false);
    }
  }

  return (
    <OwnerPage
      state={state}
      title="Branches"
      eyebrow="Account Network"
      actions={
        <>
          <button
            type="button"
            className="btn btn-ghost h-9 text-xs"
            onClick={() => void loadData()}
            disabled={loading}
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-primary h-9 text-xs"
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            Add Branch
          </button>
        </>
      }
    >
      {notice ? (
        <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--forest-emerald)]">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <OwnerStat label="Branches" value={formatNumber(branches.length)} />
        <OwnerStat
          label="Assigned managers"
          value={formatNumber(assignedManagers)}
          tone="green"
        />
        <OwnerStat
          label="Active staff"
          value={formatNumber(activeStaff)}
          tone="blue"
        />
        <OwnerStat
          label="Sent reports"
          value={formatNumber(sentReportCount)}
          tone="gold"
        />
        <OwnerStat
          label="Outstanding"
          value={formatMoney(
            sumBy(loans, (loan) => loan.balance),
            currency,
          )}
          tone="slate"
        />
      </div>

      <section className="overflow-hidden border border-[var(--line)] bg-white shadow-[0_12px_30px_rgba(20,33,61,0.08)]">
        <div className="grid gap-3 border-b border-[var(--line)] bg-[var(--soft-mist)] px-3 py-3 lg:grid-cols-[1fr_260px] lg:items-center">
          <div>
            <h2 className="text-base font-bold text-[var(--midnight-navy)]">
              Branches
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {filteredBranches.length} shown
            </p>
          </div>
          <label className="flex h-10 items-center gap-2 border border-[var(--line)] bg-white px-3 text-sm">
            <Search className="size-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none"
              placeholder="Search branches"
            />
          </label>
        </div>

        <div className="divide-y divide-[var(--line)]">
          {loading ? (
            <BranchSkeleton />
          ) : filteredBranches.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Building2 className="mx-auto size-7 text-[var(--forest-emerald)]" />
              <h3 className="mt-3 text-base font-bold text-[var(--midnight-navy)]">
                No branches found
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Create a branch, then invite its branch manager.
              </p>
            </div>
          ) : (
            filteredBranches.map((branch) => {
              const metrics = branchMetrics(branch, loans, borrowers, reports);
              const expanded = expandedId === branch.id;
              return (
                <BranchRow
                  key={branch.id}
                  branch={branch}
                  metrics={metrics}
                  currency={currency}
                  expanded={expanded}
                  onToggle={() =>
                    setExpandedId((current) =>
                      current === branch.id ? null : branch.id,
                    )
                  }
                  onInvite={() => {
                    setCreatedBranch(null);
                    setInviteBranch(branch);
                  }}
                  onOpenDetails={() => setDetailBranch(branch)}
                />
              );
            })
          )}
        </div>
      </section>

      {createOpen && state.session ? (
        <SidePanel
          title="Add Branch"
          description="Create the location first, then assign the branch manager."
          onClose={() => setCreateOpen(false)}
        >
          <form className="space-y-4" onSubmit={createBranch}>
            <TextField
              label="Branch name"
              value={branchForm.branchName}
              onChange={(value) =>
                setBranchForm((current) => ({
                  ...current,
                  branchName: value,
                }))
              }
              placeholder="Central Branch"
              required
            />
            <TextField
              label="Address"
              value={branchForm.branchAddress}
              onChange={(value) =>
                setBranchForm((current) => ({
                  ...current,
                  branchAddress: value,
                }))
              }
              placeholder="Street, town"
              required
            />
            <PhoneField
              label="Branch phone"
              countryCode={branchForm.branchPhoneCountryCode}
              nationalNumber={branchForm.branchPhoneNationalNumber}
              onCountryCodeChange={(value) =>
                setBranchForm((current) => ({
                  ...current,
                  branchPhoneCountryCode: value,
                }))
              }
              onNationalNumberChange={(value) =>
                setBranchForm((current) => ({
                  ...current,
                  branchPhoneNationalNumber: value,
                }))
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="GPS latitude"
                value={branchForm.gpsLatitude}
                onChange={(value) =>
                  setBranchForm((current) => ({
                    ...current,
                    gpsLatitude: value,
                  }))
                }
                placeholder="Optional"
              />
              <TextField
                label="GPS longitude"
                value={branchForm.gpsLongitude}
                onChange={(value) =>
                  setBranchForm((current) => ({
                    ...current,
                    gpsLongitude: value,
                  }))
                }
                placeholder="Optional"
              />
            </div>
            <FormError error={formError} />
            <PrimaryButton type="submit" loading={savingBranch}>
              Create Branch
            </PrimaryButton>
          </form>
        </SidePanel>
      ) : null}

      {inviteBranch && state.session ? (
        <InviteManagerPanel
          session={state.session}
          branch={inviteBranch}
          justCreated={createdBranch?.id === inviteBranch.id}
          saving={savingInvite}
          setSaving={setSavingInvite}
          onClose={() => {
            setInviteBranch(null);
            setCreatedBranch(null);
          }}
          onSaved={() => {
            setNotice("Manager invitation sent.");
            setInviteBranch(null);
            setCreatedBranch(null);
            void loadData();
          }}
        />
      ) : null}

      {detailBranch ? (
        <BranchDetailDrawer
          branch={detailBranch}
          metrics={branchMetrics(detailBranch, loans, borrowers, reports)}
          currency={currency}
          onClose={() => setDetailBranch(null)}
          onInvite={() => {
            setDetailBranch(null);
            setInviteBranch(detailBranch);
          }}
        />
      ) : null}
    </OwnerPage>
  );
}

function BranchRow({
  branch,
  metrics,
  currency,
  expanded,
  onToggle,
  onInvite,
  onOpenDetails,
}: {
  branch: OwnerBranch;
  metrics: BranchMetrics;
  currency: string;
  expanded: boolean;
  onToggle: () => void;
  onInvite: () => void;
  onOpenDetails: () => void;
}) {
  const manager = activeManager(branch);
  const invitedManager =
    branch.manager && branch.manager.inviteStatus !== "ACTIVE"
      ? branch.manager
      : null;
  return (
    <article>
      <button
        type="button"
        className="grid w-full gap-2 px-3 py-2.5 text-left hover:bg-[var(--soft-mist)] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_86px_92px_128px_30px] lg:items-center"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--midnight-navy)]">
            {branch.name}
          </p>
          <p className="mt-1 flex min-w-0 items-center gap-1 truncate text-xs text-slate-500">
            <MapPin className="size-3 shrink-0 text-[var(--forest-emerald)]" />
            <span className="truncate">{branch.address}</span>
          </p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--midnight-navy)]">
            {manager?.name ?? "No active manager"}
          </p>
          {manager ? (
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {manager.email}
            </p>
          ) : invitedManager ? (
            <p className="mt-0.5 truncate text-xs text-amber-700">
              Invite pending: {invitedManager.name}
            </p>
          ) : null}
        </div>
        <p className="text-xs font-bold tabular-nums text-[var(--midnight-navy)] lg:text-right">
          {metrics.staffActive}/{metrics.staffTotal}
          <span className="ml-1 font-semibold text-slate-500">staff</span>
        </p>
        <p className="text-xs font-bold tabular-nums text-[var(--midnight-navy)] lg:text-right">
          {formatNumber(metrics.activeLoans)}
          <span className="ml-1 font-semibold text-slate-500">loans</span>
        </p>
        <p className="text-xs font-bold tabular-nums text-[var(--forest-emerald)] lg:text-right">
          {formatMoney(metrics.outstanding, currency)}
        </p>
        <span className="grid size-7 place-items-center justify-self-end border border-[var(--line)] bg-white text-slate-500">
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </span>
      </button>

      {expanded ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--line)] bg-[var(--soft-ivory)] px-3 py-2 text-xs">
          <InlineFact label="Phone" value={branch.phone ?? "-"} />
          <InlineFact
            label="Borrowers"
            value={formatNumber(metrics.borrowers)}
          />
          <InlineFact
            label="Reports"
            value={formatNumber(metrics.reports.length)}
          />
          {metrics.latestReport ? (
            <span className="inline-flex items-center gap-2">
              <span className="font-bold text-slate-500">Latest</span>
              <OwnerStatus value={metrics.latestReport.status} />
            </span>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2">
            {!manager ? (
              <button
                type="button"
                className="btn btn-primary h-9 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  onInvite();
                }}
              >
                <Mail className="size-3.5" />
                Add Manager
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost h-9 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  onInvite();
                }}
              >
                <Mail className="size-3.5" />
                Invite Manager
              </button>
            )}
            <button
              type="button"
              className="btn btn-navy h-9 text-xs"
              onClick={(event) => {
                event.stopPropagation();
                onOpenDetails();
              }}
            >
              Details
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function InlineFact({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="font-bold text-[var(--midnight-navy)]">{value}</span>
    </span>
  );
}

function InviteManagerPanel({
  session,
  branch,
  justCreated,
  saving,
  setSaving,
  onClose,
  onSaved,
}: {
  session: RembehSession;
  branch: OwnerBranch;
  justCreated: boolean;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ displayName: "", email: "" });
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/branches/${branch.id}/staff-invitations`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roleName: "Branch Manager",
            displayName: form.displayName.trim(),
            email: form.email.trim(),
          }),
        },
      );
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) throw new Error(formatApiError(payload.message));
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not send invitation.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel
      title="Assign Manager"
      description={
        justCreated
          ? `${branch.name} is ready. Invite the manager for this branch.`
          : `Invite a branch manager for ${branch.name}.`
      }
      onClose={onClose}
    >
      <div className="mb-4 border border-[var(--line)] bg-[var(--soft-mist)] p-3">
        <p className="text-sm font-bold text-[var(--midnight-navy)]">
          {branch.name}
        </p>
        <p className="mt-1 text-xs text-slate-500">{branch.address}</p>
      </div>
      <form className="space-y-4" onSubmit={submit}>
        <TextField
          label="Manager name"
          value={form.displayName}
          onChange={(value) =>
            setForm((current) => ({ ...current, displayName: value }))
          }
          required
        />
        <TextField
          label="Email"
          type="email"
          value={form.email}
          onChange={(value) =>
            setForm((current) => ({ ...current, email: value }))
          }
          required
        />
        <FormError error={error} />
        <PrimaryButton type="submit" loading={saving}>
          Send Manager Invitation
        </PrimaryButton>
      </form>
    </SidePanel>
  );
}

function BranchDetailDrawer({
  branch,
  metrics,
  currency,
  onClose,
  onInvite,
}: {
  branch: OwnerBranch;
  metrics: BranchMetrics;
  currency: string;
  onClose: () => void;
  onInvite: () => void;
}) {
  const staff = branch.staff ?? [];
  const manager = activeManager(branch);
  const invitedManager =
    branch.manager && branch.manager.inviteStatus !== "ACTIVE"
      ? branch.manager
      : null;
  return (
    <SidePanel
      title={branch.name}
      description="Branch profile, team, portfolio and submitted reports."
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DetailStat
            icon={<Users className="size-4" />}
            label="Staff"
            value={`${metrics.staffActive}/${metrics.staffTotal}`}
          />
          <DetailStat
            icon={<WalletCards className="size-4" />}
            label="Outstanding"
            value={formatMoney(metrics.outstanding, currency)}
          />
          <DetailStat
            icon={<Building2 className="size-4" />}
            label="Borrowers"
            value={formatNumber(metrics.borrowers)}
          />
          <DetailStat
            icon={<ClipboardCheck className="size-4" />}
            label="Reports"
            value={formatNumber(metrics.reports.length)}
          />
        </div>

        <section className="border border-[var(--line)] bg-white">
          <PanelHeader title="Branch information" />
          <div className="grid gap-2 p-3 text-sm sm:grid-cols-2">
            <InfoLine label="Address" value={branch.address} />
            <InfoLine label="Phone" value={branch.phone ?? "-"} />
            <InfoLine
              label="GPS"
              value={
                branch.gpsLatitude || branch.gpsLongitude
                  ? `${branch.gpsLatitude ?? "-"}, ${branch.gpsLongitude ?? "-"}`
                  : "-"
              }
            />
            <InfoLine label="Created" value={formatDate(branch.createdAt)} />
          </div>
        </section>

        <section className="border border-[var(--line)] bg-white">
          <PanelHeader
            title="Manager"
            action={
              <button
                type="button"
                className="btn btn-ghost h-8 text-xs"
                onClick={onInvite}
              >
                <Mail className="size-3.5" />
                Invite
              </button>
            }
          />
          <div className="p-3">
            {manager ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <div>
                  <p className="text-sm font-bold text-[var(--midnight-navy)]">
                    {manager.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{manager.email}</p>
                </div>
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <Phone className="size-3.5 text-[var(--forest-emerald)]" />
                  {manager.phone ?? "Phone added after acceptance"}
                </p>
                <OwnerStatus value={manager.inviteStatus} />
              </div>
            ) : invitedManager ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <div>
                  <p className="text-sm font-bold text-[var(--midnight-navy)]">
                    {invitedManager.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {invitedManager.email}
                  </p>
                </div>
                <p className="text-xs text-amber-700">Waiting for acceptance</p>
                <OwnerStatus value={invitedManager.inviteStatus} />
              </div>
            ) : (
              <p className="text-sm text-slate-500">No active manager.</p>
            )}
          </div>
        </section>

        <section className="border border-[var(--line)] bg-white">
          <PanelHeader title="Team" />
          <div className="divide-y divide-[var(--line)]">
            {staff.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">
                No staff records yet.
              </p>
            ) : (
              staff.map((member) => (
                <div
                  key={member.id}
                  className="grid gap-2 px-3 py-3 text-xs sm:grid-cols-[1fr_1fr_120px] sm:items-center"
                >
                  <div>
                    <p className="font-bold text-[var(--midnight-navy)]">
                      {member.name}
                    </p>
                    <p className="mt-1 text-slate-500">{member.roleName}</p>
                  </div>
                  <p className="truncate text-slate-500">{member.email}</p>
                  <OwnerStatus value={member.inviteStatus} />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="border border-[var(--line)] bg-white">
          <PanelHeader title="Submitted reports" />
          <div className="divide-y divide-[var(--line)]">
            {metrics.reports.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">
                No submitted reports for this branch yet.
              </p>
            ) : (
              metrics.reports.map((report) => (
                <Link
                  key={report.id}
                  href={`/owner/reports?reportId=${report.id}`}
                  className="grid gap-2 px-3 py-3 text-xs hover:bg-[var(--soft-mist)] sm:grid-cols-[1fr_140px_140px_120px] sm:items-center"
                >
                  <div>
                    <p className="font-bold text-[var(--midnight-navy)]">
                      {report.reportNumber}
                    </p>
                    <p className="mt-1 text-slate-500">
                      {formatDate(report.operationDate)}
                    </p>
                  </div>
                  <p className="font-bold tabular-nums">
                    {formatMoney(report.expectedClosingBalance, currency)}
                  </p>
                  <p
                    className={`font-bold tabular-nums ${
                      (report.closingVariance ?? 0) !== 0
                        ? "text-red-700"
                        : "text-[var(--forest-emerald)]"
                    }`}
                  >
                    {formatMoney(report.closingVariance ?? 0, currency)}
                  </p>
                  <OwnerStatus value={report.status} />
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </SidePanel>
  );
}

function SidePanel({
  title,
  description,
  onClose,
  children,
  wide,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(10,18,32,0.35)]">
      <aside
        className={`ml-auto flex h-full w-full flex-col bg-white shadow-2xl ${
          wide ? "max-w-4xl" : "max-w-md"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-[var(--midnight-navy)]">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center border border-[var(--line)]"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-[var(--background)] p-4">
          {children}
        </div>
      </aside>
    </div>
  );
}

function DetailStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-[var(--line)] bg-white p-3">
      <span className="grid size-8 place-items-center bg-emerald-50 text-[var(--forest-emerald)]">
        {icon}
      </span>
      <p className="mt-2 text-[10px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-bold text-[var(--midnight-navy)]">
        {value}
      </p>
    </div>
  );
}

function PanelHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--soft-mist)] px-3 py-2">
      <h3 className="text-sm font-bold text-[var(--midnight-navy)]">{title}</h3>
      {action}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--line)] py-2 last:border-b-0">
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-[var(--midnight-navy)]">{value}</p>
    </div>
  );
}

function BranchSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-20 animate-pulse bg-[linear-gradient(90deg,#eef3f0,#f8faf9,#eef3f0)] bg-[length:200%_100%]"
        />
      ))}
    </div>
  );
}

function activeManager(branch: OwnerBranch) {
  const manager = branch.staff?.find(
    (member) =>
      member.roleName === "Branch Manager" && member.inviteStatus === "ACTIVE",
  );
  if (manager) return manager;
  return branch.manager?.inviteStatus === "ACTIVE" ? branch.manager : null;
}

type BranchMetrics = {
  staffActive: number;
  staffTotal: number;
  activeLoans: number;
  outstanding: number;
  borrowers: number;
  reports: OwnerReport[];
  latestReport: OwnerReport | null;
};

function branchMetrics(
  branch: OwnerBranch,
  loans: OwnerLoan[],
  borrowers: OwnerBorrower[],
  reports: OwnerReport[],
): BranchMetrics {
  const branchLoans = loans.filter((loan) => loan.branchId === branch.id);
  const activeLoans = branchLoans.filter((loan) => loan.status !== "CLOSED");
  const branchReports = reports.filter(
    (report) => report.branchId === branch.id,
  );
  return {
    staffActive: branch.staffSummary.active,
    staffTotal: branch.staffSummary.total,
    activeLoans: activeLoans.length,
    outstanding: sumBy(activeLoans, (loan) => loan.balance),
    borrowers: borrowers.filter((borrower) => borrower.branchId === branch.id)
      .length,
    reports: branchReports,
    latestReport: branchReports[0] ?? null,
  };
}
