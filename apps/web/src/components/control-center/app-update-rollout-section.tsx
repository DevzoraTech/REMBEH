"use client";

import { Pause, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ControlCenterSession } from "../../lib/control-center-session";
import { controlCenterFetch } from "../../lib/control-center-api";
import { Panel, StatusPill } from "./control-center-primitives";

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

function offeringLabel(release: AppRelease) {
  if (!release.isActive) return "Not offering";
  if (release.audience === "ALL") return "Everyone";
  if (release.tenants.length === 0) return "No organisations";
  if (release.tenants.length === 1) return release.tenants[0]?.name ?? "1 org";
  return `${release.tenants.length} organisations`;
}

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
  const [required, setRequired] = useState(true);
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
      setRequired(true);
      return;
    }
    setAudience(selected.audience);
    setTenantIds(selected.tenants.map((tenant) => tenant.id));
    setRequired(selected.forceUpdate);
  }, [selected]);

  function toggleTenant(id: string) {
    setTenantIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function remember(saved: AppRelease, message: string) {
    setReleases((current) =>
      current.map((row) => (row.id === saved.id ? saved : row)),
    );
    setNotice(message);
  }

  async function sendUpdate() {
    if (!selected) return;
    if (audience === "SELECTED" && tenantIds.length === 0) {
      setError("Choose at least one organisation before sending.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await controlCenterFetch<AppRelease>(
        `/app-releases/${selected.id}/send`,
        session,
        {
          method: "POST",
          body: JSON.stringify({
            audience,
            tenantIds: audience === "SELECTED" ? tenantIds : [],
            forceUpdate: required,
          }),
        },
      );
      remember(
        saved,
        saved.audience === "ALL"
          ? `${saved.version} is now offered to every organisation. Phones will be asked the next time they open REMBEH.`
          : `${saved.version} is now offered to ${saved.tenants.length} organisation${saved.tenants.length === 1 ? "" : "s"}. Signed-in phones in those organisations will be asked the next time they open REMBEH.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not send this update.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function stopOffering() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await controlCenterFetch<AppRelease>(
        `/app-releases/${selected.id}/pause`,
        session,
        { method: "POST" },
      );
      remember(
        saved,
        `${saved.version} is no longer offered. Phones stay on the latest all-organisations release.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not stop this update.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-5">
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <Panel>
          <p className="px-4 py-6 text-sm text-slate-500">Loading releases…</p>
        </Panel>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <Panel>
            <div className="flex items-center justify-between gap-3 border-b border-[#edf1f4] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#17233c]">Builds</p>
                <p className="text-[11px] font-medium text-slate-500">
                  Select a build, then send it from the panel on the right.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dfe5eb] bg-white px-2.5 text-xs font-semibold"
              >
                <RefreshCw className="size-3.5" />
                Refresh
              </button>
            </div>
            {releases.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                No mobile releases are registered yet.
              </p>
            ) : (
              <div className="max-h-[28rem] divide-y divide-[#edf1f4] overflow-y-auto">
                {releases.map((release) => {
                  const active = release.id === selectedId;
                  return (
                    <button
                      key={release.id}
                      type="button"
                      onClick={() => setSelectedId(release.id)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left ${
                        active ? "bg-[#f4faf6]" : "hover:bg-[#fbfcfd]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#17233c]">
                          {release.version}
                          <span className="ml-1.5 text-[11px] font-medium text-slate-500">
                            {release.buildNumber}
                          </span>
                        </p>
                        <p className="truncate text-[11px] font-medium text-slate-500">
                          {offeringLabel(release)}
                          {release.forceUpdate && release.isActive
                            ? " · required"
                            : ""}
                        </p>
                      </div>
                      <StatusPill
                        value={release.isActive ? "OFFERING" : "HELD"}
                        tone={release.isActive ? "green" : "slate"}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel>
            {!selected ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                Select a build to send it.
              </p>
            ) : (
              <div>
                <div className="border-b border-[#edf1f4] px-4 py-3">
                  <p className="text-sm font-semibold text-[#17233c]">
                    Send {selected.version}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    {selected.isActive
                      ? `Currently offering to ${offeringLabel(selected).toLowerCase()}.`
                      : "This build is in S3. Phones are not asked until you send it."}
                  </p>
                </div>
                <div className="space-y-3 p-4">
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#dfe5eb] bg-[#f8faf9] p-1">
                    <button
                      type="button"
                      onClick={() => setAudience("ALL")}
                      className={`h-8 rounded-md text-xs font-semibold ${
                        audience === "ALL"
                          ? "bg-white text-[#17233c] shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      Everyone
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudience("SELECTED")}
                      className={`h-8 rounded-md text-xs font-semibold ${
                        audience === "SELECTED"
                          ? "bg-white text-[#17233c] shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      Chosen organisations
                    </button>
                  </div>

                  {audience === "SELECTED" ? (
                    <div>
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search organisations"
                        className="h-9 w-full rounded-lg border border-[#dfe5eb] px-3 text-sm"
                      />
                      <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-[#edf1f4] p-1.5">
                        {filteredOrganisations.length === 0 ? (
                          <p className="px-2 py-2 text-xs text-slate-500">
                            No organisations match.
                          </p>
                        ) : (
                          filteredOrganisations.map((org) => (
                            <label
                              key={org.id}
                              className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-[#f6f8f7]"
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
                      <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                        {tenantIds.length} selected. Those organisations are
                        asked the next time a signed-in phone opens REMBEH.
                        If the app is already open, log out and log in, or
                        fully close it and open it again.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] font-medium leading-4 text-slate-500">
                      Every organisation is asked the next time the app opens.
                      The public website also switches to this APK.
                    </p>
                  )}

                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={required}
                      onChange={(event) => setRequired(event.target.checked)}
                    />
                    Required — cannot skip
                  </label>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void sendUpdate()}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#003f35] px-3.5 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      <Send className="size-3.5" />
                      {saving ? "Sending…" : "Send update"}
                    </button>
                    {selected.isActive ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void stopOffering()}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dfe5eb] bg-white px-3.5 text-sm font-semibold disabled:opacity-60"
                      >
                        <Pause className="size-3.5" />
                        Stop offering
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
