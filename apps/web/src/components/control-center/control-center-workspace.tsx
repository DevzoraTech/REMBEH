"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppBootSkeleton } from "../app/skeleton";
import { controlCenterFetch } from "../../lib/control-center-api";
import {
  clearControlCenterAuth,
  isControlCenterSessionValid,
  readControlCenterAuth,
  type ControlCenterAdmin,
  type ControlCenterSession,
} from "../../lib/control-center-session";
import { ControlCenterClientDetailSection } from "./client-detail-section";
import { ControlCenterClientsSection } from "./clients-section";
import {
  ControlCenterSection,
  ControlCenterShell,
} from "./control-center-shell";
import { ControlCenterDashboardSection } from "./dashboard-section";
import { ControlCenterMessagingSection } from "./messaging-section";
import { ControlCenterPricingHistorySection } from "./pricing-history-section";
import { ControlCenterPricingSection } from "./pricing-section";
import {
  AuditSection,
  PaymentsSection,
  ReportsSection,
  SettingsSection,
  SubscriptionsSection,
} from "./support-sections";
import { ControlCenterUsersSection } from "./users-section";
import type {
  ControlCenterClient,
  ControlCenterClientDetail,
  ControlCenterClientsResponse,
  ControlCenterDashboard,
  ControlCenterPricing,
  ControlCenterPricingHistory,
  ControlCenterTemplate,
  ControlCenterUser,
} from "./types";

type ClientMode = "LIST" | "DETAIL" | "PRICING" | "HISTORY";

export function ControlCenterWorkspace() {
  const router = useRouter();
  const [session, setSession] = useState<ControlCenterSession | null>(null);
  const [admin, setAdmin] = useState<ControlCenterAdmin | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<ControlCenterSection>("dashboard");
  const [clientMode, setClientMode] = useState<ClientMode>("LIST");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ControlCenterDashboard | null>(
    null,
  );
  const [clients, setClients] = useState<ControlCenterClientsResponse | null>(
    null,
  );
  const [users, setUsers] = useState<ControlCenterUser[]>([]);
  const [templates, setTemplates] = useState<ControlCenterTemplate[]>([]);
  const [clientDetail, setClientDetail] =
    useState<ControlCenterClientDetail | null>(null);
  const [pricing, setPricing] = useState<ControlCenterPricing | null>(null);
  const [pricingHistory, setPricingHistory] =
    useState<ControlCenterPricingHistory | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedClient = useMemo(
    () =>
      clients?.clients.find((client) => client.id === selectedClientId) ?? null,
    [clients?.clients, selectedClientId],
  );

  const loadCore = useCallback(async (activeSession: ControlCenterSession) => {
    const [dashboardData, clientsData, usersData, templatesData] =
      await Promise.all([
        controlCenterFetch<ControlCenterDashboard>("/dashboard", activeSession),
        controlCenterFetch<ControlCenterClientsResponse>(
          "/clients",
          activeSession,
        ),
        controlCenterFetch<{ users: ControlCenterUser[] }>(
          "/users",
          activeSession,
        ),
        controlCenterFetch<{ templates: ControlCenterTemplate[] }>(
          "/message-templates",
          activeSession,
        ),
      ]);
    setDashboard(dashboardData);
    setClients(clientsData);
    setUsers(usersData.users);
    setTemplates(templatesData.templates);
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void (async () => {
        const auth = readControlCenterAuth();
        if (
          !auth.session ||
          !auth.admin ||
          !isControlCenterSessionValid(auth.session)
        ) {
          clearControlCenterAuth();
          router.replace("/control-center/login");
          return;
        }
        try {
          await controlCenterFetch("/me", auth.session);
          setSession(auth.session);
          setAdmin(auth.admin);
          await loadCore(auth.session);
          setReady(true);
        } catch (caughtError) {
          clearControlCenterAuth();
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Control center session failed.",
          );
          router.replace("/control-center/login");
        }
      })();
    }, 0);
    return () => window.clearTimeout(boot);
  }, [loadCore, router]);

  const loadClient = useCallback(
    async (tenantId: string, activeSession = session) => {
      if (!activeSession) return;
      setLoadingClient(true);
      setError(null);
      try {
        const detail = await controlCenterFetch<ControlCenterClientDetail>(
          `/clients/${tenantId}`,
          activeSession,
        );
        setClientDetail(detail);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load client details.",
        );
      } finally {
        setLoadingClient(false);
      }
    },
    [session],
  );

  const loadPricing = useCallback(
    async (tenantId: string, activeSession = session) => {
      if (!activeSession) return;
      setLoadingPricing(true);
      setError(null);
      try {
        const data = await controlCenterFetch<ControlCenterPricing>(
          `/clients/${tenantId}/pricing`,
          activeSession,
        );
        setPricing(data);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load pricing.",
        );
      } finally {
        setLoadingPricing(false);
      }
    },
    [session],
  );

  const loadHistory = useCallback(
    async (tenantId: string, activeSession = session) => {
      if (!activeSession) return;
      setLoadingHistory(true);
      setError(null);
      try {
        const data = await controlCenterFetch<ControlCenterPricingHistory>(
          `/clients/${tenantId}/pricing-history`,
          activeSession,
        );
        setPricingHistory(data);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load pricing history.",
        );
      } finally {
        setLoadingHistory(false);
      }
    },
    [session],
  );

  function openClient(tenantId: string) {
    if (!tenantId) return;
    setSelectedClientId(tenantId);
    setClientMode("DETAIL");
    setActive("clients");
    void loadClient(tenantId);
  }

  function openPricing(tenantId: string) {
    if (!tenantId) return;
    setSelectedClientId(tenantId);
    setClientMode("PRICING");
    setActive("clients");
    void Promise.all([loadClient(tenantId), loadPricing(tenantId)]);
  }

  function openHistory(tenantId = selectedClientId ?? "") {
    if (!tenantId) return;
    setSelectedClientId(tenantId);
    setClientMode("HISTORY");
    setActive("clients");
    void loadHistory(tenantId);
  }

  async function refreshAfterPricing() {
    if (!session) return;
    await Promise.all([
      loadCore(session),
      selectedClientId ? loadPricing(selectedClientId, session) : undefined,
      selectedClientId ? loadHistory(selectedClientId, session) : undefined,
      selectedClientId ? loadClient(selectedClientId, session) : undefined,
    ]);
  }

  async function refreshUsers() {
    if (!session) return;
    const usersData = await controlCenterFetch<{ users: ControlCenterUser[] }>(
      "/users",
      session,
    );
    setUsers(usersData.users);
  }

  function changeSection(section: ControlCenterSection) {
    setActive(section);
    if (section !== "clients") {
      setClientMode("LIST");
    }
  }

  if (!ready || !session || !admin) {
    return <AppBootSkeleton />;
  }

  return (
    <ControlCenterShell
      admin={admin}
      active={active}
      onSectionChange={changeSection}
    >
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {renderSection({
        active,
        clientMode,
        dashboard,
        clients,
        users,
        templates,
        session,
        selectedClient,
        clientDetail,
        pricing,
        pricingHistory,
        loadingClient,
        loadingPricing,
        loadingHistory,
        savingPricing,
        openClient,
        openPricing,
        openHistory,
        setClientMode,
        setSavingPricing,
        refreshAfterPricing,
        refreshUsers,
        setActive,
      })}
    </ControlCenterShell>
  );
}

