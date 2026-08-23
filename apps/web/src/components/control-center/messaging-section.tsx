"use client";

import { Mail, MessageSquareText, Send, UsersRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
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
  EmptyState,
  Panel,
  SectionTitle,
  SelectControl,
  StatCard,
  StatusPill,
} from "./control-center-primitives";
import { ccNumber } from "./formatters";

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

const ROLE_CATEGORIES = [
  { value: "ALL", label: "All roles", roleNames: [] },
  { value: "OWNER", label: "Owners", roleNames: ["Account Owner"] },
  { value: "MANAGER", label: "Managers", roleNames: ["Manager"] },
  { value: "CASHIER", label: "Cashiers", roleNames: ["Cashier"] },
  {
    value: "FIELD_OFFICER",
    label: "Field officers",
    roleNames: ["Field Officer"],
  },
] as const;

type RecipientMode = "AUDIENCE" | "SELECTED_USERS" | "DIRECT";

export function ControlCenterMessagingSection({
  session,
  clients,
  users,
  templates,
}: {
  session: ControlCenterSession;
  clients: ControlCenterClient[];
  users: ControlCenterUser[];
  templates: ControlCenterTemplate[];
}) {
  const [channel, setChannel] = useState<"EMAIL" | "SMS">("EMAIL");
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("AUDIENCE");
  const [tenantId, setTenantId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [audience, setAudience] = useState("TENANT_USERS");
  const [roleCategory, setRoleCategory] = useState("ALL");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [templateCode, setTemplateCode] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState("");
  const [branchOptions, setBranchOptions] = useState<ControlCenterBranch[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  const channelTemplates = useMemo(
    () => templates.filter((template) => template.channel === channel),
    [channel, templates],
  );
  const selectedRoleCategory = ROLE_CATEGORIES.find(
    (category) => category.value === roleCategory,
  );
  const selectableUsers = useMemo(
    () =>
      users.filter((user) => {
        if (tenantId && user.tenant.id !== tenantId) return false;
        if (branchId && user.branch?.id !== branchId) return false;
        if (
          roleCategory !== "ALL" &&
          !userMatchesRoleCategory(user, roleCategory)
        ) {
          return false;
        }
        if (channel === "EMAIL") return Boolean(user.email);
        return Boolean(user.phone);
      }),
    [branchId, channel, roleCategory, tenantId, users],
  );
  const selectedUsers = useMemo(() => {
    const selected = new Set(selectedUserIds);
    return selectableUsers.filter((user) => selected.has(user.id));
  }, [selectableUsers, selectedUserIds]);

  useEffect(() => {
    const selected = channelTemplates.find(
      (template) => template.code === templateCode,
    );
    if (!selected) return;
    setSubject(selected.subject ?? "");
    setBody(selected.body);
  }, [channelTemplates, templateCode]);

  useEffect(() => {
    if (!tenantId) {
      setBranchOptions([]);
      setBranchId("");
      return;
    }
    let cancelled = false;
    void controlCenterFetch<ControlCenterClientDetail>(
      `/clients/${tenantId}`,
      session,
    )
      .then((detail) => {
        if (cancelled) return;
        setBranchOptions(detail.branches);
      })
      .catch(() => {
        if (cancelled) return;
        setBranchOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session, tenantId]);

  useEffect(() => {
    setSelectedUserIds((current) =>
      current.filter((id) => selectableUsers.some((user) => user.id === id)),
    );
  }, [selectableUsers]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const directRecipients = recipients
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const directMode = recipientMode === "DIRECT";
      const selectedMode = recipientMode === "SELECTED_USERS";
      const payload = {
        channel,
        templateCode: templateCode || undefined,
        tenantId: directMode ? undefined : tenantId || undefined,
        branchId: directMode || !branchId ? undefined : branchId,
        audience: directMode
          ? undefined
          : selectedMode
            ? "SELECTED_USERS"
            : audience,
        userIds: selectedMode
          ? selectedUsers.map((user) => user.id)
          : undefined,
        roleNames:
          !directMode && selectedRoleCategory?.roleNames.length
            ? selectedRoleCategory.roleNames
            : undefined,
        subject: channel === "EMAIL" ? subject : undefined,
        body,
        recipients:
          directMode && directRecipients.length ? directRecipients : undefined,
      };
      const response = await controlCenterFetch<SendResult>(
        "/messages/send",
        session,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      setResult(response);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not send message.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <SectionTitle
        title="Messaging"
        subtitle="Send email or SMS campaigns to direct recipients, client owners, branch users, or whole organizations."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Mail}
          title="Email templates"
          value={ccNumber(
            templates.filter((item) => item.channel === "EMAIL").length,
          )}
          subtitle="Ready to send"
        />
        <StatCard
          icon={MessageSquareText}
          title="SMS templates"
          value={ccNumber(
            templates.filter((item) => item.channel === "SMS").length,
          )}
          subtitle="Short message templates"
          tone="blue"
        />
        <StatCard
          icon={UsersRound}
          title="Clients"
          value={ccNumber(clients.length)}
          subtitle="Selectable audiences"
          tone="gold"
        />
        <StatCard
          icon={Send}
          title="Last result"
          value={ccNumber(result?.sent)}
          subtitle={
            result
              ? `${result.failed} failed, ${result.skipped} skipped`
              : "No send yet"
          }
          tone="purple"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_360px]">
        <Panel className="p-5">
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="mb-2 block text-xs font-black">Channel</span>
                <SelectControl
                  value={channel}
                  onChange={(value) => {
                    setChannel(value as "EMAIL" | "SMS");
                    setTemplateCode("");
                    setSubject("");
                    setBody("");
                  }}
                  ariaLabel="Channel"
                  className="w-full"
                  options={[
                    { value: "EMAIL", label: "Email" },
                    { value: "SMS", label: "SMS" },
                  ]}
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-xs font-black">Template</span>
                <SelectControl
                  value={templateCode}
                  onChange={setTemplateCode}
                  ariaLabel="Template"
                  className="w-full"
                  options={[
                    { value: "", label: "Custom message" },
                    ...channelTemplates.map((template) => ({
                      value: template.code,
                      label: template.name,
                    })),
                  ]}
                />
              </label>
            </div>

            <div
              className={`grid gap-4 ${
                recipientMode === "DIRECT" ? "md:grid-cols-3" : "md:grid-cols-5"
              }`}
            >
              <label className="block">
                <span className="mb-2 block text-xs font-black">Source</span>
                <SelectControl
                  value={recipientMode}
                  onChange={(value) => setRecipientMode(value as RecipientMode)}
                  ariaLabel="Recipient source"
                  className="w-full"
                  options={[
                    { value: "AUDIENCE", label: "Client audience" },
                    { value: "SELECTED_USERS", label: "Selected users" },
                    { value: "DIRECT", label: "Direct contacts" },
                  ]}
                />
              </label>
              {recipientMode !== "DIRECT" ? (
                <>
                  <label className="block">
                    <span className="mb-2 block text-xs font-black">
                      Client
                    </span>
                    <SelectControl
                      value={tenantId}
                      onChange={(value) => {
                        setTenantId(value);
                        setBranchId("");
                      }}
                      ariaLabel="Client organization"
                      className="w-full"
                      options={[
                        { value: "", label: "All clients" },
                        ...clients.map((client) => ({
                          value: client.id,
                          label: client.name,
                        })),
                      ]}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-black">
                      Audience
                    </span>
                    <SelectControl
                      value={audience}
                      onChange={setAudience}
                      ariaLabel="Audience"
                      className="w-full"
                      options={[
                        { value: "TENANT_USERS", label: "All client users" },
                        { value: "TENANT_OWNERS", label: "Client owners" },
                        { value: "BRANCH_USERS", label: "Branch users" },
                      ]}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-black">
                      Branch
                    </span>
                    <SelectControl
                      value={branchId}
                      onChange={setBranchId}
                      ariaLabel="Branch"
                      className="w-full"
                      options={[
                        { value: "", label: "All branches" },
                        ...branchOptions.map((branch) => ({
                          value: branch.id,
                          label: branch.name,
                        })),
                      ]}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-black">
                      Category
                    </span>
                    <SelectControl
                      value={roleCategory}
                      onChange={setRoleCategory}
                      ariaLabel="Role category"
                      className="w-full"
                      options={ROLE_CATEGORIES.map((category) => ({
                        value: category.value,
                        label: category.label,
                      }))}
                    />
                  </label>
                </>
              ) : null}
            </div>

            {recipientMode === "DIRECT" ? (
              <label className="block">
                <span className="mb-2 block text-xs font-black">
                  Direct recipients
                </span>
                <textarea
                  value={recipients}
                  onChange={(event) => setRecipients(event.target.value)}
                  rows={3}
                  placeholder={
                    channel === "EMAIL"
                      ? "name@example.com, another@example.com"
                      : "+256700000000, +256701000000"
                  }
                  className="w-full resize-none rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm font-semibold outline-none placeholder:text-slate-400 focus:border-[var(--forest-emerald)]"
                />
              </label>
            ) : null}

            {recipientMode === "SELECTED_USERS" ? (
              <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fbfa]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] px-4 py-3">
                  <div>
                    <p className="text-sm font-black">Choose people</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {selectedUsers.length} selected from{" "}
                      {selectableUsers.length} matching users
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost h-8 normal-case"
                    onClick={() =>
                      setSelectedUserIds(
                        selectableUsers.length > 0 &&
                          selectedUsers.length === selectableUsers.length
                          ? []
                          : selectableUsers.map((user) => user.id),
                      )
                    }
                  >
                    {selectableUsers.length > 0 &&
                    selectedUsers.length === selectableUsers.length
                      ? "Clear"
                      : "Select all"}
                  </button>
                </div>
                <div className="max-h-72 divide-y divide-[#edf2f7] overflow-y-auto">
                  {selectableUsers.length ? (
                    selectableUsers.map((user) => (
                      <label
                        key={user.id}
                        className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-white"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(user.id)}
                          onChange={(event) => {
                            setSelectedUserIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, user.id])]
                                : current.filter((id) => id !== user.id),
                            );
                          }}
                          className="size-4 accent-[var(--forest-emerald)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black">
                            {user.name}
                          </span>
                          <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
                            {channel === "EMAIL" ? user.email : user.phone} -{" "}
                            {user.tenant.name}
                            {user.branch ? ` / ${user.branch.name}` : ""}
                          </span>
                        </span>
                        <StatusPill
                          value={user.roles[0] ?? "User"}
                          tone="slate"
                        />
                      </label>
                    ))
                  ) : (
                    <div className="px-4 py-6">
                      <EmptyState title="No users match these filters" />
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {channel === "EMAIL" ? (
              <label className="block">
                <span className="mb-2 block text-xs font-black">Subject</span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  required
                  maxLength={200}
                  className="h-10 w-full rounded-lg border border-[#e2e8f0] px-3 text-sm font-semibold outline-none focus:border-[var(--forest-emerald)]"
                />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-xs font-black">Message</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={9}
                required
                minLength={2}
                maxLength={1600}
                className="w-full resize-none rounded-lg border border-[#e2e8f0] bg-white px-3 py-3 text-sm font-semibold leading-6 outline-none focus:border-[var(--forest-emerald)]"
              />
            </label>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sending}
                className="btn btn-primary h-10 normal-case"
              >
                <Send className="size-4" />
                {sending ? "Sending..." : `Send ${channel}`}
              </button>
            </div>
          </form>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="border-b border-[#e2e8f0] px-5 py-4">
            <h2 className="font-black">Send result</h2>
          </div>
          {result ? (
            <div className="divide-y divide-[#edf2f7]">
              <div className="grid grid-cols-3 gap-2 px-5 py-4 text-center">
                <ResultMetric label="Sent" value={result.sent} tone="green" />
                <ResultMetric label="Failed" value={result.failed} tone="red" />
                <ResultMetric
                  label="Skipped"
                  value={result.skipped}
                  tone="slate"
                />
              </div>
              {result.logs.slice(0, 20).map((log) => (
                <div key={log.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-black">
                      {log.recipient}
                    </p>
                    <StatusPill value={log.status} />
                  </div>
                  {log.error ? (
                    <p className="mt-1 text-xs font-semibold text-red-700">
                      {log.error}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No message sent yet"
                subtitle="Results and provider errors appear here after sending."
              />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function ResultMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "red" | "slate";
}) {
  const toneClass =
    tone === "green"
      ? "text-[var(--forest-emerald)]"
      : tone === "red"
        ? "text-red-700"
        : "text-slate-600";
  return (
    <div>
      <p className={`text-xl font-black ${toneClass}`}>{ccNumber(value)}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">{label}</p>
    </div>
  );
}

function userMatchesRoleCategory(user: ControlCenterUser, category: string) {
  const aliases: Record<string, string[]> = {
    OWNER: ["Account Owner", "Owner"],
    MANAGER: ["Manager", "Branch Manager"],
    CASHIER: ["Cashier"],
    FIELD_OFFICER: ["Field Officer", "Field Agent", "Agent", "Loan Officer"],
  };
  const accepted = aliases[category];
  if (!accepted) return true;
  return user.roles.some((role) => accepted.includes(role));
}
