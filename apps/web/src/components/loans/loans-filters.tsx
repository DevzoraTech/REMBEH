"use client";

import { ChevronDown, Filter, Search, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

export type DateIssuedPreset =
  | "all"
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "custom";

export type RepaymentPosition = "all" | "2-3" | "4-7" | "8+";

export type LoansAdvancedFilters = {
  officerKey: string | null;
  officerLabel: string | null;
  dateIssued: DateIssuedPreset;
  customFrom: string;
  customTo: string;
  repayment: RepaymentPosition;
  principalMin: string;
  principalMax: string;
};

export const EMPTY_LOANS_FILTERS: LoansAdvancedFilters = {
  officerKey: null,
  officerLabel: null,
  dateIssued: "all",
  customFrom: "",
  customTo: "",
  repayment: "all",
  principalMin: "",
  principalMax: "",
};

export type OfficerOption = {
  key: string;
  label: string;
};

const DATE_OPTIONS: Array<{ value: DateIssuedPreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom range" },
];

const REPAYMENT_OPTIONS: Array<{ value: RepaymentPosition; label: string }> = [
  { value: "all", label: "All" },
  { value: "2-3", label: "Overdue by 2–3 days" },
  { value: "4-7", label: "Overdue by 4–7 days" },
  { value: "8+", label: "Overdue by 8+ days" },
];

export function loansFiltersFromSearchParams(
  params: URLSearchParams,
): Partial<LoansAdvancedFilters> {
  const repayment = params.get("repayment");
  if (repayment === "2-3" || repayment === "4-7" || repayment === "8+") {
    return { repayment };
  }
  return {};
}

export function activeLoanFilterChips(filters: LoansAdvancedFilters) {
  const chips: Array<{ key: string; label: string }> = [];
  if (filters.officerLabel) {
    chips.push({ key: "officer", label: filters.officerLabel });
  }
  if (filters.dateIssued !== "all") {
    if (filters.dateIssued === "custom") {
      const from = filters.customFrom || "…";
      const to = filters.customTo || "…";
      chips.push({ key: "date", label: `${from} – ${to}` });
    } else {
      const label =
        DATE_OPTIONS.find((option) => option.value === filters.dateIssued)
          ?.label ?? filters.dateIssued;
      chips.push({ key: "date", label });
    }
  }
  if (filters.repayment !== "all") {
    const label =
      REPAYMENT_OPTIONS.find((option) => option.value === filters.repayment)
        ?.label ?? filters.repayment;
    chips.push({ key: "repayment", label });
  }
  const min = filters.principalMin.trim();
  const max = filters.principalMax.trim();
  if (min || max) {
    const minLabel = min ? Number(min).toLocaleString("en-UG") : "0";
    const maxLabel = max ? Number(max).toLocaleString("en-UG") : "∞";
    chips.push({
      key: "principal",
      label: `UGX ${minLabel} – ${maxLabel}`,
    });
  }
  return chips;
}

export function clearLoanFilterChip(
  filters: LoansAdvancedFilters,
  key: string,
): LoansAdvancedFilters {
  if (key === "officer") {
    return { ...filters, officerKey: null, officerLabel: null };
  }
  if (key === "date") {
    return { ...filters, dateIssued: "all", customFrom: "", customTo: "" };
  }
  if (key === "repayment") {
    return { ...filters, repayment: "all" };
  }
  if (key === "principal") {
    return { ...filters, principalMin: "", principalMax: "" };
  }
  return filters;
}

/** Resolve typed agent text to a known officer before apply. */
export function resolveOfficerFilter(
  draft: LoansAdvancedFilters,
  officerQuery: string,
  officers: OfficerOption[],
): LoansAdvancedFilters {
  if (draft.officerKey) {
    const selected = officers.find((officer) => officer.key === draft.officerKey);
    if (selected) {
      return {
        ...draft,
        officerKey: selected.key,
        officerLabel: selected.label,
      };
    }
  }

  const q = officerQuery.trim().toLowerCase();
  if (!q) {
    return { ...draft, officerKey: null, officerLabel: null };
  }

  const exact = officers.find((officer) => officer.label.toLowerCase() === q);
  if (exact) {
    return { ...draft, officerKey: exact.key, officerLabel: exact.label };
  }

  const partial = officers.filter((officer) =>
    officer.label.toLowerCase().includes(q),
  );
  if (partial.length === 1) {
    return {
      ...draft,
      officerKey: partial[0].key,
      officerLabel: partial[0].label,
    };
  }

  // Keep free-text label match so filtering still works by name.
  return {
    ...draft,
    officerKey: `name:${q}`,
    officerLabel: officerQuery.trim(),
  };
}

export function normalizePrincipalFilters(
  filters: LoansAdvancedFilters,
): LoansAdvancedFilters {
  const minRaw = filters.principalMin.trim();
  const maxRaw = filters.principalMax.trim();
  if (!minRaw || !maxRaw) {
    return {
      ...filters,
      principalMin: minRaw,
      principalMax: maxRaw,
    };
  }
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= max) {
    return {
      ...filters,
      principalMin: minRaw,
      principalMax: maxRaw,
    };
  }
  return {
    ...filters,
    principalMin: maxRaw,
    principalMax: minRaw,
  };
}

