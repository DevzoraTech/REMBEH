"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Bell,
  Building2,
  FileText,
  HandCoins,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../../components/app/app-shell";
import { AppBootSkeleton } from "../../../components/app/skeleton";
import { LoanProductsManager } from "../../../components/settings/loan-products-manager";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import { ensureWebPushRegistration } from "../../../lib/push-notifications";
import {
  authHeaders,
  ownerFetch,
  useOwnerSession,
} from "../owner-common";
import { OwnerHeader } from "../owner-header";

type SettingsSection = "account" | "loan-products" | "notifications";

const SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  hint: string;
  icon: typeof UserRound;
}> = [
  {
    id: "account",
    label: "Account",
    hint: "Your business and profile",
    icon: UserRound,
  },
  {
    id: "loan-products",
    label: "Loan types",
    hint: "Rates, terms, fees, and fines",
    icon: FileText,
  },
  {
    id: "notifications",
    label: "Alerts",
    hint: "Get notified about reports",
    icon: Bell,
  },
];

function parseSection(value: string | null): SettingsSection {
  if (SECTIONS.some((item) => item.id === value)) {
    return value as SettingsSection;
  }
  return "account";
}

export default function OwnerSettingsPage() {
  return (
    <Suspense fallback={<AppBootSkeleton />}>
      <OwnerSettingsContent />
    </Suspense>
  );
}

