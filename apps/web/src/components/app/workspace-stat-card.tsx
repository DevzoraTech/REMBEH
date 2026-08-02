import type { ReactNode } from "react";

export type WorkspaceStatTone = "green" | "blue" | "violet" | "gold";

const TONE_CLASS: Record<WorkspaceStatTone, string> = {
  green: "bg-[#e9f8ef] text-[#07885f]",
  blue: "bg-[#eaf4ff] text-[#2078dc]",
  violet: "bg-[#f2eaff] text-[#8b4ee8]",
  gold: "bg-[#fff3df] text-[#f28a17]",
};

export function WorkspaceStatCard({
  icon,
  label,
  value,
  hint,
  tone,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: WorkspaceStatTone;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <article className="flex h-full min-h-[88px] items-center gap-2.5 rounded-[13px] border border-[#e6ebf0] bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${TONE_CLASS[tone]}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-500">
            {label}
          </p>
          <p className="mt-1 break-words text-[clamp(0.72rem,0.9vw,1rem)] font-bold leading-tight tabular-nums text-[#0b1220]">
            {value}
          </p>
          {hint ? (
            <p className="mt-1 truncate text-[11px] font-medium text-slate-500">
              {hint}
            </p>
          ) : null}
        </div>
      </article>
    </div>
  );
}

export function WorkspaceStatSkeleton() {
  return (
    <div className="min-h-[88px] rounded-[13px] border border-[#e6ebf0] bg-white p-3 shadow-[0_8px_18px_rgba(15,23,42,0.045)]">
      <div className="flex items-center gap-2.5">
        <div className="size-10 shrink-0 animate-pulse rounded-xl bg-slate-100" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
          <div className="h-5 w-16 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
