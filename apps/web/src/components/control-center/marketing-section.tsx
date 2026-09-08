"use client";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ChevronDown,
  FileText,
  Gift,
  Megaphone,
  MessageCircle,
  PauseCircle,
  Plus,
  RefreshCw,
  Save,
  Send,
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
import { ccDate, ccDateTime, ccNumber } from "./formatters";
import {
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
  ControlCenterMarketingCampaignCategory,
  ControlCenterMarketingCampaignCtaAction,
  ControlCenterMarketingCampaignMediaType,
  ControlCenterMarketingCampaignStatus,
  ControlCenterMarketingCampaignsResponse,
  ControlCenterMarketingInternalRoute,
  ControlCenterUser,
} from "./types";

type MarketingForm = {
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  ctaAction: ControlCenterMarketingCampaignCtaAction;
  ctaRoute: string;
  category: ControlCenterMarketingCampaignCategory;
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

const FALLBACK_INTERNAL_ROUTES: ControlCenterMarketingInternalRoute[] = [
  { key: "home", label: "Home" },
  { key: "ops", label: "Daily Operations (Ops)" },
  { key: "records", label: "Records" },
  { key: "clients", label: "Clients" },
  { key: "more", label: "More" },
  { key: "subscription", label: "Subscription & SMS" },
  { key: "subscription_sms", label: "SMS bundles" },
  { key: "subscription_plan", label: "Plan renewal" },
  { key: "corrections", label: "Repayment corrections" },
  { key: "reports", label: "Reports" },
  { key: "profile", label: "Profile" },
  { key: "settings", label: "Settings" },
];

const CATEGORY_OPTIONS = [
  {
    value: "CRITICAL_WARNING" as const,
    label: "Critical operational warning",
    title: "Important REMBEH notice",
    body: "Please review this update before continuing daily operations. It may affect how your branch records work today.",
    ctaLabel: "Read notice",
    ctaAction: "INTERNAL_ROUTE" as const,
    ctaRoute: "home",
    priority: "95",
  },
  {
    value: "PRODUCT_UPDATE" as const,
    label: "Product / update / education",
    title: "New REMBEH feature available",
    body: "A new workflow is now available in your app. Open this update to see what changed and how it helps your team.",
    ctaLabel: "See update",
    ctaAction: "INTERNAL_ROUTE" as const,
    ctaRoute: "subscription",
    priority: "55",
  },
  {
    value: "PROMOTIONAL" as const,
    label: "Promotional / marketing",
    title: "Get more value with Pro",
    body: "Unlock all features, get free SMS, and grow your business with a Rembeh Pro plan.",
    ctaLabel: "View plans",
    ctaAction: "INTERNAL_ROUTE" as const,
    ctaRoute: "subscription_plan",
    priority: "80",
  },
] satisfies Array<{
  value: ControlCenterMarketingCampaignCategory;
  label: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaAction: ControlCenterMarketingCampaignCtaAction;
  ctaRoute: string;
  priority: string;
}>;

const CATEGORY_PREVIEW = {
  CRITICAL_WARNING: {
    surface: "#FFF5F5",
    border: "#FECACA",
    accent: "#DC2626",
    iconBg: "#FEE2E2",
    title: "#7F1D1D",
    body: "#991B1B",
  },
  PRODUCT_UPDATE: {
    surface: "#F0F7FF",
    border: "#BFDBFE",
    accent: "#2563EB",
    iconBg: "#DBEAFE",
    title: "#1E3A8A",
    body: "#1E40AF",
  },
  PROMOTIONAL: {
    surface: "#F0FDF6",
    border: "#BBF7D0",
    accent: "#059669",
    iconBg: "#D1FAE5",
    title: "#064E3B",
    body: "#065F46",
  },
} as const;

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
  ctaAction: "INTERNAL_ROUTE",
  ctaRoute: "home",
  category: "PRODUCT_UPDATE",
  mediaUrl: "",
  mediaStorageKey: "",
  mediaType: "NONE",
  audience: "ALL_USERS",
  status: "DRAFT",
  tenantId: "",
  branchId: "",
  roleNames: [],
  userIds: [],
  priority: "10",
  startsAt: "",
  endsAt: "",
};

const fieldLabelClass = "text-[10px] font-semibold text-[#5e6c84]";
const fieldInputClass =
  "mt-1 h-9 w-full rounded-md border border-[#dfe5eb] bg-white px-3 text-[10.5px] font-medium text-[#17233c] outline-none transition placeholder:text-[#8c97a9] focus:border-[#87bfa1] focus:ring-2 focus:ring-[#e6f4eb]";
const fieldTextareaClass =
  "mt-1 w-full resize-none rounded-md border border-[#dfe5eb] bg-white px-3 py-2 text-[10.5px] font-medium leading-5 text-[#17233c] outline-none transition placeholder:text-[#8c97a9] focus:border-[#87bfa1] focus:ring-2 focus:ring-[#e6f4eb]";