export function LoansFiltersControl({
  officers,
  applied,
  onApply,
}: {
  officers: OfficerOption[];
  applied: LoansAdvancedFilters;
  onApply: (next: LoansAdvancedFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);
  const [officerQuery, setOfficerQuery] = useState("");
  const [officerMenuOpen, setOfficerMenuOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const officerBoxRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(applied);
      setOfficerQuery(applied.officerLabel ?? "");
      setOfficerMenuOpen(false);
    }
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

      // Prefer anchoring to the Filters button; if neither side has room,
      // center in the viewport so the full panel stays on-screen.
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
      const maxHeight = Math.max(
        320,
        openUpward ? spaceAbove : spaceBelow,
      );

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

  useEffect(() => {
    if (!officerMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!officerBoxRef.current?.contains(event.target as Node)) {
        setOfficerMenuOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [officerMenuOpen]);

  const chips = activeLoanFilterChips(applied);
  const filteredOfficers = useMemo(() => {
    const q = officerQuery.trim().toLowerCase();
    if (!q) return officers.slice(0, 8);
    return officers
      .filter((officer) => officer.label.toLowerCase().includes(q))
      .slice(0, 12);
  }, [officerQuery, officers]);

  function applyDraft(nextDraft: LoansAdvancedFilters = draft) {
    const withOfficer = resolveOfficerFilter(nextDraft, officerQuery, officers);
    onApply(normalizePrincipalFilters(withOfficer));
    setOpen(false);
  }

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
            onClick={() => onApply(clearLoanFilterChip(applied, chip.key))}
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
                aria-label="Loan filters"
                className="rounded-2xl border border-[#e6ebf0] bg-white p-4 shadow-[0_22px_50px_rgba(15,23,42,0.22)]"
                style={panelStyle}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <section className="space-y-2">
              <h4 className="text-[12px] font-bold text-[#0b1220]">
                Issued by agent
              </h4>
              <div className="relative" ref={officerBoxRef}>
                <label className="flex h-10 items-center gap-2 rounded-xl border border-[#e6ebf0] px-3">
                  <Search className="size-3.5 shrink-0 text-slate-400" />
                  <input
                    value={officerQuery}
                    onChange={(event) => {
                      setOfficerQuery(event.target.value);
                      setOfficerMenuOpen(true);
                      if (!event.target.value.trim()) {
                        setDraft((current) => ({
                          ...current,
                          officerKey: null,
                          officerLabel: null,
                        }));
                      }
                    }}
                    onFocus={() => setOfficerMenuOpen(true)}
                    placeholder="Search agent"
                    className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[#0b1220] outline-none placeholder:font-medium placeholder:text-slate-400"
                  />
                  {draft.officerKey || officerQuery ? (
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-600"
                      aria-label="Clear agent"
                      onClick={() => {
                        setOfficerQuery("");
                        setDraft((current) => ({
                          ...current,
                          officerKey: null,
                          officerLabel: null,
                        }));
                      }}
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                  <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
                </label>
                {officerMenuOpen ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 max-h-44 overflow-y-auto rounded-xl border border-[#e6ebf0] bg-white py-1 shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
                    {filteredOfficers.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] text-slate-500">
                        No agents found.
                      </p>
                    ) : (
                      filteredOfficers.map((officer) => (
                        <button
                          key={officer.key}
                          type="button"
                          className={`flex w-full px-3 py-2 text-left text-xs font-semibold hover:bg-[#f8faf9] ${
                            draft.officerKey === officer.key
                              ? "bg-emerald-50 text-[var(--forest-emerald)]"
                              : "text-[#0b1220]"
                          }`}
                          onClick={() => {
                            setDraft((current) => ({
                              ...current,
                              officerKey: officer.key,
                              officerLabel: officer.label,
                            }));
                            setOfficerQuery(officer.label);
                            setOfficerMenuOpen(false);
                          }}
                        >
                          {officer.label}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="mt-4 space-y-2">
              <h4 className="text-[12px] font-bold text-[#0b1220]">
                Date issued
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {DATE_OPTIONS.map((option) => (
                  <FilterPill
                    key={option.value}
                    active={draft.dateIssued === option.value}
                    label={option.label}
                    onClick={() =>
                      setDraft((current) => {
                        const nextDate =
                          current.dateIssued === option.value
                            ? "all"
                            : option.value;
                        const clearCustom =
                          nextDate === "all" || nextDate !== "custom";
                        return {
                          ...current,
                          dateIssued: nextDate,
                          customFrom: clearCustom ? "" : current.customFrom,
                          customTo: clearCustom ? "" : current.customTo,
                        };
                      })
                    }
                  />
                ))}
              </div>
              {draft.dateIssued === "custom" ? (
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

            <section className="mt-4 space-y-2">
              <h4 className="text-[12px] font-bold text-[#0b1220]">
                Repayment position
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {REPAYMENT_OPTIONS.map((option) => (
                  <FilterPill
                    key={option.value}
                    active={draft.repayment === option.value}
                    label={option.label}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        repayment: option.value,
                      }))
                    }
                  />
                ))}
              </div>
            </section>

            <section className="mt-4 space-y-2">
              <h4 className="text-[12px] font-bold text-[#0b1220]">
                Principal amount
              </h4>
              <div className="flex items-center gap-2">
                <label className="min-w-0 flex-1 space-y-1">
                  <span className="text-[10px] font-semibold text-slate-500">
                    Min
                  </span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="0"
                    value={draft.principalMin}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        principalMin: event.target.value,
                      }))
                    }
                    className="h-9 w-full rounded-xl border border-[#e6ebf0] px-2.5 text-xs font-semibold outline-none"
                  />
                </label>
                <span className="mt-5 text-xs font-semibold text-slate-400">
                  –
                </span>
                <label className="min-w-0 flex-1 space-y-1">
                  <span className="text-[10px] font-semibold text-slate-500">
                    Max
                  </span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="Any"
                    value={draft.principalMax}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        principalMax: event.target.value,
                      }))
                    }
                    className="h-9 w-full rounded-xl border border-[#e6ebf0] px-2.5 text-xs font-semibold outline-none"
                  />
                </label>
              </div>
            </section>

                <div className="sticky bottom-0 mt-5 grid grid-cols-2 gap-2 bg-white pt-1">
                  <button
                    type="button"
                    className="h-10 rounded-xl border border-[#e6ebf0] bg-white text-xs font-semibold text-[#0b1220]"
                    onClick={() => {
                      setDraft(EMPTY_LOANS_FILTERS);
                      setOfficerQuery("");
                      onApply(EMPTY_LOANS_FILTERS);
                      setOpen(false);
                    }}
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-xl bg-[var(--forest-emerald)] text-xs font-semibold text-white"
                    onClick={() => applyDraft()}
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

/** Parse YYYY-MM-DD as a local calendar day (avoids UTC day-shift). */
export function parseLocalDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day);
}

