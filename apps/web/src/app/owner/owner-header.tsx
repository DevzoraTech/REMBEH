"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  ChevronDown,
  ClipboardCheck,
  Folder,
  MessageCircleQuestion,
  Settings,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { BranchSubscriptionMenu } from "../../components/app/branch-subscription-menu";
import { SmsCreditsHeaderBadge } from "../../components/app/sms-credits-header-badge";
import { formatNumber } from "./owner-common";
import { useOwnerBranchScope } from "./owner-branch-scope";
import {
  useOwnerNotifications,
  type OwnerNotificationItem,
} from "./owner-notifications";
import { useTooltipsEnabled } from "./owner-tooltip-prefs";

export type { OwnerNotificationItem };

export function OwnerHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  showReportsButton = true,
  settingsHref = "/owner/settings",
  reportsHref = "/owner/reports",
  notificationScope = "owner",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** @deprecated Notifications are shared account-wide via OwnerHeader. */
  notifications?: OwnerNotificationItem[];
  actions?: ReactNode;
  showReportsButton?: boolean;
  settingsHref?: string;
  reportsHref?: string;
  notificationScope?: "owner" | "manager";
}) {
  const { items: notifications, loading: notificationsLoading } =
    useOwnerNotifications(notificationScope);
  const { enabled: tooltipsEnabled, setTooltipsEnabled } = useTooltipsEnabled();
  const branchScope = useOwnerBranchScope();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const smsManageHref =
    notificationScope === "manager"
      ? "/subscription?tab=sms"
      : "/owner/subscription?tab=sms";

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 pt-1">
        {subtitle ? (
          <p className="text-xs font-medium text-slate-600">{subtitle}</p>
        ) : eyebrow ? (
          <p className="text-xs font-semibold text-[var(--forest-emerald)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-0.5 text-[clamp(1.18rem,1.35vw,1.48rem)] font-bold leading-tight tracking-[-0.02em] text-[#070b18]">
          {title}
        </h1>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
        {notificationScope === "owner" && branchScope.branches.length > 0 ? (
          <label className="flex h-9 min-w-[180px] items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 text-xs font-semibold text-[#0b1220] shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
            <Building2 className="size-3.5 shrink-0 text-[var(--forest-emerald)]" />
            <select
              value={branchScope.selectedBranchId ?? ""}
              aria-label="Branch"
              onChange={(event) =>
                branchScope.setSelectedBranchId(event.target.value || null)
              }
              className="min-w-0 flex-1 appearance-none bg-transparent outline-none"
            >
              <option value="">All branches</option>
              {branchScope.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <SmsCreditsHeaderBadge manageHref={smsManageHref} />

        {notificationScope === "manager" ? (
          <BranchSubscriptionMenu manageHref="/subscription" />
        ) : null}

        <TooltipToggle
          enabled={tooltipsEnabled}
          onChange={setTooltipsEnabled}
        />

        <div ref={notificationsRef} className="relative">
          <Tooltip label="Open live notifications and items needing attention.">
            <button
              type="button"
              className="relative grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:border-emerald-200 hover:bg-emerald-50"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell className="size-4" />
              {notifications.length > 0 ? (
                <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#18a76f] text-[10px] font-semibold text-white">
                  {Math.min(notifications.length, 9)}
                </span>
              ) : null}
            </button>
          </Tooltip>
          <NotificationOverlay
            open={notificationsOpen}
            items={notifications}
            loading={notificationsLoading}
            onClose={() => setNotificationsOpen(false)}
            scope={notificationScope}
          />
        </div>
        <Tooltip label="Open settings.">
          <Link
            href={settingsHref}
            className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:border-emerald-200 hover:bg-emerald-50"
            aria-label="Settings"
          >
            <Settings className="size-4" />
          </Link>
        </Tooltip>
        {showReportsButton ? (
          <Tooltip label="Open the report review page.">
            <Link
              href={reportsHref}
              className="flex h-9 items-center gap-2 rounded-xl bg-[#003f35] px-3.5 text-xs font-medium text-white shadow-[0_10px_20px_rgba(0,63,53,0.2)]"
            >
              Reports
              <ChevronDown className="size-4" />
            </Link>
          </Tooltip>
        ) : null}
        {actions}
      </div>
    </header>
  );
}

function TooltipToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Turn tooltips off" : "Turn tooltips on"}
      title={enabled ? "Tooltips on" : "Tooltips off"}
      onClick={() => onChange(!enabled)}
      className={`inline-flex h-9 items-center gap-2 rounded-xl border px-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition ${
        enabled
          ? "border-emerald-200 bg-emerald-50/80 text-[#013f35]"
          : "border-[#e6ebf0] bg-white text-slate-500 hover:border-slate-300"
      }`}
    >
      <MessageCircleQuestion
        className={`size-3.5 shrink-0 ${
          enabled ? "text-[var(--forest-emerald)]" : "text-slate-400"
        }`}
      />
      <span className="hidden text-[11px] font-semibold sm:inline">Tips</span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
          enabled ? "bg-[var(--forest-emerald)]" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function Tooltip({
  label,
  children,
  align = "center",
  block = false,
}: {
  label: string;
  children: ReactNode;
  align?: "left" | "center" | "right";
  block?: boolean;
}) {
  const { enabled } = useTooltipsEnabled();
  const alignClass = {
    left: "left-0",
    center: "left-1/2 -translate-x-1/2",
    right: "right-0",
  }[align];

  return (
    <span
      className={`group/tooltip relative min-w-0 ${block ? "flex w-full" : "inline-flex"}`}
    >
      {children}
      {enabled ? (
        <span
          className={`pointer-events-none absolute top-[calc(100%+8px)] z-50 max-w-[260px] whitespace-normal rounded-lg border border-[#dfe8e4] bg-[#071611] px-2.5 py-1.5 text-[11px] font-medium leading-4 text-white opacity-0 shadow-[0_14px_32px_rgba(7,22,17,0.24)] transition duration-150 group-hover/tooltip:translate-y-0 group-hover/tooltip:opacity-100 ${alignClass}`}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}

function NotificationOverlay({
  open,
  items,
  loading = false,
  onClose,
  scope = "owner",
}: {
  open: boolean;
  items: OwnerNotificationItem[];
  loading?: boolean;
  onClose: () => void;
  scope?: "owner" | "manager";
}) {
  return (
    <div
      className={`absolute right-0 top-[calc(100%+10px)] z-40 w-[min(calc(100vw-1.5rem),360px)] max-w-[calc(100vw-1.5rem)] origin-top-right overflow-hidden rounded-2xl border border-[#e4ece8] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] transition duration-200 ${
        open
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none -translate-y-2 scale-[0.98] opacity-0"
      }`}
    >
      <div className="flex items-center justify-between border-b border-[#edf2ef] px-4 py-3">
        <div>
          <p className="text-sm font-bold text-[#0b1220]">Notifications</p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            {scope === "manager"
              ? "Branch items needing attention"
              : "Account-wide items needing attention"}
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-[var(--forest-emerald)]">
          {formatNumber(items.length)}
        </span>
      </div>
      {loading ? (
        <div className="px-5 py-7 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-emerald-50 text-[var(--forest-emerald)]">
            <Bell className="size-5" />
          </span>
          <h3 className="mt-3 text-sm font-bold text-[#0b1220]">
            Loading notifications
          </h3>
          <p className="mx-auto mt-1 max-w-[250px] text-xs font-medium leading-5 text-slate-500">
            Checking the latest items that need attention.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-7 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-emerald-50 text-[var(--forest-emerald)]">
            <Bell className="size-5" />
          </span>
          <h3 className="mt-3 text-sm font-bold text-[#0b1220]">
            No notifications
          </h3>
          <p className="mx-auto mt-1 max-w-[250px] text-xs font-medium leading-5 text-slate-500">
            {scope === "manager"
              ? "Everything that needs your attention is clear right now."
              : "Everything that needs owner attention is clear right now."}
          </p>
        </div>
      ) : (
        <div className="scrollbar-none max-h-[min(380px,calc(100vh-180px))] overflow-y-auto overflow-x-hidden overscroll-contain p-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              onClick={onClose}
              className="flex w-full min-w-0 items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[#f7fbf9]"
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-xl ${
                  item.tone === "red"
                    ? "bg-red-50 text-red-600"
                    : item.tone === "gold"
                      ? "bg-orange-50 text-orange-600"
                      : item.tone === "blue"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-emerald-50 text-[var(--forest-emerald)]"
                }`}
              >
                {item.icon === "report" ? (
                  <ClipboardCheck className="size-4" />
                ) : item.icon === "loan" ? (
                  <Folder className="size-4" />
                ) : (
                  <AlertTriangle className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-[#111827]">
                  {item.title}
                </span>
                <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">
                  {item.detail}
                </span>
              </span>
              <span className="max-w-[54px] shrink-0 truncate text-right text-[10px] font-semibold text-slate-400">
                {item.time}
              </span>
            </Link>
          ))}
        </div>
      )}
      <div className="border-t border-[#edf2ef] bg-[#fbfdfc] px-3 py-2">
        <Link
          href="/owner/reports"
          onClick={onClose}
          className="flex h-9 min-w-0 items-center justify-center gap-2 rounded-xl bg-[#003f35] px-3 text-xs font-semibold text-white"
        >
          <span className="truncate">Open Reports</span>
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
