"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Lock, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "./app-shell";
import { AppBootSkeleton } from "./skeleton";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import {
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
  isSessionExpired,
  readAuthState,
} from "../../lib/auth-session";
import { resolveOperatorRole } from "../../lib/roles";
import { formatDate, formatMoney } from "../../app/owner/owner-common";
import { OwnerHeader } from "../../app/owner/owner-header";

type BillingSummary = {
  plan: {
    code: string;
    name: string;
    amount: number;
    currency: string;
    interval: string;
  };
  trial: {
    active: boolean;
    startsAt: string;
    endsAt: string;
    daysRemaining: number;
  };
  scope: "organisation" | "branch";
  canPay: boolean;
  branches: Array<{
    branchId: string;
    branchName: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    graceEndsAt: string | null;
    lockedAt: string | null;
    daysUntilPeriodEnd: number | null;
    daysUntilGraceEnd: number | null;
    canCheckout: boolean;
    reminder: string | null;
  }>;
  reminders: string[];
};

type CheckoutResponse = {
  redirectUrl: string;
};

const TRIAL_FEATURES = [
  "Full access for your first month",
  "Covers every branch you open",
  "No payment required yet",
];

const PRO_FEATURES = [
  "Everything in your free trial",
  "One branch, fully unlocked",
  "Pay by mobile money or card",
];

const BRANCH_FEATURES = [
  "Subscribe only where you operate",
  "Other branches stay open if one lapses",
  "Renew anytime from this page",
];

function authHeaders(session: RembehSession) {
  return {
    Authorization: `${session.tokenType} ${session.accessToken}`,
  };
}

/** Never surface provider/backend wording to end users. */
function friendlyError(raw: unknown): string {
  const text =
    raw instanceof Error
      ? raw.message
      : typeof raw === "string"
        ? raw
        : formatApiError(raw as string | string[] | undefined);
  const lower = text.toLowerCase();
  if (
    !text.trim() ||
    lower.includes("internal") ||
    lower.includes("server") ||
    lower.includes("exception") ||
    lower.includes("pesapal") ||
    lower.includes("prisma") ||
    lower.includes("nest") ||
    lower.includes("stack") ||
    lower.includes("econn") ||
    lower.includes("timeout") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  ) {
    return "We couldn’t complete that. Please try again.";
  }
  if (text.length > 140) {
    return "We couldn’t complete that. Please try again.";
  }
  return text;
}

function statusCopy(
  row: BillingSummary["branches"][number],
  trialActive: boolean,
) {
  if (trialActive && row.status === "TRIAL") {
    return {
      label: "Free trial",
      tone: "good" as const,
      detail: "Paid time starts after the trial",
    };
  }
  switch (row.status) {
    case "ACTIVE":
      return {
        label: "Active",
        tone: "good" as const,
        detail: row.currentPeriodEnd
          ? `Renews ${formatDate(row.currentPeriodEnd)}`
          : null,
      };
    case "GRACE":
    case "PAST_DUE":
      return {
        label: "Renew soon",
        tone: "warn" as const,
        detail:
          row.daysUntilGraceEnd != null
            ? `${Math.max(0, row.daysUntilGraceEnd)}d left`
            : "Renew to keep open",
      };
    case "LOCKED":
      return {
        label: "Paused",
        tone: "bad" as const,
        detail: "Renew to reopen",
      };
    case "TRIAL":
      return { label: "Free trial", tone: "good" as const, detail: null };
    default:
      return { label: "—", tone: "muted" as const, detail: null };
  }
}

function actionLabel(
  row: BillingSummary["branches"][number],
  trialActive: boolean,
) {
  if (!row.canCheckout) return null;
  if (row.status === "LOCKED" || row.status === "GRACE" || row.status === "PAST_DUE") {
    return "Renew";
  }
  if (row.status === "ACTIVE") return "Extend";
  if (row.status === "TRIAL") return trialActive ? "Subscribe" : "Subscribe";
  return "Subscribe";
}

export function SubscriptionWorkspace({
  mode,
}: {
  mode: "owner" | "manager";
}) {
  return (
    <Suspense fallback={<AppBootSkeleton />}>
      <SubscriptionWorkspaceContent mode={mode} />
    </Suspense>
  );
}

