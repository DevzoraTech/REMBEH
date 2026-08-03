"use client";

import {
  ArrowRightCircle,
  Building2,
  CalendarDays,
  ChevronDown,
  Clock3,
  CreditCard,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiBaseUrl, readApiJson } from "../../lib/api";
import { readAuthState } from "../../lib/auth-session";

type BranchBillingStatus = {
  branchId: string | null;
  branchName: string | null;
  status: string | null;
  locked: boolean;
  graceEndsAt: string | null;
  currentPeriodEnd: string | null;
  daysUntilGraceEnd: number | null;
  daysUntilPeriodEnd: number | null;
  trialDaysRemaining: number | null;
  trialEndsAt: string | null;
  message: string | null;
};

function formatShortDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function planLabel(status: string | null, trialDays: number | null) {
  if (status === "TRIAL" || (trialDays != null && trialDays > 0 && status !== "ACTIVE")) {
    return "Free Trial";
  }
  switch (status) {
    case "ACTIVE":
      return "Pro";
    case "GRACE":
    case "PAST_DUE":
      return "Grace period";
    case "LOCKED":
      return "Paused";
    default:
      return status ? status : "Pro";
  }
}

function pillLabel(status: BranchBillingStatus | null) {
  if (!status) return null;
  const trialDays = status.trialDaysRemaining;
  if (status.status === "TRIAL" || (trialDays != null && trialDays > 0 && status.status !== "ACTIVE")) {
    return `Trial • ${trialDays ?? 0} day${(trialDays ?? 0) === 1 ? "" : "s"} left`;
  }
  if (status.status === "GRACE" || status.status === "PAST_DUE") {
    const days = status.daysUntilGraceEnd ?? 0;
    return `Grace • ${days} day${days === 1 ? "" : "s"} left`;
  }
  if (status.status === "LOCKED") return "Paused";
  if (status.status === "ACTIVE") {
    const days = status.daysUntilPeriodEnd;
    if (days != null && days >= 0) {
      return `Pro • ${days} day${days === 1 ? "" : "s"} left`;
    }
    return "Pro";
  }
  return null;
}

function nextStepCopy(status: BranchBillingStatus) {
  if (status.locked || status.status === "LOCKED") {
    return "Renew to reopen this branch";
  }
  if (status.status === "GRACE" || status.status === "PAST_DUE") {
    return "Renew before the branch is locked";
  }
  if (
    status.status === "TRIAL" ||
    (status.trialDaysRemaining != null && status.trialDaysRemaining > 0)
  ) {
    return "Subscribe before trial ends";
  }
  if (status.status === "ACTIVE") {
    return "Manage renewals and billing";
  }
  return "Open subscription";
}

export function BranchSubscriptionMenu({
  manageHref = "/subscription",
}: {
  manageHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [billing, setBilling] = useState<BranchBillingStatus | null>(null);
  const [fallbackBranchName, setFallbackBranchName] = useState("Your branch");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const { branch } = readAuthState();
    if (branch?.name?.trim()) {
      setFallbackBranchName(branch.name.trim());
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { session } = readAuthState();
      if (!session) return;
      try {
        const response = await fetch(`${apiBaseUrl}/billing/my-branch`, {
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
          },
        });
        const payload = await readApiJson<BranchBillingStatus>(response);
        if (cancelled || !response.ok) return;
        setBilling(payload);
      } catch {
        // Non-blocking header widget.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const branchName = billing?.branchName?.trim() || fallbackBranchName;
  const pill = pillLabel(billing);
  const plan = planLabel(billing?.status ?? null, billing?.trialDaysRemaining ?? null);
  const remainingDays =
    billing?.status === "ACTIVE"
      ? billing.daysUntilPeriodEnd
      : billing?.status === "GRACE" || billing?.status === "PAST_DUE"
        ? billing.daysUntilGraceEnd
        : billing?.trialDaysRemaining;
  const endsAt =
    billing?.status === "ACTIVE"
      ? billing.currentPeriodEnd
      : billing?.status === "GRACE" || billing?.status === "PAST_DUE"
        ? billing.graceEndsAt
        : billing?.trialEndsAt;
  const endsLabel =
    billing?.status === "ACTIVE"
      ? "Renews"
      : billing?.status === "GRACE" || billing?.status === "PAST_DUE"
        ? "Grace ends"
        : "Trial ends";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 max-w-[min(100vw-8rem,22rem)] items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:border-sky-200 hover:bg-sky-50/40"
      >
        <Building2 className="size-3.5 shrink-0 text-slate-500" />
        <span className="truncate text-xs font-semibold text-[#070b18]">
          {branchName}
        </span>
        {pill ? (
          <span className="hidden shrink-0 rounded-full bg-[#e8f1fb] px-2 py-0.5 text-[10px] font-semibold text-[#2b6cb0] sm:inline">
            {pill}
          </span>
        ) : null}
        <ChevronDown
          className={`size-3.5 shrink-0 text-slate-400 transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Branch subscription"
          className="absolute right-0 top-[calc(100%+10px)] z-40 w-[min(calc(100vw-1.5rem),320px)] overflow-hidden rounded-2xl border border-[#e4ece8] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
        >
          <div className="flex items-start gap-3 border-b border-[#edf2ef] px-4 py-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e8f1fb] text-[#2b6cb0]">
              <Building2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#0b1220]">
                {branchName}
              </p>
              <span className="mt-1 inline-flex rounded-full bg-[#e8f1fb] px-2 py-0.5 text-[10px] font-semibold text-[#2b6cb0]">
                {plan}
              </span>
            </div>
          </div>

          <div className="space-y-3 px-4 py-3.5 text-xs">
            <DetailRow
              icon={<CreditCard className="size-3.5" />}
              label="Current plan"
              value={plan}
            />
            <DetailRow
              icon={<Clock3 className="size-3.5" />}
              label="Time remaining"
              value={
                remainingDays == null
                  ? "—"
                  : `${remainingDays} day${remainingDays === 1 ? "" : "s"}`
              }
              valueClassName="font-semibold text-[#2b6cb0]"
            />
            <DetailRow
              icon={<CalendarDays className="size-3.5" />}
              label={endsLabel}
              value={formatShortDate(endsAt ?? null)}
            />
            <DetailRow
              icon={<ArrowRightCircle className="size-3.5" />}
              label="Next step"
              value={billing ? nextStepCopy(billing) : "Open subscription"}
            />
          </div>

          <div className="border-t border-[#edf2ef] px-3 py-3">
            <Link
              href={manageHref}
              onClick={() => setOpen(false)}
              className="flex h-10 w-full items-center justify-center rounded-xl bg-[#2b6cb0] text-xs font-semibold text-white shadow-[0_12px_24px_rgba(43,108,176,0.25)] transition hover:bg-[#245a94]"
            >
              Manage subscription
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  valueClassName = "font-semibold text-[#0b1220]",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-slate-500">
        <span className="text-slate-400">{icon}</span>
        {label}
      </span>
      <span className={`max-w-[55%] text-right ${valueClassName}`}>{value}</span>
    </div>
  );
}
