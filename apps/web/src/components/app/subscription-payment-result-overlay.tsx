"use client";

import { type ReactNode } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileX2,
  ReceiptText,
  X,
  XCircle,
} from "lucide-react";
import { formatDate } from "../../app/owner/owner-common";

export type SubscriptionBillingPlanOption = {
  code: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
  durationMonths: number;
  label: string;
  tagline: string;
  compareAtAmount: number | null;
  savingsAmount: number | null;
  badge: "MOST_POPULAR" | "BEST_VALUE" | null;
  defaultSelected: boolean;
};

export type SubscriptionPaymentRow = {
  id: string;
  date: string;
  branchId: string;
  branchName: string;
  kind?: "subscription" | "sms";
  transaction: string;
  periodLabel: string | null;
  amount: number;
  currency: string;
  planCode?: string | null;
  planDurationMonths?: number | null;
  activeUntil?: string | null;
  transactionId?: string | null;
  verifiedAt?: string | null;
  verifiedByName?: string | null;
  failureReason?: string | null;
  credits?: number | null;
  paymentMethod: string;
  status: string;
  receipt: string | null;
  canRetry: boolean;
  canCancel?: boolean;
  bundleId?: string | null;
};

export type SubscriptionPaymentResultOverlayState = {
  kind: "success" | "failed";
  payment: SubscriptionPaymentRow;
  plan: SubscriptionBillingPlanOption;
};

export const FALLBACK_SUBSCRIPTION_PLANS: SubscriptionBillingPlanOption[] = [
  {
    code: "PRO",
    name: "Pro",
    amount: 255_000,
    currency: "UGX",
    interval: "MONTHLY",
    durationMonths: 1,
    label: "Monthly",
    tagline: "Maximum flexibility",
    compareAtAmount: null,
    savingsAmount: null,
    badge: null,
    defaultSelected: false,
  },
  {
    code: "PRO_3M",
    name: "Pro",
    amount: 725_000,
    currency: "UGX",
    interval: "THREE_MONTHS",
    durationMonths: 3,
    label: "3 months",
    tagline: "Most popular",
    compareAtAmount: 765_000,
    savingsAmount: 40_000,
    badge: "MOST_POPULAR",
    defaultSelected: true,
  },
  {
    code: "PRO_6M",
    name: "Pro",
    amount: 1_385_000,
    currency: "UGX",
    interval: "SIX_MONTHS",
    durationMonths: 6,
    label: "6 months",
    tagline: "Best value",
    compareAtAmount: 1_530_000,
    savingsAmount: 145_000,
    badge: "BEST_VALUE",
    defaultSelected: false,
  },
];

const PAYMENT_RESULT_SEEN_KEY = "rembeh.subscriptionPaymentResults.seen";

export function isManualSubscriptionPayment(row: SubscriptionPaymentRow) {
  if ((row.kind ?? "subscription") === "sms") return false;
  const method = row.paymentMethod.toLowerCase();
  return Boolean(
    row.transactionId &&
    (row.canCancel ||
      row.canRetry ||
      row.verifiedAt ||
      row.failureReason ||
      method.includes("mtn") ||
      method.includes("momo") ||
      method.includes("airtel")),
  );
}

export function planForSubscriptionPaymentRow(
  row: SubscriptionPaymentRow,
  plans: SubscriptionBillingPlanOption[],
  fallback: SubscriptionBillingPlanOption,
) {
  const match =
    plans.find((plan) => row.planCode && plan.code === row.planCode) ??
    plans.find(
      (plan) =>
        plan.durationMonths === row.planDurationMonths &&
        plan.amount === row.amount,
    ) ??
    plans.find((plan) => plan.amount === row.amount) ??
    fallback;

  return {
    ...match,
    amount: row.amount,
    currency: row.currency,
    durationMonths: row.planDurationMonths ?? match.durationMonths,
  };
}

export function hasSeenSubscriptionPaymentResult(paymentId: string) {
  return readSeenPaymentResults().has(paymentId);
}

export function markSubscriptionPaymentResultSeen(paymentId: string) {
  if (typeof window === "undefined") return;
  const seen = readSeenPaymentResults();
  seen.add(paymentId);
  const values = [...seen].slice(-100);
  window.localStorage.setItem(PAYMENT_RESULT_SEEN_KEY, JSON.stringify(values));
}

