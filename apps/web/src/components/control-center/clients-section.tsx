"use client";

import {
  Building2,
  CircleDollarSign,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PaginationControls, paginateItems } from "../app/pagination";
import type {
  ControlCenterClient,
  ControlCenterClientsResponse,
} from "./types";
import {
  InlineSearch,
  Panel,
  SectionTitle,
  SelectControl,
  StatCard,
  StatusPill,
} from "./control-center-primitives";
import { ccDate, ccNumber } from "./formatters";

export function ControlCenterClientsSection({
  data,
  onOpenClient,
  onOpenPricing,
}: {
  data: ControlCenterClientsResponse | null;
  onOpenClient: (tenantId: string) => void;
  onOpenPricing: (tenantId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [pricingType, setPricingType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const stats = data?.stats;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.clients ?? []).filter((client) => {
      const matchesSearch =
        !needle ||
        [
          client.name,
          client.ownerName,
          client.email,
          client.phone,
          client.status,
        ].some((value) => (value ?? "").toLowerCase().includes(needle));
      const matchesPricing =
        pricingType === "ALL" || client.pricingType === pricingType;
      const matchesStatus = status === "ALL" || client.status === status;
      return matchesSearch && matchesPricing && matchesStatus;
    });
  }, [data?.clients, pricingType, query, status]);
  const pageRows = paginateItems(filtered, page, pageSize);

  return (
    <>
      <SectionTitle
        title="Clients"
        subtitle="Manage organizations, branches, subscription pricing, and performance."
        action={
          <button
            type="button"
            className="btn btn-primary h-10 normal-case"
            onClick={() => onOpenPricing(filtered[0]?.id ?? "")}
            disabled={!filtered.length}
          >
            <Plus className="size-4" />
            Pricing action
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          title="Total clients"
          value={ccNumber(stats?.totalClients)}
          subtitle="All registered organizations"
        />
        <StatCard
          icon={CircleDollarSign}
          title="Custom pricing"
          value={ccNumber(stats?.customPricing)}
          subtitle="Clients with custom pricing"
          tone="blue"
        />
        <StatCard
          icon={Building2}
          title="Default pricing"
          value={ccNumber(stats?.defaultPricing)}
          subtitle="Using standard pricing"
          tone="gold"
        />
        <StatCard
          icon={ShieldCheck}
          title="Active clients"
          value={ccNumber(stats?.activeClients)}
          subtitle="Currently active"
          tone="purple"
        />
      </div>

      <Panel className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#e2e8f0] p-4">
          <InlineSearch
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search by organization, owner or email..."
            className="max-w-lg"
          />
          <SelectControl
            value={pricingType}
            onChange={(value) => {
              setPricingType(value);
              setPage(1);
            }}
            ariaLabel="Pricing type"
            options={[
              { value: "ALL", label: "All pricing" },
              { value: "CUSTOM", label: "Custom pricing" },
              { value: "DEFAULT", label: "Default pricing" },
            ]}
          />
          <SelectControl
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            ariaLabel="Client status"
            options={[
              { value: "ALL", label: "All statuses" },
              { value: "ACTIVE", label: "Active" },
              { value: "SUSPENDED", label: "Suspended" },
              { value: "PENDING_VERIFICATION", label: "Pending verification" },
              { value: "ARCHIVED", label: "Archived" },
            ]}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1000px] w-full text-left">
            <thead className="bg-[#f2f6f8] text-xs font-black text-slate-600">
              <tr>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Owner / Contact</th>
                <th className="px-4 py-3">Branches</th>
                <th className="px-4 py-3">Users</th>
                <th className="px-4 py-3">Pricing</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date onboarded</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7] text-sm">
              {pageRows.items.map((client) => (
                <ClientRow
                  key={client.id}
                  client={client}
                  onOpenClient={onOpenClient}
                  onOpenPricing={onOpenPricing}
                />
              ))}
            </tbody>
          </table>
        </div>

        <PaginationControls
          page={pageRows.currentPage}
          pageSize={pageRows.pageSize}
          total={filtered.length}
          itemLabel="clients"
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

function ClientRow({
  client,
  onOpenClient,
  onOpenPricing,
}: {
  client: ControlCenterClient;
  onOpenClient: (tenantId: string) => void;
  onOpenPricing: (tenantId: string) => void;
}) {
  return (
    <tr>
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-[var(--forest-emerald)]">
            <Building2 className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-black">{client.name}</span>
            <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
              {client.email ?? client.phone ?? "No primary contact"}
            </span>
          </span>
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="font-bold">{client.ownerName ?? "-"}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {client.phone ?? client.email ?? "-"}
        </p>
      </td>
      <td className="px-4 py-4">
        <p className="font-black">{ccNumber(client.branchCount)}</p>
        <p className="text-xs font-semibold text-slate-500">
          {ccNumber(client.activeBranchCount)} active
        </p>
      </td>
      <td className="px-4 py-4 font-bold">{ccNumber(client.userCount)}</td>
      <td className="px-4 py-4">
        <StatusPill
          value={
            client.pricingType === "CUSTOM"
              ? "Custom pricing"
              : "Default pricing"
          }
          tone={client.pricingType === "CUSTOM" ? "green" : "blue"}
        />
      </td>
      <td className="px-4 py-4">
        <StatusPill value={client.status} />
      </td>
      <td className="px-4 py-4 font-semibold">{ccDate(client.createdAt)}</td>
      <td className="px-4 py-4">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenClient(client.id)}
            className="btn btn-ghost h-8 normal-case"
          >
            View details
          </button>
          <button
            type="button"
            onClick={() => onOpenPricing(client.id)}
            className="btn btn-primary h-8 normal-case"
          >
            Pricing
          </button>
        </div>
      </td>
    </tr>
  );
}