function OwnerSettingsContent() {
  const state = useOwnerSession("/owner/settings");
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = parseSection(searchParams.get("section"));

  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [pushPermission, setPushPermission] = useState<string>("default");
  const [pushBusy, setPushBusy] = useState(false);

  const session = state.session;
  const workspace = state.workspace;
  const user = state.user;
  const canManageProducts = Boolean(
    session?.permissions.includes("loan.product.manage"),
  );

  const setSection = useCallback(
    (next: SettingsSection) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "account") params.delete("section");
      else params.set("section", next);
      const query = params.toString();
      router.replace(query ? `/owner/settings?${query}` : "/owner/settings");
      setNotice(null);
      setError(null);
    },
    [router, searchParams],
  );

  const loadBasics = useCallback(async () => {
    if (!session) return;
    try {
      const productsPayload = await ownerFetch<{
        templates?: Array<{ isActive?: boolean }>;
      }>(session, "/loan-products");
      setProductCount(
        (productsPayload.templates ?? []).filter((item) => item.isActive)
          .length,
      );
      if (typeof Notification !== "undefined") {
        setPushPermission(Notification.permission);
        if (Notification.permission === "granted") {
          // Re-sync FCM token quietly so Settings "test alert" works after
          // server/FCM recoveries (tokens can be disabled by failed sends).
          void ensureWebPushRegistration({ requestPermission: false });
        }
      }
    } catch {
      // Overview counts are optional; loan types section loads its own data.
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void loadBasics();
  }, [loadBasics, session]);

  const filteredSections = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return SECTIONS;
    return SECTIONS.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.hint.toLowerCase().includes(needle),
    );
  }, [search]);

  async function enablePush() {
    setPushBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await ensureWebPushRegistration({
        requestPermission: true,
      });
      setPushPermission(result.permission);
      if (result.permission !== "granted") {
        setError("Alerts were not enabled. You can try again anytime.");
        return;
      }
      if (!result.registered) {
        setError("Could not finish setting up alerts. Please try again.");
        return;
      }
      setNotice("Alerts are on for this browser.");
    } catch {
      setError("Could not enable alerts. Please try again.");
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestPush() {
    if (!session) return;
    setPushBusy(true);
    setError(null);
    setNotice(null);
    try {
      const registration = await ensureWebPushRegistration({
        requestPermission: false,
      });
      setPushPermission(registration.permission);
      if (registration.permission !== "granted" || !registration.registered) {
        setError(
          "This browser is not registered for alerts yet. Click Turn on alerts, then try again.",
        );
        return;
      }

      const response = await fetch(`${apiBaseUrl}/notifications/push/test`, {
        method: "POST",
        headers: {
          ...authHeaders(session),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "REMBEH",
          body: "This is a test alert.",
          href: "/owner/reports",
        }),
      });
      const payload = await readApiJson<{
        success?: number;
        reason?: "fcm_disabled" | "no_tokens" | "send_failed";
        message?: string | string[];
        webEnabled?: boolean;
      }>(response);
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      if ((payload.success ?? 0) > 0) {
        setNotice("Test alert sent. Check your notifications.");
      } else if (typeof payload.message === "string" && payload.message.trim()) {
        setError(payload.message);
      } else if (payload.reason === "fcm_disabled" || payload.webEnabled === false) {
        setError(
          "Push delivery is not configured on the server yet. Alerts cannot be sent until Firebase is set up.",
        );
      } else if (payload.reason === "no_tokens") {
        setError(
          "This browser is not registered yet. Click Turn on alerts, then try again.",
        );
      } else {
        setError(
          "No alert was delivered. Turn alerts off and on again, then try once more.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not send test alert.",
      );
    } finally {
      setPushBusy(false);
    }
  }

  if (!state.ready || !session) return <AppBootSkeleton />;

  const activeSection =
    SECTIONS.find((item) => item.id === section) ?? SECTIONS[0]!;
  const alertsOn = pushPermission === "granted";

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={null}
    >
      <div className="mx-auto max-w-[1400px] space-y-5 animate-rise">
        <OwnerHeader
          eyebrow="Settings"
          title="Settings"
          subtitle="Manage your account, loan types, and alerts."
          search={search}
          onSearchChange={setSearch}
          searchTooltip="Search settings."
          searchPlaceholder="Search settings..."
          showReportsButton={false}
          actions={
            <button
              type="button"
              onClick={() => void loadBasics()}
              aria-label="Refresh settings"
              className="grid size-9 place-items-center rounded-xl border border-[#e6ebf0] bg-white text-[#013f35] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-emerald-50"
            >
              <RefreshCw className="size-4" />
            </button>
          }
        />

        {error ? (
          <p className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="h-fit overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white p-2 shadow-[0_14px_34px_rgba(15,23,42,0.055)] lg:sticky lg:top-[72px]">
            <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              {filteredSections.map((item) => {
                const Icon = item.icon;
                const active = item.id === section;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`flex min-w-[140px] items-start gap-2.5 rounded-[12px] px-3 py-2.5 text-left transition lg:min-w-0 ${
                      active
                        ? "bg-[#013f35] text-white shadow-[0_10px_20px_rgba(1,63,53,0.28)]"
                        : "text-slate-600 hover:bg-[#f4f7f5] hover:text-[#0b1220]"
                    }`}
                  >
                    <Icon
                      className={`mt-0.5 size-4 shrink-0 ${
                        active ? "text-emerald-200" : "text-slate-400"
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold">
                        {item.label}
                      </span>
                      <span
                        className={`mt-0.5 block text-[10px] leading-snug ${
                          active ? "text-emerald-100/90" : "text-slate-500"
                        }`}
                      >
                        {item.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="min-w-0 space-y-4">
            {section === "account" ? (
              <>
                <SettingsCard
                  title="Your account"
                  description={activeSection.hint}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoRow label="Business" value={workspace?.name ?? "—"} />
                    <InfoRow label="Country" value={workspace?.country ?? "—"} />
                    <InfoRow
                      label="Currency"
                      value={workspace?.currency ?? "—"}
                    />
                    <InfoRow label="Your name" value={user?.name ?? "—"} />
                    <InfoRow label="Email" value={user?.email ?? "—"} />
                    <InfoRow label="Phone" value={user?.phone ?? "—"} />
                  </div>
                </SettingsCard>

                <SettingsCard
                  title="Quick links"
                  description="Everyday owner tools"
                >
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <OpsLink
                      href="/owner/branches"
                      icon={<Building2 className="size-4" />}
                      title="Branches"
                      text="Create branches and assign managers."
                    />
                    <OpsLink
                      href="/owner/reports"
                      icon={<FileText className="size-4" />}
                      title="Reports"
                      text="Review and approve daily reports."
                    />
                    <OpsLink
                      href="/owner/portfolio"
                      icon={<WalletCards className="size-4" />}
                      title="Portfolio"
                      text="See loans across all branches."
                    />
                    <OpsLink
                      href="/owner/borrowers"
                      icon={<UserRound className="size-4" />}
                      title="Borrowers"
                      text="Browse the borrower register."
                    />
                    <OpsLink
                      href="/owner/collections"
                      icon={<HandCoins className="size-4" />}
                      title="Repayments"
                      text="Track repayments coming in."
                    />
                    <OpsLink
                      href="/owner/risk"
                      icon={<ShieldAlert className="size-4" />}
                      title="Risk"
                      text="Watchlist and problem accounts."
                    />
                  </div>
                </SettingsCard>
              </>
            ) : null}

            {section === "loan-products" ? (
              <SettingsCard
                title="Loan types"
                description={activeSection.hint}
                bare
              >
                <LoanProductsManager
                  session={session}
                  canManage={canManageProducts}
                  appearance="owner"
                  onCountChange={setProductCount}
                />
              </SettingsCard>
            ) : null}

            {section === "notifications" ? (
              <SettingsCard
                title="Alerts"
                description="Get notified when something needs your attention."
              >
                <div className="rounded-[14px] border border-[#e6ebf0] bg-[#f8faf9] px-4 py-4">
                  <p className="text-sm font-bold text-[#0b1220]">
                    {alertsOn ? "Alerts are on" : "Alerts are off"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {alertsOn
                      ? "You will get browser alerts for important updates, like reports waiting for approval."
                      : "Turn on alerts so you know when a branch report is ready for you."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!alertsOn ? (
                      <button
                        type="button"
                        onClick={() => void enablePush()}
                        disabled={pushBusy}
                        className="flex h-9 items-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-3.5 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(15,143,104,0.28)] transition hover:brightness-105 disabled:opacity-60"
                      >
                        {pushBusy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Bell className="size-3.5" />
                        )}
                        Turn on alerts
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void sendTestPush()}
                        disabled={pushBusy}
                        className="flex h-9 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3.5 text-xs font-semibold text-[#111a2e] shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-[#f8faf9] disabled:opacity-60"
                      >
                        {pushBusy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Bell className="size-3.5" />
                        )}
                        Send a test alert
                      </button>
                    )}
                  </div>
                </div>
              </SettingsCard>
            ) : null}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function SettingsCard({
  title,
  description,
  children,
  bare,
}: {
  title: string;
  description: string;
  children: ReactNode;
  bare?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-[#e6ebf0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.055)]">
      {!bare ? (
        <div className="border-b border-[#edf1f5] px-4 py-3.5 sm:px-5">
          <h2 className="text-base font-bold text-[#0b1220]">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
      ) : null}
      <div className={bare ? "p-4 sm:p-5" : "px-4 py-4 sm:px-5"}>
        {children}
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[#edf1f5] bg-[#f8faf9] px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[#0b1220]">{value}</p>
    </div>
  );
}

function OpsLink({
  href,
  icon,
  title,
  text,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[14px] border border-[#e6ebf0] bg-[#f8faf9] p-4 transition hover:border-emerald-200 hover:bg-emerald-50/50"
    >
      <span className="grid size-9 place-items-center rounded-xl bg-white text-[var(--forest-emerald)] shadow-[0_6px_14px_rgba(15,23,42,0.06)]">
        {icon}
      </span>
      <p className="mt-3 text-sm font-bold text-[#0b1220]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{text}</p>
    </Link>
  );
}
