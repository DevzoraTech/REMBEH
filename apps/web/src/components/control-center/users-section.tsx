"use client";

import {
  Activity,
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Laptop,
  LockKeyhole,
  MoreVertical,
  Search,
  ShieldCheck,
  Smartphone,
  UserCheck,
  UserMinus,
  Users,
  UserX,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import { controlCenterFetch } from "../../lib/control-center-api";
import type { ControlCenterSession } from "../../lib/control-center-session";

import type {
  ControlCenterUser,
} from "./types";

import {
  ccDate,
  ccDateTime,
  ccNumber,
} from "./formatters";

type UserView =
  | "DIRECTORY"
  | "ISSUES"
  | "SESSIONS"
  | "ROLES";

type UserStatusAction =
  | "ACTIVE"
  | "SUSPENDED"
  | "INACTIVE";

type StatusDialogState = {
  user: ControlCenterUser;
  status: UserStatusAction;
} | null;

type RoleSummary = {
  role: string;
  count: number;
  active: number;
  suspended: number;
};

const PAGE_SIZE_OPTIONS = [
  10,
  20,
  50,
];

export function ControlCenterUsersSection({
  session,
  users = [],
  onUpdated,
}: {
  session: ControlCenterSession;
  users?: ControlCenterUser[];
  onUpdated: () => Promise<void>;
}) {
  const userRows =
    Array.isArray(users)
      ? users
      : [];

  const [view, setView] =
    useState<UserView>("DIRECTORY");

  const [query, setQuery] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("ALL");

  const [roleFilter, setRoleFilter] =
    useState("ALL");

  const [organizationFilter, setOrganizationFilter] =
    useState("ALL");

  const [sessionFilter, setSessionFilter] =
    useState("ALL");

  const [page, setPage] =
    useState(1);

  const [pageSize, setPageSize] =
    useState(10);

  const [selectedUser, setSelectedUser] =
    useState<ControlCenterUser | null>(null);

  const [statusDialog, setStatusDialog] =
    useState<StatusDialogState>(null);

  const [reason, setReason] =
    useState("");

  const [busyUserId, setBusyUserId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const roles =
    useMemo(() => {
      const values =
        new Set<string>();

      for (const user of userRows) {
        for (const role of user.roles) {
          values.add(role);
        }
      }

      return [...values].sort(
        (a, b) =>
          a.localeCompare(b),
      );
    }, [
      userRows,
    ]);

  const organizations =
    useMemo(() => {
      const map =
        new Map<
          string,
          string
        >();

      for (const user of userRows) {
        map.set(
          user.tenant.id,
          user.tenant.name,
        );
      }

      return [...map.entries()]
        .map(
          ([
            id,
            name,
          ]) => ({
            id,
            name,
          }),
        )
        .sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
            ),
        );
    }, [
      userRows,
    ]);

  const accessIssueUsers =
    useMemo(
      () =>
        userRows.filter(
          (user) =>
            [
              "SUSPENDED",
              "INACTIVE",
              "PENDING_VERIFICATION",
              "INVITED",
            ].includes(
              user.status.toUpperCase(),
            ),
        ),
      [userRows],
    );

  const activeSessions =
    useMemo(
      () =>
        userRows.filter(
          (user) =>
            user.sessionActive,
        ),
      [userRows],
    );

  const neverUsedUsers =
    useMemo(
      () =>
        userRows.filter(
          (user) =>
            !user.lastUsedAt,
        ),
      [userRows],
    );

  const roleSummary =
    useMemo<RoleSummary[]>(() => {
      return roles
        .map((role) => {
          const matching =
            userRows.filter(
              (user) =>
                user.roles.includes(
                  role,
                ),
            );

          return {
            role,

            count:
              matching.length,

            active:
              matching.filter(
                (user) =>
                  user.status ===
                  "ACTIVE",
              ).length,

            suspended:
              matching.filter(
                (user) =>
                  user.status ===
                  "SUSPENDED",
              ).length,
          };
        })
        .sort(
          (a, b) =>
            b.count -
            a.count,
        );
    }, [
      roles,
      userRows,
    ]);

  const filteredUsers =
    useMemo(() => {
      const needle =
        query
          .trim()
          .toLowerCase();

      return userRows.filter(
        (user) => {
          const matchesView =
            view === "DIRECTORY"
              ? true
              : view === "ISSUES"
                ? [
                    "SUSPENDED",
                    "INACTIVE",
                    "PENDING_VERIFICATION",
                    "INVITED",
                  ].includes(
                    user.status.toUpperCase(),
                  )
                : view === "SESSIONS"
                  ? true
                  : false;

          const matchesSearch =
            !needle ||
            [
              user.name,
              user.email,
              user.phone,
              user.publicId,
              user.tenant.name,
              user.branch?.name,
              user.roles.join(
                " ",
              ),
              user.lastUsedDevice,
              user.lastUsedPlatform,
            ].some((value) =>
              (
                value ??
                ""
              )
                .toLowerCase()
                .includes(
                  needle,
                ),
            );

          const matchesStatus =
            statusFilter === "ALL" ||
            user.status ===
              statusFilter;

          const matchesRole =
            roleFilter === "ALL" ||
            user.roles.includes(
              roleFilter,
            );

          const matchesOrganization =
            organizationFilter ===
              "ALL" ||
            user.tenant.id ===
              organizationFilter;

          const matchesSession =
            sessionFilter === "ALL"
              ? true
              : sessionFilter ===
                  "ACTIVE"
                ? user.sessionActive
                : sessionFilter ===
                    "NO_ACTIVE"
                  ? !user.sessionActive
                  : !user.lastUsedAt;

          return (
            matchesView &&
            matchesSearch &&
            matchesStatus &&
            matchesRole &&
            matchesOrganization &&
            matchesSession
          );
        },
      );
    }, [
      organizationFilter,
      query,
      roleFilter,
      sessionFilter,
      statusFilter,
      userRows,
      view,
    ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredUsers.length /
          pageSize,
      ),
    );

  const currentPage =
    Math.min(
      page,
      totalPages,
    );

  const pageRows =
    filteredUsers.slice(
      (
        currentPage -
        1
      ) *
        pageSize,
      currentPage *
        pageSize,
    );

  function changeView(
    nextView: UserView,
  ) {
    setView(
      nextView,
    );

    setPage(
      1,
    );

    if (
      nextView ===
      "ISSUES"
    ) {
      setStatusFilter(
        "ALL",
      );
    }

    if (
      nextView ===
      "SESSIONS"
    ) {
      setSessionFilter(
        "ALL",
      );
    }
  }

  function resetPage() {
    setPage(
      1,
    );
  }

  function openStatusDialog(
    user: ControlCenterUser,
    status: UserStatusAction,
  ) {
    setReason(
      "",
    );

    setError(
      null,
    );

    setStatusDialog({
      user,
      status,
    });
  }

  async function submitStatusChange() {
    if (
      !statusDialog
    ) {
      return;
    }

    if (
      statusDialog.status ===
        "SUSPENDED" &&
      !reason.trim()
    ) {
      setError(
        "A suspension reason is required.",
      );

      return;
    }

    setBusyUserId(
      statusDialog.user.id,
    );

    setError(
      null,
    );

    try {
      await controlCenterFetch(
        `/users/${statusDialog.user.id}/status`,
        session,
        {
          method:
            "PATCH",

          body:
            JSON.stringify({
              status:
                statusDialog.status,

              reason:
                statusDialog.status ===
                "SUSPENDED"
                  ? reason.trim()
                  : undefined,
            }),
        },
      );

      await onUpdated();

      setSelectedUser(
        (current) =>
          current?.id ===
          statusDialog.user.id
            ? {
                ...current,
                status:
                  statusDialog.status,
              }
            : current,
      );

      setStatusDialog(
        null,
      );

      setReason(
        "",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update user access.",
      );
    } finally {
      setBusyUserId(
        null,
      );
    }
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[1500px]">
        <PageHeader />

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Users}
            tone="green"
            label="Total users"
            value={ccNumber(
              userRows.length,
            )}
            secondary="Across all organizations"
          />

          <MetricCard
            icon={UserCheck}
            tone="blue"
            label="Active users"
            value={ccNumber(
              userRows.filter(
                (user) =>
                  user.status ===
                  "ACTIVE",
              ).length,
            )}
            secondary="Accounts with active access"
          />

          <MetricCard
            icon={AlertTriangle}
            tone="amber"
            label="Access issues"
            value={ccNumber(
              accessIssueUsers.length,
            )}
            secondary="Suspended, inactive or pending"
          />

          <MetricCard
            icon={Activity}
            tone="purple"
            label="Active sessions"
            value={ccNumber(
              activeSessions.length,
            )}
            secondary={`${ccNumber(
              neverUsedUsers.length,
            )} never used`}
          />
        </div>

        <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <UserTabs
            active={view}
            onChange={
              changeView
            }
            counts={{
              directory:
                userRows.length,

              issues:
                accessIssueUsers.length,

              sessions:
                activeSessions.length,

              roles:
                roleSummary.length,
            }}
          />

          {view ===
          "ROLES" ? (
            <RoleDistributionView
              rows={
                roleSummary
              }
              users={
                userRows
              }
              onSelectRole={(
                role,
              ) => {
                setRoleFilter(
                  role,
                );

                setView(
                  "DIRECTORY",
                );

                setPage(
                  1,
                );
              }}
            />
          ) : (
            <>
              <UserFilters
                view={
                  view
                }
                query={
                  query
                }
                statusFilter={
                  statusFilter
                }
                roleFilter={
                  roleFilter
                }
                organizationFilter={
                  organizationFilter
                }
                sessionFilter={
                  sessionFilter
                }
                roles={
                  roles
                }
                organizations={
                  organizations
                }
                onQueryChange={(
                  value,
                ) => {
                  setQuery(
                    value,
                  );

                  resetPage();
                }}
                onStatusChange={(
                  value,
                ) => {
                  setStatusFilter(
                    value,
                  );

                  resetPage();
                }}
                onRoleChange={(
                  value,
                ) => {
                  setRoleFilter(
                    value,
                  );

                  resetPage();
                }}
                onOrganizationChange={(
                  value,
                ) => {
                  setOrganizationFilter(
                    value,
                  );

                  resetPage();
                }}
                onSessionChange={(
                  value,
                ) => {
                  setSessionFilter(
                    value,
                  );

                  resetPage();
                }}
              />

              {error &&
              !statusDialog ? (
                <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-[10px] font-medium text-red-700">
                  {error}
                </div>
              ) : null}

              {pageRows.length ? (
                <>
                  <UsersTable
                    rows={
                      pageRows
                    }
                    onOpenUser={
                      setSelectedUser
                    }
                    onStatusAction={
                      openStatusDialog
                    }
                    busyUserId={
                      busyUserId
                    }
                  />

                  <PaginationFooter
                    page={
                      currentPage
                    }
                    totalPages={
                      totalPages
                    }
                    totalItems={
                      filteredUsers.length
                    }
                    firstItem={
                      filteredUsers.length
                        ? (
                            currentPage -
                            1
                          ) *
                            pageSize +
                          1
                        : 0
                    }
                    lastItem={Math.min(
                      currentPage *
                        pageSize,
                      filteredUsers.length,
                    )}
                    pageSize={
                      pageSize
                    }
                    onPageChange={
                      setPage
                    }
                    onPageSizeChange={(
                      value,
                    ) => {
                      setPageSize(
                        value,
                      );

                      setPage(
                        1,
                      );
                    }}
                  />
                </>
              ) : (
                <UsersEmptyState
                  view={
                    view
                  }
                />
              )}
            </>
          )}
        </section>
      </div>

      {selectedUser ? (
        <UserDetailPanel
          user={
            selectedUser
          }
          onClose={() =>
            setSelectedUser(
              null,
            )
          }
          onStatusAction={
            openStatusDialog
          }
        />
      ) : null}

      {statusDialog ? (
        <StatusActionDialog
          state={
            statusDialog
          }
          reason={
            reason
          }
          error={
            error
          }
          busy={
            busyUserId ===
            statusDialog.user.id
          }
          onReasonChange={
            setReason
          }
          onClose={() => {
            if (
              busyUserId
            ) {
              return;
            }

            setStatusDialog(
              null,
            );

            setReason(
              "",
            );

            setError(
              null,
            );
          }}
          onConfirm={() =>
            void submitStatusChange()
          }
        />
      ) : null}
    </>
  );
}

