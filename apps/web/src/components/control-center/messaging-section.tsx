"use client";

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { ControlCenterSession } from "../../lib/control-center-session";
import { controlCenterFetch } from "../../lib/control-center-api";

import type {
  ControlCenterBranch,
  ControlCenterClient,
  ControlCenterClientDetail,
  ControlCenterTemplate,
  ControlCenterUser,
} from "./types";

import {
  ccNumber,
} from "./formatters";

type CommunicationsView =
  | "OVERVIEW"
  | "COMPOSE"
  | "TEMPLATES"
  | "ACTIVITY"
  | "FAILURES";

type MessageChannel =
  | "EMAIL"
  | "SMS";

type MessageStatus =
  | "SENT"
  | "FAILED"
  | "SKIPPED";

type RecipientMode =
  | "AUDIENCE"
  | "SELECTED_USERS"
  | "DIRECT";

type MessageAudience =
  | "ALL_USERS"
  | "TENANT_USERS"
  | "BRANCH_USERS"
  | "TENANT_OWNERS"
  | "SELECTED_USERS"
  | "ROLE_USERS";

type SendResult = {
  sent: number;
  failed: number;
  skipped: number;

  logs: Array<{
    id: string;
    recipient: string;
    status: string;
    error: string | null;
  }>;
};

type MessageLog = {
  id: string;

  tenantId: string | null;
  organizationName: string | null;

  branchId: string | null;
  branchName: string | null;

  channel: MessageChannel;

  recipient: string;

  subject: string | null;
  body: string;

  status: MessageStatus;

  provider: string | null;
  error: string | null;

  sentAt: string | null;
  createdAt: string;

  createdBy: {
    id: string;
    name: string;
    email: string;
  };
};

type MessagesResponse = {
  stats: {
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    email: number;
    sms: number;
  };

  filteredStats: {
    total: number;
    sent: number;
    failed: number;
    skipped: number;
  };

  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };

  logs: MessageLog[];
};

type ReviewData = {
  recipientLabel: string;
  recipientCount: number | null;
};

const PAGE_SIZE = 20;

const ROLE_CATEGORIES = [
  {
    value: "OWNER",
    label: "Owners",
    roleNames: ["Account Owner", "Owner", "Workspace Owner"],
  },
  {
    value: "MANAGER",
    label: "Managers",
    roleNames: ["Branch Manager", "Manager"],
  },
  {
    value: "SUPERVISOR",
    label: "Supervisors",
    roleNames: ["Supervisor"],
  },
  {
    value: "CASHIER",
    label: "Cashiers",
    roleNames: ["Cashier"],
  },
  {
    value: "FIELD_OFFICER",
    label: "Field officers",
    roleNames: ["Field Officer", "Field Agent"],
  },
  {
    value: "LOAN_OFFICER",
    label: "Loan officers",
    roleNames: ["Loan Officer"],
  },
  {
    value: "AGENT",
    label: "Agents",
    roleNames: ["Agent"],
  },
  {
    value: "RECOVERY_OFFICER",
    label: "Recovery officers",
    roleNames: ["Recovery Officer"],
  },
] as const;

function roleNamesForSelection(selectedRoles: string[]) {
  const names = new Set<string>();
  for (const value of selectedRoles) {
    const category = ROLE_CATEGORIES.find((item) => item.value === value);
    for (const name of category?.roleNames ?? []) {
      names.add(name);
    }
  }
  return [...names];
}