const sectionLabelClass = "text-[11px] font-semibold text-[#15223a]";
const actionTextBtnClass =
  "text-[10px] font-semibold text-[#53627a] transition hover:text-[#168650] disabled:opacity-50";

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
  const [statusFilter, setStatusFilter] = useState<
    ControlCenterMarketingCampaignStatus | "ALL"
  >("ALL");
  const [categoryFilter, setCategoryFilter] = useState<
    ControlCenterMarketingCampaignCategory | "ALL"
  >("ALL");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const campaignRows = Array.isArray(data?.campaigns) ? data!.campaigns : [];

  const internalRoutes = useMemo(() => {
    const routes = Array.isArray(data?.internalRoutes)
      ? data!.internalRoutes
      : [];
    return routes.length > 0 ? routes : FALLBACK_INTERNAL_ROUTES;
  }, [data?.internalRoutes]);

  const statusCounts = useMemo(() => {
    return {
      ALL: data?.stats.total ?? campaignRows.length,
      ACTIVE: data?.stats.active ?? 0,
      DRAFT: data?.stats.draft ?? 0,
      PAUSED: data?.stats.paused ?? 0,
      ARCHIVED: data?.stats.archived ?? 0,
    };
  }, [campaignRows.length, data?.stats]);

  const categoryCounts = useMemo(() => {
    const base =
      statusFilter === "ALL"
        ? campaignRows
        : campaignRows.filter((campaign) => campaign.status === statusFilter);
    return {
      ALL: base.length,
      CRITICAL_WARNING: base.filter(
        (campaign) => campaign.category === "CRITICAL_WARNING",
      ).length,
      PRODUCT_UPDATE: base.filter(
        (campaign) => campaign.category === "PRODUCT_UPDATE",
      ).length,
      PROMOTIONAL: base.filter((campaign) => campaign.category === "PROMOTIONAL")
        .length,
    };
  }, [campaignRows, statusFilter]);

  const filteredCampaigns = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = campaignRows.filter((campaign) => {
      if (statusFilter !== "ALL" && campaign.status !== statusFilter) {
        return false;
      }
      if (categoryFilter !== "ALL" && campaign.category !== categoryFilter) {
        return false;
      }
      if (!needle) return true;
      return [
        campaign.title,
        campaign.body,
        campaign.tenantName ?? "",
        campaign.branchName ?? "",
        campaign.status,
        campaign.audience,
        campaign.category,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    return [...filtered].sort((a, b) => {
      const aActive = a.status === "ACTIVE" ? 0 : 1;
      const bActive = b.status === "ACTIVE" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return (
        new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
      );
    });
  }, [campaignRows, categoryFilter, query, statusFilter]);

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

  async function saveCampaign(options?: { publish?: boolean }) {
    const validationError = validateCampaignForm(form);
    if (validationError) {
      setError(validationError);
      setNotice(null);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const uploaded = mediaFile ? await uploadMedia(mediaFile) : null;
      const mediaStorageKey = uploaded?.storageKey ?? form.mediaStorageKey;
      const mediaType = uploaded?.mediaType ?? form.mediaType;
      const nextStatus = options?.publish ? "ACTIVE" : form.status;
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        ctaLabel: nullable(form.ctaLabel),
        ctaUrl:
          form.ctaAction === "EXTERNAL_URL" ? nullable(form.ctaUrl) : null,
        ctaAction: form.ctaAction,
        ctaRoute:
          form.ctaAction === "INTERNAL_ROUTE" ? nullable(form.ctaRoute) : null,
        category: form.category,
        mediaUrl: mediaStorageKey ? null : nullable(form.mediaUrl),
        mediaStorageKey: nullable(mediaStorageKey),
        mediaType: mediaStorageKey || form.mediaUrl ? mediaType : "NONE",
        placement: "MOBILE_HEADER",
        audience: form.audience,
        status: nextStatus,
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

      const response = await controlCenterFetch<{
        campaign: ControlCenterMarketingCampaign;
      }>(
        editingId
          ? `/marketing-campaigns/${editingId}`
          : "/marketing-campaigns",
        session,
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );

      const saved = response.campaign;
      setData((current) => mergeCampaignIntoList(current, saved));
      setEditingId(saved.id);
      setMediaFile(null);
      setForm((current) => ({
        ...current,
        status: saved.status,
        mediaStorageKey: saved.mediaStorageKey ?? current.mediaStorageKey,
        mediaUrl: saved.mediaStorageKey ? "" : (saved.mediaUrl ?? ""),
        mediaType: saved.mediaType,
      }));
      setNotice(
        saved.status === "ACTIVE"
          ? "Campaign saved and published. Matching users get a push, and the Home card appears under SMS balance after they refresh the app."
          : "Campaign saved as a draft. Publish it when you want the mobile card to go live.",
      );
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

  async function submitCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCampaign();
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
      ctaAction: campaign.ctaAction ?? "EXTERNAL_URL",
      ctaRoute: campaign.ctaRoute ?? "",
      category: campaign.category ?? "PRODUCT_UPDATE",
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

  function duplicateCampaign(campaign: ControlCenterMarketingCampaign) {
    setEditingId(null);
    setMediaFile(null);
    setForm({
      title: campaign.title,
      body: campaign.body,
      ctaLabel: campaign.ctaLabel ?? "",
      ctaUrl: campaign.ctaUrl ?? "",
      ctaAction: campaign.ctaAction ?? "EXTERNAL_URL",
      ctaRoute: campaign.ctaRoute ?? "",
      category: campaign.category ?? "PRODUCT_UPDATE",
      mediaUrl: campaign.mediaStorageKey ? "" : (campaign.mediaUrl ?? ""),
      mediaStorageKey: campaign.mediaStorageKey ?? "",
      mediaType: campaign.mediaType,
      audience: campaign.audience,
      status: "DRAFT",
      tenantId: campaign.tenantId ?? "",
      branchId: campaign.branchId ?? "",
      roleNames: campaign.roleNames,
      userIds: campaign.userIds,
      priority: String(campaign.priority),
      startsAt: toDateTimeLocal(campaign.startsAt),
      endsAt: campaign.endsAt ? toDateTimeLocal(campaign.endsAt) : "",
    });
    setNotice("Campaign duplicated into the form as a new draft. Review and save.");
    setError(null);
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

  function selectCategory(category: ControlCenterMarketingCampaignCategory) {
    const sample = CATEGORY_OPTIONS.find((option) => option.value === category);
    setForm((current) => {
      const sampleTitles = new Set(
        CATEGORY_OPTIONS.map((option) => option.title),
      );
      const usingSampleContent =
        !current.title.trim() || sampleTitles.has(current.title.trim());
      return {
        ...current,
        category,
        ...(usingSampleContent && sample
          ? {
              title: sample.title,
              body: sample.body,
              ctaLabel: sample.ctaLabel,
              ctaAction: sample.ctaAction,
              ctaRoute: sample.ctaRoute,
              priority: sample.priority,
            }
          : {}),
        status: current.status === "ARCHIVED" ? "DRAFT" : current.status,
      };
    });
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Marketing"
        subtitle="In-app header campaigns for mobile users."
        action={
          <button
            type="button"
            onClick={() => void loadCampaigns()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3.5 text-[10.5px] font-semibold text-[#17233c] transition hover:bg-[#f7faf8] disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {error ? (
        <p className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-[8px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-[#188653]">
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
          subtitle="Currently published"
          icon={Send}
          tone="green"
        />
        <StatCard
          title="Drafts"
          value={ccNumber(data?.stats.draft ?? 0)}
          subtitle="Not yet published"
          icon={FileText}
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

      <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
        <form onSubmit={submitCampaign}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f4] px-4 py-3">
            <div>
              <h2 className="text-[13px] font-semibold text-[#15223a]">
                {editingId ? "Edit campaign" : "New campaign"}
              </h2>
              <p className="mt-0.5 text-[10px] font-medium text-[#68758d]">
                Appears in the mobile app header for matching users.
              </p>
            </div>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] text-[#60708a] transition hover:bg-[#f7faf8]"
                aria-label="Cancel editing"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="grid xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
            <div className="min-w-0">
              {/* Section A: Template */}
              <div className="px-4 py-3.5">
                <p className={sectionLabelClass}>Template</p>
                <div className="mt-2 divide-y divide-[#edf1f4] rounded-md border border-[#dfe5eb]">
                  {CATEGORY_OPTIONS.map((option) => {
                    const checked = form.category === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-center gap-2.5 px-3 py-2.5 transition ${
                          checked ? "bg-[#f4faf6]" : "bg-white hover:bg-[#fbfcfd]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="campaign-template"
                          checked={checked}
                          onChange={() => selectCategory(option.value)}
                          className="size-3.5 accent-[#188653]"
                        />
                        <span
                          className={`text-[10.5px] font-semibold ${
                            checked ? "text-[#168650]" : "text-[#17233c]"
                          }`}
                        >
                          {option.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Section B: Content */}
              <div className="border-t border-[#edf1f4] px-4 py-3.5">
                <p className={sectionLabelClass}>Content</p>
                <div className="mt-2.5 space-y-2.5">
                  <label className="block">
                    <span className={fieldLabelClass}>Title</span>
                    <input
                      value={form.title}
                      onChange={(event) => updateForm("title", event.target.value)}
                      placeholder="Campaign title"
                      className={fieldInputClass}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className={fieldLabelClass}>Body</span>
                    <textarea
                      value={form.body}
                      onChange={(event) => updateForm("body", event.target.value)}
                      placeholder="Short message for the header card"
                      rows={3}
                      className={fieldTextareaClass}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className={fieldLabelClass}>Button label</span>
                    <input
                      value={form.ctaLabel}
                      onChange={(event) =>
                        updateForm("ctaLabel", event.target.value)
                      }
                      placeholder="Optional"
                      className={fieldInputClass}
                    />
                  </label>
                </div>
              </div>

              {/* Section C: Button destination */}
              <div className="border-t border-[#edf1f4] px-4 py-3.5">
                <p className={sectionLabelClass}>Button destination</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: "EXTERNAL_URL", label: "External" },
                      { value: "INTERNAL_ROUTE", label: "In-app" },
                    ] as const
                  ).map((option) => {
                    const selected = form.ctaAction === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateForm("ctaAction", option.value)}
                        className={`h-8 rounded-md border text-[10px] font-semibold transition ${
                          selected
                            ? "border-[#188653] bg-[#f2fbf6] text-[#188653]"
                            : "border-[#dfe5eb] bg-white text-[#53627a] hover:bg-[#fbfcfd]"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {form.ctaAction === "EXTERNAL_URL" ? (
                  <label className="mt-2.5 block">
                    <span className={fieldLabelClass}>URL</span>
                    <input
                      value={form.ctaUrl}
                      onChange={(event) =>
                        updateForm("ctaUrl", event.target.value)
                      }
                      placeholder="https://..."
                      className={fieldInputClass}
                    />
                  </label>
                ) : (
                  <label className="mt-2.5 block">
                    <span className={fieldLabelClass}>In-app page</span>
                    <SelectControl
                      value={form.ctaRoute}
                      onChange={(value) => updateForm("ctaRoute", value)}
                      ariaLabel="In-app page"
                      className="mt-1 !h-9 w-full !rounded-md !border-[#dfe5eb] !text-[10.5px] !font-medium"
                      options={[
                        { value: "", label: "Choose page" },
                        ...internalRoutes.map((route) => ({
                          value: route.key,
                          label: route.label,
                        })),
                      ]}
                    />
                  </label>
                )}
              </div>

              {/* Section D: Audience + schedule + priority + status */}
              <div className="border-t border-[#edf1f4] px-4 py-3.5">
                <p className={sectionLabelClass}>Audience & schedule</p>
                <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                  <label className="block">
                    <span className={fieldLabelClass}>Audience</span>
                    <SelectControl
                      value={form.audience}
                      onChange={(value) =>
                        updateForm(
                          "audience",
                          value as ControlCenterMarketingCampaignAudience,
                        )
                      }
                      ariaLabel="Audience"
                      className="mt-1 !h-9 w-full !rounded-md !border-[#dfe5eb] !text-[10.5px] !font-medium"
                      options={AUDIENCE_OPTIONS}
                    />
                  </label>
                  <label className="block">
                    <span className={fieldLabelClass}>Status</span>
                    <SelectControl
                      value={form.status}
                      onChange={(value) =>
                        updateForm(
                          "status",
                          value as ControlCenterMarketingCampaignStatus,
                        )
                      }
                      ariaLabel="Status"
                      className="mt-1 !h-9 w-full !rounded-md !border-[#dfe5eb] !text-[10.5px] !font-medium"
                      options={STATUS_OPTIONS}
                    />
                  </label>
                </div>

                <div className="mt-2.5 flex items-center justify-between rounded-md border border-[#dfe5eb] bg-[#fcfdfe] px-3 py-2">
                  <span className="text-[10px] font-semibold text-[#5e6c84]">
                    Estimated reach
                  </span>
                  <span className="text-[13px] font-semibold text-[#15223a]">
                    {ccNumber(audienceReach)}
                  </span>
                </div>

                {form.audience !== "ALL_USERS" ? (
                  <label className="mt-2.5 block">
                    <span className={fieldLabelClass}>Organization</span>
                    <SelectControl
                      value={form.tenantId}
                      onChange={(value) => updateForm("tenantId", value)}
                      ariaLabel="Organization"
                      className="mt-1 !h-9 w-full !rounded-md !border-[#dfe5eb] !text-[10.5px] !font-medium"
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
                  <label className="mt-2.5 block">
                    <span className={fieldLabelClass}>Branch</span>
                    <SelectControl
                      value={form.branchId}
                      onChange={(value) => updateForm("branchId", value)}
                      ariaLabel="Branch"
                      className="mt-1 !h-9 w-full !rounded-md !border-[#dfe5eb] !text-[10.5px] !font-medium"
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
                  <div className="mt-2.5">
                    <span className={fieldLabelClass}>Roles</span>
                    <div className="mt-1.5 divide-y divide-[#edf1f4] rounded-md border border-[#dfe5eb]">
                      {ROLE_OPTIONS.map((role) => (
                        <label
                          key={role}
                          className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[10.5px] font-semibold text-[#17233c]"
                        >
                          <input
                            type="checkbox"
                            checked={form.roleNames.includes(role)}
                            onChange={() => toggleRole(role)}
                            className="size-3.5 accent-[#188653]"
                          />
                          {role}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}

                {form.audience === "SELECTED_USERS" ? (
                  <div className="mt-2.5">
                    <span className={fieldLabelClass}>Selected people</span>
                    <div className="mt-1.5 max-h-40 divide-y divide-[#edf1f4] overflow-y-auto rounded-md border border-[#dfe5eb]">
                      {selectableUsers.length === 0 ? (
                        <p className="px-3 py-3 text-[10.5px] font-medium text-[#68758d]">
                          No users match the current filters.
                        </p>
                      ) : (
                        selectableUsers.slice(0, 120).map((user) => (
                          <label
                            key={user.id}
                            className="flex cursor-pointer items-center gap-2.5 px-3 py-2"
                          >
                            <input
                              type="checkbox"
                              checked={selectedUsers.has(user.id)}
                              onChange={() => toggleUser(user.id)}
                              className="size-3.5 accent-[#188653]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[10.5px] font-semibold text-[#17233c]">
                                {user.name}
                              </span>
                              <span className="block truncate text-[9.5px] font-medium text-[#68758d]">
                                {user.tenant.name}
                                {user.branch ? ` · ${user.branch.name}` : ""}
                              </span>
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
                  <label className="block">
                    <span className={fieldLabelClass}>Priority</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.priority}
                      onChange={(event) =>
                        updateForm("priority", event.target.value)
                      }
                      className={fieldInputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={fieldLabelClass}>Starts</span>
                    <input
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(event) =>
                        updateForm("startsAt", event.target.value)
                      }
                      className={fieldInputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={fieldLabelClass}>Ends</span>
                    <input
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(event) =>
                        updateForm("endsAt", event.target.value)
                      }
                      className={fieldInputClass}
                    />
                  </label>
                </div>
              </div>

              {/* Section E: Media */}
              <div className="border-t border-[#edf1f4] px-4 py-3.5">
                <p className={sectionLabelClass}>Media</p>
                <p className="mt-0.5 text-[9.5px] font-medium text-[#68758d]">
                  Optional image or video for the header card.
                </p>
                <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                  <label className="block">
                    <span className={fieldLabelClass}>Upload file</span>
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
                      className="mt-1 block w-full text-[10px] font-medium text-[#53627a] file:mr-2 file:h-8 file:rounded-md file:border-0 file:bg-[#f2fbf6] file:px-2.5 file:text-[10px] file:font-semibold file:text-[#188653]"
                    />
                  </label>
                  <label className="block">
                    <span className={fieldLabelClass}>Or media URL</span>
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
                      className={fieldInputClass}
                    />
                  </label>
                </div>
                <label className="mt-2.5 block max-w-xs">
                  <span className={fieldLabelClass}>Media type</span>
                  <SelectControl
                    value={form.mediaType}
                    onChange={(value) =>
                      updateForm(
                        "mediaType",
                        value as ControlCenterMarketingCampaignMediaType,
                      )
                    }
                    ariaLabel="Media type"
                    className="mt-1 !h-9 w-full !rounded-md !border-[#dfe5eb] !text-[10.5px] !font-medium"
                    options={[
                      { value: "NONE", label: "Text only" },
                      { value: "IMAGE", label: "Image" },
                      { value: "VIDEO", label: "Video" },
                    ]}
                  />
                </label>
              </div>
            </div>

            {/* Right column: Preview */}
            <div className="border-t border-[#edf1f4] bg-[#fcfdfe] px-4 py-3.5 xl:border-l xl:border-t-0">
              <div className="xl:sticky xl:top-4">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-[#15223a]">
                    Preview
                  </p>
                  <span className="text-[10px] font-semibold text-[#68758d]">
                    Priority {form.priority || 0}
                  </span>
                </div>
                <CampaignCardPreview
                  category={form.category}
                  title={form.title}
                  body={form.body}
                  ctaLabel={form.ctaLabel}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[#edf1f4] px-4 py-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#dfe5eb] bg-white px-3.5 text-[10px] font-semibold text-[#17233c] transition hover:bg-[#f7faf8] disabled:opacity-60"
            >
              <Save className="size-3.5" />
              {saving
                ? "Saving..."
                : editingId
                  ? "Save changes"
                  : "Save draft"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveCampaign({ publish: true })}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#188653] px-3.5 text-[10px] font-semibold text-white transition hover:bg-[#147348] disabled:opacity-60"
            >
              <Send className="size-3.5" />
              {saving ? "Publishing..." : "Publish"}
            </button>
            {editingId ? (
              <button
                type="button"
                disabled={saving}
                onClick={resetForm}
                className="ml-auto inline-flex h-9 items-center px-2 text-[10px] font-semibold text-[#68758d] transition hover:text-[#17233c] disabled:opacity-60"
              >
                New campaign
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#edf1f4] px-4 py-3">
          <h2 className="mr-auto text-[13px] font-semibold text-[#15223a]">
            Campaigns
          </h2>
          <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3 focus-within:border-[#87bfa1] focus-within:ring-2 focus-within:ring-[#e6f4eb] sm:max-w-[280px]">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search campaigns..."
              className="min-w-0 flex-1 bg-transparent text-[10.5px] font-normal text-[#17233c] outline-none placeholder:text-[#8c97a9]"
            />
          </label>
          <SelectControl
            value={statusFilter}
            onChange={(value) =>
              setStatusFilter(
                value as ControlCenterMarketingCampaignStatus | "ALL",
              )
            }
            ariaLabel="Status filter"
            className="!h-9 !min-w-[140px] !rounded-md !border-[#dfe5eb] !text-[10px] !font-medium"
            options={[
              { value: "ALL", label: `All statuses (${statusCounts.ALL})` },
              { value: "ACTIVE", label: `Active (${statusCounts.ACTIVE})` },
              { value: "DRAFT", label: `Draft (${statusCounts.DRAFT})` },
              { value: "PAUSED", label: `Paused (${statusCounts.PAUSED})` },
              {
                value: "ARCHIVED",
                label: `Archived (${statusCounts.ARCHIVED})`,
              },
            ]}
          />
          <SelectControl
            value={categoryFilter}
            onChange={(value) =>
              setCategoryFilter(
                value as ControlCenterMarketingCampaignCategory | "ALL",
              )
            }
            ariaLabel="Category filter"
            className="!h-9 !min-w-[140px] !rounded-md !border-[#dfe5eb] !text-[10px] !font-medium"
            options={[
              { value: "ALL", label: `All templates (${categoryCounts.ALL})` },
              {
                value: "CRITICAL_WARNING",
                label: `Critical (${categoryCounts.CRITICAL_WARNING})`,
              },
              {
                value: "PRODUCT_UPDATE",
                label: `Product (${categoryCounts.PRODUCT_UPDATE})`,
              },
              {
                value: "PROMOTIONAL",
                label: `Promo (${categoryCounts.PROMOTIONAL})`,
              },
            ]}
          />
        </div>

        {loading ? (
          <p className="px-4 py-8 text-[11px] font-medium text-[#68758d]">
            Loading campaigns...
          </p>
        ) : filteredCampaigns.length === 0 ? (
          <CampaignListEmpty
            statusFilter={statusFilter}
            categoryFilter={categoryFilter}
            hasQuery={query.trim().length > 0}
          />
        ) : (
          <>
            <div className="hidden border-b border-[#edf1f4] bg-[#fcfdfe] px-4 py-2.5 text-[9.5px] font-semibold text-[#56647d] xl:grid xl:grid-cols-[minmax(0,1.4fr)_90px_minmax(120px,0.7fr)_minmax(130px,0.75fr)_90px_minmax(200px,0.9fr)] xl:gap-3">
              <span>Campaign</span>
              <span>Template</span>
              <span>Audience</span>
              <span>Schedule</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[#edf1f4]">
              {filteredCampaigns.map((campaign) => (
                <CampaignTableRow
                  key={campaign.id}
                  campaign={campaign}
                  saving={saving}
                  internalRoutes={internalRoutes}
                  onEdit={() => editCampaign(campaign)}
                  onDuplicate={() => duplicateCampaign(campaign)}
                  onStatus={(status) => void updateStatus(campaign, status)}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function CampaignCardPreview({
  category,
  title,
  body,
  ctaLabel,
}: {
  category: ControlCenterMarketingCampaignCategory;
  title: string;
  body: string;
  ctaLabel: string;
}) {
  const theme = CATEGORY_PREVIEW[category];
  const label = ctaLabel.trim() || "Learn more";

  return (
    <div
      className="relative overflow-hidden rounded-[10px] border p-3.5"
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
      }}
    >
      <PreviewWatermark category={category} accent={theme.accent} />

      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className="absolute right-2.5 top-2.5 grid size-6 place-items-center rounded-full bg-white/80 text-slate-400"
      >
        <X className="size-3" />
      </button>

      <div className="relative z-[1] flex items-start gap-2.5 pr-7">
        <div
          className="grid size-9 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: theme.iconBg, color: theme.accent }}
        >
          {category === "CRITICAL_WARNING" ? (
            <AlertTriangle className="size-4" strokeWidth={2.4} />
          ) : category === "PRODUCT_UPDATE" ? (
            <Megaphone className="size-4" strokeWidth={2.4} />
          ) : (
            <Gift className="size-4" strokeWidth={2.4} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="text-[12px] font-semibold leading-4"
            style={{ color: theme.title }}
          >
            {title.trim() || "Campaign preview"}
          </p>
          <p
            className="mt-1 line-clamp-3 text-[10.5px] font-medium leading-4"
            style={{ color: theme.body }}
          >
            {body.trim() ||
              "Write a short message for the mobile header card."}
          </p>

          <div
            className="mt-2.5 inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: theme.accent }}
          >
            {label}
            <ArrowRight className="size-3" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewWatermark({
  category,
  accent,
}: {
  category: ControlCenterMarketingCampaignCategory;
  accent: string;
}) {
  if (category === "CRITICAL_WARNING") {
    return (
      <MessageCircle
        className="pointer-events-none absolute -right-2 bottom-1 size-20 opacity-[0.1]"
        style={{ color: accent }}
        strokeWidth={1.5}
      />
    );
  }

  if (category === "PRODUCT_UPDATE") {
    return (
      <div className="pointer-events-none absolute -right-1 bottom-2 flex items-end opacity-[0.14]">
        <FileText className="size-14" style={{ color: accent }} strokeWidth={1.4} />
        <span
          className="absolute -right-0.5 top-1 grid size-5 place-items-center rounded-full text-white"
          style={{ backgroundColor: "#10B981" }}
        >
          <Plus className="size-3" strokeWidth={3} />
        </span>
      </div>
    );
  }

  return (
    <BarChart3
      className="pointer-events-none absolute -right-1 bottom-1 size-20 opacity-[0.12]"
      style={{ color: accent }}
      strokeWidth={1.5}
    />
  );
}

function CampaignListEmpty({
  statusFilter,
  categoryFilter,
  hasQuery,
}: {
  statusFilter: ControlCenterMarketingCampaignStatus | "ALL";
  categoryFilter: ControlCenterMarketingCampaignCategory | "ALL";
  hasQuery: boolean;
}) {
  const statusLabel =
    statusFilter === "ALL"
      ? null
      : STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label ??
        statusFilter.toLowerCase();
  const categoryLabel =
    categoryFilter === "ALL" ? null : categoryShortLabel(categoryFilter);

  let title = "No campaigns yet";
  let body = "Create a header campaign to notify mobile users.";

  if (hasQuery) {
    title = "No campaigns match your search";
    body = "Try a different keyword, or clear search and filters.";
  } else if (statusLabel || categoryLabel) {
    const parts = [statusLabel, categoryLabel].filter(Boolean).join(" · ");
    title = `No ${parts} campaigns`;
    body = "Switch filters or create a campaign that matches this view.";
  }

  return (
    <div className="mx-4 my-5 rounded-[10px] border border-dashed border-[#dfe5eb] px-4 py-8 text-center">
      <p className="text-[11px] font-semibold text-[#15223a]">{title}</p>
      <p className="mt-1 text-[10px] font-medium text-[#68758d]">{body}</p>
    </div>
  );
}

function CampaignTableRow({
  campaign,
  saving,
  internalRoutes,
  onEdit,
  onDuplicate,
  onStatus,
}: {
  campaign: ControlCenterMarketingCampaign;
  saving: boolean;
  internalRoutes: ControlCenterMarketingInternalRoute[];
  onEdit: () => void;
  onDuplicate: () => void;
  onStatus: (status: ControlCenterMarketingCampaignStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const schedule = campaignScheduleMeta(campaign);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((current) => !current);
          }
        }}
        className="grid cursor-pointer gap-2 px-4 py-3 transition hover:bg-[#fbfcfd] xl:grid-cols-[minmax(0,1.4fr)_90px_minmax(120px,0.7fr)_minmax(130px,0.75fr)_90px_minmax(200px,0.9fr)] xl:items-center xl:gap-3"
      >
        <div className="min-w-0">
          <div className="flex items-start gap-1.5">
            <ChevronDown
              className={`mt-0.5 size-3.5 shrink-0 text-[#8a94a5] transition ${
                expanded ? "rotate-180" : ""
              }`}
            />
            <div className="min-w-0">
              <p className="truncate text-[10.5px] font-semibold text-[#17233c]">
                {campaign.title}
              </p>
              <p className="mt-0.5 truncate text-[9.5px] font-medium text-[#68758d]">
                {campaign.body}
              </p>
            </div>
          </div>
        </div>

        <p className="text-[10.5px] font-medium text-[#26344d]">
          {categoryShortLabel(campaign.category)}
        </p>

        <p className="truncate text-[10.5px] font-medium text-[#26344d]">
          {audienceLabel(campaign)}
        </p>

        <p className="text-[10px] font-medium text-[#26354f]">
          {schedule.detail}
        </p>

        <div>
          <StatusPill value={campaign.status} />
        </div>

        <div
          className="flex flex-wrap items-center justify-start gap-x-2.5 gap-y-1 xl:justify-end"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onEdit}
            disabled={saving}
            className={actionTextBtnClass}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={saving}
            className={actionTextBtnClass}
          >
            Duplicate
          </button>
          {campaign.status === "ACTIVE" ? (
            <button
              type="button"
              onClick={() => onStatus("PAUSED")}
              disabled={saving}
              className={actionTextBtnClass}
            >
              Pause
            </button>
          ) : campaign.status !== "ARCHIVED" ? (
            <button
              type="button"
              onClick={() => onStatus("ACTIVE")}
              disabled={saving}
              className="text-[10px] font-semibold text-[#188653] transition hover:text-[#147348] disabled:opacity-50"
            >
              Publish
            </button>
          ) : null}
          {campaign.status !== "ARCHIVED" ? (
            <button
              type="button"
              onClick={() => onStatus("ARCHIVED")}
              disabled={saving}
              className="text-[10px] font-semibold text-[#c94040] transition hover:text-[#a83333] disabled:opacity-50"
            >
              Archive
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-[#edf1f4] bg-[#fcfdfe] px-4 py-2.5 text-[10px] font-medium text-[#68758d]">
          <p>
            Created by {campaign.createdBy?.name ?? "Unknown"} ·{" "}
            {ccDateTime(campaign.createdAt)} · Priority {campaign.priority}
          </p>
          <p className="mt-1">
            {ctaSummary(campaign, internalRoutes)}
            {campaign.ctaLabel ? ` · Button: ${campaign.ctaLabel}` : ""}
            {campaign.ctaAction === "EXTERNAL_URL" && campaign.ctaUrl
              ? ` → ${campaign.ctaUrl}`
              : ""}
            {campaign.ctaAction === "INTERNAL_ROUTE" && campaign.ctaRoute
              ? ` → ${routeLabel(campaign.ctaRoute, internalRoutes)}`
              : ""}
          </p>
          <p className="mt-1">{schedule.badge}</p>
        </div>
      ) : null}
    </div>
  );
}

function categoryShortLabel(category: ControlCenterMarketingCampaignCategory) {
  if (category === "CRITICAL_WARNING") return "Critical";
  if (category === "PRODUCT_UPDATE") return "Product";
  return "Promo";
}

function routeLabel(
  routeKey: string,
  routes: ControlCenterMarketingInternalRoute[],
) {
  return routes.find((route) => route.key === routeKey)?.label ?? routeKey;
}

function ctaSummary(
  campaign: ControlCenterMarketingCampaign,
  routes: ControlCenterMarketingInternalRoute[],
) {
  if (!campaign.ctaLabel?.trim()) return "No button";
  if (campaign.ctaAction === "INTERNAL_ROUTE") {
    const page = campaign.ctaRoute
      ? routeLabel(campaign.ctaRoute, routes)
      : "In-app";
    return `In-app · ${page}`;
  }
  return "External link";
}

function campaignScheduleMeta(campaign: ControlCenterMarketingCampaign) {
  const now = Date.now();
  const starts = new Date(campaign.startsAt).getTime();
  const ends = campaign.endsAt ? new Date(campaign.endsAt).getTime() : null;
  const startsValid = !Number.isNaN(starts);
  const endsValid = ends !== null && !Number.isNaN(ends);

  if (campaign.status === "ARCHIVED") {
    return {
      badge: "Archived",
      badgeClass: "bg-slate-100 text-slate-600",
      detail: startsValid
        ? `Started ${ccDate(campaign.startsAt)}`
        : "No schedule",
    };
  }

  if (endsValid && ends! < now) {
    return {
      badge: "Expired",
      badgeClass: "bg-red-50 text-red-700",
      detail: `Ended ${ccDate(campaign.endsAt!)}`,
    };
  }

  if (startsValid && starts > now) {
    return {
      badge: "Scheduled",
      badgeClass: "bg-sky-50 text-sky-700",
      detail: endsValid
        ? `Starts ${ccDate(campaign.startsAt)} · ends ${ccDate(campaign.endsAt!)}`
        : `Starts ${ccDate(campaign.startsAt)}`,
    };
  }

  if (campaign.status === "ACTIVE") {
    return {
      badge: "Live",
      badgeClass: "bg-emerald-50 text-[var(--forest-emerald)]",
      detail: endsValid
        ? `Live · until ${ccDate(campaign.endsAt!)}`
        : `Live · from ${ccDate(campaign.startsAt)}`,
    };
  }

  if (campaign.status === "PAUSED") {
    return {
      badge: "Paused",
      badgeClass: "bg-amber-50 text-amber-700",
      detail: endsValid
        ? `Until ${ccDate(campaign.endsAt!)}`
        : `From ${ccDate(campaign.startsAt)}`,
    };
  }

  return {
    badge: "Draft",
    badgeClass: "bg-slate-100 text-slate-600",
    detail: startsValid
      ? endsValid
        ? `${ccDate(campaign.startsAt)} → ${ccDate(campaign.endsAt!)}`
        : `Starts ${ccDate(campaign.startsAt)}`
      : "No schedule",
  };
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

function validateCampaignForm(form: MarketingForm): string | null {
  if (form.title.trim().length < 2 || form.body.trim().length < 2) {
    return "Add a title and message before saving.";
  }
  if (form.audience !== "ALL_USERS" && !form.tenantId.trim()) {
    return "Choose an organization for this audience.";
  }
  if (form.audience === "BRANCH_USERS" && !form.branchId.trim()) {
    return "Choose a branch for this audience.";
  }
  if (form.audience === "ROLE_USERS" && form.roleNames.length === 0) {
    return "Choose at least one role.";
  }
  if (form.audience === "SELECTED_USERS" && form.userIds.length === 0) {
    return "Choose at least one person.";
  }
  if (form.ctaAction === "INTERNAL_ROUTE" && !form.ctaRoute.trim()) {
    return "Choose the in-app page for the action button.";
  }
  if (form.ctaAction === "EXTERNAL_URL" && form.ctaUrl.trim()) {
    try {
      const parsed = new URL(form.ctaUrl.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return "External button links must start with https://";
      }
    } catch {
      return "External button links must be a full https:// URL.";
    }
  }
  if (
    form.ctaLabel.trim() &&
    form.ctaAction === "EXTERNAL_URL" &&
    !form.ctaUrl.trim()
  ) {
    return "Add an external https link for the button, or switch to an in-app page.";
  }
  if (form.endsAt && form.startsAt) {
    const starts = new Date(form.startsAt).getTime();
    const ends = new Date(form.endsAt).getTime();
    if (!Number.isNaN(starts) && !Number.isNaN(ends) && ends <= starts) {
      return "End date must be after the start date.";
    }
  }
  return null;
}

function mergeCampaignIntoList(
  current: ControlCenterMarketingCampaignsResponse | null,
  saved: ControlCenterMarketingCampaign,
): ControlCenterMarketingCampaignsResponse {
  const routes =
    current?.internalRoutes ??
    FALLBACK_INTERNAL_ROUTES.map((route) => ({
      key: route.key,
      label: route.label,
    }));
  const existing = Array.isArray(current?.campaigns) ? current!.campaigns : [];
  const campaigns = [saved, ...existing.filter((row) => row.id !== saved.id)];
  return {
    internalRoutes: routes,
    campaigns,
    stats: {
      total: campaigns.length,
      active: campaigns.filter((row) => row.status === "ACTIVE").length,
      draft: campaigns.filter((row) => row.status === "DRAFT").length,
      paused: campaigns.filter((row) => row.status === "PAUSED").length,
      archived: campaigns.filter((row) => row.status === "ARCHIVED").length,
    },
  };
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