function PageHeader() {
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
    <div className="mb-5 flex items-start justify-between gap-5">
      <div>
        <h1 className="text-[27px] font-bold tracking-[-0.025em] text-[#111d36]">
          Users
        </h1>

        <p className="mt-1 text-[12.5px] font-normal text-[#63718b]">
          Manage account access, roles and usage across all client
          organizations.
        </p>
      </div>

      <p className="mt-2 hidden text-[11px] font-medium text-[#61708a] md:block">
        {date}
      </p>
    </div>
  );
}

function UserTabs({
  active,
  onChange,
  counts,
}: {
  active:
    UserView;

  onChange:
    (
      value:
        UserView,
    ) => void;

  counts: {
    directory:
      number;
    issues:
      number;
    sessions:
      number;
    roles:
      number;
  };
}) {
  const items: Array<{
    value:
      UserView;
    label:
      string;
    count:
      number;
  }> = [
    {
      value:
        "DIRECTORY",
      label:
        "Directory",
      count:
        counts.directory,
    },

    {
      value:
        "ISSUES",
      label:
        "Access issues",
      count:
        counts.issues,
    },

    {
      value:
        "SESSIONS",
      label:
        "Sessions & usage",
      count:
        counts.sessions,
    },

    {
      value:
        "ROLES",
      label:
        "Role distribution",
      count:
        counts.roles,
    },
  ];

  return (
    <div className="flex min-h-[53px] items-end gap-1 overflow-x-auto px-3 sm:px-4">
      {items.map(
        (item) => {
          const selected =
            active ===
            item.value;

          return (
            <button
              key={
                item.value
              }
              type="button"
              onClick={() =>
                onChange(
                  item.value,
                )
              }
              className={`relative flex h-[52px] shrink-0 items-center gap-2 px-3 text-[11px] transition ${
                selected
                  ? "font-semibold text-[#168650]"
                  : "font-medium text-[#58677f] hover:text-[#17233c]"
              }`}
            >
              {
                item.label
              }

              <span
                className={`grid min-w-[21px] place-items-center rounded-full px-1.5 py-[2px] text-[9px] font-semibold ${
                  selected
                    ? "bg-[#e5f5eb] text-[#188651]"
                    : "bg-[#f1f3f6] text-[#6b7890]"
                }`}
              >
                {
                  item.count
                }
              </span>

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

function UserFilters({
  view,
  query,
  statusFilter,
  roleFilter,
  organizationFilter,
  sessionFilter,
  roles,
  organizations,
  onQueryChange,
  onStatusChange,
  onRoleChange,
  onOrganizationChange,
  onSessionChange,
}: {
  view:
    UserView;

  query:
    string;

  statusFilter:
    string;

  roleFilter:
    string;

  organizationFilter:
    string;

  sessionFilter:
    string;

  roles:
    string[];

  organizations:
    Array<{
      id:
        string;
      name:
        string;
    }>;

  onQueryChange:
    (
      value:
        string,
    ) => void;

  onStatusChange:
    (
      value:
        string,
    ) => void;

  onRoleChange:
    (
      value:
        string,
    ) => void;

  onOrganizationChange:
    (
      value:
        string,
    ) => void;

  onSessionChange:
    (
      value:
        string,
    ) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-[#edf1f4] px-4 py-3">
      <label className="flex h-9 min-w-[270px] flex-[1.4] items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3 focus-within:border-[#87bfa1]">
        <Search className="size-3.5 shrink-0 text-[#64738c]" />

        <input
          type="search"
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
          placeholder="Search user, email, organization, branch or role..."
          className="min-w-0 flex-1 bg-transparent text-[10.5px] text-[#17233c] outline-none placeholder:text-[#8c97a9]"
        />
      </label>

      <FilterSelect
        icon={Building2}
        value={
          organizationFilter
        }
        onChange={
          onOrganizationChange
        }
        options={[
          {
            value:
              "ALL",
            label:
              "All organizations",
          },

          ...organizations.map(
            (
              organization,
            ) => ({
              value:
                organization.id,

              label:
                organization.name,
            }),
          ),
        ]}
      />

      <FilterSelect
        icon={ShieldCheck}
        value={
          roleFilter
        }
        onChange={
          onRoleChange
        }
        options={[
          {
            value:
              "ALL",
            label:
              "All roles",
          },

          ...roles.map(
            (role) => ({
              value:
                role,

              label:
                role,
            }),
          ),
        ]}
      />

      <FilterSelect
        icon={LockKeyhole}
        value={
          statusFilter
        }
        onChange={
          onStatusChange
        }
        options={[
          {
            value:
              "ALL",
            label:
              "All statuses",
          },
          {
            value:
              "ACTIVE",
            label:
              "Active",
          },
          {
            value:
              "SUSPENDED",
            label:
              "Suspended",
          },
          {
            value:
              "INACTIVE",
            label:
              "Inactive",
          },
          {
            value:
              "PENDING_VERIFICATION",
            label:
              "Pending verification",
          },
          {
            value:
              "INVITED",
            label:
              "Invited",
          },
        ]}
      />

      {view ===
        "SESSIONS" ? (
        <FilterSelect
          icon={Activity}
          value={
            sessionFilter
          }
          onChange={
            onSessionChange
          }
          options={[
            {
              value:
                "ALL",
              label:
                "All usage states",
            },
            {
              value:
                "ACTIVE",
              label:
                "Active sessions",
            },
            {
              value:
                "NO_ACTIVE",
              label:
                "No active session",
            },
            {
              value:
                "NEVER_USED",
              label:
                "Never used",
            },
          ]}
        />
      ) : null}
    </div>
  );
}

function UsersTable({
  rows,
  onOpenUser,
  onStatusAction,
  busyUserId,
}: {
  rows:
    ControlCenterUser[];

  onOpenUser:
    (
      user:
        ControlCenterUser,
    ) => void;

  onStatusAction:
    (
      user:
        ControlCenterUser,
      status:
        UserStatusAction,
    ) => void;

  busyUserId:
    string | null;
}) {
  return (
    <div className="overflow-x-auto border-t border-[#edf1f4]">
      <table className="w-full min-w-[1180px] table-fixed text-left">
        <thead>
          <tr className="bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
            <th className="w-[24%] px-4 py-2.5">
              User
            </th>

            <th className="w-[20%] px-3 py-2.5">
              Organization / Branch
            </th>

            <th className="w-[16%] px-3 py-2.5">
              Roles
            </th>

            <th className="w-[16%] px-3 py-2.5">
              Last activity
            </th>

            <th className="w-[11%] px-3 py-2.5">
              Session
            </th>

            <th className="w-[10%] px-3 py-2.5">
              Status
            </th>

            <th className="w-[3%] px-2 py-2.5">
              Actions
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-[#edf1f4]">
          {rows.map(
            (user) => (
              <UserTableRow
                key={
                  user.id
                }
                user={
                  user
                }
                busy={
                  busyUserId ===
                  user.id
                }
                onOpen={() =>
                  onOpenUser(
                    user,
                  )
                }
                onStatusAction={(
                  status,
                ) =>
                  onStatusAction(
                    user,
                    status,
                  )
                }
              />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function UserTableRow({
  user,
  busy,
  onOpen,
  onStatusAction,
}: {
  user:
    ControlCenterUser;

  busy:
    boolean;

  onOpen:
    () => void;

  onStatusAction:
    (
      status:
        UserStatusAction,
    ) => void;
}) {
  return (
    <tr className="group h-[68px] transition hover:bg-[#fbfcfd]">
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={
            onOpen
          }
          className="flex max-w-full items-center gap-3 text-left"
        >
          <UserAvatar
            name={
              user.name
            }
          />

          <span className="min-w-0">
            <span className="block truncate text-[10.5px] font-semibold text-[#17233c] group-hover:text-[#168650]">
              {
                user.name
              }
            </span>

            <span className="mt-1 block truncate text-[9px] text-[#718099]">
              {
                user.email
              }
            </span>

            {user.phone ? (
              <span className="mt-0.5 block truncate text-[8.5px] text-[#8b96a7]">
                {
                  user.phone
                }
              </span>
            ) : null}
          </span>
        </button>
      </td>

      <td className="px-3 py-2.5">
        <p className="truncate text-[10px] font-semibold text-[#26344d]">
          {
            user.tenant.name
          }
        </p>

        <p className="mt-1 truncate text-[9px] text-[#718099]">
          {user.branch?.name ??
            "Organization-wide"}
        </p>
      </td>

      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {user.roles
            .slice(
              0,
              2,
            )
            .map(
              (role) => (
                <RoleBadge
                  key={
                    role
                  }
                  label={
                    role
                  }
                />
              ),
            )}

          {user.roles.length >
          2 ? (
            <span className="inline-flex min-h-[21px] items-center rounded-[5px] bg-[#eef2f6] px-2 text-[8.5px] font-semibold text-[#65738a]">
              +
              {user.roles.length -
                2}
            </span>
          ) : null}
        </div>
      </td>

      <td className="px-3 py-2.5">
        <p className="text-[9.5px] font-medium text-[#26344d]">
          {user.lastUsedAt
            ? ccDateTime(
                user.lastUsedAt,
              )
            : "Not used yet"}
        </p>

        <p className="mt-1 truncate text-[8.5px] text-[#8490a1]">
          {[
            user.lastUsedPlatform,
            user.lastUsedDevice,
          ]
            .filter(
              Boolean,
            )
            .join(
              " · ",
            ) ||
            "No device activity"}
        </p>
      </td>

      <td className="px-3 py-2.5">
        <SessionBadge
          active={
            user.sessionActive
          }
        />
      </td>

      <td className="px-3 py-2.5">
        <UserStatusBadge
          value={
            user.status
          }
        />
      </td>

      <td className="px-2 py-2.5">
        <div className="relative">
          <button
            type="button"
            disabled={
              busy
            }
            onClick={
              onOpen
            }
            className="grid size-8 place-items-center rounded-md text-[#68768f] transition hover:bg-[#f1f4f6] hover:text-[#17233c] disabled:opacity-40"
            aria-label={`Open ${user.name}`}
          >
            <MoreVertical className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function UserDetailPanel({
  user,
  onClose,
  onStatusAction,
}: {
  user:
    ControlCenterUser;

  onClose:
    () => void;

  onStatusAction:
    (
      user:
        ControlCenterUser,
      status:
        UserStatusAction,
    ) => void;
}) {
  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Close user details"
        onClick={
          onClose
        }
        className="absolute inset-0 bg-[#0f172a]/25"
      />

      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[470px] flex-col border-l border-[#dfe5eb] bg-white shadow-[-18px_0_50px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#edf1f4] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar
              name={
                user.name
              }
              large
            />

            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[#17233c]">
                {
                  user.name
                }
              </p>

              <p className="mt-1 truncate text-[9.5px] text-[#718099]">
                {
                  user.email
                }
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="grid size-8 shrink-0 place-items-center rounded-md text-[#65738a] hover:bg-[#f3f5f7]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-[#edf1f4] px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-medium uppercase tracking-[0.04em] text-[#8490a1]">
                  Account status
                </p>

                <div className="mt-2">
                  <UserStatusBadge
                    value={
                      user.status
                    }
                  />
                </div>
              </div>

              <SessionBadge
                active={
                  user.sessionActive
                }
              />
            </div>
          </div>

          <DetailSection
            title="Account"
          >
            <DetailRow
              label="Public ID"
              value={
                user.publicId ??
                "Not assigned"
              }
            />

            <DetailRow
              label="Phone"
              value={
                user.phone ??
                "Not recorded"
              }
            />

            <DetailRow
              label="Created"
              value={ccDate(
                user.createdAt,
              )}
            />

            <DetailRow
              label="Updated"
              value={ccDateTime(
                user.updatedAt,
              )}
            />
          </DetailSection>

          <DetailSection
            title="Organization access"
          >
            <DetailRow
              label="Organization"
              value={
                user.tenant.name
              }
            />

            <DetailRow
              label="Organization status"
              value={
                labelFromValue(
                  user.tenant.status,
                )
              }
            />

            <DetailRow
              label="Branch"
              value={
                user.branch?.name ??
                "All branches / organization-wide"
              }
            />

            <div className="pt-2">
              <p className="text-[9px] font-medium text-[#8490a1]">
                Roles
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {user.roles.length ? (
                  user.roles.map(
                    (role) => (
                      <RoleBadge
                        key={
                          role
                        }
                        label={
                          role
                        }
                      />
                    ),
                  )
                ) : (
                  <span className="text-[9.5px] text-[#718099]">
                    No roles assigned
                  </span>
                )}
              </div>
            </div>
          </DetailSection>

          <DetailSection
            title="Session & usage"
          >
            <DetailRow
              label="Last used"
              value={
                user.lastUsedAt
                  ? ccDateTime(
                      user.lastUsedAt,
                    )
                  : "Never used"
              }
            />

            <DetailRow
              label="Platform"
              value={
                user.lastUsedPlatform ??
                "Not available"
              }
            />

            <DetailRow
              label="Device"
              value={
                user.lastUsedDevice ??
                "Not available"
              }
            />

            <DetailRow
              label="Current session"
              value={
                user.sessionActive
                  ? "Active"
                  : "No active session"
              }
            />
          </DetailSection>
        </div>

        <div className="border-t border-[#edf1f4] bg-[#fbfcfd] p-4">
          <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.04em] text-[#8490a1]">
            Access controls
          </p>

          <div className="flex flex-wrap gap-2">
            {user.status !==
            "ACTIVE" ? (
              <button
                type="button"
                onClick={() =>
                  onStatusAction(
                    user,
                    "ACTIVE",
                  )
                }
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-3.5 text-[9.5px] font-semibold text-white hover:bg-[#147849]"
              >
                <UserCheck className="size-3.5" />
                Activate
              </button>
            ) : null}

            {user.status !==
            "SUSPENDED" ? (
              <button
                type="button"
                onClick={() =>
                  onStatusAction(
                    user,
                    "SUSPENDED",
                  )
                }
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[#f0c8c8] bg-[#fff6f6] px-3.5 text-[9.5px] font-semibold text-[#c84040] hover:bg-[#fff0f0]"
              >
                <UserX className="size-3.5" />
                Suspend
              </button>
            ) : null}

            {user.status !==
            "INACTIVE" ? (
              <button
                type="button"
                onClick={() =>
                  onStatusAction(
                    user,
                    "INACTIVE",
                  )
                }
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3.5 text-[9.5px] font-semibold text-[#526078] hover:bg-[#f4f6f8]"
              >
                <UserMinus className="size-3.5" />
                Mark inactive
              </button>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

function StatusActionDialog({
  state,
  reason,
  error,
  busy,
  onReasonChange,
  onClose,
  onConfirm,
}: {
  state:
    NonNullable<StatusDialogState>;

  reason:
    string;

  error:
    string | null;

  busy:
    boolean;

  onReasonChange:
    (
      value:
        string,
    ) => void;

  onClose:
    () => void;

  onConfirm:
    () => void;
}) {
  const isSuspend =
    state.status ===
    "SUSPENDED";

  const title =
    state.status ===
    "ACTIVE"
      ? "Activate account"
      : state.status ===
          "INACTIVE"
        ? "Mark account inactive"
        : "Suspend account";

  const description =
    state.status ===
    "ACTIVE"
      ? `Restore access for ${state.user.name}.`
      : state.status ===
          "INACTIVE"
        ? `Mark ${state.user.name}'s account as inactive.`
        : `Block ${state.user.name} from normal account access.`;

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center px-4">
      <button
        type="button"
        onClick={
          onClose
        }
        className="absolute inset-0 bg-[#0f172a]/35 backdrop-blur-[1px]"
        aria-label="Close account action dialog"
      />

      <section className="relative z-10 w-full max-w-[450px] overflow-hidden rounded-[12px] border border-[#dfe5eb] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#edf1f4] px-5 py-4">
          <div>
            <p className="text-[13px] font-semibold text-[#17233c]">
              {
                title
              }
            </p>

            <p className="mt-1 text-[9.5px] leading-4 text-[#718099]">
              {
                description
              }
            </p>
          </div>

          <button
            type="button"
            disabled={
              busy
            }
            onClick={
              onClose
            }
            className="grid size-8 shrink-0 place-items-center rounded-md text-[#65738a] hover:bg-[#f3f5f7] disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="rounded-[8px] border border-[#e4e8ed] bg-[#fafbfc] p-3">
            <p className="text-[10px] font-semibold text-[#26344d]">
              {
                state.user.name
              }
            </p>

            <p className="mt-1 text-[9px] text-[#718099]">
              {
                state.user.email
              }{" "}
              ·{" "}
              {
                state.user.tenant.name
              }
            </p>
          </div>

          {isSuspend ? (
            <label className="mt-4 block">
              <span className="mb-2 block text-[9.5px] font-semibold text-[#34425b]">
                Suspension reason
                <span className="text-[#c84040]">
                  {" "}
                  *
                </span>
              </span>

              <textarea
                autoFocus
                value={
                  reason
                }
                onChange={(
                  event,
                ) =>
                  onReasonChange(
                    event.target.value,
                  )
                }
                maxLength={
                  500
                }
                rows={
                  4
                }
                placeholder="Explain why this account is being suspended..."
                className="w-full resize-none rounded-[8px] border border-[#dfe5eb] bg-white px-3 py-2.5 text-[10px] leading-5 text-[#26344d] outline-none placeholder:text-[#9aa3b1] focus:border-[#d39595]"
              />

              <div className="mt-1 text-right text-[8px] text-[#8b96a7]">
                {
                  reason.length
                }
                /500
              </div>
            </label>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-[7px] border border-red-100 bg-red-50 px-3 py-2 text-[9.5px] font-medium text-red-700">
              {
                error
              }
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#edf1f4] bg-[#fbfcfd] px-5 py-3">
          <button
            type="button"
            disabled={
              busy
            }
            onClick={
              onClose
            }
            className="h-9 rounded-md border border-[#dfe5eb] bg-white px-3.5 text-[9.5px] font-semibold text-[#526078] hover:bg-[#f4f6f8] disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={
              busy ||
              (
                isSuspend &&
                !reason.trim()
              )
            }
            onClick={
              onConfirm
            }
            className={`inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-[9.5px] font-semibold text-white disabled:opacity-40 ${
              isSuspend
                ? "bg-[#c94545] hover:bg-[#b83c3c]"
                : "bg-[#188653] hover:bg-[#147849]"
            }`}
          >
            {busy ? (
              <Clock3 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}

            {busy
              ? "Saving..."
              : title}
          </button>
        </div>
      </section>
    </div>
  );
}

function RoleDistributionView({
  rows,
  users,
  onSelectRole,
}: {
  rows:
    RoleSummary[];

  users:
    ControlCenterUser[];

  onSelectRole:
    (
      role:
        string,
    ) => void;
}) {
  if (
    !rows.length
  ) {
    return (
      <UsersEmptyState
        view="ROLES"
      />
    );
  }

  const maxCount =
    Math.max(
      1,
      ...rows.map(
        (row) =>
          row.count,
      ),
    );

  return (
    <div className="border-t border-[#edf1f4] p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(
          (row) => (
            <button
              key={
                row.role
              }
              type="button"
              onClick={() =>
                onSelectRole(
                  row.role,
                )
              }
              className="rounded-[10px] border border-[#dfe5eb] bg-white p-4 text-left transition hover:border-[#bfdccb] hover:bg-[#fbfdfc]"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-9 place-items-center rounded-[8px] bg-[#eaf6ee] text-[#168650]">
                  <ShieldCheck className="size-4" />
                </span>

                <span className="text-[18px] font-bold text-[#17233c]">
                  {ccNumber(
                    row.count,
                  )}
                </span>
              </div>

              <p className="mt-4 text-[10.5px] font-semibold text-[#26344d]">
                {
                  row.role
                }
              </p>

              <div className="mt-3 h-[4px] overflow-hidden rounded-full bg-[#edf1f4]">
                <div
                  className="h-full rounded-full bg-[#24935f]"
                  style={{
                    width:
                      `${Math.max(
                        4,
                        (
                          row.count /
                          maxCount
                        ) *
                          100,
                      )}%`,
                  }}
                />
              </div>

              <div className="mt-3 flex items-center gap-4 text-[8.5px] text-[#718099]">
                <span>
                  {
                    row.active
                  }{" "}
                  active
                </span>

                <span>
                  {
                    row.suspended
                  }{" "}
                  suspended
                </span>

                <span>
                  {(
                    (
                      row.count /
                      Math.max(
                        1,
                        users.length,
                      )
                    ) *
                    100
                  ).toFixed(
                    1,
                  )}
                  %
                </span>
              </div>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function PaginationFooter({
  page,
  totalPages,
  totalItems,
  firstItem,
  lastItem,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page:
    number;

  totalPages:
    number;

  totalItems:
    number;

  firstItem:
    number;

  lastItem:
    number;

  pageSize:
    number;

  onPageChange:
    (
      page:
        number,
    ) => void;

  onPageSizeChange:
    (
      value:
        number,
    ) => void;
}) {
  return (
    <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-3 border-t border-[#edf1f4] px-4 py-2">
      <p className="text-[9.5px] text-[#68768f]">
        Showing{" "}
        {
          firstItem
        }{" "}
        to{" "}
        {
          lastItem
        }{" "}
        of{" "}
        {
          totalItems
        }{" "}
        users
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
          className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] bg-white text-[#60708a] hover:bg-[#f7f9fa] disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        <span className="min-w-[70px] text-center text-[9.5px] font-medium text-[#526078]">
          {
            page
          }{" "}
          /{" "}
          {
            totalPages
          }
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
          className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] bg-white text-[#60708a] hover:bg-[#f7f9fa] disabled:opacity-40"
        >
          <ChevronRight className="size-3.5" />
        </button>

        <div className="relative ml-2">
          <select
            value={
              pageSize
            }
            onChange={(
              event,
            ) =>
              onPageSizeChange(
                Number(
                  event.target.value,
                ),
              )
            }
            className="h-8 appearance-none rounded-md border border-[#dfe5eb] bg-white pl-3 pr-7 text-[9px] font-medium text-[#526078] outline-none"
          >
            {PAGE_SIZE_OPTIONS.map(
              (
                value,
              ) => (
                <option
                  key={
                    value
                  }
                  value={
                    value
                  }
                >
                  {
                    value
                  }{" "}
                  / page
                </option>
              ),
            )}
          </select>

          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-[#718099]" />
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  icon: Icon,
  value,
  onChange,
  options,
}: {
  icon:
    LucideIcon;

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
}) {
  return (
    <label className="relative flex h-9 min-w-[165px] items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3">
      <Icon className="size-3.5 shrink-0 text-[#52627c]" />

      <select
        value={
          value
        }
        onChange={(
          event,
        ) =>
          onChange(
            event.target.value,
          )
        }
        className="min-w-0 flex-1 appearance-none bg-transparent pr-5 text-[9.5px] font-medium text-[#34425b] outline-none"
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

      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-[#68768f]" />
    </label>
  );
}

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
          {
            label
          }
        </p>

        <p className="mt-1 truncate text-[22px] font-bold leading-7 tracking-[-0.02em] text-[#101d37]">
          {
            value
          }
        </p>

        <p className="mt-1 text-[9.5px] text-[#68758d]">
          {
            secondary
          }
        </p>
      </div>
    </section>
  );
}

type IconTone =
  | "green"
  | "blue"
  | "amber"
  | "purple"
  | "red";

function LargeIcon({
  icon: Icon,
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
    "purple"
  ) {
    return "bg-[#f3edff] text-[#7146de]";
  }

  if (
    tone ===
    "red"
  ) {
    return "bg-[#fff0f0] text-[#df4545]";
  }

  return "bg-[#eaf6ee] text-[#198b55]";
}

function UserAvatar({
  name,
  large = false,
}: {
  name:
    string;

  large?:
    boolean;
}) {
  const initials =
    name
      .split(
        /\s+/,
      )
      .filter(
        Boolean,
      )
      .slice(
        0,
        2,
      )
      .map(
        (word) =>
          word.charAt(
            0,
          ),
      )
      .join(
        "",
      )
      .toUpperCase() ||
    "U";

  return (
    <span
      className={`grid shrink-0 place-items-center rounded-[9px] bg-[#edf5f0] font-semibold text-[#168650] ${
        large
          ? "size-[44px] text-[12px]"
          : "size-[35px] text-[9.5px]"
      }`}
    >
      {
        initials
      }
    </span>
  );
}

function RoleBadge({
  label,
}: {
  label:
    string;
}) {
  return (
    <span className="inline-flex min-h-[21px] items-center rounded-[5px] bg-[#eef2f6] px-2 text-[8.5px] font-semibold text-[#59677d]">
      {
        label
      }
    </span>
  );
}

function UserStatusBadge({
  value,
}: {
  value:
    string;
}) {
  const normalized =
    value.toUpperCase();

  let styles =
    "bg-[#eef2f6] text-[#59677d]";

  if (
    normalized ===
    "ACTIVE"
  ) {
    styles =
      "bg-[#eaf6ee] text-[#1b804e]";
  } else if (
    normalized ===
      "SUSPENDED" ||
    normalized ===
      "BLOCKED"
  ) {
    styles =
      "bg-[#fff0f0] text-[#c93f3f]";
  } else if (
    normalized ===
      "PENDING_VERIFICATION" ||
    normalized ===
      "INVITED"
  ) {
    styles =
      "bg-[#fff2df] text-[#bd6b13]";
  }

  return (
    <span
      className={`inline-flex min-h-[22px] items-center rounded-[5px] px-2 text-[9px] font-semibold ${styles}`}
    >
      {labelFromValue(
        value,
      )}
    </span>
  );
}

function SessionBadge({
  active,
}: {
  active:
    boolean;
}) {
  return (
    <span
      className={`inline-flex min-h-[22px] items-center gap-1.5 rounded-[5px] px-2 text-[8.5px] font-semibold ${
        active
          ? "bg-[#eaf6ee] text-[#1b804e]"
          : "bg-[#eef2f6] text-[#65738a]"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          active
            ? "bg-[#24935f]"
            : "bg-[#a3adba]"
        }`}
      />

      {active
        ? "Active"
        : "None"}
    </span>
  );
}

function DetailSection({
  title,
  children,
}: {
  title:
    string;

  children:
    React.ReactNode;
}) {
  return (
    <section className="border-b border-[#edf1f4] px-5 py-4">
      <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.04em] text-[#8490a1]">
        {
          title
        }
      </p>

      <div className="space-y-3">
        {
          children
        }
      </div>
    </section>
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
    <div className="grid grid-cols-[125px_minmax(0,1fr)] gap-4">
      <p className="text-[9px] text-[#8490a1]">
        {
          label
        }
      </p>

      <p className="break-words text-[9.5px] font-medium text-[#34425b]">
        {
          value
        }
      </p>
    </div>
  );
}

function UsersEmptyState({
  view,
}: {
  view:
    UserView;
}) {
  const content =
    view ===
    "ISSUES"
      ? {
          icon:
            ShieldCheck,

          title:
            "No access issues",

          description:
            "No suspended, inactive, invited or pending accounts match the current filters.",
        }
      : view ===
          "SESSIONS"
        ? {
            icon:
              Activity,

            title:
              "No usage records found",

            description:
              "No users match the selected session and usage filters.",
          }
        : view ===
            "ROLES"
          ? {
              icon:
                ShieldCheck,

              title:
                "No roles available",

              description:
                "No user role assignments are currently available.",
            }
          : {
              icon:
                Users,

              title:
                "No users found",

              description:
                "No users match the current directory filters.",
            };

  const Icon =
    content.icon;

  return (
    <div className="grid min-h-[260px] place-items-center border-t border-[#edf1f4] px-6 py-12 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-[#eef6f1] text-[#168650]">
          <Icon className="size-5" />
        </div>

        <p className="mt-3 text-[12px] font-semibold text-[#17233c]">
          {
            content.title
          }
        </p>

        <p className="mx-auto mt-1 max-w-md text-[9.5px] leading-5 text-[#6b7890]">
          {
            content.description
          }
        </p>
      </div>
    </div>
  );
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
    .trim()
    .split(
      /\s+/,
    )
    .map(
      (word) =>
        word
          .charAt(
            0,
          )
          .toUpperCase() +
        word
          .slice(
            1,
          )
          .toLowerCase(),
    )
    .join(
      " ",
    );
}