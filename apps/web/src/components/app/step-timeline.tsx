"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type StepTone =
  | "green"
  | "teal"
  | "blue"
  | "violet"
  | "amber"
  | "red"
  | "slate";

export type StepTimelineItem = {
  id: string;
  title: string;
  detail: ReactNode;
  icon: ReactNode;
  tone?: StepTone;
  /** Category pill shown above the timestamp (e.g. Payment, Submission). */
  badge?: string;
  meta?: ReactNode;
  href?: string;
};

const TONE_CLASS: Record<StepTone, string> = {
  green: "bg-emerald-50 text-emerald-700",
  teal: "bg-teal-50 text-teal-700",
  blue: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-600",
  slate: "bg-slate-100 text-slate-600",
};

export function StepTimeline({
  items,
  empty,
  className = "",
}: {
  items: StepTimelineItem[];
  empty?: ReactNode;
  className?: string;
}) {
  if (items.length === 0) {
    return empty ? <>{empty}</> : null;
  }

  return (
    <ol className={`relative ${className}`}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const tone = item.tone ?? "green";
        const body = (
          <>
            <span
              className={`relative z-[1] mt-0.5 grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-3.5 ${TONE_CLASS[tone]}`}
            >
              {item.icon}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold leading-5 text-[#0b1220]">
                    {item.title}
                  </p>
                  <div className="mt-0.5 text-[12px] leading-4 text-slate-500">
                    {item.detail}
                  </div>
                </div>
                {item.badge || item.meta ? (
                  <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5 text-right">
                    {item.badge ? (
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${TONE_CLASS[tone]}`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                    {item.meta ? (
                      <div className="text-[11px] font-medium text-slate-400">
                        {item.meta}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        );

        return (
          <li
            key={item.id}
            className={`relative flex gap-3 pb-4 last:pb-0 ${
              !isLast ? "border-b border-[#edf1f5]" : ""
            }`}
          >
            {!isLast ? (
              <span
                aria-hidden
                className="absolute left-[15px] top-8 bottom-0 w-px bg-[#e4e9ee]"
              />
            ) : null}
            {item.href ? (
              <Link
                href={item.href}
                className="relative flex min-w-0 flex-1 gap-3 rounded-xl transition hover:bg-[#f7faf8]"
              >
                {body}
              </Link>
            ) : (
              <div className="relative flex min-w-0 flex-1 gap-3">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
