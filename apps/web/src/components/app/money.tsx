import type { ReactNode } from "react";
import { formatMoneyAmount } from "../../app/owner/owner-common";

type MoneyProps = {
  value: number | null | undefined;
  currency?: string;
  /** Prefixed sign like "+" or "−" before the currency. */
  sign?: string;
  className?: string;
  currencyClassName?: string;
  amountClassName?: string;
  /** Appended after the amount, e.g. " all time". */
  suffix?: ReactNode;
};

/**
 * Consistent money display: small muted currency code + truncating amount.
 * Use this in UI. Keep `formatMoney()` for plain-string contexts (exports, toasts).
 */
export function Money({
  value,
  currency = "UGX",
  sign,
  className = "",
  currencyClassName = "",
  amountClassName = "",
  suffix,
}: MoneyProps) {
  const amount = formatMoneyAmount(value);

  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-baseline gap-1 tabular-nums ${className}`}
    >
      {sign ? (
        <span className="shrink-0 font-semibold text-inherit">{sign}</span>
      ) : null}
      <span
        className={`shrink-0 text-[0.72em] font-semibold uppercase tracking-[0.04em] text-slate-500 ${currencyClassName}`}
      >
        {currency}
      </span>
      <span className={`min-w-0 truncate ${amountClassName}`}>{amount}</span>
      {suffix ? (
        <span className="shrink-0 text-[0.85em] font-medium text-slate-500">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