function SubscriptionWorkspaceContent({
  mode,
}: {
  mode: "owner" | "manager";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingBranchId, setPayingBranchId] = useState<string | null>(null);
  const paid = searchParams.get("paid") === "1";
  const nextPath = mode === "owner" ? "/owner/subscription" : "/subscription";

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      if (!auth.session || isSessionExpired(auth.session)) {
        clearAuthState();
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }
      const role = resolveOperatorRole(auth.session, auth.user);
      if (mode === "owner" && role !== "owner") {
        router.replace(role === "manager" ? "/subscription" : "/dashboard");
        return;
      }
      if (mode === "manager" && role === "owner") {
        const qs = searchParams.toString();
        router.replace(
          qs ? `/owner/subscription?${qs}` : "/owner/subscription",
        );
        return;
      }
      if (mode === "manager" && role !== "manager") {
        router.replace("/dashboard");
        return;
      }
      setSession(auth.session);
      setWorkspace(auth.workspace);
      setUser(auth.user);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(boot);
  }, [mode, nextPath, router, searchParams]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/billing/summary`, {
        headers: authHeaders(session),
      });
      const payload = await readApiJson<
        BillingSummary & { message?: string | string[] }
      >(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setSummary(payload);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!ready || !session) return;
    void load();
  }, [ready, session, load]);

  useEffect(() => {
    if (!paid || !session) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [paid, session, load]);

  const visibleBranches = useMemo(() => {
    if (!summary) return [];
    const q = search.trim().toLowerCase();
    if (!q) return summary.branches;
    return summary.branches.filter((row) =>
      row.branchName.toLowerCase().includes(q),
    );
  }, [summary, search]);

  async function startCheckout(branchId: string) {
    if (!session) return;
    setPayingBranchId(branchId);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/billing/branches/${branchId}/checkout`,
        {
          method: "POST",
          headers: {
            ...authHeaders(session),
            "Content-Type": "application/json",
          },
        },
      );
      const payload = await readApiJson<
        CheckoutResponse & { message?: string | string[] }
      >(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      if (!payload.redirectUrl) {
        throw new Error("unavailable");
      }
      window.location.assign(payload.redirectUrl);
    } catch (err) {
      setError(friendlyError(err));
      setPayingBranchId(null);
    }
  }

  function scrollToBranches() {
    document
      .getElementById("your-branches")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!ready || !session || !workspace || !user) {
    return <AppBootSkeleton />;
  }

  const amount = summary?.plan.amount ?? 100_000;
  const currency = summary?.plan.currency ?? "UGX";
  const isBranchScope = summary?.scope === "branch" || mode === "manager";
  const priceLabel = formatMoney(amount, currency);

  return (
    <AppShell session={session} workspace={workspace} user={user}>
      <div className="mx-auto max-w-6xl space-y-3 px-1 pb-6 sm:px-2">
        <OwnerHeader
          title="Subscription"
          subtitle={
            isBranchScope
              ? "Your branch plan."
              : "Plans for every branch."
          }
          search={search}
          onSearchChange={setSearch}
          showSearch={
            !isBranchScope && Boolean(summary && summary.branches.length > 5)
          }
          showReportsButton={mode === "owner"}
          searchPlaceholder="Find a branch…"
          settingsHref={mode === "owner" ? "/owner/settings" : "/settings"}
          reportsHref={mode === "owner" ? "/owner/reports" : "/reports"}
          notificationScope={mode === "owner" ? "owner" : "manager"}
        />

        {paid ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950">
            Payment received. Updating your plan…
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-950">
            {error}
          </p>
        ) : null}

        <section className="relative overflow-hidden rounded-2xl bg-[#04140f] px-4 py-5 text-white shadow-[0_18px_48px_rgba(0,30,24,0.22)] sm:px-6 sm:py-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 70% 50% at 90% 0%, rgba(57,255,136,0.16), transparent 55%)",
            }}
          />

          <div className="relative flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.35rem,2.5vw,1.75rem)] leading-tight tracking-[-0.02em]">
                Choose your plan.
              </h2>
              <p className="mt-1 text-xs text-white/65 sm:text-sm">
                Free trial first, then Pro per branch each month.
              </p>
            </div>
            {summary?.trial.active ? (
              <p className="rounded-full border border-[#39ff88]/30 bg-[#39ff88]/10 px-3 py-1 text-[11px] font-semibold text-[#7dffb5]">
                Trial · {summary.trial.daysRemaining}d left
              </p>
            ) : null}
          </div>

          {loading && !summary ? (
            <div className="relative mt-6 flex justify-center text-sm text-white/60">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
              <PlanCard
                name="Trial"
                priceLabel="Free"
                features={TRIAL_FEATURES}
                accent={summary?.trial.active ? "active" : "default"}
              />
              <PlanCard
                name="Pro"
                priceLabel={priceLabel}
                priceHint="/ branch / month"
                features={PRO_FEATURES}
                featured
                ctaLabel="Branches"
                onCta={scrollToBranches}
              />
              <PlanCard
                name="Branches"
                priceLabel="Flexible"
                features={BRANCH_FEATURES}
              />
            </div>
          )}
        </section>

        <section
          id="your-branches"
          className="scroll-mt-4 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.04)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
            <div>
              <h3 className="text-sm font-semibold text-[#070b18]">
                {isBranchScope ? "Your branch" : "Branches"}
              </h3>
              <p className="text-xs text-slate-500">
                {isBranchScope
                  ? "Current plan — renew here."
                  : "Current plan for each location."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="size-3" />
              Refresh
            </button>
          </div>

          <div className="px-3 py-3 sm:px-4">
            {loading && !summary ? (
              <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </div>
            ) : null}

            {summary && visibleBranches.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                {summary.branches.length === 0
                  ? isBranchScope
                    ? "No branch assigned yet."
                    : "Add a branch to manage plans."
                  : "No branches match that search."}
              </p>
            ) : null}

            {summary && visibleBranches.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f0f4f6] text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Branch</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="hidden px-3 py-2 font-semibold sm:table-cell">
                        Renews
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)] bg-white">
                    {visibleBranches.map((row) => {
                      const copy = statusCopy(row, summary.trial.active);
                      const label = actionLabel(row, summary.trial.active);
                      const paying = payingBranchId === row.branchId;
                      return (
                        <tr key={row.branchId} className="align-middle">
                          <td className="px-3 py-2.5">
                            <p className="text-[13px] font-semibold text-[#070b18]">
                              {row.branchName}
                            </p>
                            <p className="text-[11px] text-slate-500 sm:hidden">
                              {copy.detail ?? priceLabel}
                            </p>
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusPill tone={copy.tone} label={copy.label} />
                          </td>
                          <td className="hidden px-3 py-2.5 text-xs text-slate-600 sm:table-cell">
                            {copy.detail ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {label ? (
                              <button
                                type="button"
                                disabled={paying}
                                onClick={() => void startCheckout(row.branchId)}
                                className="inline-flex h-8 min-w-[5.75rem] items-center justify-center gap-1 rounded-full bg-[#003f35] px-3 text-[11px] font-semibold text-white hover:bg-[#025144] disabled:opacity-70"
                              >
                                {paying ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : null}
                                {paying ? "…" : label}
                              </button>
                            ) : (
                              <span className="text-[11px] font-medium text-emerald-700">
                                Included
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function PlanCard({
  name,
  priceLabel,
  priceHint,
  features,
  featured,
  accent,
  ctaLabel,
  onCta,
}: {
  name: string;
  priceLabel: string;
  priceHint?: string;
  features: string[];
  featured?: boolean;
  accent?: "default" | "active";
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <article
      className={`relative flex flex-col rounded-xl border px-4 py-4 ${
        featured
          ? "border-[#39ff88]/65 bg-[#061a14] sm:-translate-y-1"
          : accent === "active"
            ? "border-[#39ff88]/40 bg-black/25"
            : "border-[#39ff88]/22 bg-black/20"
      }`}
    >
      {featured ? (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#39ff88] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#04140f]">
          Recommended
        </span>
      ) : null}

      <h3 className="font-[family-name:var(--font-display)] text-xl leading-none tracking-[-0.02em]">
        {name}
        <span className="text-[#39ff88]">.</span>
      </h3>
      <div className="mt-2 h-px w-full bg-[#39ff88]/20" />
      <p className="mt-3 font-[family-name:var(--font-display)] text-[1.35rem] leading-none tracking-[-0.03em]">
        {priceLabel}
      </p>
      {priceHint ? (
        <p className="mt-1 text-[10px] font-medium text-white/50">{priceHint}</p>
      ) : (
        <p className="mt-1 text-[10px] text-transparent">.</p>
      )}

      <ul className="mt-3 space-y-1.5">
        {features.map((item) => (
          <li
            key={item}
            className="flex gap-1.5 text-[11px] leading-snug text-white/75"
          >
            <Check
              className="mt-0.5 size-3.5 shrink-0 text-[#39ff88]"
              strokeWidth={2.75}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {ctaLabel && onCta ? (
        <button
          type="button"
          onClick={onCta}
          className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-full border border-[#39ff88] text-xs font-semibold text-white transition hover:bg-[#39ff88]/12"
        >
          {ctaLabel}
        </button>
      ) : null}
    </article>
  );
}

function StatusPill({
  tone,
  label,
}: {
  tone: "good" | "warn" | "bad" | "muted";
  label: string;
}) {
  const styles = {
    good: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    warn: "bg-amber-50 text-amber-900 ring-amber-200",
    bad: "bg-rose-50 text-rose-800 ring-rose-200",
    muted: "bg-slate-50 text-slate-600 ring-slate-200",
  }[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${styles}`}
    >
      {tone === "bad" ? <Lock className="size-2.5" /> : null}
      {label}
    </span>
  );
}
