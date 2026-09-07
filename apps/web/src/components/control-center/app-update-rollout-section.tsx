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
  const [keepLatest, setKeepLatest] = useState(3);
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

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
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
      return releaseRows;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load app rollouts.",
      );
      return [] as AppRelease[];
    } finally {
      if (!opts?.soft) setLoading(false);
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

  const offeringCount = useMemo(
    () => releases.filter((release) => release.isActive).length,
    [releases],
  );

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
    const keep = Math.min(20, Math.max(1, Math.floor(keepLatest) || 3));
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const beforeActiveIds = new Set(
        releases.filter((row) => row.isActive).map((row) => row.id),
      );
      await controlCenterFetch<AppRelease>(
        `/app-releases/${selected.id}/send`,
        session,
        {
          method: "POST",
          body: JSON.stringify({
            audience,
            tenantIds: audience === "SELECTED" ? tenantIds : [],
            forceUpdate: required,
            keepLatest: keep,
          }),
        },
      );
      const afterRows = await load({ soft: true });
      const saved =
        afterRows.find((row) => row.id === selected.id) ??
        afterRows[0] ??
        null;
      if (!saved) {
        setNotice("Send completed. Refresh if the list looks stale.");
        return;
      }
      const stillOffered = afterRows.filter((row) => row.isActive);
      const heldOlder = [...beforeActiveIds].filter(
        (id) =>
          id !== saved.id && !stillOffered.some((row) => row.id === id),
      ).length;
      let message =
        saved.audience === "ALL"
          ? `${saved.version} is now live for every organisation.`
          : `${saved.version} is now live for ${saved.tenants.length} organisation${saved.tenants.length === 1 ? "" : "s"}.`;
      if (saved.forceUpdate) {
        message +=
          " Required — phones must install and cannot skip.";
      } else {
        message +=
          " Optional — phones see a skippable modal on every open until they install.";
      }
      if (!saved.isActive) {
        message = `${saved.version} was sent, but it is older than the latest ${keep} offered builds, so it was held. Pause newer offers or raise “Keep latest”.`;
      } else if (heldOlder > 0) {
        message += ` Held ${heldOlder} older offer${heldOlder === 1 ? "" : "s"} to keep the latest ${keep}.`;
      } else {
        message += ` ${stillOffered.length} build${stillOffered.length === 1 ? "" : "s"} currently offered (cap ${keep}).`;
      }
      const higherAll = stillOffered.find(
        (row) =>
          row.id !== saved.id &&
          row.audience === "ALL" &&
          (row.releaseEpoch > saved.releaseEpoch ||
            (row.releaseEpoch === saved.releaseEpoch &&
              row.buildNumber > saved.buildNumber)),
      );
      const olderAll = stillOffered.find(
        (row) =>
          row.id !== saved.id &&
          row.audience === "ALL" &&
          (row.releaseEpoch < saved.releaseEpoch ||
            (row.releaseEpoch === saved.releaseEpoch &&
              row.buildNumber < saved.buildNumber)),
      );
      if (saved.isActive && saved.audience === "SELECTED" && higherAll) {
        message += ` Note: ${higherAll.version} (${higherAll.buildNumber}) is still offered to everyone and will win for those organisations until you stop it.`;
      } else if (saved.isActive && saved.audience === "SELECTED" && olderAll) {
        message += ` ${olderAll.version} remains for everyone else. Chosen orgs get ${saved.version} while signed in.`;
      }
      setNotice(message);
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
        `${saved.version} is held. Phones stop being offered this build (they keep whatever they already installed).`,
      );
      void load();
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
                  {offeringCount} offering now. Send keeps the latest{" "}
                  {keepLatest} active by default.
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
                          {release.isActive
                            ? release.forceUpdate
                              ? " · required"
                              : " · optional"
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
                      ? `Currently offering to ${offeringLabel(selected).toLowerCase()}. Signed-in phones are notified live.`
                      : "This build is registered but held. Phones will not see it until you Send."}
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
                        {tenantIds.length} selected. Only signed-in phones in
                        those organisations are offered this build (live while
                        the app is open, or within about a minute).
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] font-medium leading-4 text-slate-500">
                      Every organisation is offered this build. The public
                      website download follows the newest Everyone release.
                      Signed-in phones update live.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#dfe5eb] bg-[#f8faf9] p-1">
                    <button
                      type="button"
                      onClick={() => setRequired(true)}
                      className={`h-8 rounded-md text-xs font-semibold ${
                        required
                          ? "bg-white text-[#17233c] shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      Required
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequired(false)}
                      className={`h-8 rounded-md text-xs font-semibold ${
                        !required
                          ? "bg-white text-[#17233c] shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      Optional — can skip
                    </button>
                  </div>
                  <p className="text-[11px] font-medium leading-4 text-slate-500">
                    {required
                      ? "Phones must install before continuing. Skip is hidden."
                      : "Phones see the update modal on every open and can tap Skip for now. It comes back next time they open REMBEH until they install."}
                  </p>

                  <label className="block text-sm font-semibold text-slate-700">
                    Keep latest offered builds
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={keepLatest}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setKeepLatest(
                            Number.isFinite(next)
                              ? Math.min(20, Math.max(1, Math.floor(next)))
                              : 3,
                          );
                        }}
                        className="h-9 w-20 rounded-lg border border-[#dfe5eb] px-3 text-sm"
                      />
                      <span className="text-[11px] font-medium text-slate-500">
                        Default 3. Older phones on those builds also get the
                        modal for the newest offer.
                      </span>
                    </div>
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