export function ControlCenterMessagingSection({
  session,
  clients = [],
  users = [],
  templates = [],
}: {
  session: ControlCenterSession;
  clients?: ControlCenterClient[];
  users?: ControlCenterUser[];
  templates?: ControlCenterTemplate[];
}) {
  const clientRows =
    Array.isArray(
      clients,
    )
      ? clients
      : [];

  const userRows =
    Array.isArray(
      users,
    )
      ? users
      : [];

  const templateRows =
    Array.isArray(
      templates,
    )
      ? templates
      : [];

  const [
    view,
    setView,
  ] =
    useState<CommunicationsView>(
      "OVERVIEW",
    );

  const [
    channel,
    setChannel,
  ] =
    useState<MessageChannel>(
      "EMAIL",
    );

  const [
    recipientMode,
    setRecipientMode,
  ] =
    useState<RecipientMode>(
      "AUDIENCE",
    );

  const [
    tenantId,
    setTenantId,
  ] =
    useState("");

  const [
    branchId,
    setBranchId,
  ] =
    useState("");

  const [
    audience,
    setAudience,
  ] =
    useState<MessageAudience>(
      "TENANT_USERS",
    );

  const [
    selectedRoles,
    setSelectedRoles,
  ] =
    useState<string[]>(
      [],
    );

  const [
    selectedUserIds,
    setSelectedUserIds,
  ] =
    useState<string[]>(
      [],
    );

  const [
    templateCode,
    setTemplateCode,
  ] =
    useState("");

  const [
    subject,
    setSubject,
  ] =
    useState("");

  const [
    body,
    setBody,
  ] =
    useState("");

  const [
    recipients,
    setRecipients,
  ] =
    useState("");

  const [
    branchOptions,
    setBranchOptions,
  ] =
    useState<ControlCenterBranch[]>(
      [],
    );

  const [
    branchesLoading,
    setBranchesLoading,
  ] =
    useState(false);

  const [
    sending,
    setSending,
  ] =
    useState(false);

  const [
    sendError,
    setSendError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    result,
    setResult,
  ] =
    useState<SendResult | null>(
      null,
    );

  const [
    showReview,
    setShowReview,
  ] =
    useState(false);

  /*
   * Persistent communication activity.
   */
  const [
    messageData,
    setMessageData,
  ] =
    useState<MessagesResponse | null>(
      null,
    );

  const [
    messagesLoading,
    setMessagesLoading,
  ] =
    useState(false);

  const [
    messagesError,
    setMessagesError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    activityQuery,
    setActivityQuery,
  ] =
    useState("");

  const [
    activityChannel,
    setActivityChannel,
  ] =
    useState<
      "ALL" |
      MessageChannel
    >(
      "ALL",
    );

  const [
    activityStatus,
    setActivityStatus,
  ] =
    useState<
      "ALL" |
      MessageStatus
    >(
      "ALL",
    );

  const [
    activityTenantId,
    setActivityTenantId,
  ] =
    useState("");

  const [
    activityDate,
    setActivityDate,
  ] =
    useState<
      "ALL" |
      "TODAY" |
      "7_DAYS" |
      "30_DAYS" |
      "90_DAYS"
    >(
      "ALL",
    );

  const [
    activityPage,
    setActivityPage,
  ] =
    useState(1);

  const channelTemplates =
    useMemo(
      () =>
        templateRows.filter(
          (
            template,
          ) =>
            template.channel ===
            channel,
        ),
      [
        channel,
        templateRows,
      ],
    );

  const selectedTemplate =
    useMemo(
      () =>
        channelTemplates.find(
          (
            template,
          ) =>
            template.code ===
            templateCode,
        ) ?? null,
      [
        channelTemplates,
        templateCode,
      ],
    );

  const selectedClient =
    useMemo(
      () =>
        clientRows.find(
          (
            client,
          ) =>
            client.id ===
            tenantId,
        ) ?? null,
      [
        clientRows,
        tenantId,
      ],
    );

  const selectedBranch =
    useMemo(
      () =>
        branchOptions.find(
          (
            branch,
          ) =>
            branch.id ===
            branchId,
        ) ?? null,
      [
        branchId,
        branchOptions,
      ],
    );

  const selectedRoleNames =
    roleNamesForSelection(
      selectedRoles,
    );

  const selectableUsers =
    useMemo(
      () =>
        userRows.filter(
          (
            user,
          ) => {
            if (
              tenantId &&
              user.tenant.id !==
                tenantId
            ) {
              return false;
            }

            if (
              branchId &&
              user.branch?.id !==
                branchId
            ) {
              return false;
            }

            if (
              recipientMode ===
                "AUDIENCE" &&
              audience ===
                "TENANT_OWNERS" &&
              !userMatchesSelectedRoles(
                user,
                [
                  "OWNER",
                ],
              )
            ) {
              return false;
            }

            if (
              selectedRoles.length >
                0 &&
              !userMatchesSelectedRoles(
                user,
                selectedRoles,
              )
            ) {
              return false;
            }

            if (
              channel ===
              "EMAIL"
            ) {
              return Boolean(
                user.email,
              );
            }

            return Boolean(
              user.phone,
            );
          },
        ),
      [
        audience,
        branchId,
        channel,
        recipientMode,
        selectedRoles,
        tenantId,
        userRows,
      ],
    );

  const selectedUsers =
    useMemo(
      () => {
        const selected =
          new Set(
            selectedUserIds,
          );

        return selectableUsers.filter(
          (
            user,
          ) =>
            selected.has(
              user.id,
            ),
        );
      },
      [
        selectableUsers,
        selectedUserIds,
      ],
    );

  const directRecipients =
    useMemo(
      () =>
        recipients
          .split(
            /[,\n]/,
          )
          .map(
            (
              item,
            ) =>
              item.trim(),
          )
          .filter(
            Boolean,
          ),
      [
        recipients,
      ],
    );

  const reviewData =
    useMemo<ReviewData>(
      () =>
        buildReviewData({
          recipientMode,
          audience,
          selectedClient,
          selectedBranch,
          selectedUsers,
          selectableUsers,
          directRecipients,
          selectedRoles,
        }),
      [
        audience,
        directRecipients,
        recipientMode,
        selectedRoles,
        selectableUsers,
        selectedBranch,
        selectedClient,
        selectedUsers,
      ],
    );

  const emailTemplateCount =
    templateRows.filter(
      (
        template,
      ) =>
        template.channel ===
        "EMAIL",
    ).length;

  const smsTemplateCount =
    templateRows.filter(
      (
        template,
      ) =>
        template.channel ===
        "SMS",
    ).length;

  const contactableEmailUsers =
    userRows.filter(
      (
        user,
      ) =>
        Boolean(
          user.email,
        ),
    ).length;

  const contactableSmsUsers =
    userRows.filter(
      (
        user,
      ) =>
        Boolean(
          user.phone,
        ),
    ).length;

  const loadMessages =
    useCallback(
      async ({
        page = activityPage,
        status = activityStatus,
      }: {
        page?: number;
        status?:
          | "ALL"
          | MessageStatus;
      } = {}) => {
        setMessagesLoading(
          true,
        );

        setMessagesError(
          null,
        );

        try {
          const params =
            new URLSearchParams();

          params.set(
            "page",
            String(
              page,
            ),
          );

          params.set(
            "pageSize",
            String(
              PAGE_SIZE,
            ),
          );

          if (
            activityQuery.trim()
          ) {
            params.set(
              "search",
              activityQuery.trim(),
            );
          }

          if (
            activityChannel !==
            "ALL"
          ) {
            params.set(
              "channel",
              activityChannel,
            );
          }

          if (
            status !==
            "ALL"
          ) {
            params.set(
              "status",
              status,
            );
          }

          if (
            activityTenantId
          ) {
            params.set(
              "tenantId",
              activityTenantId,
            );
          }

          const dateRange =
            resolveDateRange(
              activityDate,
            );

          if (
            dateRange.dateFrom
          ) {
            params.set(
              "dateFrom",
              dateRange.dateFrom,
            );
          }

          if (
            dateRange.dateTo
          ) {
            params.set(
              "dateTo",
              dateRange.dateTo,
            );
          }

          const response =
            await controlCenterFetch<MessagesResponse>(
              `/messages?${params.toString()}`,
              session,
            );

          setMessageData(
            response,
          );

          setActivityPage(
            response.pagination.page,
          );
        } catch (
          caughtError
        ) {
          setMessagesError(
            caughtError instanceof
              Error
              ? caughtError.message
              : "Could not load communication activity.",
          );
        } finally {
          setMessagesLoading(
            false,
          );
        }
      },
      [
        activityChannel,
        activityDate,
        activityPage,
        activityQuery,
        activityStatus,
        activityTenantId,
        session,
      ],
    );

  useEffect(() => {
    void loadMessages({
      page: 1,
    });
  }, [
    session,
  ]);

  useEffect(() => {
    if (
      !selectedTemplate
    ) {
      return;
    }

    setSubject(
      selectedTemplate.subject ??
        "",
    );

    setBody(
      selectedTemplate.body,
    );
  }, [
    selectedTemplate,
  ]);

  useEffect(() => {
    if (
      !tenantId
    ) {
      setBranchOptions(
        [],
      );

      setBranchId(
        "",
      );

      return;
    }

    let cancelled =
      false;

    setBranchesLoading(
      true,
    );

    void controlCenterFetch<ControlCenterClientDetail>(
      `/clients/${tenantId}`,
      session,
    )
      .then(
        (
          detail,
        ) => {
          if (
            cancelled
          ) {
            return;
          }

          setBranchOptions(
            Array.isArray(
              detail?.branches,
            )
              ? detail.branches
              : [],
          );
        },
      )
      .catch(
        () => {
          if (
            cancelled
          ) {
            return;
          }

          setBranchOptions(
            [],
          );
        },
      )
      .finally(
        () => {
          if (
            !cancelled
          ) {
            setBranchesLoading(
              false,
            );
          }
        },
      );

    return () => {
      cancelled =
        true;
    };
  }, [
    session,
    tenantId,
  ]);

  useEffect(() => {
    setSelectedUserIds(
      (
        current,
      ) =>
        current.filter(
          (
            id,
          ) =>
            selectableUsers.some(
              (
                user,
              ) =>
                user.id ===
                id,
            ),
        ),
    );
  }, [
    selectableUsers,
  ]);

  function changeView(
    next:
      CommunicationsView,
  ) {
    setView(
      next,
    );

    if (
      next ===
      "FAILURES"
    ) {
      setActivityStatus(
        "FAILED",
      );

      setActivityPage(
        1,
      );

      void loadMessages({
        page: 1,
        status:
          "FAILED",
      });
    }

    if (
      next ===
      "ACTIVITY"
    ) {
      setActivityPage(
        1,
      );

      void loadMessages({
        page: 1,
      });
    }
  }

  function resetComposer() {
    setChannel(
      "EMAIL",
    );

    setRecipientMode(
      "AUDIENCE",
    );

    setTenantId(
      "",
    );

    setBranchId(
      "",
    );

    setAudience(
      "TENANT_USERS",
    );

    setSelectedRoles(
      [],
    );

    setSelectedUserIds(
      [],
    );

    setTemplateCode(
      "",
    );

    setSubject(
      "",
    );

    setBody(
      "",
    );

    setRecipients(
      "",
    );

    setSendError(
      null,
    );

    setShowReview(
      false,
    );
  }

  function validateCompose() {
    if (
      body.trim().length <
      2
    ) {
      return "Enter a message before continuing.";
    }

    if (
      channel ===
        "EMAIL" &&
      subject.trim().length <
        2
    ) {
      return "Enter an email subject.";
    }

    if (
      recipientMode ===
        "DIRECT" &&
      !directRecipients.length
    ) {
      return "Enter at least one direct recipient.";
    }

    if (
      recipientMode ===
        "SELECTED_USERS" &&
      !selectedUsers.length
    ) {
      return "Select at least one user.";
    }

    if (
      recipientMode ===
        "AUDIENCE" &&
      audience ===
        "BRANCH_USERS" &&
      !branchId
    ) {
      return "Select a branch for the branch users audience.";
    }

    if (
      recipientMode ===
        "AUDIENCE" &&
      audience ===
        "BRANCH_USERS" &&
      !tenantId
    ) {
      return "Select an organization for the branch users audience.";
    }

    return null;
  }

  function openReview() {
    const validationError =
      validateCompose();

    if (
      validationError
    ) {
      setSendError(
        validationError,
      );

      return;
    }

    setSendError(
      null,
    );

    setShowReview(
      true,
    );
  }

  async function submit(
    event?:
      FormEvent<HTMLFormElement>,
  ) {
    event?.preventDefault();

    const validationError =
      validateCompose();

    if (
      validationError
    ) {
      setSendError(
        validationError,
      );

      setShowReview(
        false,
      );

      return;
    }

    setSending(
      true,
    );

    setSendError(
      null,
    );

    try {
      const directMode =
        recipientMode ===
        "DIRECT";

      const selectedMode =
        recipientMode ===
        "SELECTED_USERS";

      let resolvedAudience:
        MessageAudience |
        undefined;

      if (
        selectedMode
      ) {
        resolvedAudience =
          "SELECTED_USERS";
      } else if (
        !directMode &&
        audience ===
          "TENANT_OWNERS"
      ) {
        resolvedAudience =
          "TENANT_OWNERS";
      } else if (
        !directMode &&
        selectedRoleNames.length >
          0
      ) {
        resolvedAudience =
          "ROLE_USERS";
      } else if (
        !directMode &&
        !tenantId
      ) {
        resolvedAudience =
          "ALL_USERS";
      } else if (
        !directMode
      ) {
        resolvedAudience =
          audience;
      }

      const payload = {
        channel,

        templateCode:
          templateCode ||
          undefined,

        tenantId:
          directMode
            ? undefined
            : tenantId ||
              undefined,

        branchId:
          directMode ||
          !branchId ||
          audience ===
            "TENANT_OWNERS"
            ? undefined
            : branchId,

        audience:
          resolvedAudience,

        userIds:
          selectedMode
            ? selectedUsers.map(
                (
                  user,
                ) =>
                  user.id,
              )
            : undefined,

        roleNames:
          !directMode &&
          audience !==
            "TENANT_OWNERS" &&
          selectedRoleNames.length
            ? selectedRoleNames
            : undefined,

        subject:
          channel ===
          "EMAIL"
            ? subject.trim()
            : undefined,

        body:
          body.trim(),

        recipients:
          directMode &&
          directRecipients.length
            ? directRecipients
            : undefined,
      };

      const response =
        await controlCenterFetch<SendResult>(
          "/messages/send",
          session,
          {
            method:
              "POST",

            body:
              JSON.stringify(
                payload,
              ),
          },
        );

      setResult(
        response,
      );

      setShowReview(
        false,
      );

      await loadMessages({
        page: 1,
      });
    } catch (
      caughtError
    ) {
      setSendError(
        caughtError instanceof
          Error
          ? caughtError.message
          : "Could not send message.",
      );

      setShowReview(
        false,
      );
    } finally {
      setSending(
        false,
      );
    }
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[1500px]">
        <PageHeader
          onCompose={() =>
            changeView(
              "COMPOSE",
            )
          }
        />

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Send}
            tone="green"
            label="Messages sent"
            value={ccNumber(
              messageData?.stats.sent ??
                0,
            )}
            secondary={`${ccNumber(
              messageData?.stats.total ??
                0,
            )} recorded attempts`}
          />

          <MetricCard
            icon={AlertTriangle}
            tone="red"
            label="Failed"
            value={ccNumber(
              messageData?.stats.failed ??
                0,
            )}
            secondary="Requires review"
          />

          <MetricCard
            icon={Mail}
            tone="blue"
            label="Email"
            value={ccNumber(
              messageData?.stats.email ??
                0,
            )}
            secondary={`${emailTemplateCount} email templates`}
          />

          <MetricCard
            icon={
              MessageSquareText
            }
            tone="amber"
            label="SMS"
            value={ccNumber(
              messageData?.stats.sms ??
                0,
            )}
            secondary={`${smsTemplateCount} SMS templates`}
          />
        </div>

        <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <CommunicationsTabs
            active={
              view
            }
            onChange={
              changeView
            }
            counts={{
              templates:
                templateRows.length,

              failures:
                messageData?.stats.failed ??
                0,
            }}
          />

          {view ===
          "OVERVIEW" ? (
            <OverviewView
              clients={
                clientRows
              }
              users={
                userRows
              }
              templates={
                templateRows
              }
              messageData={
                messageData
              }
              messagesLoading={
                messagesLoading
              }
              onCompose={() =>
                changeView(
                  "COMPOSE",
                )
              }
              onOpenTemplates={() =>
                changeView(
                  "TEMPLATES",
                )
              }
              onOpenActivity={() =>
                changeView(
                  "ACTIVITY",
                )
              }
              onOpenFailures={() =>
                changeView(
                  "FAILURES",
                )
              }
            />
          ) : view ===
            "COMPOSE" ? (
            <ComposeView
              channel={
                channel
              }
              setChannel={
                setChannel
              }
              recipientMode={
                recipientMode
              }
              setRecipientMode={
                setRecipientMode
              }
              tenantId={
                tenantId
              }
              setTenantId={
                setTenantId
              }
              branchId={
                branchId
              }
              setBranchId={
                setBranchId
              }
              audience={
                audience
              }
              setAudience={
                setAudience
              }
              selectedRoles={
                selectedRoles
              }
              setSelectedRoles={
                setSelectedRoles
              }
              selectedUserIds={
                selectedUserIds
              }
              setSelectedUserIds={
                setSelectedUserIds
              }
              templateCode={
                templateCode
              }
              setTemplateCode={
                setTemplateCode
              }
              subject={
                subject
              }
              setSubject={
                setSubject
              }
              body={
                body
              }
              setBody={
                setBody
              }
              recipients={
                recipients
              }
              setRecipients={
                setRecipients
              }
              clients={
                clientRows
              }
              branchOptions={
                branchOptions
              }
              branchesLoading={
                branchesLoading
              }
              channelTemplates={
                channelTemplates
              }
              selectableUsers={
                selectableUsers
              }
              selectedClient={
                selectedClient
              }
              selectedBranch={
                selectedBranch
              }
              reviewData={
                reviewData
              }
              error={
                sendError
              }
              result={
                result
              }
              sending={
                sending
              }
              onReview={
                openReview
              }
              onReset={
                resetComposer
              }
            />
          ) : view ===
            "TEMPLATES" ? (
            <TemplatesView
              templates={
                templateRows
              }
              onUseTemplate={(
                template,
              ) => {
                setChannel(
                  template.channel,
                );

                setTemplateCode(
                  template.code,
                );

                setSubject(
                  template.subject ??
                    "",
                );

                setBody(
                  template.body,
                );

                changeView(
                  "COMPOSE",
                );
              }}
            />
          ) : view ===
            "ACTIVITY" ? (
            <ActivityView
              clients={
                clientRows
              }
              data={
                messageData
              }
              loading={
                messagesLoading
              }
              error={
                messagesError
              }
              query={
                activityQuery
              }
              channel={
                activityChannel
              }
              status={
                activityStatus
              }
              tenantId={
                activityTenantId
              }
              date={
                activityDate
              }
              onQueryChange={(
                value,
              ) => {
                setActivityQuery(
                  value,
                );

                setActivityPage(
                  1,
                );
              }}
              onChannelChange={(
                value,
              ) => {
                setActivityChannel(
                  value,
                );

                setActivityPage(
                  1,
                );
              }}
              onStatusChange={(
                value,
              ) => {
                setActivityStatus(
                  value,
                );

                setActivityPage(
                  1,
                );
              }}
              onTenantChange={(
                value,
              ) => {
                setActivityTenantId(
                  value,
                );

                setActivityPage(
                  1,
                );
              }}
              onDateChange={(
                value,
              ) => {
                setActivityDate(
                  value,
                );

                setActivityPage(
                  1,
                );
              }}
              onApply={() =>
                void loadMessages({
                  page: 1,
                })
              }
              onRefresh={() =>
                void loadMessages({
                  page:
                    activityPage,
                })
              }
              onPageChange={(
                page,
              ) => {
                setActivityPage(
                  page,
                );

                void loadMessages({
                  page,
                });
              }}
            />
          ) : (
            <FailuresView
              clients={
                clientRows
              }
              data={
                messageData
              }
              loading={
                messagesLoading
              }
              error={
                messagesError
              }
              query={
                activityQuery
              }
              channel={
                activityChannel
              }
              tenantId={
                activityTenantId
              }
              date={
                activityDate
              }
              onQueryChange={
                setActivityQuery
              }
              onChannelChange={
                setActivityChannel
              }
              onTenantChange={
                setActivityTenantId
              }
              onDateChange={
                setActivityDate
              }
              onApply={() =>
                void loadMessages({
                  page: 1,
                  status:
                    "FAILED",
                })
              }
              onRefresh={() =>
                void loadMessages({
                  page:
                    activityPage,
                  status:
                    "FAILED",
                })
              }
              onPageChange={(
                page,
              ) => {
                setActivityPage(
                  page,
                );

                void loadMessages({
                  page,
                  status:
                    "FAILED",
                });
              }}
            />
          )}
        </section>
      </div>

      {showReview ? (
        <ReviewDialog
          channel={
            channel
          }
          subject={
            subject
          }
          body={
            body
          }
          reviewData={
            reviewData
          }
          selectedClient={
            selectedClient
          }
          selectedBranch={
            selectedBranch
          }
          sending={
            sending
          }
          onClose={() =>
            setShowReview(
              false,
            )
          }
          onSend={() =>
            void submit()
          }
        />
      ) : null}
    </>
  );
}

