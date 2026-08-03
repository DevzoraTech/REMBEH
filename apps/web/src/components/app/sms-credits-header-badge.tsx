"use client";

import { MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiBaseUrl, readApiJson } from "../../lib/api";
import { readAuthState } from "../../lib/auth-session";
import { formatNumber } from "../../app/owner/owner-common";

type SmsBalance = {
  availableUnits?: number;
  creditsRemaining?: number;
  canSendSms: boolean;
  scope: "branch" | "account";
  branchId: string | null;
  branchName: string | null;
};

function toneForCredits(credits: number): {
  wrap: string;
  text: string;
  dot: string;
  label: string;
} {
  if (credits <= 0) {
    return {
      wrap: "border-red-200 bg-red-50 hover:bg-red-100/80",
      text: "text-red-700",
      dot: "bg-red-500",
      label: "No SMS credit left. Top up to resume borrower notifications.",
    };
  }
  if (credits < 5) {
    return {
      wrap: "border-red-200 bg-red-50 hover:bg-red-100/80",
      text: "text-red-700",
      dot: "bg-red-500",
      label: "SMS credit is critically low. Top up soon.",
    };
  }
  if (credits <= 20) {
    return {
      wrap: "border-orange-200 bg-orange-50 hover:bg-orange-100/70",
      text: "text-orange-800",
      dot: "bg-orange-500",
      label: "SMS credit is running low. Consider topping up.",
    };
  }
  return {
    wrap: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100/70",
    text: "text-emerald-800",
    dot: "bg-emerald-500",
    label: "SMS notifications credit available.",
  };
}

export function SmsCreditsHeaderBadge({
  manageHref,
}: {
  manageHref: string;
}) {
  const [balance, setBalance] = useState<SmsBalance | null>(null);

  const load = useCallback(async () => {
    const { session } = readAuthState();
    if (!session) return;
    try {
      const response = await fetch(`${apiBaseUrl}/sms-credits/balance`, {
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
        },
      });
      if (!response.ok) return;
      const payload = await readApiJson<SmsBalance>(response);
      setBalance(payload);
    } catch {
      // Badge is optional chrome; ignore load failures.
    }
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [load]);

  if (!balance) return null;

  const credits = Math.max(
    0,
    Math.floor(balance.availableUnits ?? balance.creditsRemaining ?? 0),
  );
  const tone = toneForCredits(credits);
  const scopeHint =
    balance.scope === "branch" && balance.branchName
      ? balance.branchName
      : "All branches";

  return (
    <Link
      href={manageHref}
      title={`${tone.label} (${scopeHint})`}
      aria-label={`${formatNumber(credits)} SMS available. ${tone.label}`}
      className={`inline-flex h-9 items-center gap-2 rounded-xl border px-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition ${tone.wrap}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
      <MessageSquareText className={`size-3.5 shrink-0 ${tone.text}`} />
      <span className={`text-xs font-semibold tabular-nums ${tone.text}`}>
        {formatNumber(credits)}
        <span className="ml-1 font-medium opacity-80">SMS</span>
      </span>
    </Link>
  );
}
