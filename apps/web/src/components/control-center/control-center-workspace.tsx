"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AppBootSkeleton } from "../app/skeleton";

import { controlCenterFetch } from "../../lib/control-center-api";

import {
  clearControlCenterAuth,
  isControlCenterSessionValid,
  readControlCenterAuth,
  type ControlCenterAdmin,
  type ControlCenterSession,
} from "../../lib/control-center-session";

import { AuditSection } from "./audit-section";
import { ControlCenterBranchDetailSection } from "./branch-detail-section";
import { ControlCenterClientDetailSection } from "./client-detail-section";
import { ControlCenterClientsSection } from "./clients-section";

import {
  ControlCenterShell,
  type ControlCenterSection,
} from "./control-center-shell";

import { ControlCenterDashboardSection } from "./dashboard-section";
import { ControlCenterMessagingSection } from "./messaging-section";
import { PaymentsSection } from "./payments-section";
import { ControlCenterPricingHistorySection } from "./pricing-history-section";
import { ControlCenterPricingSection } from "./pricing-section";
import { ControlCenterPricingWorkspaceSection } from "./pricing-workspace-section";
import { ReportsSection } from "./reports-section";
import { SettingsSection } from "./settings-section";
import { SubscriptionsSection } from "./subscriptions-section";
import { ControlCenterUsersSection } from "./users-section";

import type {
  ControlCenterBranch,
  ControlCenterClient,
  ControlCenterClientDetail,
  ControlCenterClientsResponse,
  ControlCenterDashboard,
  ControlCenterPricing,
  ControlCenterPricingHistory,
  ControlCenterTemplate,
  ControlCenterUser,
} from "./types";

type ClientMode =
  | "LIST"
  | "DETAIL"
  | "BRANCH_DETAIL"
  | "PRICING"
  | "HISTORY";

