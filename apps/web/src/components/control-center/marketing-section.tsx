"use client";

import {
  Archive,
  CalendarDays,
  Edit3,
  ImagePlus,
  Megaphone,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { ControlCenterSession } from "../../lib/control-center-session";
import { controlCenterFetch } from "../../lib/control-center-api";
import { ccDate, ccNumber } from "./formatters";
import {
  IconBadge,
  InlineSearch,
  Panel,
  SectionTitle,
  SelectControl,
  StatCard,
  StatusPill,
} from "./control-center-primitives";
import type {
  ControlCenterBranch,
  ControlCenterClient,
  ControlCenterClientDetail,
  ControlCenterMarketingCampaign,
  ControlCenterMarketingCampaignAudience,
  ControlCenterMarketingCampaignMediaType,
  ControlCenterMarketingCampaignStatus,
  ControlCenterMarketingCampaignsResponse,
  ControlCenterUser,
} from "./types";

type MarketingForm = {
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  mediaUrl: string;
  mediaStorageKey: string;
  mediaType: ControlCenterMarketingCampaignMediaType;
  audience: ControlCenterMarketingCampaignAudience;
  status: ControlCenterMarketingCampaignStatus;
  tenantId: string;
  branchId: string;
  roleNames: string[];
  userIds: string[];
  priority: string;
  startsAt: string;
  endsAt: string;
};

type PresignResponse = {
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
  mediaType: ControlCenterMarketingCampaignMediaType;
};

const ROLE_OPTIONS = ["Account Owner", "Manager", "Cashier", "Field Officer"];

const MARKETING_TEMPLATES = [
  {
    label: "Subscription reminder",
    title: "Subscription renewal reminder",
    body: "Your branch subscription is nearing renewal. Renew early to keep REMBEH running without interruption.",
    ctaLabel: "Renew now",
    priority: 80,
  },
  {
    label: "New feature",
    title: "New REMBEH feature available",
    body: "A new workflow is now available in your app. Open this update to see what changed and how it helps your team.",
    ctaLabel: "See update",
    priority: 55,
  },
  {
    label: "Training",
    title: "Team training notice",
    body: "A REMBEH training session is available for your team. Share this with the right staff and confirm attendance.",
    ctaLabel: "Confirm",
    priority: 45,
  },
  {
    label: "Critical notice",
    title: "Important REMBEH notice",
    body: "Please review this update before continuing daily operations. It may affect how your branch records work today.",
    ctaLabel: "Read notice",
    priority: 95,
  },
] satisfies Array<{
  label: string;
  title: string;
  body: string;
  ctaLabel: string;
  priority: number;
}>;

const AUDIENCE_OPTIONS: Array<{
  value: ControlCenterMarketingCampaignAudience;
  label: string;
}> = [
  { value: "ALL_USERS", label: "Everyone using REMBEH" },
  { value: "TENANT_USERS", label: "All users in one organization" },
  { value: "BRANCH_USERS", label: "All users in one branch" },
  { value: "TENANT_OWNERS", label: "Owners in one organization" },
  { value: "ROLE_USERS", label: "Selected roles" },
  { value: "SELECTED_USERS", label: "Selected people" },
];

const STATUS_OPTIONS: Array<{
  value: ControlCenterMarketingCampaignStatus;
  label: string;
}> = [
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Draft" },
  { value: "PAUSED", label: "Paused" },
  { value: "ARCHIVED", label: "Archived" },
];

const emptyForm: MarketingForm = {
  title: "",
  body: "",
  ctaLabel: "",
  ctaUrl: "",
  mediaUrl: "",
  mediaStorageKey: "",
  mediaType: "NONE",
  audience: "TENANT_USERS",
  status: "ACTIVE",
  tenantId: "",
  branchId: "",
  roleNames: [],
  userIds: [],
  priority: "10",
  startsAt: "",
  endsAt: "",
};

export function ControlCenterMarketingSection({
  session,
  clients = [],
  users = [],
}: {
  session: ControlCenterSession;
  clients?: ControlCenterClient[];
  users?: ControlCenterUser[];
}) {
  const [data, setData] =
    useState<ControlCenterMarketingCampaignsResponse | null>(null);
  const [form, setForm] = useState<MarketingForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [branches, setBranches] = useState<ControlCenterBranch[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const campaignRows = Array.isArray(data?.campaigns) ? data!.campaigns : [];

  const filteredCampaigns = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return campaignRows;
    return campaignRows.filter((campaign) =>
      [
        campaign.title,
        campaign.body,
        campaign.tenantName ?? "",
        campaign.branchName ?? "",
        campaign.status,
        campaign.audience,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [campaignRows, query]);

  const selectedUsers = useMemo(() => new Set(form.userIds), [form.userIds]);

  const selectableUsers = useMemo(() => {
    return users.filter((user) => {
      if (form.tenantId && user.tenant.id !== form.tenantId) return false;
      if (form.branchId && user.branch?.id !== form.branchId) return false;
      if (
        form.audience === "ROLE_USERS" &&
        form.roleNames.length > 0 &&
        !form.roleNames.some((role) => user.roles.includes(role))
      ) {
        return false;
      }
      return true;
    });
  }, [form.audience, form.branchId, form.roleNames, form.tenantId, users]);

  const audienceReach = useMemo(() => {
    if (form.audience === "SELECTED_USERS") return form.userIds.length;

    return users.filter((user) => {
      if (form.audience !== "ALL_USERS" && !form.tenantId) return false;
      if (form.tenantId && user.tenant.id !== form.tenantId) return false;
      if (form.branchId && user.branch?.id !== form.branchId) return false;
      if (
        form.audience === "BRANCH_USERS" &&
        (!form.branchId || user.branch?.id !== form.branchId)
      ) {
        return false;
      }
      if (
        form.audience === "TENANT_OWNERS" &&
        !user.roles.some((role) =>
          ["Account Owner", "Owner"].includes(role),
        )
      ) {
        return false;
      }
      if (
        form.audience === "ROLE_USERS" &&
        !form.roleNames.some((role) => user.roles.includes(role))
      ) {
        return false;
      }
      return true;
    }).length;
  }, [
    form.audience,
    form.branchId,
    form.roleNames,
    form.tenantId,
    form.userIds.length,
    users,
  ]);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response =
        await controlCenterFetch<ControlCenterMarketingCampaignsResponse>(
          "/marketing-campaigns",
          session,
        );
      setData(response);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load marketing campaigns.",
      );
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    let cancelled = false;
    if (!form.tenantId) {
      setBranches([]);
      setForm((current) => ({ ...current, branchId: "" }));
      return;
    }

    void controlCenterFetch<ControlCenterClientDetail>(
      `/clients/${form.tenantId}`,
      session,
    )
      .then((detail) => {
        if (cancelled) return;
        setBranches(Array.isArray(detail.branches) ? detail.branches : []);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });

    return () => {
      cancelled = true;
    };
  }, [form.tenantId, session]);

  function updateForm<K extends keyof MarketingForm>(
    key: K,
    value: MarketingForm[K],
  ) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "audience") {
        if (value === "ALL_USERS") {
          next.tenantId = "";
          next.branchId = "";
          next.userIds = [];
        }
        if (value !== "BRANCH_USERS") next.branchId = "";
        if (value !== "ROLE_USERS") next.roleNames = [];
        if (value !== "SELECTED_USERS") next.userIds = [];
      }
      if (key === "tenantId") {
        next.branchId = "";
        next.userIds = [];
      }
      if (key === "branchId") {
        next.userIds = [];
      }
      return next;
    });
  }

  async function submitCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const uploaded = mediaFile ? await uploadMedia(mediaFile) : null;
      const mediaStorageKey = uploaded?.storageKey ?? form.mediaStorageKey;
      const mediaType = uploaded?.mediaType ?? form.mediaType;
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        ctaLabel: nullable(form.ctaLabel),
        ctaUrl: nullable(form.ctaUrl),
        mediaUrl: mediaStorageKey ? null : nullable(form.mediaUrl),
        mediaStorageKey: nullable(mediaStorageKey),
        mediaType: mediaStorageKey || form.mediaUrl ? mediaType : "NONE",
        placement: "MOBILE_HEADER",
        audience: form.audience,
        status: form.status,
        tenantId: nullable(form.tenantId),
        branchId: nullable(form.branchId),
        roleNames: form.roleNames,
        userIds: form.userIds,
        priority: Number(form.priority || 0),
        startsAt: form.startsAt
          ? new Date(form.startsAt).toISOString()
          : new Date().toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };

      await controlCenterFetch<{ campaign: ControlCenterMarketingCampaign }>(
        editingId
          ? `/marketing-campaigns/${editingId}`
          : "/marketing-campaigns",
        session,
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setNotice(
        editingId
          ? "Marketing campaign updated."
          : "Marketing campaign created.",
      );
      resetForm();
      await loadCampaigns();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save marketing campaign.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadMedia(file: File) {
    const presign = await controlCenterFetch<PresignResponse>(
      "/marketing-campaigns/media/presign",
      session,
      {
        method: "POST",
        body: JSON.stringify({
          mimeType: file.type,
          fileName: file.name,
        }),
      },
    );

    const response = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) {
      throw new Error("Media upload failed. Please try again.");
    }
    return presign;
  }

  async function updateStatus(
    campaign: ControlCenterMarketingCampaign,
    status: ControlCenterMarketingCampaignStatus,
  ) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await controlCenterFetch(
        `/marketing-campaigns/${campaign.id}/status`,
        session,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      setNotice(`Campaign set to ${status.toLowerCase()}.`);
      await loadCampaigns();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update campaign status.",
      );
    } finally {
      setSaving(false);
    }
  }

  function editCampaign(campaign: ControlCenterMarketingCampaign) {
    setEditingId(campaign.id);
    setMediaFile(null);
    setForm({
      title: campaign.title,
      body: campaign.body,
      ctaLabel: campaign.ctaLabel ?? "",
      ctaUrl: campaign.ctaUrl ?? "",
      mediaUrl: campaign.mediaStorageKey ? "" : (campaign.mediaUrl ?? ""),
      mediaStorageKey: campaign.mediaStorageKey ?? "",
      mediaType: campaign.mediaType,
      audience: campaign.audience,
      status: campaign.status,
      tenantId: campaign.tenantId ?? "",
      branchId: campaign.branchId ?? "",
      roleNames: campaign.roleNames,
      userIds: campaign.userIds,
      priority: String(campaign.priority),
      startsAt: toDateTimeLocal(campaign.startsAt),
      endsAt: campaign.endsAt ? toDateTimeLocal(campaign.endsAt) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setMediaFile(null);
    setForm(emptyForm);
  }

  function toggleRole(role: string) {
    updateForm(
      "roleNames",
      form.roleNames.includes(role)
        ? form.roleNames.filter((item) => item !== role)
        : [...form.roleNames, role],
    );
  }

  function toggleUser(userId: string) {
    updateForm(
      "userIds",
      selectedUsers.has(userId)
        ? form.userIds.filter((id) => id !== userId)
        : [...form.userIds, userId],
    );
  }

  function applyTemplate(template: (typeof MARKETING_TEMPLATES)[number]) {
    setForm((current) => ({
      ...current,
      title: template.title,
      body: template.body,
      ctaLabel: template.ctaLabel,
      priority: String(template.priority),
      status: current.status === "ARCHIVED" ? "DRAFT" : current.status,
    }));
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Marketing"
        subtitle="Create app header campaigns, choose exactly who sees them, and attach media without releasing a new app."
        action={
          <button
            type="button"
            onClick={() => void loadCampaigns()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dde4eb] bg-white px-3 text-sm font-bold text-[#12213f] transition hover:bg-[#f7faf8] disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-[var(--forest-emerald)]">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total campaigns"
          value={ccNumber(data?.stats.total ?? 0)}
          subtitle="Header campaigns created"
          icon={Megaphone}
        />
        <StatCard
          title="Active"
          value={ccNumber(data?.stats.active ?? 0)}
          subtitle="Visible when targeting matches"
          icon={Send}
          tone="green"
        />
        <StatCard
          title="Drafts"
          value={ccNumber(data?.stats.draft ?? 0)}
          subtitle="Prepared but not visible"
          icon={Sparkles}
          tone="blue"
        />
        <StatCard
          title="Paused"
          value={ccNumber(data?.stats.paused ?? 0)}
          subtitle="Temporarily hidden"
          icon={PauseCircle}
          tone="gold"
        />
      </div>

      <Panel className="p-5">
        <form
          onSubmit={submitCampaign}
          className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-[var(--midnight-navy)]">
                  {editingId ? "Edit campaign" : "Create campaign"}
                </h2>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  This content appears in the mobile app header for matching
                  users.
                </p>
              </div>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="grid size-9 place-items-center rounded-lg border border-[#dde4eb] text-slate-500"
                  aria-label="Cancel editing"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>

            <div>
              <span className="text-xs font-bold text-slate-600">
                Quick templates
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {MARKETING_TEMPLATES.map((template) => (
                  <button
                    key={template.label}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className="inline-flex h-8 items-center rounded-lg border border-[#dde4eb] bg-white px-3 text-xs font-bold text-[#12213f] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">Headline</span>
              <input
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder="e.g. New customer care line"
                className="mt-1 h-11 w-full rounded-lg border border-[#dde4eb] px-3 text-sm font-semibold outline-none focus:border-[var(--forest-emerald)] focus:ring-2 focus:ring-emerald-100"
                required
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">Message</span>
              <textarea
                value={form.body}
                onChange={(event) => updateForm("body", event.target.value)}
                placeholder="Write the short message mobile users should see."
                rows={4}
                className="mt-1 w-full resize-none rounded-lg border border-[#dde4eb] px-3 py-2 text-sm font-medium leading-6 outline-none focus:border-[var(--forest-emerald)] focus:ring-2 focus:ring-emerald-100"
                required
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">
                  Button label
                </span>
                <input
                  value={form.ctaLabel}
                  onChange={(event) =>
                    updateForm("ctaLabel", event.target.value)
                  }
                  placeholder="Learn more"
                  className="mt-1 h-10 w-full rounded-lg border border-[#dde4eb] px-3 text-sm font-medium outline-none focus:border-[var(--forest-emerald)] focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">
                  Button link
                </span>
                <input
                  value={form.ctaUrl}
                  onChange={(event) => updateForm("ctaUrl", event.target.value)}
                  placeholder="https://..."
                  className="mt-1 h-10 w-full rounded-lg border border-[#dde4eb] px-3 text-sm font-medium outline-none focus:border-[var(--forest-emerald)] focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">
                  Attach image or video
                </span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setMediaFile(file);
                    if (file) {
                      updateForm(
                        "mediaType",
                        file.type.startsWith("video/") ? "VIDEO" : "IMAGE",
                      );
                    }
                  }}
                  className="mt-1 block w-full text-sm font-medium text-slate-600 file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:text-sm file:font-bold file:text-[var(--forest-emerald)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">
                  Or paste media link
                </span>
                <input
                  value={form.mediaUrl}
                  onChange={(event) => {
                    updateForm("mediaUrl", event.target.value);
                    if (
                      event.target.value.trim() &&
                      form.mediaType === "NONE"
                    ) {
                      updateForm("mediaType", "IMAGE");
                    }
                  }}
                  placeholder="https://..."
                  className="mt-1 h-10 w-full rounded-lg border border-[#dde4eb] px-3 text-sm font-medium outline-none focus:border-[var(--forest-emerald)] focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">
                Media type
              </span>
              <SelectControl
                value={form.mediaType}
                onChange={(value) =>
                  updateForm(
                    "mediaType",
                    value as ControlCenterMarketingCampaignMediaType,
                  )
                }
                ariaLabel="Media type"
                className="mt-1 w-full"
                options={[
                  { value: "NONE", label: "Text only" },
                  { value: "IMAGE", label: "Image" },
                  { value: "VIDEO", label: "Video" },
                ]}
              />
            </label>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">
                  Audience
                </span>
                <SelectControl
                  value={form.audience}
                  onChange={(value) =>
                    updateForm(
                      "audience",
                      value as ControlCenterMarketingCampaignAudience,
                    )
                  }
                  ariaLabel="Audience"
                  className="mt-1 w-full"
                  options={AUDIENCE_OPTIONS}
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-600">Status</span>
                <SelectControl
                  value={form.status}
                  onChange={(value) =>
                    updateForm(
                      "status",
                      value as ControlCenterMarketingCampaignStatus,
                    )
                  }
                  ariaLabel="Status"
                  className="mt-1 w-full"
                  options={STATUS_OPTIONS}
                />
              </label>
            </div>

            <div className="rounded-lg border border-red-100 bg-red-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-red-800">
                    Estimated reach
                  </p>
                  <p className="mt-1 text-xs font-semibold text-red-600">
                    Based on current users and selected filters.
                  </p>
                </div>
                <p className="text-2xl font-black text-red-700">
                  {ccNumber(audienceReach)}
                </p>
              </div>
            </div>

            {form.audience !== "ALL_USERS" ? (
              <label className="block">
                <span className="text-xs font-bold text-slate-600">
                  Organization
                </span>
                <SelectControl
                  value={form.tenantId}
                  onChange={(value) => updateForm("tenantId", value)}
                  ariaLabel="Organization"
                  className="mt-1 w-full"
                  options={[
                    { value: "", label: "Choose organization" },
                    ...clients.map((client) => ({
                      value: client.id,
                      label: client.name,
                    })),
                  ]}
                />
              </label>
            ) : null}

            {["BRANCH_USERS", "SELECTED_USERS"].includes(form.audience) &&
            form.tenantId ? (
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Branch</span>
                <SelectControl
                  value={form.branchId}
                  onChange={(value) => updateForm("branchId", value)}
                  ariaLabel="Branch"
                  className="mt-1 w-full"
                  options={[
                    {
                      value: "",
                      label:
                        form.audience === "BRANCH_USERS"
                          ? "Choose branch"
                          : "All branches",
                    },
                    ...branches.map((branch) => ({
                      value: branch.id,
                      label: branch.name,
                    })),
                  ]}
                />
              </label>
            ) : null}

            {form.audience === "ROLE_USERS" ? (
              <div>
                <span className="text-xs font-bold text-slate-600">Roles</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`h-9 rounded-lg border px-3 text-xs font-bold ${
                        form.roleNames.includes(role)
                          ? "border-[var(--forest-emerald)] bg-emerald-50 text-[var(--forest-emerald)]"
                          : "border-[#dde4eb] bg-white text-slate-600"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {form.audience === "SELECTED_USERS" ? (
              <div>
                <span className="text-xs font-bold text-slate-600">
                  Selected people
                </span>
                <div className="mt-2 max-h-44 divide-y divide-[#eef2f5] overflow-y-auto rounded-lg border border-[#dde4eb]">
                  {selectableUsers.length === 0 ? (
                    <p className="px-3 py-4 text-sm font-medium text-slate-500">
                      No users match the current filters.
                    </p>
                  ) : (
                    selectableUsers.slice(0, 120).map((user) => (
                      <label
                        key={user.id}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(user.id)}
                          onChange={() => toggleUser(user.id)}
                          className="size-4 accent-[var(--forest-emerald)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-[var(--midnight-navy)]">
                            {user.name}
                          </span>
                          <span className="block truncate text-xs font-medium text-slate-500">
                            {user.tenant.name}
                            {user.branch ? ` - ${user.branch.name}` : ""}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">
                  Priority
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.priority}
                  onChange={(event) =>
                    updateForm("priority", event.target.value)
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-[#dde4eb] px-3 text-sm font-medium outline-none focus:border-[var(--forest-emerald)] focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-bold text-slate-600">Starts</span>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) =>
                    updateForm("startsAt", event.target.value)
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-[#dde4eb] px-3 text-sm font-medium outline-none focus:border-[var(--forest-emerald)] focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">Ends</span>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => updateForm("endsAt", event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#dde4eb] px-3 text-sm font-medium outline-none focus:border-[var(--forest-emerald)] focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <div className="rounded-lg border border-red-200 bg-white p-3 shadow-[0_14px_30px_rgba(220,38,38,0.09)]">
              <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-red-600 px-3 py-2 text-white">
                <span className="text-[11px] font-black uppercase tracking-[0.08em]">
                  Mobile header preview
                </span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-black">
                  Priority {form.priority || 0}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <IconBadge
                  icon={form.mediaType === "VIDEO" ? Video : ImagePlus}
                  tone={form.mediaType === "NONE" ? "slate" : "gold"}
                  className="size-10"
                />
                <div className="min-w-0">
                  <p className="text-sm font-black text-[var(--midnight-navy)]">
                    {form.title || "Campaign preview"}
                  </p>
                  <p className="mt-1 line-clamp-3 text-xs font-medium leading-5 text-slate-600">
                    {form.body ||
                      "Write a short, useful message that will sit below the branch header."}
                  </p>
                  {form.ctaLabel ? (
                    <p className="mt-2 text-xs font-black text-red-700">
                      {form.ctaLabel}
                    </p>
                  ) : null}
                  {mediaFile || form.mediaUrl || form.mediaStorageKey ? (
                    <p className="mt-2 truncate text-[11px] font-semibold text-slate-400">
                      {mediaFile?.name ||
                        form.mediaUrl ||
                        "Uploaded media attached"}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--forest-emerald)] px-4 text-sm font-black text-white shadow-[0_12px_24px_rgba(5,111,58,0.2)] transition hover:bg-[#025f31] disabled:opacity-60"
            >
              <Save className="size-4" />
              {saving
                ? "Saving..."
                : editingId
                  ? "Save campaign"
                  : "Create campaign"}
            </button>
          </div>
        </form>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ebf0] px-5 py-4">
          <div>
            <h2 className="text-base font-black text-[var(--midnight-navy)]">
              Campaigns
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Higher priority active campaigns appear first when more than one
              matches.
            </p>
          </div>
          <InlineSearch
            value={query}
            onChange={setQuery}
            placeholder="Search campaigns..."
            className="max-w-md"
          />
        </div>

        <div className="hidden grid-cols-[1.15fr_0.9fr_0.8fr_0.75fr_0.8fr_190px] gap-3 border-b border-[#e6ebf0] bg-[#f7faf9] px-5 py-3 text-[11px] font-black uppercase text-slate-500 xl:grid">
          <span>Campaign</span>
          <span>Audience</span>
          <span>Media</span>
          <span>Schedule</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        <div className="divide-y divide-[#edf1f4]">
          {loading ? (
            <p className="px-5 py-8 text-sm font-semibold text-slate-500">
              Loading campaigns...
            </p>
          ) : filteredCampaigns.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Search className="mx-auto size-7 text-slate-300" />
              <h3 className="mt-3 text-base font-black text-[var(--midnight-navy)]">
                No campaigns found
              </h3>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Create the first header campaign or clear your search.
              </p>
            </div>
          ) : (
            filteredCampaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                saving={saving}
                onEdit={() => editCampaign(campaign)}
                onStatus={(status) => void updateStatus(campaign, status)}
              />
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

function CampaignRow({
  campaign,
  saving,
  onEdit,
  onStatus,
}: {
  campaign: ControlCenterMarketingCampaign;
  saving: boolean;
  onEdit: () => void;
  onStatus: (status: ControlCenterMarketingCampaignStatus) => void;
}) {
  return (
    <article className="grid gap-3 px-5 py-4 xl:grid-cols-[1.15fr_0.9fr_0.8fr_0.75fr_0.8fr_190px] xl:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-[var(--midnight-navy)]">
          {campaign.title}
        </p>
        <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-500">
          {campaign.body}
        </p>
      </div>

      <div className="text-xs font-semibold text-slate-600">
        <p>{audienceLabel(campaign)}</p>
        <p className="mt-1 text-slate-400">Priority {campaign.priority}</p>
      </div>

      <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
        {campaign.mediaType === "VIDEO" ? (
          <Video className="size-4 text-[#2563eb]" />
        ) : campaign.mediaType === "IMAGE" ? (
          <ImagePlus className="size-4 text-[var(--forest-emerald)]" />
        ) : (
          <Megaphone className="size-4 text-slate-400" />
        )}
        {campaign.mediaType === "NONE" ? "Text only" : campaign.mediaType}
      </div>

      <div className="text-xs font-semibold text-slate-600">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5 text-slate-400" />
          {ccDate(campaign.startsAt)}
        </div>
        {campaign.endsAt ? (
          <p className="mt-1 text-slate-400">Until {ccDate(campaign.endsAt)}</p>
        ) : (
          <p className="mt-1 text-slate-400">No end date</p>
        )}
      </div>

      <StatusPill value={campaign.status} />

      <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
        <button
          type="button"
          onClick={onEdit}
          disabled={saving}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dde4eb] bg-white px-2.5 text-xs font-bold text-[#12213f] disabled:opacity-60"
        >
          <Edit3 className="size-3.5" />
          Edit
        </button>
        {campaign.status === "ACTIVE" ? (
          <button
            type="button"
            onClick={() => onStatus("PAUSED")}
            disabled={saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-bold text-amber-700 disabled:opacity-60"
          >
            <PauseCircle className="size-3.5" />
            Pause
          </button>
        ) : campaign.status !== "ARCHIVED" ? (
          <button
            type="button"
            onClick={() => onStatus("ACTIVE")}
            disabled={saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-bold text-[var(--forest-emerald)] disabled:opacity-60"
          >
            <PlayCircle className="size-3.5" />
            Publish
          </button>
        ) : null}
        {campaign.status !== "ARCHIVED" ? (
          <button
            type="button"
            onClick={() => onStatus("ARCHIVED")}
            disabled={saving}
            className="grid size-8 place-items-center rounded-lg border border-red-100 bg-red-50 text-red-600 disabled:opacity-60"
            aria-label="Archive campaign"
          >
            <Archive className="size-3.5" />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function audienceLabel(campaign: ControlCenterMarketingCampaign) {
  if (campaign.audience === "ALL_USERS") return "Everyone";
  if (campaign.audience === "TENANT_OWNERS") {
    return `Owners - ${campaign.tenantName ?? "organization"}`;
  }
  if (campaign.audience === "BRANCH_USERS") {
    return `${campaign.branchName ?? "Branch"} - ${campaign.tenantName ?? ""}`;
  }
  if (campaign.audience === "ROLE_USERS") {
    const scope = campaign.tenantName ? ` at ${campaign.tenantName}` : "";
    return `${campaign.roleNames.join(", ") || "Selected roles"}${scope}`;
  }
  if (campaign.audience === "SELECTED_USERS") {
    return `${campaign.userIds.length} selected people`;
  }
  return campaign.tenantName ?? "Organization users";
}

function nullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}
