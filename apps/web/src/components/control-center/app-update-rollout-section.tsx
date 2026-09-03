"use client";

import { Megaphone, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ControlCenterSession } from "../../lib/control-center-session";
import { controlCenterFetch } from "../../lib/control-center-api";
import { IconBadge, Panel, StatusPill } from "./control-center-primitives";

type RolloutAudience = "ALL" | "SELECTED";

type RolloutOrganisation = {
  id: string;
  name: string;
  status: string;
};

type AppRelease = {
  id: string;
  version: string;
  buildNumber: number;
  releaseEpoch: number;
  updateMode: string;
  forceUpdate: boolean;
  isActive: boolean;
  audience: RolloutAudience;
  message: string | null;
  downloadCount: number;
  tenants: RolloutOrganisation[];
};

export function ControlCenterAppUpdateRolloutSection({
  session,
}: {
  session: ControlCenterSession;
}) {
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [organisations, setOrganisations] = useState<RolloutOrganisation[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [audience, setAudience] = useState<RolloutAudience>("ALL");
  const [tenantIds, setTenantIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => releases.find((release) => release.id === selectedId) ?? null,
    [releases, selectedId],
  );

  const filteredOrganisations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return organisations;
    return organisations.filter((org) =>
      org.name.toLowerCase().includes(needle),
    );
  }, [organisations, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [releaseRows, orgRows] = await Promise.all([
        controlCenterFetch<AppRelease[]>("/app-releases?app=mobile", session),
        controlCenterFetch<RolloutOrganisation[]>(
          "/app-release-organisations",
          session,
        ),
      ]);
      setReleases(releaseRows);
      setOrganisations(orgRows);
      setSelectedId((current) => {
        if (current && releaseRows.some((row) => row.id === current)) {
          return current;
        }
        return releaseRows[0]?.id ?? null;
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load app rollouts.",
      );
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setAudience("ALL");
      setTenantIds([]);
      return;
    }
    setAudience(selected.audience);
    setTenantIds(selected.tenants.map((tenant) => tenant.id));
  }, [selected]);

  function toggleTenant(id: string) {
    setTenantIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function saveAudience() {
    if (!selected) return;
    if (audience === "SELECTED" && tenantIds.length === 0) {
      setError("Choose at least one organisation for a selected rollout.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await controlCenterFetch<AppRelease>(
        `/app-releases/${selected.id}`,
        session,
        {
          method: "PATCH",
          body: JSON.stringify({
            audience,
            tenantIds: audience === "SELECTED" ? tenantIds : [],
          }),
        },
      );
      setReleases((current) =>
        current.map((row) => (row.id === saved.id ? saved : row)),
      );
      setNotice(
        saved.audience === "ALL"
          ? `${saved.version} now rolls out to every organisation.`
          : `${saved.version} now rolls out to ${saved.tenants.length} organisation${saved.tenants.length === 1 ? "" : "s"}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the rollout.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function promoteToAll() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await controlCenterFetch<AppRelease>(
        `/app-releases/${selected.id}/promote`,
        session,
        { method: "POST" },
      );
      setReleases((current) =>
        current.map((row) => (row.id === saved.id ? saved : row)),
      );
      setNotice(`${saved.version} is now the full rollout for every organisation.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not promote this release.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function patchRelease(id: string, body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await controlCenterFetch<AppRelease>(
        `/app-releases/${id}`,
        session,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      setReleases((current) =>
        current.map((row) => (row.id === saved.id ? saved : row)),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update the release.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-8">
      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <Panel>
          <p className="px-5 py-8 text-sm text-slate-500">Loading rollouts…</p>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel>
            <div className="flex items-start justify-between gap-3 border-b border-[#edf1f4] px-5 py-4">
              <div className="flex items-start gap-3">
                <IconBadge icon={Megaphone} />
                <div>
                  <p className="text-sm font-semibold text-[#17233c]">
                    Release rollout
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Send a build to every organisation, or only to the ones you
                    are testing with.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#dfe5eb] bg-white px-3 text-xs font-semibold"
              >
                <RefreshCw className="size-3.5" />
                Refresh
              </button>
            </div>
            {releases.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">
                No mobile releases are registered yet.
              </p>
            ) : (
              <div className="divide-y divide-[#edf1f4]">
                {releases.map((release) => {
                  const active = release.id === selectedId;
                  return (
                    <button
                      key={release.id}
                      type="button"
                      onClick={() => setSelectedId(release.id)}
                      className={`flex w-full items-start justify-between gap-3 px-5 py-3.5 text-left ${
                        active ? "bg-[#f4faf6]" : "hover:bg-[#fbfcfd]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#17233c]">
                          {release.version}
                          <span className="ml-1.5 text-xs font-medium text-slate-500">
                            build {release.buildNumber}
                          </span>
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-slate-500">
                          {release.audience === "ALL"
                            ? "All organisations"
                            : release.tenants.length === 0
                              ? "No organisations selected"
                              : release.tenants
                                  .map((tenant) => tenant.name)
                                  .join(", ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                        <StatusPill
                          value={release.isActive ? "ACTIVE" : "OFF"}
                          tone={release.isActive ? "green" : "slate"}
                        />
                        {release.forceUpdate ? (
                          <StatusPill value="FORCE" tone="gold" />
                        ) : null}
                        <StatusPill
                          value={release.audience === "ALL" ? "ALL" : "PILOT"}
                          tone={release.audience === "ALL" ? "blue" : "gold"}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel>
            {!selected ? (
              <p className="px-5 py-8 text-sm text-slate-500">
                Select a release to choose who receives it.
              </p>
            ) : (
              <div>
                <div className="border-b border-[#edf1f4] px-5 py-4">
                  <p className="text-sm font-semibold text-[#17233c]">
                    {selected.version} audience
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Organisations not on this pilot stay on the latest
                    all-organisations release. The public website always
                    serves that all-organisations APK.
                  </p>
                </div>
                <div className="space-y-4 p-5">
                  <label className="flex items-start gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="radio"
                      name="audience"
                      checked={audience === "ALL"}
                      onChange={() => setAudience("ALL")}
                      className="mt-0.5"
                    />
                    <span>
                      All organisations
                      <span className="mt-0.5 block text-xs font-medium text-slate-500">
                        Full rollout. Every signed-in org gets this build if it
                        is the newest active release.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="radio"
                      name="audience"
                      checked={audience === "SELECTED"}
                      onChange={() => setAudience("SELECTED")}
                      className="mt-0.5"
                    />
                    <span>
                      Selected organisations only
                      <span className="mt-0.5 block text-xs font-medium text-slate-500">
                        Pilot this build. Everyone else stays on the current
                        all-organisations version.
                      </span>
                    </span>
                  </label>

                  {audience === "SELECTED" ? (
                    <div>
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search organisations"
                        className="h-10 w-full rounded-xl border border-[#dfe5eb] px-3 text-sm"
                      />
                      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-[#edf1f4] p-2">
                        {filteredOrganisations.length === 0 ? (
                          <p className="px-2 py-3 text-xs text-slate-500">
                            No organisations match.
                          </p>
                        ) : (
                          filteredOrganisations.map((org) => (
                            <label
                              key={org.id}
                              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[#f6f8f7]"
                            >
                              <input
                                type="checkbox"
                                checked={tenantIds.includes(org.id)}
                                onChange={() => toggleTenant(org.id)}
                              />
                              <span className="min-w-0 truncate font-medium text-[#17233c]">
                                {org.name}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                      <p className="mt-2 text-[11px] font-medium text-slate-500">
                        {tenantIds.length} selected
                      </p>
                    </div>
                  ) : null}

                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected.forceUpdate}
                      onChange={(event) =>
                        void patchRelease(selected.id, {
                          forceUpdate: event.target.checked,
                        })
                      }
                    />
                    Force this update for the audience above
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected.isActive}
                      onChange={(event) =>
                        void patchRelease(selected.id, {
                          isActive: event.target.checked,
                        })
                      }
                    />
                    Release is active
                  </label>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveAudience()}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003f35] px-4 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      <Save className="size-4" />
                      {saving ? "Saving…" : "Save audience"}
                    </button>
                    {selected.audience === "SELECTED" ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void promoteToAll()}
                        className="inline-flex h-10 items-center rounded-xl border border-[#dfe5eb] bg-white px-4 text-sm font-semibold disabled:opacity-60"
                      >
                        Promote to all
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