export function ControlCenterWorkspace() {
  const router = useRouter();

  const [session, setSession] =
    useState<ControlCenterSession | null>(null);

  const [admin, setAdmin] =
    useState<ControlCenterAdmin | null>(null);

  const [ready, setReady] =
    useState(false);

  const [active, setActive] =
    useState<ControlCenterSection>("dashboard");

  const [clientMode, setClientMode] =
    useState<ClientMode>("LIST");

  const [
    selectedClientId,
    setSelectedClientId,
  ] = useState<string | null>(null);

  const [
    selectedBranchId,
    setSelectedBranchId,
  ] = useState<string | null>(null);

  const [dashboard, setDashboard] =
    useState<ControlCenterDashboard | null>(null);

  const [clients, setClients] =
    useState<ControlCenterClientsResponse | null>(
      null,
    );

  const [users, setUsers] =
    useState<ControlCenterUser[]>([]);

  const [templates, setTemplates] =
    useState<ControlCenterTemplate[]>([]);

  const [clientDetail, setClientDetail] =
    useState<ControlCenterClientDetail | null>(
      null,
    );

  const [pricing, setPricing] =
    useState<ControlCenterPricing | null>(null);

  const [
    pricingHistory,
    setPricingHistory,
  ] =
    useState<ControlCenterPricingHistory | null>(
      null,
    );

  const [
    loadingClient,
    setLoadingClient,
  ] = useState(false);

  const [
    loadingPricing,
    setLoadingPricing,
  ] = useState(false);

  const [
    loadingHistory,
    setLoadingHistory,
  ] = useState(false);

  const [
    savingPricing,
    setSavingPricing,
  ] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const selectedClient =
    useMemo(
      () =>
        clients?.clients?.find(
          (client) =>
            client.id ===
            selectedClientId,
        ) ?? null,
      [
        clients?.clients,
        selectedClientId,
      ],
    );

  const selectedBranch =
    useMemo<ControlCenterBranch | null>(
      () =>
        clientDetail?.branches?.find(
          (branch) =>
            branch.id ===
            selectedBranchId,
        ) ?? null,
      [
        clientDetail?.branches,
        selectedBranchId,
      ],
    );

  const loadCore =
    useCallback(
      async (
        activeSession:
          ControlCenterSession,
      ) => {
        const [
          dashboardData,
          clientsData,
          usersData,
          templatesData,
        ] = await Promise.all([
          controlCenterFetch<ControlCenterDashboard>(
            "/dashboard",
            activeSession,
          ),

          controlCenterFetch<ControlCenterClientsResponse>(
            "/clients",
            activeSession,
          ),

          controlCenterFetch<{
            users:
              ControlCenterUser[];
          }>(
            "/users",
            activeSession,
          ),

          controlCenterFetch<{
            templates:
              ControlCenterTemplate[];
          }>(
            "/message-templates",
            activeSession,
          ),
        ]);

        setDashboard(
          dashboardData,
        );

        setClients({
          ...clientsData,

          clients:
            Array.isArray(
              clientsData?.clients,
            )
              ? clientsData.clients
              : [],
        });

        setUsers(
          Array.isArray(
            usersData?.users,
          )
            ? usersData.users
            : [],
        );

        setTemplates(
          Array.isArray(
            templatesData?.templates,
          )
            ? templatesData.templates
            : [],
        );
      },
      [],
    );

  useEffect(() => {
    const boot =
      window.setTimeout(
        () => {
          void (async () => {
            const auth =
              readControlCenterAuth();

            if (
              !auth.session ||
              !auth.admin ||
              !isControlCenterSessionValid(
                auth.session,
              )
            ) {
              clearControlCenterAuth();

              router.replace(
                "/control-center/login",
              );

              return;
            }

            try {
              await controlCenterFetch(
                "/me",
                auth.session,
              );

              setSession(
                auth.session,
              );

              setAdmin(
                auth.admin,
              );

              await loadCore(
                auth.session,
              );

              setReady(
                true,
              );
            } catch (
              caughtError
            ) {
              clearControlCenterAuth();

              setError(
                caughtError instanceof Error
                  ? caughtError.message
                  : "Control center session failed.",
              );

              router.replace(
                "/control-center/login",
              );
            }
          })();
        },
        0,
      );

    return () =>
      window.clearTimeout(
        boot,
      );
  }, [
    loadCore,
    router,
  ]);

  const loadClient =
    useCallback(
      async (
        tenantId: string,
        activeSession = session,
      ) => {
        if (
          !activeSession
        ) {
          return;
        }

        setLoadingClient(
          true,
        );

        setError(
          null,
        );

        try {
          const detail =
            await controlCenterFetch<ControlCenterClientDetail>(
              `/clients/${tenantId}`,
              activeSession,
            );

          setClientDetail(
            detail,
          );
        } catch (
          caughtError
        ) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load client details.",
          );
        } finally {
          setLoadingClient(
            false,
          );
        }
      },
      [
        session,
      ],
    );

  const loadPricing =
    useCallback(
      async (
        tenantId: string,
        activeSession = session,
      ) => {
        if (
          !activeSession
        ) {
          return;
        }

        setLoadingPricing(
          true,
        );

        setError(
          null,
        );

        try {
          const data =
            await controlCenterFetch<ControlCenterPricing>(
              `/clients/${tenantId}/pricing`,
              activeSession,
            );

          setPricing(
            data,
          );
        } catch (
          caughtError
        ) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load pricing.",
          );
        } finally {
          setLoadingPricing(
            false,
          );
        }
      },
      [
        session,
      ],
    );

  const loadHistory =
    useCallback(
      async (
        tenantId: string,
        activeSession = session,
      ) => {
        if (
          !activeSession
        ) {
          return;
        }

        setLoadingHistory(
          true,
        );

        setError(
          null,
        );

        try {
          const data =
            await controlCenterFetch<ControlCenterPricingHistory>(
              `/clients/${tenantId}/pricing-history`,
              activeSession,
            );

          setPricingHistory(
            data,
          );
        } catch (
          caughtError
        ) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load pricing history.",
          );
        } finally {
          setLoadingHistory(
            false,
          );
        }
      },
      [
        session,
      ],
    );

  function openClient(
    tenantId: string,
  ) {
    if (
      !tenantId
    ) {
      return;
    }

    setSelectedClientId(
      tenantId,
    );

    setSelectedBranchId(
      null,
    );

    setClientMode(
      "DETAIL",
    );

    setActive(
      "clients",
    );

    void loadClient(
      tenantId,
    );
  }

  function openBranch(
    branchId: string,
  ) {
    if (
      !branchId ||
      !selectedClientId
    ) {
      return;
    }

    setSelectedBranchId(
      branchId,
    );

    setClientMode(
      "BRANCH_DETAIL",
    );

    setActive(
      "clients",
    );
  }

  function openPricing(
    tenantId: string,
  ) {
    if (
      !tenantId
    ) {
      return;
    }

    setSelectedClientId(
      tenantId,
    );

    setSelectedBranchId(
      null,
    );

    setPricing(
      null,
    );

    setClientMode(
      "PRICING",
    );

    setActive(
      "clients",
    );

    void Promise.all([
      loadClient(
        tenantId,
      ),

      loadPricing(
        tenantId,
      ),
    ]);
  }

  function openHistory(
    tenantId =
      selectedClientId ??
      "",
  ) {
    if (
      !tenantId
    ) {
      return;
    }

    setSelectedClientId(
      tenantId,
    );

    setSelectedBranchId(
      null,
    );

    setPricingHistory(
      null,
    );

    setClientMode(
      "HISTORY",
    );

    setActive(
      "clients",
    );

    /*
     * Load both.
     *
     * History can be opened directly from Client Detail.
     * If the user then returns to the pricing editor,
     * current pricing must already exist.
     */
    void Promise.all([
      loadHistory(
        tenantId,
      ),

      loadPricing(
        tenantId,
      ),

      clientDetail?.client.id ===
      tenantId
        ? Promise.resolve()
        : loadClient(
            tenantId,
          ),
    ]);
  }

  async function refreshAfterPricing() {
    if (
      !session
    ) {
      return;
    }

    const tasks:
      Promise<unknown>[] = [
        loadCore(
          session,
        ),
      ];

    if (
      selectedClientId
    ) {
      tasks.push(
        loadPricing(
          selectedClientId,
          session,
        ),
      );

      tasks.push(
        loadHistory(
          selectedClientId,
          session,
        ),
      );

      tasks.push(
        loadClient(
          selectedClientId,
          session,
        ),
      );
    }

    await Promise.all(
      tasks,
    );
  }

  async function refreshUsers() {
    if (
      !session
    ) {
      return;
    }

    const usersData =
      await controlCenterFetch<{
        users:
          ControlCenterUser[];
      }>(
        "/users",
        session,
      );

    setUsers(
      Array.isArray(
        usersData?.users,
      )
        ? usersData.users
        : [],
    );
  }

  function changeSection(
    section:
      ControlCenterSection,
  ) {
    setActive(
      section,
    );

    if (
      section !==
      "clients"
    ) {
      setClientMode(
        "LIST",
      );

      setSelectedBranchId(
        null,
      );
    }
  }

  if (
    !ready ||
    !session ||
    !admin
  ) {
    return (
      <AppBootSkeleton />
    );
  }

  return (
    <ControlCenterShell
      admin={
        admin
      }
      active={
        active
      }
      onSectionChange={
        changeSection
      }
    >
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-medium text-red-700">
          {
            error
          }
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
        selectedBranch,

        clientDetail,
        pricing,
        pricingHistory,

        loadingClient,
        loadingPricing,
        loadingHistory,
        savingPricing,

        openClient,
        openBranch,
        openPricing,
        openHistory,

        setClientMode,
        setSelectedBranchId,
        setSavingPricing,

        refreshAfterPricing,
        refreshUsers,

        setActive:
          changeSection,
      })}
    </ControlCenterShell>
  );
}

