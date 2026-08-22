"use client";

import { ArrowLeft, Download, History, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ControlCenterClient, ControlCenterPricingHistory } from "./types";
import {
  EmptyState,
  Panel,
  SectionTitle,
  SelectControl,
  StatusPill,
} from "./control-center-primitives";
import { ccDate, ccDateTime, ccMoney } from "./formatters";

export function ControlCenterPricingHistorySection({
  client,
  history,
  loading,
  onBack,
}: {
  client: ControlCenterClient | null;
  history: ControlCenterPricingHistory | null;
  loading: boolean;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("ALL");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (history?.history ?? []).filter((row) => {
      const matchesScope = scope === "ALL" || row.scope === scope;
      const matchesSearch =
        !needle ||
        [
          row.reason,
          row.changedBy,
          row.planName,
          row.planCode,
          row.branch?.name,
        ].some((value) => (value ?? "").toLowerCase().includes(needle));
      return matchesScope && matchesSearch;
    });
  }, [history?.history, query, scope]);

  function exportCsv() {
    const header = [
      "Date",
      "Scope",
      "Branch",
      "Plan",
      "Old amount",
      "New amount",
      "Currency",
      "Effective from",
      "Effective until",
      "Changed by",
      "Reason",
    ];
    const lines = rows.map((row) =>
      [
        row.createdAt,
        row.scope,
        row.branch?.name ?? "",
        row.planName,
        row.oldAmount,
        row.newAmount,
        row.currency,
        row.effectiveFrom,
        row.effectiveUntil ?? "",
        row.changedBy,
        row.reason,
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${client?.name ?? "client"}-pricing-history.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 text-sm font-black text-[var(--midnight-navy)]"
      >
        <ArrowLeft className="size-4" />
        Back to pricing
      </button>

      <SectionTitle
        title="Pricing History"
        subtitle={
          client
            ? `View all pricing changes for ${client.name} and its branches.`
            : "View pricing changes."
        }
        action={
          <button
            type="button"
            onClick={exportCsv}
            disabled={!rows.length}
            className="btn btn-ghost h-10 normal-case"
          >
            <Download className="size-4" />
            Export
          </button>
        }
      />

      <Panel className="mb-5 p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-emerald-50 text-[var(--forest-emerald)]">
            <History className="size-5" />
          </span>
          <div>
            <p className="text-sm font-black">
              {client?.name ?? "Client organization"}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {rows.length} pricing records
            </p>
          </div>
          <div className="ml-auto">
            <StatusPill value={client?.status ?? "Active"} />
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b border-[#e2e8f0] p-4">
          <label className="flex h-10 min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-[#e2e8f0] bg-white px-3">
            <Search className="size-4 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by admin, plan or reason..."
              className="min-w-0 flex-1 text-sm font-semibold outline-none placeholder:text-slate-400"
            />
          </label>
          <SelectControl
            value={scope}
            onChange={setScope}
            ariaLabel="Scope"
            options={[
              { value: "ALL", label: "All scopes" },
              { value: "ORGANIZATION", label: "Organization" },
              { value: "BRANCH", label: "Branch override" },
            ]}
          />
        </div>

        {loading ? (
          <div className="p-5">
            <div className="h-56 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-left">
              <thead className="bg-[#f2f6f8] text-xs font-black text-slate-600">
                <tr>
                  <th className="px-4 py-3">Date & time</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Changed</th>
                  <th className="px-4 py-3">Effective</th>
                  <th className="px-4 py-3">Changed by</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7] text-sm">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-4 font-bold">
                      {ccDateTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill
                        value={
                          row.scope === "ORGANIZATION"
                            ? "Organization"
                            : "Branch override"
                        }
                        tone={row.scope === "ORGANIZATION" ? "green" : "blue"}
                      />
                      {row.branch ? (
                        <p className="mt-1 text-xs font-semibold text-blue-700">
                          {row.branch.name}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-black">{row.planName}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {row.interval.toLowerCase().replace(/_/g, " ")}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-black">
                      {ccMoney(row.oldAmount, row.currency)}
                      {" -> "}
                      <span className="text-[var(--forest-emerald)]">
                        {ccMoney(row.newAmount, row.currency)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-bold">{ccDate(row.effectiveFrom)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {row.effectiveUntil
                          ? `Until ${ccDate(row.effectiveUntil)}`
                          : "No expiry"}
                      </p>
                    </td>
                    <td className="px-4 py-4 font-bold">{row.changedBy}</td>
                    <td className="px-4 py-4 text-xs font-semibold leading-5 text-slate-600">
                      {row.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState title="No pricing changes match the current filters" />
          </div>
        )}
      </Panel>
    </>
  );
}