function readSeenPaymentResults() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(PAYMENT_RESULT_SEEN_KEY);
    const values = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(
      Array.isArray(values)
        ? values.filter(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          )
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

function paymentPeriodLabel(plan: SubscriptionBillingPlanOption) {
  if (plan.durationMonths === 1) return "Monthly Subscription";
  return `${plan.durationMonths}-Month Subscription`;
}

function paymentPlanAccessCopy(plan: SubscriptionBillingPlanOption) {
  const unit = plan.durationMonths === 1 ? "month" : "months";
  return `Access all Rembeh features for ${plan.durationMonths} ${unit}`;
}

function daysRemainingUntil(value: string | null | undefined) {
  if (!value) return null;
  const end = Date.parse(value);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
}

function formatPaymentSubmittedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(/\b(am|pm)\b/gi, (match) => match.toUpperCase());
}

export function SubscriptionPaymentResultOverlay({
  result,
  onClose,
  onTryAgain,
}: {
  result: SubscriptionPaymentResultOverlayState;
  onClose: () => void;
  onTryAgain: () => void;
}) {
  return (
    <PaymentOverlay onClose={onClose}>
      {result.kind === "success" ? (
        <SubscriptionActivatedPanel result={result} onClose={onClose} />
      ) : (
        <PaymentFailedPanel
          result={result}
          onClose={onClose}
          onTryAgain={onTryAgain}
        />
      )}
    </PaymentOverlay>
  );
}

function PaymentOverlay({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#020617]/55 px-3 py-6 backdrop-blur-[2px] sm:px-6 sm:py-10">
      <button
        type="button"
        className="fixed inset-0 h-full w-full cursor-default"
        aria-label="Close payment dialog"
        onClick={onClose}
      />
      <div className="relative mx-auto w-full max-w-[40rem]">{children}</div>
    </div>
  );
}

function SubmittedPaymentRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`grid gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center ${
        last ? "" : "border-b border-[#edf1f5]"
      }`}
    >
      <div className="flex items-center gap-4 text-left">
        <span className="text-slate-500">{icon}</span>
        <span className="text-base font-semibold text-[#070b18]">{label}</span>
      </div>
      <div className="text-left text-base font-medium text-[#070b18] sm:text-right">
        {value}
      </div>
    </div>
  );
}

