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
  "Loans, repayments, and reports",
  "Ideal while you set up",
];

const PRO_FEATURES = [
  "Everything in your free trial",
  "One branch, fully unlocked",
  "Loans, agents, and daily operations",
  "Pay by mobile money or card",
  "Built for growing branch teams",
];

const BRANCH_FEATURES = [
  "Subscribe only where you operate",
  "Other branches stay open if one lapses",
  "Two days to renew before a pause",
  "Owner or manager can renew",
  "Cancel or renew any time",
];

function authHeaders(session: RembehSession) {
  return {
    Authorization: `${session.tokenType} ${session.accessToken}`,
  };
}

function statusCopy(
  row: BillingSummary["branches"][number],
  trialActive: boolean,
) {
  if (trialActive && row.status === "TRIAL") {
    return {
      label: "Free trial",
      tone: "good" as const,
      detail: "Subscribe early — paid time starts after the trial",
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
            ? `${Math.max(0, row.daysUntilGraceEnd)} day${row.daysUntilGraceEnd === 1 ? "" : "s"} left`
            : "Renew to keep this branch open",
      };
    case "LOCKED":
      return {
        label: "Paused",
        tone: "bad" as const,
        detail: "Renew to reopen this branch",
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
  if (row.status === "LOCKED") return "Renew";
  if (row.status === "GRACE" || row.status === "PAST_DUE") return "Renew";
  if (row.status === "ACTIVE") return "Extend";
  if (row.status === "TRIAL") return trialActive ? "Subscribe early" : "Subscribe";
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
      setError(
        err instanceof Error
          ? err.message
          : "We couldn’t load subscription details.",
      );
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
        throw new Error("Payment page is unavailable right now. Try again.");
      }
      window.location.assign(payload.redirectUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn’t start payment. Please try again.",
      );
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

  const amount = summary?.plan.amount ?? 150_000;
  const currency = summary?.plan.currency ?? "UGX";
  const isBranchScope = summary?.scope === "branch" || mode === "manager";
  const priceLabel = formatMoney(amount, currency);

  return (
    <AppShell session={session} workspace={workspace} user={user}>
      <div className="mx-auto max-w-6xl space-y-5 px-1 pb-10 sm:px-2">
        <OwnerHeader
          title="Subscription"
          subtitle={
            isBranchScope
              ? "Your branch plan and renewal."
              : "Plans for every branch in your organisation."
          }
          search={search}
          onSearchChange={setSearch}
          showSearch={
            !isBranchScope && Boolean(summary && summary.branches.length > 4)
          }
          showReportsButton={mode === "owner"}
          searchPlaceholder="Find a branch…"
          settingsHref={mode === "owner" ? "/owner/settings" : "/settings"}
          reportsHref={mode === "owner" ? "/owner/reports" : "/reports"}
          notificationScope={mode === "owner" ? "owner" : "manager"}
        />

        {paid ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950">
            Payment received. We’re updating your plan now.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-950">
            {error}
          </p>
        ) : null}

        <section className="relative overflow-hidden rounded-[28px] bg-[#04140f] px-5 py-10 text-white shadow-[0_28px_80px_rgba(0,30,24,0.28)] sm:px-8 sm:py-12 lg:px-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 80% 55% at 90% -10%, rgba(57,255,136,0.18), transparent 55%), radial-gradient(ellipse 70% 50% at 0% 110%, rgba(15,138,108,0.22), transparent 50%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 top-4 h-52 w-72 opacity-25"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-18deg, transparent, transparent 14px, rgba(57,255,136,0.14) 14px, rgba(57,255,136,0.14) 15px)",
              maskImage:
                "radial-gradient(ellipse at center, black 20%, transparent 75%)",
            }}
          />

          <div className="relative mx-auto max-w-3xl text-center">
            <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.9rem,4vw,2.85rem)] font-medium leading-[1.1] tracking-[-0.02em] text-white">
              Choose the right plan.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/68 sm:text-[15px]">
              Start free, then keep each branch on Pro — billed monthly for the
              locations you run.
            </p>
            {summary?.trial.active ? (
              <p className="mt-5 inline-flex rounded-full border border-[#39ff88]/35 bg-[#39ff88]/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-[#7dffb5]">
                Free trial · {summary.trial.daysRemaining} day
                {summary.trial.daysRemaining === 1 ? "" : "s"} left
              </p>
            ) : (
              <p className="mt-5 inline-flex rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-wide text-white/70">
                Monthly · per branch
              </p>
            )}
          </div>

          {loading && !summary ? (
            <div className="relative mt-12 flex justify-center text-sm text-white/60">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading plans…
            </div>
          ) : (
            <div className="relative mx-auto mt-10 grid max-w-5xl items-end gap-5 lg:grid-cols-3">
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
                ctaLabel={isBranchScope ? "Subscribe below" : "See branches"}
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
          className="scroll-mt-6 overflow-hidden rounded-[24px] border border-[var(--line)] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.05)]"
        >
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] px-5 py-5 sm:px-7">
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.02em] text-[#070b18]">
                {isBranchScope ? "Your branch" : "Your branches"}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {isBranchScope
                  ? "Current plan for this location — you can renew here."
                  : "Current plan for each location. Subscribe or renew any branch."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </button>
          </div>

          <div className="px-5 py-5 sm:px-7 sm:pb-7">
            {loading && !summary ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </div>
            ) : null}

            {summary && visibleBranches.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                {summary.branches.length === 0
                  ? isBranchScope
                    ? "No branch is assigned to your account yet."
                    : "Add a branch to start managing plans."
                  : "No branches match that search."}
              </p>
            ) : null}

            {summary && visibleBranches.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f0f4f6] text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Branch</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="hidden px-4 py-3 font-semibold md:table-cell">
                        Renews
                      </th>
                      <th className="hidden px-4 py-3 font-semibold sm:table-cell">
                        Plan
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
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
                        <tr
                          key={row.branchId}
                          className="align-middle transition hover:bg-[#f8fafb]"
                        >
                          <td className="px-4 py-4">
                            <p className="font-semibold text-[#070b18]">
                              {row.branchName}
                            </p>
                            {copy.detail ? (
                              <p className="mt-0.5 text-xs text-slate-500 md:hidden">
                                {copy.detail}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <StatusPill tone={copy.tone} label={copy.label} />
                          </td>
                          <td className="hidden px-4 py-4 text-slate-600 md:table-cell">
                            {copy.detail ?? "—"}
                          </td>
                          <td className="hidden px-4 py-4 text-slate-600 sm:table-cell">
                            {priceLabel}
                            <span className="text-slate-400"> / mo</span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            {label ? (
                              <button
                                type="button"
                                disabled={paying}
                                onClick={() => void startCheckout(row.branchId)}
                                className="inline-flex h-10 min-w-[8rem] items-center justify-center gap-1.5 rounded-full border border-[#003f35] bg-[#003f35] px-4 text-xs font-semibold text-white transition hover:bg-[#025144] disabled:opacity-70"
                              >
                                {paying ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : null}
                                {paying ? "Opening…" : label}
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-emerald-700">
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
      className={`relative flex flex-col rounded-[22px] border px-6 py-7 ${
        featured
          ? "border-[#39ff88]/70 bg-[#061a14] shadow-[0_24px_60px_rgba(0,0,0,0.35)] lg:-translate-y-3 lg:py-9"
          : accent === "active"
            ? "border-[#39ff88]/45 bg-black/25"
            : "border-[#39ff88]/28 bg-black/20"
      }`}
    >
      {featured ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#39ff88] px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#04140f]">
          Recommended
        </span>
      ) : null}

      <h3 className="font-[family-name:var(--font-display)] text-[1.65rem] leading-none tracking-[-0.02em] text-white">
        {name}
        <span className="text-[#39ff88]">.</span>
      </h3>
      <div className="mt-3 h-px w-full bg-[#39ff88]/25" />

      <div className="mt-5">
        <p className="font-[family-name:var(--font-display)] text-[clamp(1.7rem,2.8vw,2.25rem)] leading-none tracking-[-0.03em] text-white">
          {priceLabel}
        </p>
        {priceHint ? (
          <p className="mt-2 text-xs font-medium text-white/55">{priceHint}</p>
        ) : (
          <p className="mt-2 text-xs font-medium text-transparent">.</p>
        )}
      </div>

      <ul className="mt-6 flex-1 space-y-3">
        {features.map((item) => (
          <li
            key={item}
            className="flex gap-2.5 text-[13px] leading-snug text-white/78"
          >
            <Check
              className="mt-0.5 size-4 shrink-0 text-[#39ff88]"
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
          className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-full border border-[#39ff88] bg-transparent text-sm font-semibold text-white transition hover:bg-[#39ff88]/12"
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
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${styles}`}
    >
      {tone === "bad" ? <Lock className="size-3" /> : null}
      {label}
    </span>
  );
}
