"use client";

import { ShieldCheck, UserCheck, UserMinus, UserX, Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { ControlCenterSession } from "../../lib/control-center-session";
import { controlCenterFetch } from "../../lib/control-center-api";
import { PaginationControls, paginateItems } from "../app/pagination";
import type { ControlCenterUser } from "./types";
import {
  InlineSearch,
  Panel,
  SectionTitle,
  SelectControl,
  StatCard,
  StatusPill,
} from "./control-center-primitives";
import { ccDate, ccDateTime, ccNumber } from "./formatters";

export function ControlCenterUsersSection({
  session,
  users,
  onUpdated,
}: {
  session: ControlCenterSession;
  users: ControlCenterUser[];
  onUpdated: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [role, setRole] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roles = useMemo(() => {
    const values = new Set<string>();
    for (const user of users) {
      for (const item of user.roles) values.add(item);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [users]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !needle ||
        [
          user.name,
          user.email,
          user.phone,
          user.publicId,
          user.tenant.name,
          user.branch?.name,
          user.roles.join(" "),
        ].some((value) => (value ?? "").toLowerCase().includes(needle));
      const matchesStatus = status === "ALL" || user.status === status;
      const matchesRole = role === "ALL" || user.roles.includes(role);
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [query, role, status, users]);
  const rows = paginateItems(filtered, page, pageSize);

  async function updateStatus(user: ControlCenterUser, nextStatus: string) {
    setError(null);
    let reason: string | undefined;
    if (nextStatus === "SUSPENDED") {
      reason =
        window.prompt(`Reason for suspending ${user.name}`)?.trim() ??
        undefined;
      if (!reason) return;
    }
    setBusyUserId(user.id);
    try {
      await controlCenterFetch(`/users/${user.id}/status`, session, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, reason }),
      });
      await onUpdated();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update user status.",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <>
      <SectionTitle
        title="Users"
        subtitle="View app users across all organizations and control their account access."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          title="Total users"
          value={ccNumber(users.length)}
          subtitle="Across all organizations"
        />
        <StatCard
          icon={UserCheck}
          title="Active"
          value={ccNumber(
            users.filter((user) => user.status === "ACTIVE").length,
          )}
          subtitle="Can access the app"
          tone="blue"
        />
        <StatCard
          icon={UserX}
          title="Suspended"
          value={ccNumber(
            users.filter((user) => user.status === "SUSPENDED").length,
          )}
          subtitle="Blocked by administrators"
          tone="red"
        />
        <StatCard
          icon={ShieldCheck}
          title="Roles"
          value={ccNumber(roles.length)}
          subtitle="Distinct access roles"
          tone="gold"
        />
      </div>

      <Panel className="mt-5 overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b border-[#e2e8f0] p-4">
          <InlineSearch
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search users, organizations, branches or roles..."
            className="max-w-xl"
          />
          <SelectControl
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            ariaLabel="User status"
            options={[
              { value: "ALL", label: "All statuses" },
              { value: "ACTIVE", label: "Active" },
              { value: "SUSPENDED", label: "Suspended" },
              { value: "INACTIVE", label: "Inactive" },
              { value: "INVITED", label: "Invited" },
              { value: "PENDING_VERIFICATION", label: "Pending verification" },
            ]}
          />
          <SelectControl
            value={role}
            onChange={(value) => {
              setRole(value);
              setPage(1);
            }}
            ariaLabel="Role"
            options={[
              { value: "ALL", label: "All roles" },
              ...roles.map((item) => ({ value: item, label: item })),
            ]}
          />
        </div>

        {error ? (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-[1220px] w-full text-left">
            <thead className="bg-[#f2f6f8] text-xs font-black text-slate-600">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Roles</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7] text-sm">
              {rows.items.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-4">
                    <p className="font-black">{user.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {user.email}
                    </p>
                    {user.phone ? (
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">
                        {user.phone}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-bold">{user.tenant.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {user.tenant.status}
                    </p>
                  </td>
                  <td className="px-4 py-4 font-semibold">
                    {user.branch?.name ?? "All branches"}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {user.roles.map((item) => (
                        <StatusPill key={item} value={item} tone="slate" />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold">
                      {user.lastUsedAt
                        ? ccDateTime(user.lastUsedAt)
                        : "Not used yet"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {[
                        user.lastUsedPlatform,
                        user.lastUsedDevice,
                        user.sessionActive ? "Active session" : null,
                      ]
                        .filter(Boolean)
                        .join(" - ") || "-"}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <StatusPill value={user.status} />
                  </td>
                  <td className="px-4 py-4 font-semibold">
                    {ccDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      {user.status !== "ACTIVE" ? (
                        <button
                          type="button"
                          disabled={busyUserId === user.id}
                          onClick={() => updateStatus(user, "ACTIVE")}
                          className="btn btn-primary h-8 normal-case"
                        >
                          Activate
                        </button>
                      ) : null}
                      {user.status !== "SUSPENDED" ? (
                        <button
                          type="button"
                          disabled={busyUserId === user.id}
                          onClick={() => updateStatus(user, "SUSPENDED")}
                          className="btn btn-ghost h-8 normal-case text-red-700"
                        >
                          Suspend
                        </button>
                      ) : null}
                      {user.status !== "INACTIVE" ? (
                        <button
                          type="button"
                          disabled={busyUserId === user.id}
                          onClick={() => updateStatus(user, "INACTIVE")}
                          className="btn btn-ghost h-8 normal-case"
                        >
                          Inactivate
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationControls
          page={rows.currentPage}
          pageSize={rows.pageSize}
          total={filtered.length}
          itemLabel="users"
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setPage(1);
          }}
        />
      </Panel>
    </>
  );
}