function PageHeader({
  onCompose,
}: {
  onCompose:
    () => void;
}) {
  const date =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        weekday:
          "long",

        day:
          "2-digit",

        month:
          "long",

        year:
          "numeric",
      },
    ).format(
      new Date(),
    );

  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-5">
      <div>
        <h1 className="text-[27px] font-bold tracking-[-0.025em] text-[#111d36]">
          Communications
        </h1>

        <p className="mt-1 text-[12.5px] font-normal text-[#63718b]">
          Send targeted client communications and manage outbound
          delivery operations.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <p className="hidden text-[11px] font-medium text-[#61708a] xl:block">
          {date}
        </p>

        <button
          type="button"
          onClick={
            onCompose
          }
          className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-3.5 text-[10px] font-semibold text-white transition hover:bg-[#147849]"
        >
          <Send className="size-3.5" />
          Compose message
        </button>
      </div>
    </div>
  );
}

function CommunicationsTabs({
  active,
  onChange,
  counts,
}: {
  active:
    CommunicationsView;

  onChange:
    (
      value:
        CommunicationsView,
    ) => void;

  counts: {
    templates:
      number;

    failures:
      number;
  };
}) {
  const tabs: Array<{
    value:
      CommunicationsView;

    label:
      string;

    count?:
      number;
  }> = [
    {
      value:
        "OVERVIEW",

      label:
        "Overview",
    },

    {
      value:
        "COMPOSE",

      label:
        "Compose",
    },

    {
      value:
        "TEMPLATES",

      label:
        "Templates",

      count:
        counts.templates,
    },

    {
      value:
        "ACTIVITY",

      label:
        "Delivery activity",
    },

    {
      value:
        "FAILURES",

      label:
        "Failures",

      count:
        counts.failures,
    },
  ];

  return (
    <div className="flex min-h-[53px] items-end gap-1 overflow-x-auto px-3 sm:px-4">
      {tabs.map(
        (
          tab,
        ) => {
          const selected =
            active ===
            tab.value;

          return (
            <button
              key={
                tab.value
              }
              type="button"
              onClick={() =>
                onChange(
                  tab.value,
                )
              }
              className={`relative flex h-[52px] shrink-0 items-center gap-2 px-3 text-[11px] transition ${
                selected
                  ? "font-semibold text-[#168650]"
                  : "font-medium text-[#58677f] hover:text-[#17233c]"
              }`}
            >
              {tab.label}

              {typeof tab.count ===
              "number" ? (
                <span
                  className={`grid min-w-[21px] place-items-center rounded-full px-1.5 py-[2px] text-[9px] font-semibold ${
                    selected
                      ? "bg-[#e5f5eb] text-[#188651]"
                      : "bg-[#f1f3f6] text-[#6b7890]"
                  }`}
                >
                  {
                    tab.count
                  }
                </span>
              ) : null}

              {selected ? (
                <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t-full bg-[#21935e]" />
              ) : null}
            </button>
          );
        },
      )}
    </div>
  );
}

function OverviewView({
  clients,
  users,
  templates,
  messageData,
  messagesLoading,
  onCompose,
  onOpenTemplates,
  onOpenActivity,
  onOpenFailures,
}: {
  clients:
    ControlCenterClient[];

  users:
    ControlCenterUser[];

  templates:
    ControlCenterTemplate[];

  messageData:
    MessagesResponse | null;

  messagesLoading:
    boolean;

  onCompose:
    () => void;

  onOpenTemplates:
    () => void;

  onOpenActivity:
    () => void;

  onOpenFailures:
    () => void;
}) {
  const owners =
    users.filter(
      (
        user,
      ) =>
        user.roles.some(
          (
            role,
          ) =>
            [
              "Account Owner",
              "Owner",
            ].includes(
              role,
            ),
        ),
    ).length;

  const recentLogs =
    messageData?.logs.slice(
      0,
      5,
    ) ?? [];

  return (
    <div className="border-t border-[#edf1f4] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.8fr)]">
        <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SectionHeader
            title="Outbound operations"
            subtitle="Choose the communication action you need to perform."
          />

          <div className="grid gap-3 border-t border-[#edf1f4] p-4 md:grid-cols-2">
            <ActionCard
              icon={Send}
              tone="green"
              title="Compose message"
              description="Send an email or SMS to an organization, branch, role, selected users or direct contacts."
              actionLabel="Compose"
              onClick={
                onCompose
              }
            />

            <ActionCard
              icon={Mail}
              tone="blue"
              title="Message templates"
              description="Review reusable email and SMS content available to Control Center administrators."
              actionLabel="View templates"
              onClick={
                onOpenTemplates
              }
            />

            <ActionCard
              icon={
                CheckCircle2
              }
              tone="slate"
              title="Delivery activity"
              description="Review persistent outbound communication history and provider outcomes."
              actionLabel="View activity"
              onClick={
                onOpenActivity
              }
            />

            <ActionCard
              icon={
                AlertTriangle
              }
              tone="red"
              title="Delivery failures"
              description="Investigate failed communications and provider errors that require action."
              actionLabel="Review failures"
              onClick={
                onOpenFailures
              }
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SectionHeader
            title="Audience coverage"
            subtitle="Current communication population."
          />

          <div className="divide-y divide-[#edf1f4] border-t border-[#edf1f4]">
            <CoverageRow
              label="Organizations"
              value={
                clients.length
              }
            />

            <CoverageRow
              label="Users"
              value={
                users.length
              }
            />

            <CoverageRow
              label="Organization owners"
              value={
                owners
              }
            />

            <CoverageRow
              label="Templates"
              value={
                templates.length
              }
            />
          </div>
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
        <SectionHeader
          title="Recent communication activity"
          subtitle="Latest persistent outbound message records."
        />

        {messagesLoading &&
        !messageData ? (
          <ActivitySkeleton />
        ) : recentLogs.length ? (
          <div className="overflow-x-auto border-t border-[#edf1f4]">
            <table className="w-full min-w-[980px] table-fixed text-left">
              <thead>
                <tr className="bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
                  <th className="w-[21%] px-4 py-2.5">
                    Recipient
                  </th>

                  <th className="w-[21%] px-3 py-2.5">
                    Organization
                  </th>

                  <th className="w-[11%] px-3 py-2.5">
                    Channel
                  </th>

                  <th className="w-[12%] px-3 py-2.5">
                    Status
                  </th>

                  <th className="w-[15%] px-3 py-2.5">
                    Administrator
                  </th>

                  <th className="w-[20%] px-3 py-2.5">
                    Created
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1f4]">
                {recentLogs.map(
                  (
                    log,
                  ) => (
                    <tr
                      key={
                        log.id
                      }
                      className="h-[58px]"
                    >
                      <td className="px-4 py-2.5">
                        <p className="truncate text-[10px] font-semibold text-[#26344d]">
                          {
                            log.recipient
                          }
                        </p>
                      </td>

                      <td className="px-3 py-2.5">
                        <p className="truncate text-[10px] font-medium text-[#526078]">
                          {log.organizationName ??
                            "Direct recipient"}
                        </p>

                        {log.branchName ? (
                          <p className="mt-1 truncate text-[8.5px] text-[#8490a1]">
                            {
                              log.branchName
                            }
                          </p>
                        ) : null}
                      </td>

                      <td className="px-3 py-2.5">
                        <ChannelBadge
                          value={
                            log.channel
                          }
                        />
                      </td>

                      <td className="px-3 py-2.5">
                        <MessageStatusBadge
                          value={
                            log.status
                          }
                        />
                      </td>

                      <td className="px-3 py-2.5 text-[9.5px] font-medium text-[#526078]">
                        {
                          log.createdBy.name
                        }
                      </td>

                      <td className="px-3 py-2.5 text-[9.5px] text-[#718099]">
                        {formatDateTime(
                          log.createdAt,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Send}
            title="No communication history"
            description="Outbound communication records will appear here after messages are sent."
          />
        )}
      </section>
    </div>
  );
}

function ActivityView({
  clients,
  data,
  loading,
  error,
  query,
  channel,
  status,
  tenantId,
  date,
  onQueryChange,
  onChannelChange,
  onStatusChange,
  onTenantChange,
  onDateChange,
  onApply,
  onRefresh,
  onPageChange,
}: {
  clients:
    ControlCenterClient[];

  data:
    MessagesResponse | null;

  loading:
    boolean;

  error:
    string | null;

  query:
    string;

  channel:
    "ALL" | MessageChannel;

  status:
    "ALL" | MessageStatus;

  tenantId:
    string;

  date:
    "ALL" |
    "TODAY" |
    "7_DAYS" |
    "30_DAYS" |
    "90_DAYS";

  onQueryChange:
    (
      value:
        string,
    ) => void;

  onChannelChange:
    (
      value:
        "ALL" |
        MessageChannel,
    ) => void;

  onStatusChange:
    (
      value:
        "ALL" |
        MessageStatus,
    ) => void;

  onTenantChange:
    (
      value:
        string,
    ) => void;

  onDateChange:
    (
      value:
        "ALL" |
        "TODAY" |
        "7_DAYS" |
        "30_DAYS" |
        "90_DAYS",
    ) => void;

  onApply:
    () => void;

  onRefresh:
    () => void;

  onPageChange:
    (
      page:
        number,
    ) => void;
}) {
  return (
    <div className="border-t border-[#edf1f4]">
      <ActivityFilters
        clients={
          clients
        }
        query={
          query
        }
        channel={
          channel
        }
        status={
          status
        }
        tenantId={
          tenantId
        }
        date={
          date
        }
        showStatus
        loading={
          loading
        }
        onQueryChange={
          onQueryChange
        }
        onChannelChange={
          onChannelChange
        }
        onStatusChange={
          onStatusChange
        }
        onTenantChange={
          onTenantChange
        }
        onDateChange={
          onDateChange
        }
        onApply={
          onApply
        }
        onRefresh={
          onRefresh
        }
      />

      {error ? (
        <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-[10px] font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {loading &&
      !data ? (
        <ActivitySkeleton />
      ) : data?.logs.length ? (
        <>
          <MessageLogsTable
            logs={
              data.logs
            }
          />

          <PaginationFooter
            page={
              data.pagination.page
            }
            totalPages={
              data.pagination.totalPages
            }
            pageSize={
              data.pagination.pageSize
            }
            totalItems={
              data.pagination.total
            }
            onPageChange={
              onPageChange
            }
          />
        </>
      ) : (
        <EmptyState
          icon={
            MessageSquareText
          }
          title="No communications found"
          description="No message logs match the current filters."
        />
      )}
    </div>
  );
}

function FailuresView({
  clients,
  data,
  loading,
  error,
  query,
  channel,
  tenantId,
  date,
  onQueryChange,
  onChannelChange,
  onTenantChange,
  onDateChange,
  onApply,
  onRefresh,
  onPageChange,
}: {
  clients:
    ControlCenterClient[];

  data:
    MessagesResponse | null;

  loading:
    boolean;

  error:
    string | null;

  query:
    string;

  channel:
    "ALL" |
    MessageChannel;

  tenantId:
    string;

  date:
    "ALL" |
    "TODAY" |
    "7_DAYS" |
    "30_DAYS" |
    "90_DAYS";

  onQueryChange:
    (
      value:
        string,
    ) => void;

  onChannelChange:
    (
      value:
        "ALL" |
        MessageChannel,
    ) => void;

  onTenantChange:
    (
      value:
        string,
    ) => void;

  onDateChange:
    (
      value:
        "ALL" |
        "TODAY" |
        "7_DAYS" |
        "30_DAYS" |
        "90_DAYS",
    ) => void;

  onApply:
    () => void;

  onRefresh:
    () => void;

  onPageChange:
    (
      page:
        number,
    ) => void;
}) {
  return (
    <div className="border-t border-[#edf1f4]">
      <div className="border-b border-red-100 bg-[#fffafa] px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[#fff0f0] text-[#d34747]">
            <AlertTriangle className="size-4" />
          </span>

          <div>
            <p className="text-[10.5px] font-semibold text-[#b63a3a]">
              Failed communications
            </p>

            <p className="mt-1 text-[9.5px] leading-4 text-[#876767]">
              Review provider errors and recipient failures before
              attempting another communication.
            </p>
          </div>
        </div>
      </div>

      <ActivityFilters
        clients={
          clients
        }
        query={
          query
        }
        channel={
          channel
        }
        status="FAILED"
        tenantId={
          tenantId
        }
        date={
          date
        }
        showStatus={
          false
        }
        loading={
          loading
        }
        onQueryChange={
          onQueryChange
        }
        onChannelChange={
          onChannelChange
        }
        onStatusChange={() => {}}
        onTenantChange={
          onTenantChange
        }
        onDateChange={
          onDateChange
        }
        onApply={
          onApply
        }
        onRefresh={
          onRefresh
        }
      />

      {error ? (
        <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-[10px] font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {loading &&
      !data ? (
        <ActivitySkeleton />
      ) : data?.logs.length ? (
        <>
          <MessageLogsTable
            logs={
              data.logs
            }
            failureMode
          />

          <PaginationFooter
            page={
              data.pagination.page
            }
            totalPages={
              data.pagination.totalPages
            }
            pageSize={
              data.pagination.pageSize
            }
            totalItems={
              data.pagination.total
            }
            onPageChange={
              onPageChange
            }
          />
        </>
      ) : (
        <EmptyState
          icon={
            CheckCircle2
          }
          title="No failed communications"
          description="There are no failed message records matching the current filters."
        />
      )}
    </div>
  );
}

function ActivityFilters({
  clients,
  query,
  channel,
  status,
  tenantId,
  date,
  showStatus,
  loading,
  onQueryChange,
  onChannelChange,
  onStatusChange,
  onTenantChange,
  onDateChange,
  onApply,
  onRefresh,
}: {
  clients:
    ControlCenterClient[];

  query:
    string;

  channel:
    "ALL" |
    MessageChannel;

  status:
    "ALL" |
    MessageStatus;

  tenantId:
    string;

  date:
    "ALL" |
    "TODAY" |
    "7_DAYS" |
    "30_DAYS" |
    "90_DAYS";

  showStatus:
    boolean;

  loading:
    boolean;

  onQueryChange:
    (
      value:
        string,
    ) => void;

  onChannelChange:
    (
      value:
        "ALL" |
        MessageChannel,
    ) => void;

  onStatusChange:
    (
      value:
        "ALL" |
        MessageStatus,
    ) => void;

  onTenantChange:
    (
      value:
        string,
    ) => void;

  onDateChange:
    (
      value:
        "ALL" |
        "TODAY" |
        "7_DAYS" |
        "30_DAYS" |
        "90_DAYS",
    ) => void;

  onApply:
    () => void;

  onRefresh:
    () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-[#edf1f4] px-4 py-3">
      <label className="flex h-9 min-w-[250px] flex-1 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3">
        <Search className="size-3.5 shrink-0 text-[#64738c]" />

        <input
          value={
            query
          }
          onChange={(
            event,
          ) =>
            onQueryChange(
              event.target.value,
            )
          }
          onKeyDown={(
            event,
          ) => {
            if (
              event.key ===
              "Enter"
            ) {
              onApply();
            }
          }}
          placeholder="Search recipient, subject, message or error..."
          className="min-w-0 flex-1 bg-transparent text-[10px] text-[#26344d] outline-none placeholder:text-[#8c97a9]"
        />
      </label>

      <SelectInput
        value={
          tenantId
        }
        onChange={
          onTenantChange
        }
        className="w-[190px]"
        options={[
          {
            value:
              "",

            label:
              "All organizations",
          },

          ...clients.map(
            (
              client,
            ) => ({
              value:
                client.id,

              label:
                client.name,
            }),
          ),
        ]}
      />

      <SelectInput
        value={
          channel
        }
        onChange={(
          value,
        ) =>
          onChannelChange(
            value as
              | "ALL"
              | MessageChannel,
          )
        }
        className="w-[145px]"
        options={[
          {
            value:
              "ALL",

            label:
              "All channels",
          },

          {
            value:
              "EMAIL",

            label:
              "Email",
          },

          {
            value:
              "SMS",

            label:
              "SMS",
          },
        ]}
      />

      {showStatus ? (
        <SelectInput
          value={
            status
          }
          onChange={(
            value,
          ) =>
            onStatusChange(
              value as
                | "ALL"
                | MessageStatus,
            )
          }
          className="w-[145px]"
          options={[
            {
              value:
                "ALL",

              label:
                "All statuses",
            },

            {
              value:
                "SENT",

              label:
                "Sent",
            },

            {
              value:
                "FAILED",

              label:
                "Failed",
            },

            {
              value:
                "SKIPPED",

              label:
                "Skipped",
            },
          ]}
        />
      ) : null}

      <SelectInput
        value={
          date
        }
        onChange={(
          value,
        ) =>
          onDateChange(
            value as
              | "ALL"
              | "TODAY"
              | "7_DAYS"
              | "30_DAYS"
              | "90_DAYS",
          )
        }
        className="w-[145px]"
        options={[
          {
            value:
              "ALL",

            label:
              "Any date",
          },

          {
            value:
              "TODAY",

            label:
              "Today",
          },

          {
            value:
              "7_DAYS",

            label:
              "Last 7 days",
          },

          {
            value:
              "30_DAYS",

            label:
              "Last 30 days",
          },

          {
            value:
              "90_DAYS",

            label:
              "Last 90 days",
          },
        ]}
      />

      <button
        type="button"
        onClick={
          onApply
        }
        disabled={
          loading
        }
        className="inline-flex h-9 items-center rounded-md bg-[#188653] px-3.5 text-[9.5px] font-semibold text-white disabled:opacity-50"
      >
        Apply
      </button>

      <button
        type="button"
        onClick={
          onRefresh
        }
        disabled={
          loading
        }
        className="grid size-9 place-items-center rounded-md border border-[#dfe5eb] bg-white text-[#61708a] transition hover:bg-[#f7f9fa] disabled:opacity-50"
        aria-label="Refresh communications"
      >
        <RefreshCw
          className={`size-3.5 ${
            loading
              ? "animate-spin"
              : ""
          }`}
        />
      </button>
    </div>
  );
}

function MessageLogsTable({
  logs,
  failureMode = false,
}: {
  logs:
    MessageLog[];

  failureMode?:
    boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1220px] table-fixed text-left">
        <thead>
          <tr className="bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
            <th className="w-[18%] px-4 py-2.5">
              Recipient
            </th>

            <th className="w-[18%] px-3 py-2.5">
              Organization / Branch
            </th>

            <th className="w-[9%] px-3 py-2.5">
              Channel
            </th>

            <th className="w-[10%] px-3 py-2.5">
              Status
            </th>

            <th className="w-[13%] px-3 py-2.5">
              Provider
            </th>

            <th className="w-[13%] px-3 py-2.5">
              Administrator
            </th>

            <th className="w-[12%] px-3 py-2.5">
              Created
            </th>

            <th className="w-[7%] px-3 py-2.5">
              Details
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-[#edf1f4]">
          {logs.map(
            (
              log,
            ) => (
              <MessageLogRow
                key={
                  log.id
                }
                log={
                  log
                }
                failureMode={
                  failureMode
                }
              />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function MessageLogRow({
  log,
  failureMode,
}: {
  log:
    MessageLog;

  failureMode:
    boolean;
}) {
  const [
    expanded,
    setExpanded,
  ] =
    useState(false);

  return (
    <>
      <tr
        className={`h-[64px] transition hover:bg-[#fbfcfd] ${
          failureMode
            ? "bg-[#fffdfd]"
            : ""
        }`}
      >
        <td className="px-4 py-2.5">
          <p className="truncate text-[10px] font-semibold text-[#26344d]">
            {
              log.recipient
            }
          </p>

          {log.subject ? (
            <p className="mt-1 truncate text-[8.5px] text-[#8490a1]">
              {
                log.subject
              }
            </p>
          ) : null}
        </td>

        <td className="px-3 py-2.5">
          <p className="truncate text-[10px] font-medium text-[#526078]">
            {log.organizationName ??
              "Direct recipient"}
          </p>

          {log.branchName ? (
            <p className="mt-1 truncate text-[8.5px] text-[#8490a1]">
              {
                log.branchName
              }
            </p>
          ) : null}
        </td>

        <td className="px-3 py-2.5">
          <ChannelBadge
            value={
              log.channel
            }
          />
        </td>

        <td className="px-3 py-2.5">
          <MessageStatusBadge
            value={
              log.status
            }
          />
        </td>

        <td className="px-3 py-2.5">
          <p className="truncate text-[9.5px] font-medium text-[#526078]">
            {log.provider ??
              "—"}
          </p>
        </td>

        <td className="px-3 py-2.5">
          <p className="truncate text-[9.5px] font-medium text-[#526078]">
            {
              log.createdBy.name
            }
          </p>
        </td>

        <td className="px-3 py-2.5">
          <p className="text-[9.5px] text-[#526078]">
            {formatDate(
              log.createdAt,
            )}
          </p>

          <p className="mt-1 text-[8.5px] text-[#8490a1]">
            {formatTime(
              log.createdAt,
            )}
          </p>
        </td>

        <td className="px-3 py-2.5">
          <button
            type="button"
            onClick={() =>
              setExpanded(
                (
                  current,
                ) =>
                  !current,
              )
            }
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[9px] font-semibold text-[#168650] hover:bg-[#f0f8f3]"
          >
            {expanded
              ? "Hide"
              : "View"}

            <ChevronDown
              className={`size-3 transition ${
                expanded
                  ? "rotate-180"
                  : ""
              }`}
            />
          </button>
        </td>
      </tr>

      {expanded ? (
        <tr>
          <td
            colSpan={
              8
            }
            className="bg-[#fafbfc] px-4 py-4"
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
              <div>
                <p className="text-[8.5px] font-medium uppercase tracking-[0.05em] text-[#8490a1]">
                  Message
                </p>

                <div className="mt-2 whitespace-pre-wrap rounded-[8px] border border-[#e1e7eb] bg-white p-3 text-[9.5px] leading-5 text-[#42516a]">
                  {
                    log.body
                  }
                </div>
              </div>

              <div className="space-y-3">
                <DetailRow
                  label="Provider"
                  value={
                    log.provider ??
                    "Not recorded"
                  }
                />

                <DetailRow
                  label="Sent at"
                  value={
                    log.sentAt
                      ? formatDateTime(
                          log.sentAt,
                        )
                      : "Not recorded"
                  }
                />

                <DetailRow
                  label="Created by"
                  value={
                    log.createdBy.name
                  }
                />

                {log.error ? (
                  <div className="rounded-[8px] border border-red-100 bg-red-50 p-3">
                    <p className="text-[8.5px] font-medium uppercase tracking-[0.05em] text-[#b63a3a]">
                      Provider error
                    </p>

                    <p className="mt-1 text-[9.5px] leading-4 text-[#c94040]">
                      {
                        log.error
                      }
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ComposeView({
  channel,
  setChannel,
  recipientMode,
  setRecipientMode,
  tenantId,
  setTenantId,
  branchId,
  setBranchId,
  audience,
  setAudience,
  selectedRoles,
  setSelectedRoles,
  selectedUserIds,
  setSelectedUserIds,
  templateCode,
  setTemplateCode,
  subject,
  setSubject,
  body,
  setBody,
  recipients,
  setRecipients,
  clients,
  branchOptions,
  branchesLoading,
  channelTemplates,
  selectableUsers,
  selectedClient,
  selectedBranch,
  reviewData,
  error,
  result,
  sending,
  onReview,
  onReset,
}: {
  channel:
    MessageChannel;

  setChannel:
    (
      value:
        MessageChannel,
    ) => void;

  recipientMode:
    RecipientMode;

  setRecipientMode:
    (
      value:
        RecipientMode,
    ) => void;

  tenantId:
    string;

  setTenantId:
    (
      value:
        string,
    ) => void;

  branchId:
    string;

  setBranchId:
    (
      value:
        string,
    ) => void;

  audience:
    MessageAudience;

  setAudience:
    (
      value:
        MessageAudience,
    ) => void;

  selectedRoles:
    string[];

  setSelectedRoles:
    React.Dispatch<
      React.SetStateAction<
        string[]
      >
    >;

  selectedUserIds:
    string[];

  setSelectedUserIds:
    React.Dispatch<
      React.SetStateAction<
        string[]
      >
    >;

  templateCode:
    string;

  setTemplateCode:
    (
      value:
        string,
    ) => void;

  subject:
    string;

  setSubject:
    (
      value:
        string,
    ) => void;

  body:
    string;

  setBody:
    (
      value:
        string,
    ) => void;

  recipients:
    string;

  setRecipients:
    (
      value:
        string,
    ) => void;

  clients:
    ControlCenterClient[];

  branchOptions:
    ControlCenterBranch[];

  branchesLoading:
    boolean;

  channelTemplates:
    ControlCenterTemplate[];

  selectableUsers:
    ControlCenterUser[];

  selectedClient:
    ControlCenterClient | null;

  selectedBranch:
    ControlCenterBranch | null;

  reviewData:
    ReviewData;

  error:
    string | null;

  result:
    SendResult | null;

  sending:
    boolean;

  onReview:
    () => void;

  onReset:
    () => void;
}) {
  return (
    <div className="border-t border-[#edf1f4] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.72fr)]">
        <form
          onSubmit={(
            event,
          ) => {
            event.preventDefault();

            onReview();
          }}
          className="space-y-4"
        >
          <section className="rounded-[10px] border border-[#dfe5eb] bg-white">
            <SectionHeader
              title="Message"
              subtitle="Choose a channel and start from a reusable template or a custom message."
            />

            <div className="grid gap-4 border-t border-[#edf1f4] p-4 md:grid-cols-2">
              <Field>
                <FieldLabel>
                  Channel
                </FieldLabel>

                <SelectInput
                  value={
                    channel
                  }
                  onChange={(
                    value,
                  ) => {
                    setChannel(
                      value as
                        MessageChannel,
                    );

                    setTemplateCode(
                      "",
                    );

                    setSubject(
                      "",
                    );

                    setBody(
                      "",
                    );
                  }}
                  options={[
                    {
                      value:
                        "EMAIL",

                      label:
                        "Email",
                    },

                    {
                      value:
                        "SMS",

                      label:
                        "SMS",
                    },
                  ]}
                />
              </Field>

              <Field>
                <FieldLabel>
                  Template
                </FieldLabel>

                <SelectInput
                  value={
                    templateCode
                  }
                  onChange={
                    setTemplateCode
                  }
                  options={[
                    {
                      value:
                        "",

                      label:
                        "Custom message",
                    },

                    ...channelTemplates.map(
                      (
                        template,
                      ) => ({
                        value:
                          template.code,

                        label:
                          template.name,
                      }),
                    ),
                  ]}
                />
              </Field>
            </div>
          </section>

          <section className="rounded-[10px] border border-[#dfe5eb] bg-white">
            <SectionHeader
              title="Audience"
              subtitle="Define exactly who should receive this communication."
            />

            <div className="grid gap-4 border-t border-[#edf1f4] p-4 md:grid-cols-2">
              <Field>
                <FieldLabel>
                  Recipient source
                </FieldLabel>

                <SelectInput
                  value={
                    recipientMode
                  }
                  onChange={(
                    value,
                  ) => {
                    setRecipientMode(
                      value as
                        RecipientMode,
                    );

                    setSelectedUserIds(
                      [],
                    );
                  }}
                  options={[
                    {
                      value:
                        "AUDIENCE",

                      label:
                        "By organization and role",
                    },

                    {
                      value:
                        "SELECTED_USERS",

                      label:
                        "Selected users",
                    },

                    {
                      value:
                        "DIRECT",

                      label:
                        "Direct contacts",
                    },
                  ]}
                />
              </Field>

              {recipientMode !==
              "DIRECT" ? (
                <Field>
                  <FieldLabel>
                    Organization
                  </FieldLabel>
                  <p className="mb-1.5 text-[9.5px] text-[#718099]">
                    All organizations includes every client. Choose one organization only when you want to limit the message.
                  </p>

                  <SelectInput
                    value={
                      tenantId
                    }
                    onChange={(
                      value,
                    ) => {
                      setTenantId(
                        value,
                      );

                      setBranchId(
                        "",
                      );

                      setSelectedUserIds(
                        [],
                      );
                    }}
                    options={[
                      {
                        value:
                          "",

                        label:
                          "All organizations",
                      },

                      ...clients.map(
                        (
                          client,
                        ) => ({
                          value:
                            client.id,

                          label:
                            client.name,
                        }),
                      ),
                    ]}
                  />
                </Field>
              ) : null}

              {recipientMode ===
              "AUDIENCE" ? (
                <>
                  <Field>
                    <FieldLabel>
                      Audience
                    </FieldLabel>

                    <SelectInput
                      value={
                        audience
                      }
                      onChange={(
                        value,
                      ) => {
                        const next =
                          value as
                            MessageAudience;

                        setAudience(
                          next,
                        );

                        if (
                          next ===
                          "TENANT_OWNERS"
                        ) {
                          setSelectedRoles(
                            [],
                          );
                        }
                      }}
                      options={[
                        {
                          value:
                            "TENANT_USERS",

                          label:
                            "All users",
                        },

                        {
                          value:
                            "TENANT_OWNERS",

                          label:
                            "Owners only",
                        },

                        {
                          value:
                            "BRANCH_USERS",

                          label:
                            "One branch",
                        },
                      ]}
                    />
                  </Field>

                  <Field>
                    <FieldLabel>
                      Branch
                    </FieldLabel>

                    <SelectInput
                      value={
                        branchId
                      }
                      onChange={
                        setBranchId
                      }
                      disabled={
                        !tenantId ||
                        branchesLoading
                      }
                      options={[
                        {
                          value:
                            "",

                          label:
                            branchesLoading
                              ? "Loading branches..."
                              : audience ===
                                  "BRANCH_USERS"
                                ? "Select a branch"
                                : "All branches",
                        },

                        ...branchOptions.map(
                          (
                            branch,
                          ) => ({
                            value:
                              branch.id,

                            label:
                              branch.name,
                          }),
                        ),
                      ]}
                    />
                  </Field>
                </>
              ) : null}

              {recipientMode ===
                "SELECTED_USERS" ||
              (recipientMode ===
                "AUDIENCE" &&
                audience !==
                  "TENANT_OWNERS") ? (
                <div className="md:col-span-2">
                  <FieldLabel>
                    Roles
                  </FieldLabel>
                  <p className="mb-2 text-[9.5px] text-[#718099]">
                    Tick All roles to include everyone, or pick only the people you want: owners, managers, cashiers, officers, agents, and the rest.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#dfe5eb] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#26344d]">
                      <input
                        type="checkbox"
                        checked={selectedRoles.length === 0}
                        onChange={() => setSelectedRoles([])}
                      />
                      All roles
                    </label>
                    {ROLE_CATEGORIES.map((category) => {
                      const checked = selectedRoles.includes(category.value);
                      return (
                        <label
                          key={category.value}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold ${
                            checked
                              ? "border-[#87bfa1] bg-[#eaf6ee] text-[#198b55]"
                              : "border-[#dfe5eb] bg-white text-[#26344d]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedRoles((current) =>
                                checked
                                  ? current.filter((value) => value !== category.value)
                                  : [...current, category.value],
                              );
                            }}
                          />
                          {category.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : recipientMode ===
                  "AUDIENCE" &&
                audience ===
                  "TENANT_OWNERS" ? (
                <div className="md:col-span-2">
                  <p className="rounded-md border border-[#dfe5eb] bg-[#f7f9fb] px-3 py-2 text-[10px] text-[#526078]">
                    This goes to organization owners only, across the organization you chose or every organization if you left All organizations selected.
                  </p>
                </div>
              ) : null}
            </div>

            {recipientMode ===
            "DIRECT" ? (
              <div className="border-t border-[#edf1f4] p-4">
                <Field>
                  <FieldLabel>
                    Direct recipients
                  </FieldLabel>

                  <textarea
                    value={
                      recipients
                    }
                    onChange={(
                      event,
                    ) =>
                      setRecipients(
                        event.target.value,
                      )
                    }
                    rows={4}
                    placeholder={
                      channel ===
                      "EMAIL"
                        ? "name@example.com, another@example.com"
                        : "+256700000000, +256701000000"
                    }
                    className="w-full resize-none rounded-md border border-[#dfe5eb] bg-white px-3 py-2.5 text-[10.5px] leading-5 text-[#26344d] outline-none placeholder:text-[#9aa4b2] focus:border-[#87bfa1] focus:ring-2 focus:ring-[#e6f4eb]"
                  />
                </Field>
              </div>
            ) : null}

            {recipientMode ===
            "SELECTED_USERS" ? (
              <SelectedUsersPanel
                users={
                  selectableUsers
                }
                selectedIds={
                  selectedUserIds
                }
                setSelectedIds={
                  setSelectedUserIds
                }
                channel={
                  channel
                }
              />
            ) : null}
          </section>

          <section className="rounded-[10px] border border-[#dfe5eb] bg-white">
            <SectionHeader
              title="Content"
              subtitle={
                channel ===
                "EMAIL"
                  ? "Prepare the subject and email body."
                  : "Prepare the SMS message."
              }
            />

            <div className="space-y-4 border-t border-[#edf1f4] p-4">
              {channel ===
              "EMAIL" ? (
                <Field>
                  <FieldLabel>
                    Subject
                  </FieldLabel>

                  <input
                    value={
                      subject
                    }
                    onChange={(
                      event,
                    ) =>
                      setSubject(
                        event.target.value,
                      )
                    }
                    maxLength={
                      200
                    }
                    className="h-10 w-full rounded-md border border-[#dfe5eb] bg-white px-3 text-[10.5px] font-medium text-[#26344d] outline-none focus:border-[#87bfa1] focus:ring-2 focus:ring-[#e6f4eb]"
                  />
                </Field>
              ) : null}

              <Field>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>
                    Message
                  </FieldLabel>

                  <span className="text-[8.5px] text-[#8490a1]">
                    {
                      body.length
                    }{" "}
                    / 1600
                  </span>
                </div>

                <textarea
                  value={
                    body
                  }
                  onChange={(
                    event,
                  ) =>
                    setBody(
                      event.target.value,
                    )
                  }
                  rows={10}
                  maxLength={
                    1600
                  }
                  className="w-full resize-none rounded-md border border-[#dfe5eb] bg-white px-3 py-3 text-[10.5px] leading-5 text-[#26344d] outline-none focus:border-[#87bfa1] focus:ring-2 focus:ring-[#e6f4eb]"
                />
              </Field>
            </div>
          </section>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] font-medium text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={
                onReset
              }
              className="h-9 rounded-md border border-[#dfe5eb] bg-white px-3.5 text-[10px] font-semibold text-[#526078]"
            >
              Clear
            </button>

            <button
              type="submit"
              disabled={
                sending
              }
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-4 text-[10px] font-semibold text-white disabled:opacity-50"
            >
              Review message
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="rounded-[10px] border border-[#dfe5eb] bg-white">
            <SectionHeader
              title="Send summary"
            />

            <div className="space-y-3 border-t border-[#edf1f4] p-4">
              <SummaryRow
                label="Channel"
                value={
                  channel
                }
              />

              <SummaryRow
                label="Organization"
                value={
                  selectedClient
                    ?.name ??
                  (recipientMode ===
                  "DIRECT"
                    ? "Direct recipients"
                    : "Not selected")
                }
              />

              <SummaryRow
                label="Branch"
                value={
                  selectedBranch
                    ?.name ??
                  "All / not selected"
                }
              />

              <SummaryRow
                label="Audience"
                value={
                  reviewData.recipientLabel
                }
              />

              <SummaryRow
                label="Recipients"
                value={
                  reviewData.recipientCount !=
                  null
                    ? ccNumber(
                        reviewData.recipientCount,
                      )
                    : "Resolved by server"
                }
              />
            </div>
          </section>

          {result ? (
            <LatestResultCard
              result={
                result
              }
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function SelectedUsersPanel({
  users,
  selectedIds,
  setSelectedIds,
  channel,
}: {
  users:
    ControlCenterUser[];

  selectedIds:
    string[];

  setSelectedIds:
    React.Dispatch<
      React.SetStateAction<
        string[]
      >
    >;

  channel:
    MessageChannel;
}) {
  const [
    query,
    setQuery,
  ] =
    useState("");

  const filtered =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        if (
          !needle
        ) {
          return users;
        }

        return users.filter(
          (
            user,
          ) =>
            [
              user.name,
              user.email,
              user.phone,
              user.tenant.name,
              user.branch?.name,
            ].some(
              (
                value,
              ) =>
                String(
                  value ??
                    "",
                )
                  .toLowerCase()
                  .includes(
                    needle,
                  ),
            ),
        );
      },
      [
        query,
        users,
      ],
    );

  return (
    <div className="border-t border-[#edf1f4]">
      <div className="flex items-center gap-3 border-b border-[#edf1f4] px-4 py-3">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3">
          <Search className="size-3.5 text-[#64738c]" />

          <input
            value={
              query
            }
            onChange={(
              event,
            ) =>
              setQuery(
                event.target.value,
              )
            }
            placeholder="Search users..."
            className="min-w-0 flex-1 bg-transparent text-[10px] outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() =>
            setSelectedIds(
              selectedIds.length ===
                filtered.length &&
                filtered.length >
                  0
                ? []
                : filtered.map(
                    (
                      user,
                    ) =>
                      user.id,
                  ),
            )
          }
          className="h-8 rounded-md border border-[#dfe5eb] bg-white px-3 text-[9.5px] font-semibold text-[#526078]"
        >
          Select all
        </button>
      </div>

      <div className="max-h-[300px] divide-y divide-[#edf1f4] overflow-y-auto">
        {filtered.map(
          (
            user,
          ) => (
            <label
              key={
                user.id
              }
              className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-[#fbfcfd]"
            >
              <input
                type="checkbox"
                checked={
                  selectedIds.includes(
                    user.id,
                  )
                }
                onChange={(
                  event,
                ) =>
                  setSelectedIds(
                    (
                      current,
                    ) =>
                      event.target.checked
                        ? [
                            ...new Set(
                              [
                                ...current,
                                user.id,
                              ],
                            ),
                          ]
                        : current.filter(
                            (
                              id,
                            ) =>
                              id !==
                              user.id,
                          ),
                  )
                }
                className="size-4 accent-[#188653]"
              />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10px] font-semibold text-[#26344d]">
                  {
                    user.name
                  }
                </span>

                <span className="mt-1 block truncate text-[9px] text-[#718099]">
                  {channel ===
                  "EMAIL"
                    ? user.email
                    : user.phone ??
                      "No phone"}{" "}
                  ·{" "}
                  {
                    user.tenant.name
                  }
                </span>
              </span>
            </label>
          ),
        )}
      </div>
    </div>
  );
}

function TemplatesView({
  templates,
  onUseTemplate,
}: {
  templates:
    ControlCenterTemplate[];

  onUseTemplate:
    (
      template:
        ControlCenterTemplate,
    ) => void;
}) {
  return (
    <div className="grid gap-3 border-t border-[#edf1f4] p-4 lg:grid-cols-2">
      {templates.map(
        (
          template,
        ) => (
          <article
            key={
              template.id
            }
            className="rounded-[10px] border border-[#dfe5eb] bg-white p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10.5px] font-semibold text-[#17233c]">
                  {
                    template.name
                  }
                </p>

                <p className="mt-1 text-[8.5px] text-[#8490a1]">
                  {
                    template.code
                  }
                </p>
              </div>

              <ChannelBadge
                value={
                  template.channel
                }
              />
            </div>

            {template.subject ? (
              <p className="mt-4 text-[10px] font-semibold text-[#26344d]">
                {
                  template.subject
                }
              </p>
            ) : null}

            <p className="mt-2 line-clamp-4 whitespace-pre-line text-[9.5px] leading-5 text-[#718099]">
              {
                template.body
              }
            </p>

            <button
              type="button"
              onClick={() =>
                onUseTemplate(
                  template,
                )
              }
              className="mt-4 inline-flex h-8 items-center gap-1.5 text-[9.5px] font-semibold text-[#168650]"
            >
              Use template
              <ArrowRight className="size-3" />
            </button>
          </article>
        ),
      )}
    </div>
  );
}

function ReviewDialog({
  channel,
  subject,
  body,
  reviewData,
  selectedClient,
  selectedBranch,
  sending,
  onClose,
  onSend,
}: {
  channel:
    MessageChannel;

  subject:
    string;

  body:
    string;

  reviewData:
    ReviewData;

  selectedClient:
    ControlCenterClient | null;

  selectedBranch:
    ControlCenterBranch | null;

  sending:
    boolean;

  onClose:
    () => void;

  onSend:
    () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center px-4">
      <button
        type="button"
        disabled={
          sending
        }
        onClick={
          onClose
        }
        className="absolute inset-0 bg-[#0f172a]/35 backdrop-blur-[1px]"
      />

      <section className="relative z-10 w-full max-w-[620px] overflow-hidden rounded-[12px] border border-[#dfe5eb] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between border-b border-[#edf1f4] px-5 py-4">
          <div>
            <p className="text-[13px] font-semibold text-[#17233c]">
              Review message
            </p>

            <p className="mt-1 text-[9.5px] text-[#718099]">
              Confirm the audience and content before sending.
            </p>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="grid size-8 place-items-center"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-3 border-b border-[#edf1f4] p-4 sm:grid-cols-2">
          <ReviewMetric
            label="Channel"
            value={
              channel
            }
          />

          <ReviewMetric
            label="Recipients"
            value={
              reviewData.recipientCount !=
              null
                ? ccNumber(
                    reviewData.recipientCount,
                  )
                : "Server-resolved"
            }
          />

          <ReviewMetric
            label="Organization"
            value={
              selectedClient
                ?.name ??
              "Direct recipients"
            }
          />

          <ReviewMetric
            label="Branch"
            value={
              selectedBranch
                ?.name ??
              "All / not applicable"
            }
          />
        </div>

        <div className="p-4">
          {channel ===
          "EMAIL" ? (
            <>
              <p className="text-[8.5px] uppercase text-[#8490a1]">
                Subject
              </p>

              <p className="mt-1 text-[10.5px] font-semibold text-[#26344d]">
                {
                  subject
                }
              </p>
            </>
          ) : null}

          <p className="mt-4 text-[8.5px] uppercase text-[#8490a1]">
            Message
          </p>

          <div className="mt-2 max-h-[250px] overflow-y-auto whitespace-pre-wrap rounded-[8px] border border-[#e3e8ed] bg-[#fafbfc] p-3 text-[10px] leading-5 text-[#42516a]">
            {
              body
            }
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#edf1f4] px-4 py-3">
          <button
            type="button"
            disabled={
              sending
            }
            onClick={
              onClose
            }
            className="h-9 rounded-md border border-[#dfe5eb] px-3.5 text-[10px] font-semibold text-[#526078]"
          >
            Back
          </button>

          <button
            type="button"
            disabled={
              sending
            }
            onClick={
              onSend
            }
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-4 text-[10px] font-semibold text-white disabled:opacity-50"
          >
            <Send className="size-3.5" />

            {sending
              ? "Sending..."
              : `Send ${channel}`}
          </button>
        </div>
      </section>
    </div>
  );
}

function PaginationFooter({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
}: {
  page:
    number;

  totalPages:
    number;

  pageSize:
    number;

  totalItems:
    number;

  onPageChange:
    (
      page:
        number,
    ) => void;
}) {
  const first =
    totalItems
      ? (
          page -
          1
        ) *
          pageSize +
        1
      : 0;

  const last =
    Math.min(
      page *
        pageSize,
      totalItems,
    );

  return (
    <div className="flex min-h-[48px] items-center justify-between gap-3 border-t border-[#edf1f4] px-4 py-2">
      <p className="text-[9.5px] text-[#68768f]">
        Showing {first} to {last} of {totalItems}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={
            page <=
            1
          }
          onClick={() =>
            onPageChange(
              page -
                1,
            )
          }
          className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        <span className="px-2 text-[9.5px] font-semibold text-[#526078]">
          {page} /{" "}
          {totalPages}
        </span>

        <button
          type="button"
          disabled={
            page >=
            totalPages
          }
          onClick={() =>
            onPageChange(
              page +
                1,
            )
          }
          className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] disabled:opacity-40"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="animate-pulse divide-y divide-[#edf1f4] border-t border-[#edf1f4]">
      {Array.from({
        length: 5,
      }).map(
        (
          _,
          index,
        ) => (
          <div
            key={
              index
            }
            className="h-[62px] bg-[#fafbfc]"
          />
        ),
      )}
    </div>
  );
}

function ActionCard({
  icon,
  tone,
  title,
  description,
  actionLabel,
  onClick,
}: {
  icon:
    LucideIcon;

  tone:
    IconTone;

  title:
    string;

  description:
    string;

  actionLabel:
    string;

  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className="group rounded-[9px] border border-[#dfe5eb] p-4 text-left transition hover:bg-[#fbfdfc]"
    >
      <SmallIcon
        icon={
          icon
        }
        tone={
          tone
        }
      />

      <p className="mt-3 text-[10.5px] font-semibold text-[#17233c]">
        {title}
      </p>

      <p className="mt-1 min-h-[44px] text-[9.5px] leading-5 text-[#718099]">
        {description}
      </p>

      <span className="mt-3 inline-flex items-center gap-1 text-[9.5px] font-semibold text-[#168650]">
        {actionLabel}
        <ArrowRight className="size-3" />
      </span>
    </button>
  );
}

function Field({
  children,
  className = "",
}: {
  children:
    React.ReactNode;
  className?:
    string;
}) {
  return (
    <label className={`block ${className}`}>
      {children}
    </label>
  );
}

function FieldLabel({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <span className="mb-1.5 block text-[9.5px] font-semibold text-[#526078]">
      {children}
    </span>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title:
    string;

  subtitle?:
    string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] font-semibold text-[#17233c]">
        {title}
      </p>

      {subtitle ? (
        <p className="mt-1 text-[9.5px] text-[#718099]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  disabled,
  className = "",
}: {
  value:
    string;

  onChange:
    (
      value:
        string,
    ) => void;

  options:
    Array<{
      value:
        string;

      label:
        string;
    }>;

  disabled?:
    boolean;

  className?:
    string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={
          value
        }
        disabled={
          disabled
        }
        onChange={(
          event,
        ) =>
          onChange(
            event.target.value,
          )
        }
        className="h-10 w-full appearance-none rounded-md border border-[#dfe5eb] bg-white px-3 pr-8 text-[10px] font-medium text-[#34425b] outline-none disabled:bg-[#f6f8fa]"
      >
        {options.map(
          (
            option,
          ) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {
                option.label
              }
            </option>
          ),
        )}
      </select>

      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#68768f]" />
    </div>
  );
}

function CoverageRow({
  label,
  value,
}: {
  label:
    string;

  value:
    number;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[9.5px] text-[#718099]">
        {label}
      </span>

      <span className="text-[10.5px] font-semibold text-[#26344d]">
        {ccNumber(
          value,
        )}
      </span>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div>
      <p className="text-[8.5px] uppercase text-[#8490a1]">
        {label}
      </p>

      <p className="mt-1 text-[9.5px] font-medium text-[#526078]">
        {value}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[9px] text-[#8490a1]">
        {label}
      </span>

      <span className="max-w-[65%] text-right text-[9.5px] font-semibold text-[#26344d]">
        {value}
      </span>
    </div>
  );
}

function ReviewMetric({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div className="rounded-[8px] bg-[#f7f9fa] p-3">
      <p className="text-[8.5px] uppercase text-[#8490a1]">
        {label}
      </p>

      <p className="mt-1 text-[10px] font-semibold text-[#26344d]">
        {value}
      </p>
    </div>
  );
}

function LatestResultCard({
  result,
}: {
  result:
    SendResult;
}) {
  return (
    <section className="rounded-[10px] border border-[#dfe5eb] bg-white">
      <SectionHeader
        title="Latest send result"
      />

      <div className="grid grid-cols-3 border-t border-[#edf1f4]">
        <ResultMetric
          label="Sent"
          value={
            result.sent
          }
          tone="green"
        />

        <ResultMetric
          label="Failed"
          value={
            result.failed
          }
          tone="red"
        />

        <ResultMetric
          label="Skipped"
          value={
            result.skipped
          }
          tone="slate"
        />
      </div>
    </section>
  );
}

function ResultMetric({
  label,
  value,
  tone,
}: {
  label:
    string;

  value:
    number;

  tone:
    "green" |
    "red" |
    "slate";
}) {
  return (
    <div className="border-r border-[#edf1f4] px-3 py-4 text-center last:border-r-0">
      <p
        className={`text-[18px] font-bold ${
          tone ===
          "green"
            ? "text-[#168650]"
            : tone ===
                "red"
              ? "text-[#c94040]"
              : "text-[#65738a]"
        }`}
      >
        {ccNumber(
          value,
        )}
      </p>

      <p className="mt-1 text-[8.5px] text-[#8490a1]">
        {label}
      </p>
    </div>
  );
}

function ChannelBadge({
  value,
}: {
  value:
    MessageChannel;
}) {
  return (
    <span
      className={`inline-flex rounded-[5px] px-2 py-1 text-[8.5px] font-semibold ${
        value ===
        "EMAIL"
          ? "bg-[#eaf6ee] text-[#1b804e]"
          : "bg-[#edf4ff] text-[#3569b8]"
      }`}
    >
      {value ===
      "EMAIL"
        ? "Email"
        : "SMS"}
    </span>
  );
}

function MessageStatusBadge({
  value,
}: {
  value:
    string;
}) {
  const normalized =
    value.toUpperCase();

  return (
    <span
      className={`inline-flex rounded-[5px] px-2 py-1 text-[8.5px] font-semibold ${
        normalized ===
        "SENT"
          ? "bg-[#eaf6ee] text-[#1b804e]"
          : normalized ===
              "FAILED"
            ? "bg-[#fff0f0] text-[#c94040]"
            : "bg-[#fff3df] text-[#b96912]"
      }`}
    >
      {labelFromValue(
        value,
      )}
    </span>
  );
}

function EmptyState({
  icon:
    Icon,
  title,
  description,
}: {
  icon:
    LucideIcon;

  title:
    string;

  description:
    string;
}) {
  return (
    <div className="grid min-h-[240px] place-items-center px-6 py-12 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-[#eef6f1] text-[#168650]">
          <Icon className="size-5" />
        </div>

        <p className="mt-3 text-[12px] font-semibold text-[#17233c]">
          {title}
        </p>

        <p className="mx-auto mt-1 max-w-md text-[10px] leading-5 text-[#6b7890]">
          {description}
        </p>
      </div>
    </div>
  );
}

type IconTone =
  | "green"
  | "blue"
  | "amber"
  | "slate"
  | "red";

function MetricCard({
  icon,
  tone,
  label,
  value,
  secondary,
}: {
  icon:
    LucideIcon;

  tone:
    IconTone;

  label:
    string;

  value:
    string;

  secondary:
    string;
}) {
  return (
    <section className="flex min-h-[108px] items-center gap-4 rounded-[10px] border border-[#dfe5eb] bg-white px-4">
      <LargeIcon
        icon={
          icon
        }
        tone={
          tone
        }
      />

      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-[#5e6c84]">
          {label}
        </p>

        <p className="mt-1 truncate text-[22px] font-bold leading-7 tracking-[-0.02em] text-[#101d37]">
          {value}
        </p>

        <p className="mt-1 text-[9.5px] text-[#68758d]">
          {secondary}
        </p>
      </div>
    </section>
  );
}

function LargeIcon({
  icon:
    Icon,
  tone,
}: {
  icon:
    LucideIcon;

  tone:
    IconTone;
}) {
  return (
    <span
      className={`grid size-[52px] shrink-0 place-items-center rounded-[11px] ${iconTone(
        tone,
      )}`}
    >
      <Icon
        className="size-[22px]"
        strokeWidth={
          1.9
        }
      />
    </span>
  );
}

function SmallIcon({
  icon:
    Icon,
  tone,
}: {
  icon:
    LucideIcon;

  tone:
    IconTone;
}) {
  return (
    <span
      className={`grid size-[35px] shrink-0 place-items-center rounded-[8px] ${iconTone(
        tone,
      )}`}
    >
      <Icon className="size-[16px]" />
    </span>
  );
}

function iconTone(
  tone:
    IconTone,
) {
  if (
    tone ===
    "blue"
  ) {
    return "bg-[#edf4ff] text-[#276de9]";
  }

  if (
    tone ===
    "amber"
  ) {
    return "bg-[#fff3df] text-[#e38012]";
  }

  if (
    tone ===
    "red"
  ) {
    return "bg-[#fff0f0] text-[#df4545]";
  }

  if (
    tone ===
    "slate"
  ) {
    return "bg-[#eef2f6] text-[#65738a]";
  }

  return "bg-[#eaf6ee] text-[#198b55]";
}

function buildReviewData({
  recipientMode,
  audience,
  selectedClient,
  selectedBranch,
  selectedUsers,
  selectableUsers,
  directRecipients,
  selectedRoles,
}: {
  recipientMode:
    RecipientMode;

  audience:
    MessageAudience;

  selectedClient:
    ControlCenterClient | null;

  selectedBranch:
    ControlCenterBranch | null;

  selectedUsers:
    ControlCenterUser[];

  selectableUsers:
    ControlCenterUser[];

  directRecipients:
    string[];

  selectedRoles:
    string[];
}): ReviewData {
  if (
    recipientMode ===
    "DIRECT"
  ) {
    return {
      recipientLabel:
        "Direct contacts",

      recipientCount:
        directRecipients.length,
    };
  }

  if (
    recipientMode ===
    "SELECTED_USERS"
  ) {
    return {
      recipientLabel:
        "Selected users",

      recipientCount:
        selectedUsers.length,
    };
  }

  const scopeLabel =
    selectedBranch
      ? selectedBranch.name
      : selectedClient
        ? selectedClient.name
        : "All organizations";

  if (
    selectedRoles.length >
    0
  ) {
    const labels =
      ROLE_CATEGORIES.filter(
        (
          category,
        ) =>
          selectedRoles.includes(
            category.value,
          ),
      ).map(
        (
          category,
        ) =>
          category.label,
      );

    return {
      recipientLabel:
        `${labels.join(", ")} · ${scopeLabel}`,

      recipientCount:
        selectableUsers.length,
    };
  }

  if (
    audience ===
    "TENANT_OWNERS"
  ) {
    return {
      recipientLabel:
        `Owners · ${scopeLabel}`,

      recipientCount:
        selectableUsers.length,
    };
  }

  if (
    audience ===
    "BRANCH_USERS"
  ) {
    return {
      recipientLabel:
        selectedBranch
          ? `${selectedBranch.name} users`
          : "Branch users",

      recipientCount:
        selectableUsers.length,
    };
  }

  return {
    recipientLabel:
      selectedClient
        ? `${selectedClient.name} users`
        : "All users",

    recipientCount:
      selectableUsers.length,
  };
}

function userMatchesSelectedRoles(
  user:
    ControlCenterUser,
  selectedRoles:
    string[],
) {
  if (
    !selectedRoles.length
  ) {
    return true;
  }

  const accepted =
    new Set(
      roleNamesForSelection(
        selectedRoles,
      ).map(
        (
          name,
        ) =>
          name.toLowerCase(),
      ),
    );

  return user.roles.some(
    (
      role,
    ) =>
      accepted.has(
        role.toLowerCase(),
      ),
  );
}

function resolveDateRange(
  value:
    "ALL" |
    "TODAY" |
    "7_DAYS" |
    "30_DAYS" |
    "90_DAYS",
) {
  if (
    value ===
    "ALL"
  ) {
    return {
      dateFrom:
        undefined,

      dateTo:
        undefined,
    };
  }

  const now =
    new Date();

  const end =
    new Date(
      now,
    );

  const start =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

  if (
    value ===
    "7_DAYS"
  ) {
    start.setDate(
      start.getDate() -
        7,
    );
  }

  if (
    value ===
    "30_DAYS"
  ) {
    start.setDate(
      start.getDate() -
        30,
    );
  }

  if (
    value ===
    "90_DAYS"
  ) {
    start.setDate(
      start.getDate() -
        90,
    );
  }

  return {
    dateFrom:
      start.toISOString(),

    dateTo:
      end.toISOString(),
  };
}

function labelFromValue(
  value:
    string,
) {
  return value
    .replace(
      /_/g,
      " ",
    )
    .toLowerCase()
    .replace(
      /\b\w/g,
      (
        letter,
      ) =>
        letter.toUpperCase(),
    );
}

function formatDate(
  value:
    string,
) {
  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric",
    },
  ).format(
    date,
  );
}

function formatTime(
  value:
    string,
) {
  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      hour:
        "2-digit",

      minute:
        "2-digit",
    },
  ).format(
    date,
  );
}

function formatDateTime(
  value:
    string,
) {
  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",
    },
  ).format(
    date,
  );
}