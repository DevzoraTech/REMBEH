"use client";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  FileText,
  Loader2,
  MessageSquareText,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";

type SmsNotificationSettings = {
  enabled: boolean;
  loanRecordedEnabled: boolean;
  paymentConfirmationEnabled: boolean;
  paymentReminderEnabled: boolean;
  overdueNoticeEnabled: boolean;
  templates: {
    loanRecorded: string;
    paymentConfirmation: string;
    paymentReminder: string;
    overdueNotice: string;
  };
  updatedAt: string | null;
};

type Props = {
  session: RembehSession;
  canEdit: boolean;
};

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
        checked ? "bg-[#0a6b55]" : "bg-slate-300"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block size-5 rounded-full bg-white shadow transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function SmsNotificationSettingsPanel({ session, canEdit }: Props) {
  const [settings, setSettings] = useState<SmsNotificationSettings | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/sms-credits/notification-settings`,
        {
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
          },
        },
      );
      const payload = await readApiJson<
        SmsNotificationSettings & { message?: string | string[] }
      >(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setSettings(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load SMS settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [session.accessToken, session.tokenType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(
    key: keyof Omit<SmsNotificationSettings, "templates" | "updatedAt">,
    value: boolean,
  ) {
    if (!settings || !canEdit) return;
    setSavingKey(key);
    setError(null);
    setNotice(null);
    const previous = settings;
    setSettings({ ...settings, [key]: value });
    try {
      const response = await fetch(
        `${apiBaseUrl}/sms-credits/notification-settings`,
        {
          method: "PATCH",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ [key]: value }),
        },
      );
      const payload = await readApiJson<
        SmsNotificationSettings & { message?: string | string[] }
      >(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setSettings(payload);
      setNotice("SMS settings saved.");
    } catch (caught) {
      setSettings(previous);
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save SMS settings.",
      );
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm font-medium text-slate-500">
        <Loader2 className="size-4 animate-spin" />
        Loading SMS settings…
      </div>
    );
  }

  if (!settings) {
    return (
      <p className="py-6 text-sm font-medium text-red-600">
        {error ?? "SMS settings unavailable."}
      </p>
    );
  }

  const cards = [
    {
      key: "loanRecordedEnabled" as const,
      title: "Loan Recorded Notification",
      description: "Notify borrowers when their loan is recorded.",
      icon: FileText,
      iconClass: "bg-sky-50 text-sky-600",
      preview: settings.templates.loanRecorded,
    },
    {
      key: "paymentConfirmationEnabled" as const,
      title: "Payment Confirmation",
      description:
        "Confirm that a borrower's payment has been received and recorded.",
      icon: CheckCircle2,
      iconClass: "bg-emerald-50 text-emerald-700",
      preview: settings.templates.paymentConfirmation,
    },
    {
      key: "paymentReminderEnabled" as const,
      title: "Payment Reminder",
      description: "Remind borrowers when a scheduled payment is due (≤3 days).",
      icon: Bell,
      iconClass: "bg-amber-50 text-amber-700",
      preview: settings.templates.paymentReminder,
    },
    {
      key: "overdueNoticeEnabled" as const,
      title: "Overdue Loan Notice",
      description:
        "Notify borrowers when a payment remains unpaid after its due date (≥4 days).",
      icon: AlertTriangle,
      iconClass: "bg-rose-50 text-rose-600",
      preview: settings.templates.overdueNotice,
    },
  ];

  const masterOff = !settings.enabled;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-[-0.02em] text-[#0b1220]">
          SMS Notification Settings
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose which SMS notifications are sent to borrowers.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          {notice}
        </p>
      ) : null}

      <div className="flex items-center gap-3 rounded-2xl border border-[#e6ebf0] bg-white px-4 py-3.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
        <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-[#0a6b55]">
          <MessageSquareText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#0b1220]">
            Allow SMS Notifications
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Turn automated borrower SMS notifications on or off.
          </p>
        </div>
        <Toggle
          checked={settings.enabled}
          disabled={!canEdit || savingKey === "enabled"}
          label="Allow SMS Notifications"
          onChange={(next) => void patch("enabled", next)}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          const checked = settings[card.key];
          return (
            <article
              key={card.key}
              className={`rounded-2xl border border-[#e6ebf0] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] ${
                masterOff ? "opacity-70" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${card.iconClass}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#0b1220]">
                      {card.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {card.description}
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={checked && settings.enabled}
                  disabled={
                    !canEdit || masterOff || savingKey === card.key
                  }
                  label={card.title}
                  onChange={(next) => void patch(card.key, next)}
                />
              </div>
              <div className="mt-3 rounded-xl bg-[#f4f7f6] px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  Message preview
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                  {card.preview}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
