"use client";

import { Building2, FileText, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import {
  OwnerPage,
  OwnerPanel,
  formatDate,
  useOwnerSession,
} from "../owner-common";

export default function OwnerSettingsPage() {
  const state = useOwnerSession("/owner/settings");
  const workspace = state.workspace;
  const user = state.user;

  return (
    <OwnerPage state={state} title="Owner Settings" eyebrow="Account">
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <OwnerPanel title="Account Profile">
          <div className="space-y-1 p-3">
            <SettingLine label="Account name" value={workspace?.name ?? "-"} />
            <SettingLine label="Country" value={workspace?.country ?? "-"} />
            <SettingLine label="Currency" value={workspace?.currency ?? "-"} />
            <SettingLine label="Status" value={workspace?.status ?? "-"} />
          </div>
        </OwnerPanel>

        <OwnerPanel title="Owner Profile">
          <div className="space-y-1 p-3">
            <SettingLine label="Name" value={user?.name ?? "-"} />
            <SettingLine label="Email" value={user?.email ?? "-"} />
            <SettingLine label="Phone" value={user?.phone ?? "-"} />
            <SettingLine
              label="Role"
              value={user?.roleName ?? "Account Owner"}
            />
          </div>
        </OwnerPanel>
      </div>

      <OwnerPanel title="Owner Tools">
        <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
          <OwnerTool
            href="/owner/branches"
            icon={<Building2 className="size-5" />}
            title="Branches"
            text="Create branches and assign managers."
          />
          <OwnerTool
            href="/owner/reports"
            icon={<ShieldCheck className="size-5" />}
            title="Reports"
            text="Review reports submitted by managers."
          />
          <OwnerTool
            href="/owner/portfolio"
            icon={<FileText className="size-5" />}
            title="Portfolio"
            text="Track loans across all branches."
          />
          <OwnerTool
            href="/owner/borrowers"
            icon={<UserRound className="size-5" />}
            title="Borrowers"
            text="View the account borrower register."
          />
        </div>
      </OwnerPanel>

      <OwnerPanel title="Account Notes">
        <div className="p-3 text-sm text-slate-600">
          <p>
            Owners approve submitted branch reports and monitor account-wide
            performance. Daily cash opening, float assignment, expenses,
            returns, and branch closing are handled by branch managers.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Last viewed {formatDate(new Date().toISOString())}
          </p>
        </div>
      </OwnerPanel>
    </OwnerPage>
  );
}

function SettingLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] border-b border-[var(--line)] px-1 py-2 text-sm last:border-b-0">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="font-bold text-[var(--midnight-navy)]">{value}</span>
    </div>
  );
}

function OwnerTool({
  href,
  icon,
  title,
  text,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="border border-[var(--line)] bg-[var(--soft-ivory)] p-3 hover:border-[var(--forest-emerald)]"
    >
      <span className="grid size-10 place-items-center bg-emerald-50 text-[var(--forest-emerald)]">
        {icon}
      </span>
      <p className="mt-3 text-sm font-bold text-[var(--midnight-navy)]">
        {title}
      </p>
      <p className="mt-1 text-xs text-slate-500">{text}</p>
    </Link>
  );
}
