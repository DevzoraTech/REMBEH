"use client";

import { Filter, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  loanMatchesDateIssued,
  type DateIssuedPreset,
} from "../loans/loans-filters";

export type ReportStatusFilterValue =
  | "all"
  | "MANAGER_REVIEW"
  | "SENT_TO_OWNER"
  | "OWNER_APPROVED"
  | "RETURNED_TO_MANAGER";

export type ReportsAdvancedFilters = {
  branchId: string | null;
  branchLabel: string | null;
  status: ReportStatusFilterValue;
  datePreset: DateIssuedPreset;
  customFrom: string;
  customTo: string;
};

export const EMPTY_REPORTS_FILTERS: ReportsAdvancedFilters = {
  branchId: null,
  branchLabel: null,
  status: "all",
  datePreset: "all",
  customFrom: "",
  customTo: "",
};

export type ReportBranchOption = {
  id: string;
  name: string;
};

const DATE_OPTIONS: Array<{ value: DateIssuedPreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "custom", label: "Custom Range" },
];

const MANAGER_STATUS_OPTIONS: Array<{
  value: ReportStatusFilterValue;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "MANAGER_REVIEW", label: "Ready to send" },
  { value: "SENT_TO_OWNER", label: "Awaiting Approval" },
  { value: "OWNER_APPROVED", label: "Approved" },
  { value: "RETURNED_TO_MANAGER", label: "Returned" },
];

const OWNER_STATUS_OPTIONS: Array<{
  value: ReportStatusFilterValue;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "SENT_TO_OWNER", label: "Awaiting Approval" },
  { value: "OWNER_APPROVED", label: "Approved" },
  { value: "RETURNED_TO_MANAGER", label: "Returned" },
];

export function reportStatusOptions(mode: "owner" | "manager") {
  return mode === "manager" ? MANAGER_STATUS_OPTIONS : OWNER_STATUS_OPTIONS;
}

export function reportStatusLabel(status: string) {
  if (status === "MANAGER_REVIEW") return "Ready to send";
  if (status === "SENT_TO_OWNER") return "Awaiting Approval";
  if (status === "OWNER_APPROVED") return "Approved";
  if (status === "RETURNED_TO_MANAGER") return "Returned";
  return status.replaceAll("_", " ");
}

export function activeReportFilterChips(
  filters: ReportsAdvancedFilters,
  _mode: "owner" | "manager",
) {
  const chips: Array<{ key: string; label: string }> = [];
  if (filters.status !== "all") {
    chips.push({
      key: "status",
      label: reportStatusLabel(filters.status),
    });
  }
  if (filters.datePreset !== "all") {
    if (filters.datePreset === "custom") {
      const from = filters.customFrom || "…";
      const to = filters.customTo || "…";
      chips.push({ key: "date", label: `${from} – ${to}` });
    } else {
      const label =
        DATE_OPTIONS.find((option) => option.value === filters.datePreset)
          ?.label ?? filters.datePreset;
      chips.push({ key: "date", label });
    }
  }
  return chips;
}

export function clearReportFilterChip(
  filters: ReportsAdvancedFilters,
  key: string,
): ReportsAdvancedFilters {
  if (key === "branch") {
    return { ...filters, branchId: null, branchLabel: null };
  }
  if (key === "status") {
    return { ...filters, status: "all" };
  }
  if (key === "date") {
    return {
      ...filters,
      datePreset: "all",
      customFrom: "",
      customTo: "",
    };
  }
  return filters;
}

export function reportMatchesDate(
  operationDate: string,
  filters: ReportsAdvancedFilters,
  now = new Date(),
) {
  const issued = new Date(`${operationDate.slice(0, 10)}T12:00:00`);
  return loanMatchesDateIssued(
    issued,
    {
      officerKey: null,
      officerLabel: null,
      dateIssued: filters.datePreset,
      customFrom: filters.customFrom,
      customTo: filters.customTo,
      repayment: "all",
      principalMin: "",
      principalMax: "",
    },
    now,
  );
}