export function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function loanMatchesDateIssued(
  issueDate: Date,
  filters: LoansAdvancedFilters,
  now = new Date(),
) {
  if (Number.isNaN(issueDate.getTime())) return false;
  if (filters.dateIssued === "all") return true;

  const today = startOfLocalDay(now);
  const issued = startOfLocalDay(issueDate);

  if (filters.dateIssued === "today") {
    return issued.getTime() === today.getTime();
  }
  if (filters.dateIssued === "this_week") {
    const weekStart = new Date(today);
    const day = weekStart.getDay();
    const diff = day === 0 ? 6 : day - 1;
    weekStart.setDate(weekStart.getDate() - diff);
    return issued >= weekStart && issued <= today;
  }
  if (filters.dateIssued === "this_month") {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return issued >= monthStart && issued <= today;
  }
  if (filters.dateIssued === "last_month") {
    const lastMonthStart = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return issued >= lastMonthStart && issued < thisMonthStart;
  }
  if (filters.dateIssued === "custom") {
    const from = filters.customFrom
      ? parseLocalDateInput(filters.customFrom)
      : null;
    const to = filters.customTo ? parseLocalDateInput(filters.customTo) : null;
    if (!from && !to) return true;
    const fromDay = from ? startOfLocalDay(from) : null;
    const toDay = to ? startOfLocalDay(to) : null;
    if (fromDay && issued < fromDay) return false;
    if (toDay && issued > toDay) return false;
    return true;
  }
  return true;
}

export function loanMatchesRepaymentPosition(
  overdueDays: number,
  repayment: RepaymentPosition,
) {
  if (repayment === "all") return true;
  if (repayment === "2-3") return overdueDays >= 2 && overdueDays <= 3;
  if (repayment === "4-7") return overdueDays >= 4 && overdueDays <= 7;
  if (repayment === "8+") return overdueDays >= 8;
  return true;
}

export function loanMatchesPrincipalRange(
  principal: number,
  filters: LoansAdvancedFilters,
) {
  const minRaw = filters.principalMin.trim();
  const maxRaw = filters.principalMax.trim();
  if (minRaw) {
    const min = Number(minRaw);
    if (Number.isFinite(min) && principal < min) return false;
  }
  if (maxRaw) {
    const max = Number(maxRaw);
    if (Number.isFinite(max) && principal > max) return false;
  }
  return true;
}

export function loanMatchesOfficer(
  loan: {
    officerPublicId?: string | null;
    officerName?: string | null;
  },
  filters: LoansAdvancedFilters,
) {
  if (!filters.officerKey) return true;
  if (filters.officerKey.startsWith("name:")) {
    const needle = filters.officerKey.slice("name:".length);
    return (loan.officerName ?? "").toLowerCase().includes(needle);
  }
  const key =
    loan.officerPublicId?.trim() ||
    loan.officerName?.trim().toLowerCase() ||
    "";
  return key === filters.officerKey;
}
