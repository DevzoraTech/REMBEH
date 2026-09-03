"use client";

import { Mail } from "lucide-react";

export type PendingInviteRow = {
  id: string;
  name: string;
  email: string;
  roleName: string;
  branchName?: string | null;
  branchId?: string;
};

export function PendingInvitesPanel({
  items,
  busyId,
  onResend,
}: {
  items: PendingInviteRow[];
  busyId: string | null;
  onResend: (item: PendingInviteRow) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-[16px] border border-amber-200 bg-amber-50/90 shadow-[0_10px_24px_rgba(180,83,9,0.08)]">
      <div className="flex items-start gap-3 border-b border-amber-200/80 px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-amber-700">
          <Mail className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-amber-950">
            Waiting to accept · {items.length}
          </h2>
          <p className="mt-0.5 text-xs font-medium text-amber-800">
            Invited staff who have not joined yet. Resend if they missed the
            email.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-amber-200/70 bg-white/70">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#0b1224]">
                {item.name}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-slate-600">
                {item.roleName}
                {item.branchName ? ` · ${item.branchName}` : ""}
                {` · ${item.email}`}
              </p>
            </div>
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => onResend(item)}
              className="shrink-0 rounded-lg bg-[#07885f] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              {busyId === item.id ? "Sending..." : "Resend invite"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