function SubscriptionActivatedPanel({
  result,
  onClose,
}: {
  result: SubscriptionPaymentResultOverlayState;
  onClose: () => void;
}) {
  const { payment, plan } = result;
  const verifiedAt = payment.verifiedAt ?? payment.date;
  const activeUntil = payment.activeUntil ?? null;
  const remaining = activeUntil ? daysRemainingUntil(activeUntil) : null;

  return (
    <section className="relative rounded-2xl bg-white px-8 py-9 shadow-[0_26px_90px_rgba(15,23,42,0.32)]">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-5 top-5 grid size-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-[#070b18]"
      >
        <X className="size-6" />
      </button>

      <div className="text-center">
        <div className="relative mx-auto grid size-[92px] place-items-center rounded-full bg-[#e9f8ef] text-[#07885f]">
          <CheckCircle2 className="size-14" strokeWidth={2.25} />
          <span className="absolute left-0 top-8 size-1.5 rounded-full bg-[#b7ead1]" />
          <span className="absolute right-3 top-2 size-1.5 rounded-full bg-[#b7ead1]" />
          <span className="absolute bottom-5 right-0 size-2 rounded-full bg-[#f1c84b]" />
        </div>
        <h2 className="mt-6 text-[1.85rem] font-bold tracking-normal text-[#070b18]">
          Subscription activated!
        </h2>
        <p className="mx-auto mt-4 max-w-[24rem] text-base leading-7 text-slate-600">
          Your payment has been verified and your subscription is now active.
        </p>
      </div>

      <div className="mt-7 rounded-lg border border-[#dfece5] bg-[#f4fbf7] p-5">
        <div className="flex gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#dff5e8] text-[#07885f]">
            <CalendarDays className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-[#070b18]">
                {paymentPeriodLabel(plan)}
              </h3>
              <span className="rounded-md bg-[#e6f8ed] px-2 py-1 text-sm font-bold text-[#07885f]">
                Active
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {paymentPlanAccessCopy(plan)}
            </p>
            <div className="mt-4 border-t border-[#dfebe5] pt-4">
              <p className="text-sm text-slate-600">Active until</p>
              <p className="mt-1 text-lg font-bold text-[#07885f]">
                {activeUntil ? formatDate(activeUntil) : "Active"}
              </p>
              {remaining !== null ? (
                <p className="mt-1 text-sm font-medium text-[#070b18]">
                  ({remaining} days remaining)
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-[#e6ebf0] bg-white px-5">
        <SubmittedPaymentRow
          icon={<CreditCard className="size-5" />}
          label="Payment method"
          value={payment.paymentMethod || "MTN MoMo"}
        />
        <SubmittedPaymentRow
          icon={<ReceiptText className="size-5" />}
          label="Transaction ID"
          value={payment.transactionId || payment.receipt || "-"}
        />
        <SubmittedPaymentRow
          icon={<Clock3 className="size-5" />}
          label="Verified on"
          value={formatPaymentSubmittedAt(verifiedAt)}
          last
        />
      </div>
    </section>
  );
}

function PaymentFailedPanel({
  result,
  onClose,
  onTryAgain,
}: {
  result: SubscriptionPaymentResultOverlayState;
  onClose: () => void;
  onTryAgain: () => void;
}) {
  const { payment, plan } = result;
  const transactionId = payment.transactionId || payment.receipt || "-";

  return (
    <section className="relative rounded-2xl bg-white px-8 py-9 shadow-[0_26px_90px_rgba(15,23,42,0.32)]">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-5 top-5 grid size-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-[#070b18]"
      >
        <X className="size-6" />
      </button>

      <div className="text-center">
        <div className="relative mx-auto grid size-[92px] place-items-center rounded-full bg-[#fde8ee] text-[#d72d3d]">
          <XCircle className="size-14" strokeWidth={2.25} />
          <span className="absolute left-1 top-8 size-1.5 rounded-full bg-[#fac6d1]" />
          <span className="absolute right-4 top-3 size-1.5 rounded-full bg-[#fac6d1]" />
          <span className="absolute bottom-5 right-1 size-1.5 rounded-full bg-[#fac6d1]" />
        </div>
        <h2 className="mt-6 text-[1.85rem] font-bold tracking-normal text-[#070b18]">
          Payment could not be verified
        </h2>
        <p className="mx-auto mt-4 max-w-[25rem] text-base leading-7 text-slate-600">
          We were unable to verify the payment submitted for your{" "}
          {paymentPeriodLabel(plan)}.
        </p>
      </div>

      <div className="mt-8 rounded-lg border border-[#f4d8de] bg-[#fff3f5] p-5">
        <div className="flex gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#fde0e8] text-[#d72d3d]">
            <FileX2 className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-600">Transaction ID</p>
            <p className="mt-2 text-xl font-bold text-[#070b18]">
              {transactionId}
            </p>
            <div className="mt-6 border-t border-[#f1d9de] pt-5">
              <p className="text-sm font-medium text-slate-600">Reason</p>
              <p className="mt-2 text-base font-bold text-[#d72d3d]">
                {payment.failureReason || "Transaction could not be found."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-[#e6ebf0] bg-white p-5">
        <div className="flex gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#fff3f5] text-[#d72d3d]">
            <AlertCircle className="size-5" />
          </span>
          <p className="text-base leading-7 text-[#070b18]">
            Check the transaction details and submit the correct transaction ID.
            If you believe this payment was made successfully, contact support.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onTryAgain}
          className="inline-flex h-12 items-center justify-center rounded-lg border border-[#07885f] bg-white text-lg font-bold text-[#07885f] transition hover:bg-[#f3faf6]"
        >
          Try again
        </button>
        <a
          href="tel:0777823011"
          className="inline-flex h-12 items-center justify-center rounded-lg bg-[#07885f] text-lg font-bold text-white shadow-[0_14px_26px_rgba(7,136,95,0.22)] transition hover:bg-[#067352]"
        >
          Contact support
        </a>
      </div>
    </section>
  );
}
