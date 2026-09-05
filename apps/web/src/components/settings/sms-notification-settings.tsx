"use client";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  FileText,
  Loader2,
  MessageSquareText,
  Phone,
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
  supportPhone: string | null;
  supportContact: {
    ownerName: string | null;
    ownerPhone: string | null;
    managerName: string | null;
    managerPhone: string | null;
    resolvedPhone: string;
    usingCustomPhone: boolean;
    canEditSource: boolean;
    canEditPhone: boolean;
    canLock: boolean;
  };
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
  const [phoneDraft, setPhoneDraft] = useState("");

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
      setPhoneDraft(
        payload.supportPhone?.trim() ||
          payload.supportContact.ownerPhone?.trim() ||
          "",
      );
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
    body: Record<string, boolean | string | null>,
    key = Object.keys(body)[0] ?? "save",
  ) {
    if (!settings || !canEdit) return;
    setSavingKey(key);
    setError(null);
    setNotice(null);
    const previous = settings;
    try {
      const response = await fetch(
        `${apiBaseUrl}/sms-credits/notification-settings`,
        {
          method: "PATCH",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      const payload = await readApiJson<
        SmsNotificationSettings & { message?: string | string[] }
      >(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setSettings(payload);
      setPhoneDraft(
        payload.supportPhone?.trim() ||
          payload.supportContact.ownerPhone?.trim() ||
          "",
      );
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

  async function saveSupportPhone(next: string | null) {
    await patch({ supportPhone: next }, "supportPhone");
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
  const canEditPhone = canEdit && settings.supportContact.canEditPhone;
  const ownerPhone = settings.supportContact.ownerPhone?.trim() || "";
  const phoneDirty =
    phoneDraft.trim() !==
    (settings.supportPhone?.trim() || ownerPhone);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-[-0.02em] text-[#0b1220]">
          SMS Notification Settings
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose which SMS notifications are sent to borrowers, and which
          number they should call for support.
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

      <div className="rounded-2xl border border-[#e6ebf0] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <Phone className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#0b1220]">
              Support number in client messages
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              This number is inserted into loan, payment, and reminder SMS.
              By default it uses the organisation owner&apos;s phone
              {ownerPhone ? ` (${ownerPhone})` : ""}.
            </p>
            <label
              htmlFor="sms-support-phone"
              className="mt-3 block text-[11px] font-semibold text-slate-600"
            >
              Number shown to clients
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input
                id="sms-support-phone"
                type="tel"
                inputMode="tel"
                value={phoneDraft}
                disabled={!canEditPhone || savingKey === "supportPhone"}
                onChange={(event) => setPhoneDraft(event.target.value)}
                placeholder={ownerPhone || "e.g. 07XX XXX XXX"}
                className="h-10 min-w-[220px] flex-1 rounded-xl border border-[#dfe5eb] bg-white px-3 text-sm font-semibold text-[#0b1220] outline-none focus:border-[#0a6b55] disabled:bg-slate-50 disabled:text-slate-400"
              />
              <button
                type="button"
                disabled={
                  !canEditPhone ||
                  !phoneDirty ||
                  savingKey === "supportPhone"
                }
                onClick={() => void saveSupportPhone(phoneDraft.trim() || null)}
                className="inline-flex h-10 items-center rounded-xl bg-[#0a6b55] px-3.5 text-xs font-bold text-white transition hover:bg-[#085c49] disabled:opacity-50"
              >
                {savingKey === "supportPhone" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  "Save number"
                )}
              </button>
              {settings.supportContact.usingCustomPhone ? (
                <button
                  type="button"
                  disabled={!canEditPhone || savingKey === "supportPhone"}
                  onClick={() => void saveSupportPhone(null)}
                  className="inline-flex h-10 items-center rounded-xl border border-[#dfe5eb] bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Use owner number
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] font-medium text-slate-500">
              Currently used:{" "}
              <span className="font-bold text-[#0b1220]">
                {settings.supportContact.resolvedPhone || "Not set"}
              </span>
              {settings.supportContact.usingCustomPhone
                ? " · custom"
                : " · owner default"}
            </p>
            {!canEditPhone ? (
              <p className="mt-2 text-[11px] font-medium text-amber-700">
                Only the organisation owner can change this number.
              </p>
            ) : null}
          </div>
        </div>
      </div>

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
          onChange={(next) => void patch({ enabled: next })}
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
                  onChange={(next) => void patch({ [card.key]: next })}
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