/** Display code: DR + DDMMYY from operation date (one report per day). */
export function dailyReportCode(operationDate: string) {
  const raw = operationDate.slice(0, 10);
  const [year, month, day] = raw.split("-");
  if (!year || !month || !day || year.length < 4) return raw;
  return `DR${day}${month}${year.slice(2)}`;
}

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
        active
          ? "border-[var(--forest-emerald)] bg-[#e9f8ef] text-[var(--forest-emerald)]"
          : "border-[#e6ebf0] bg-white text-[#334155] hover:bg-[#f8faf9]"
      }`}
    >
      {label}
    </button>
  );
}

export function ReportsFiltersControl({
  mode,
  applied,
  onApply,
}: {
  mode: "owner" | "manager";
  branches: ReportBranchOption[];
  applied: ReportsAdvancedFilters;
  onApply: (next: ReportsAdvancedFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const statusOptions = reportStatusOptions(mode);
  const chips = activeReportFilterChips(applied, mode);

  useEffect(() => {
    if (open) setDraft(applied);
  }, [applied, open]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle({});
      return;
    }

    function placePanel() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(380, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.left),
        Math.max(12, window.innerWidth - width - 12),
      );
      const gap = 10;
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const minComfortable = 420;

      if (spaceBelow < minComfortable && spaceAbove < minComfortable) {
        const maxHeight = Math.min(window.innerHeight - 32, 560);
        setPanelStyle({
          position: "fixed",
          top: "50%",
          left: "50%",
          bottom: "auto",
          width,
          maxHeight,
          overflowY: "auto",
          transform: "translate(-50%, -50%)",
          zIndex: 80,
        });
        return;
      }

      const openUpward = spaceBelow < minComfortable && spaceAbove > spaceBelow;
      const maxHeight = Math.max(320, openUpward ? spaceAbove : spaceBelow);

      if (openUpward) {
        setPanelStyle({
          position: "fixed",
          top: "auto",
          bottom: window.innerHeight - rect.top + gap,
          left,
          width,
          maxHeight,
          overflowY: "auto",
          transform: "none",
          zIndex: 80,
        });
      } else {
        setPanelStyle({
          position: "fixed",
          top: rect.bottom + gap,
          bottom: "auto",
          left,
          width,
          maxHeight,
          overflowY: "auto",
          transform: "none",
          zIndex: 80,
        });
      }
    }

    placePanel();
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", placePanel, true);
    return () => {
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("scroll", placePanel, true);
    };
  }, [open]);

  return (
    <div className="relative flex min-w-0 flex-wrap items-center gap-2">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold shadow-[0_8px_18px_rgba(15,23,42,0.035)] ${
          chips.length > 0
            ? "border-emerald-200 bg-emerald-50 text-[var(--forest-emerald)]"
            : "border-[#e6ebf0] bg-white text-[#111a2e]"
        }`}
      >
        <Filter className="size-3.5" />
        Filters
        {chips.length > 0 ? (
          <span className="grid min-w-4 place-items-center rounded-full bg-[var(--forest-emerald)] px-1 text-[10px] font-bold text-white">
            {chips.length}
          </span>
        ) : null}
      </button>

      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg bg-[#e8eefc] px-2.5 py-1.5 text-[11px] font-semibold text-[#3b5bdb]"
        >
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            className="grid size-4 shrink-0 place-items-center rounded-full text-[#3b5bdb]/opacity-70 hover:opacity-100"
            aria-label={`Remove ${chip.label}`}
            onClick={() => onApply(clearReportFilterChip(applied, chip.key))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      {open && typeof document !== "undefined" && panelStyle.width
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[70] cursor-default bg-[rgba(15,23,42,0.22)]"
                aria-label="Close filters"
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-label="Report filters"
                className="rounded-2xl border border-[#e6ebf0] bg-white p-4 shadow-[0_22px_50px_rgba(15,23,42,0.22)]"
                style={panelStyle}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <section className="space-y-2">
                  <h4 className="text-[12px] font-bold text-[#0b1220]">
                    Status
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {statusOptions.map((option) => (
                      <FilterPill
                        key={option.value}
                        active={draft.status === option.value}
                        label={option.label}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            status:
                              current.status === option.value
                                ? "all"
                                : option.value,
                          }))
                        }
                      />
                    ))}
                  </div>
                </section>

                <section className="mt-4 space-y-2">
                  <h4 className="text-[12px] font-bold text-[#0b1220]">
                    Report date
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {DATE_OPTIONS.map((option) => (
                      <FilterPill
                        key={option.value}
                        active={draft.datePreset === option.value}
                        label={option.label}
                        onClick={() =>
                          setDraft((current) => {
                            const nextDate =
                              current.datePreset === option.value
                                ? "all"
                                : option.value;
                            const clearCustom =
                              nextDate === "all" || nextDate !== "custom";
                            return {
                              ...current,
                              datePreset: nextDate,
                              customFrom: clearCustom ? "" : current.customFrom,
                              customTo: clearCustom ? "" : current.customTo,
                            };
                          })
                        }
                      />
                    ))}
                  </div>
                  {draft.datePreset === "custom" ? (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <label className="space-y-1">
                        <span className="text-[10px] font-semibold text-slate-500">
                          From
                        </span>
                        <input
                          type="date"
                          value={draft.customFrom}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              customFrom: event.target.value,
                            }))
                          }
                          className="h-9 w-full rounded-xl border border-[#e6ebf0] px-2.5 text-xs font-semibold outline-none"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] font-semibold text-slate-500">
                          To
                        </span>
                        <input
                          type="date"
                          value={draft.customTo}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              customTo: event.target.value,
                            }))
                          }
                          className="h-9 w-full rounded-xl border border-[#e6ebf0] px-2.5 text-xs font-semibold outline-none"
                        />
                      </label>
                    </div>
                  ) : null}
                </section>

                <div className="sticky bottom-0 mt-5 grid grid-cols-2 gap-2 bg-white pt-1">
                  <button
                    type="button"
                    className="h-10 rounded-xl border border-[#e6ebf0] bg-white text-xs font-semibold text-[#0b1220]"
                    onClick={() => {
                      onApply(EMPTY_REPORTS_FILTERS);
                      setOpen(false);
                    }}
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-xl bg-[var(--forest-emerald)] text-xs font-semibold text-white"
                    onClick={() => {
                      onApply(draft);
                      setOpen(false);
                    }}
                  >
                    Apply filters
                  </button>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