function renderSection(input: {
  active: ControlCenterSection;
  clientMode: ClientMode;
  dashboard: ControlCenterDashboard | null;
  clients: ControlCenterClientsResponse | null;
  users: ControlCenterUser[];
  templates: ControlCenterTemplate[];
  session: ControlCenterSession;
  selectedClient: ControlCenterClient | null;
  clientDetail: ControlCenterClientDetail | null;
  pricing: ControlCenterPricing | null;
  pricingHistory: ControlCenterPricingHistory | null;
  loadingClient: boolean;
  loadingPricing: boolean;
  loadingHistory: boolean;
  savingPricing: boolean;
  openClient: (tenantId: string) => void;
  openPricing: (tenantId: string) => void;
  openHistory: (tenantId?: string) => void;
  setClientMode: (mode: ClientMode) => void;
  setSavingPricing: (saving: boolean) => void;
  refreshAfterPricing: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  setActive: (section: ControlCenterSection) => void;
}) {
  const clientRows = input.clients?.clients ?? [];

  if (input.active === "dashboard") {
    return (
      <ControlCenterDashboardSection
        dashboard={input.dashboard}
        clients={clientRows}
        onOpenClient={input.openClient}
        onOpenUsers={() => input.setActive("users")}
        onOpenPricing={() => input.setActive("pricing")}
      />
    );
  }

  if (input.active === "clients") {
    if (input.clientMode === "DETAIL") {
      return (
        <ControlCenterClientDetailSection
          detail={input.clientDetail}
          loading={input.loadingClient}
          onBack={() => input.setClientMode("LIST")}
          onManagePricing={() => {
            if (input.selectedClient)
              input.openPricing(input.selectedClient.id);
          }}
          onPricingHistory={() => input.openHistory()}
        />
      );
    }
    if (input.clientMode === "PRICING") {
      return (
        <ControlCenterPricingSection
          session={input.session}
          client={input.selectedClient}
          pricing={input.pricing}
          loading={input.loadingPricing}
          saving={input.savingPricing}
          onBack={() => input.setClientMode("DETAIL")}
          onHistory={() => input.openHistory()}
          onSaved={input.refreshAfterPricing}
          onSaveStateChange={input.setSavingPricing}
        />
      );
    }
    if (input.clientMode === "HISTORY") {
      return (
        <ControlCenterPricingHistorySection
          client={input.selectedClient}
          history={input.pricingHistory}
          loading={input.loadingHistory}
          onBack={() => input.setClientMode("PRICING")}
        />
      );
    }
    return (
      <ControlCenterClientsSection
        data={input.clients}
        onOpenClient={input.openClient}
        onOpenPricing={input.openPricing}
      />
    );
  }

  if (input.active === "pricing") {
    return (
      <ControlCenterClientsSection
        data={input.clients}
        onOpenClient={input.openClient}
        onOpenPricing={input.openPricing}
      />
    );
  }

  if (input.active === "users") {
    return (
      <ControlCenterUsersSection
        session={input.session}
        users={input.users}
        onUpdated={input.refreshUsers}
      />
    );
  }

  if (input.active === "messaging") {
    return (
      <ControlCenterMessagingSection
        session={input.session}
        clients={clientRows}
        users={input.users}
        templates={input.templates}
      />
    );
  }

  if (input.active === "subscriptions") {
    return (
      <SubscriptionsSection
        clients={clientRows}
        dashboard={input.dashboard}
        onOpenClient={input.openClient}
      />
    );
  }

  if (input.active === "payments") {
    return <PaymentsSection dashboard={input.dashboard} />;
  }

  if (input.active === "reports") {
    return <ReportsSection dashboard={input.dashboard} clients={clientRows} />;
  }

  if (input.active === "audit") {
    return <AuditSection dashboard={input.dashboard} />;
  }

  return <SettingsSection templates={input.templates} />;
}