function renderSection(
  input: {
    active:
      ControlCenterSection;

    clientMode:
      ClientMode;

    dashboard:
      ControlCenterDashboard | null;

    clients:
      ControlCenterClientsResponse | null;

    users:
      ControlCenterUser[];

    templates:
      ControlCenterTemplate[];

    session:
      ControlCenterSession;

    selectedClient:
      ControlCenterClient | null;

    selectedBranch:
      ControlCenterBranch | null;

    clientDetail:
      ControlCenterClientDetail | null;

    pricing:
      ControlCenterPricing | null;

    pricingHistory:
      ControlCenterPricingHistory | null;

    loadingClient:
      boolean;

    loadingPricing:
      boolean;

    loadingHistory:
      boolean;

    savingPricing:
      boolean;

    openClient:
      (
        tenantId:
          string,
      ) => void;

    openBranch:
      (
        branchId:
          string,
      ) => void;

    openPricing:
      (
        tenantId:
          string,
      ) => void;

    openHistory:
      (
        tenantId?:
          string,
      ) => void;

    setClientMode:
      (
        mode:
          ClientMode,
      ) => void;

    setSelectedBranchId:
      (
        branchId:
          string | null,
      ) => void;

    setSavingPricing:
      (
        saving:
          boolean,
      ) => void;

    refreshAfterPricing:
      () =>
        Promise<void>;

    refreshUsers:
      () =>
        Promise<void>;

    setActive:
      (
        section:
          ControlCenterSection,
      ) => void;
  },
) {
  const clientRows =
    Array.isArray(
      input.clients?.clients,
    )
      ? input.clients!.clients
      : [];

  if (
    input.active ===
    "dashboard"
  ) {
    return (
      <ControlCenterDashboardSection
        dashboard={
          input.dashboard
        }
        clients={
          clientRows
        }
        onOpenClient={
          input.openClient
        }
        onOpenSection={
          input.setActive
        }
      />
    );
  }

  if (
    input.active ===
    "clients"
  ) {
    if (
      input.clientMode ===
      "BRANCH_DETAIL"
    ) {
      if (
        !input.selectedBranch ||
        !input.clientDetail
      ) {
        return (
          <ControlCenterClientDetailSection
            detail={
              input.clientDetail
            }
            loading={
              input.loadingClient
            }
            onBack={() =>
              input.setClientMode(
                "LIST",
              )
            }
            onOpenBranch={
              input.openBranch
            }
            onManagePricing={() => {
              if (
                input.selectedClient
              ) {
                input.openPricing(
                  input.selectedClient.id,
                );
              }
            }}
            onPricingHistory={() =>
              input.openHistory()
            }
          />
        );
      }

      return (
        <ControlCenterBranchDetailSection
          branch={
            input.selectedBranch
          }
          organizationName={
            input.clientDetail.client.name
          }
          currency={
            input.clientDetail.client.currency
          }
          onBack={() => {
            input.setSelectedBranchId(
              null,
            );

            input.setClientMode(
              "DETAIL",
            );
          }}
          onOpenClient={() => {
            input.setSelectedBranchId(
              null,
            );

            input.setClientMode(
              "DETAIL",
            );
          }}
          onManagePricing={() => {
            if (
              input.selectedClient
            ) {
              input.openPricing(
                input.selectedClient.id,
              );
            }
          }}
        />
      );
    }

    if (
      input.clientMode ===
      "DETAIL"
    ) {
      return (
        <ControlCenterClientDetailSection
          detail={
            input.clientDetail
          }
          loading={
            input.loadingClient
          }
          onBack={() =>
            input.setClientMode(
              "LIST",
            )
          }
          onOpenBranch={
            input.openBranch
          }
          onManagePricing={() => {
            if (
              input.selectedClient
            ) {
              input.openPricing(
                input.selectedClient.id,
              );
            }
          }}
          onPricingHistory={() =>
            input.openHistory()
          }
        />
      );
    }

    /*
     * Client-specific pricing editor.
     */
    if (
      input.clientMode ===
      "PRICING"
    ) {
      return (
        <ControlCenterPricingSection
          session={
            input.session
          }
          client={
            input.selectedClient
          }
          pricing={
            input.pricing
          }
          loading={
            input.loadingPricing
          }
          saving={
            input.savingPricing
          }
          onBack={() =>
            input.setClientMode(
              "DETAIL",
            )
          }
          onHistory={() =>
            input.openHistory()
          }
          onSaved={
            input.refreshAfterPricing
          }
          onSaveStateChange={
            input.setSavingPricing
          }
        />
      );
    }

    /*
     * Client-specific commercial history.
     */
    if (
      input.clientMode ===
      "HISTORY"
    ) {
      return (
        <ControlCenterPricingHistorySection
          client={
            input.selectedClient
          }
          history={
            input.pricingHistory
          }
          loading={
            input.loadingHistory
          }
          onBack={() =>
            input.setClientMode(
              "PRICING",
            )
          }
        />
      );
    }

    return (
      <ControlCenterClientsSection
        data={
          input.clients
        }
        onOpenClient={
          input.openClient
        }
        onOpenPricing={
          input.openPricing
        }
      />
    );
  }

  /*
   * Global commercial pricing workspace.
   */
  if (
    input.active ===
    "pricing"
  ) {
    return (
      <ControlCenterPricingWorkspaceSection
        session={
          input.session
        }
        clients={
          clientRows
        }
        onOpenClient={
          input.openClient
        }
        onManageClientPricing={
          input.openPricing
        }
      />
    );
  }

  if (
    input.active ===
    "subscriptions"
  ) {
    return (
      <SubscriptionsSection
        session={
          input.session
        }
        onOpenClient={
          input.openClient
        }
      />
    );
  }

  if (
    input.active ===
    "payments"
  ) {
    return (
      <PaymentsSection
        session={
          input.session
        }
      />
    );
  }

  if (
    input.active ===
    "communications"
  ) {
    return (
      <ControlCenterMessagingSection
        session={
          input.session
        }
        clients={
          clientRows
        }
        users={
          input.users
        }
        templates={
          input.templates
        }
      />
    );
  }

  if (
    input.active ===
    "reports"
  ) {
    return (
      <ReportsSection
        session={
          input.session
        }
        dashboard={
          input.dashboard
        }
        clients={
          clientRows
        }
        onOpenClient={
          input.openClient
        }
      />
    );
  }

  if (
    input.active ===
    "users"
  ) {
    return (
      <ControlCenterUsersSection
        session={
          input.session
        }
        users={
          input.users
        }
        onUpdated={
          input.refreshUsers
        }
      />
    );
  }

  if (
    input.active ===
    "audit"
  ) {
    return (
      <AuditSection
        session={
          input.session
        }
      />
    );
  }

  return (
    <SettingsSection
      session={
        input.session
      }
    />
  );
}
