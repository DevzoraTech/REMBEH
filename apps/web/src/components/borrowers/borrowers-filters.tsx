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
import {
  loanMatchesDateIssued,
  type DateIssuedPreset,
  type OfficerOption,
} from "../loans/loans-filters";

export type VerificationFilter =
  | "all"
  | "verified"
  | "pending"
  | "issue";
export type BorrowerLoanStatusFilter =
  | "all"
  | "active"
  | "overdue"
  | "closed_only";

export type BorrowersAdvancedFilters = {
  officerKey: string | null;
  officerLabel: string | null;
  verification: VerificationFilter;
  loanStatus: BorrowerLoanStatusFilter;
  dateRegistered: DateIssuedPreset;
  customFrom: string;
  customTo: string;
};

export const EMPTY_BORROWERS_FILTERS: BorrowersAdvancedFilters = {
  officerKey: null,
  officerLabel: null,
  verification: "all",
  loanStatus: "all",
  dateRegistered: "all",
  customFrom: "",
  customTo: "",
};

const DATE_OPTIONS: Array<{ value: DateIssuedPreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom range" },
];

const VERIFICATION_OPTIONS: Array<{
  value: VerificationFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "pending", label: "Not verified" },
  { value: "issue", label: "Verification issue" },
];

const LOAN_STATUS_OPTIONS: Array<{
  value: BorrowerLoanStatusFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active loan" },
  { value: "overdue", label: "Overdue loan" },
  { value: "closed_only", label: "Closed loans only" },
];

export type { OfficerOption };

export function activeBorrowerFilterChips(filters: BorrowersAdvancedFilters) {
  const chips: Array<{ key: string; label: string }> = [];
  if (filters.officerLabel) {
    chips.push({ key: "officer", label: filters.officerLabel });
  }
  if (filters.verification !== "all") {
    const label =
      VERIFICATION_OPTIONS.find((option) => option.value === filters.verification)
        ?.label ?? filters.verification;
    chips.push({ key: "verification", label });
  }
  if (filters.loanStatus !== "all") {
    const label =
      LOAN_STATUS_OPTIONS.find((option) => option.value === filters.loanStatus)
        ?.label ?? filters.loanStatus;
    chips.push({ key: "loanStatus", label });
  }
  if (filters.dateRegistered !== "all") {
    if (filters.dateRegistered === "custom") {
      const from = filters.customFrom || "…";
      const to = filters.customTo || "…";
      chips.push({ key: "date", label: `${from} – ${to}` });
    } else {
      const label =
        DATE_OPTIONS.find((option) => option.value === filters.dateRegistered)
          ?.label ?? filters.dateRegistered;
      chips.push({ key: "date", label });
    }
  }
  return chips;
}

export function clearBorrowerFilterChip(
  filters: BorrowersAdvancedFilters,
  key: string,
): BorrowersAdvancedFilters {
  if (key === "officer") {
    return { ...filters, officerKey: null, officerLabel: null };
  }
  if (key === "verification") {
    return { ...filters, verification: "all" };
  }
  if (key === "loanStatus") {
    return { ...filters, loanStatus: "all" };
  }
  if (key === "date") {
    return {
      ...filters,
      dateRegistered: "all",
      customFrom: "",
      customTo: "",
    };
  }
  return filters;
}

function resolveOfficerFilter(
  draft: BorrowersAdvancedFilters,
  officerQuery: string,
  officers: OfficerOption[],
): BorrowersAdvancedFilters {
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

  return {
    ...draft,
    officerKey: `name:${q}`,
    officerLabel: officerQuery.trim(),
  };
}

export function borrowerMatchesDateRegistered(
  createdAt: string,
  filters: BorrowersAdvancedFilters,
  now = new Date(),
) {
  return loanMatchesDateIssued(
    new Date(createdAt),
    {
      officerKey: null,
      officerLabel: null,
      dateIssued: filters.dateRegistered,
      customFrom: filters.customFrom,
      customTo: filters.customTo,
      repayment: "all",
      principalMin: "",
      principalMax: "",
    },
    now,
  );
}

export function borrowerMatchesOfficer(
  borrower: {
    registeredByName?: string | null;
    registeredByPublicId?: string | null;
  },
  filters: BorrowersAdvancedFilters,
) {
  if (!filters.officerKey && !filters.officerLabel) return true;
  const key = filters.officerKey ?? "";
  if (key.startsWith("name:")) {
    const name = key.slice(5);
    return (borrower.registeredByName ?? "").toLowerCase().includes(name);
  }
  if (filters.officerKey && borrower.registeredByPublicId) {
    if (borrower.registeredByPublicId === filters.officerKey) return true;
  }
  if (filters.officerLabel) {
    return (
      (borrower.registeredByName ?? "").toLowerCase() ===
      filters.officerLabel.toLowerCase()
    );
  }
  return false;
}

export function BorrowersFiltersControl({
  officers,
  applied,
  onApply,
}: {
  officers: OfficerOption[];
  applied: BorrowersAdvancedFilters;
  onApply: (next: BorrowersAdvancedFilters) => void;
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

  const chips = activeBorrowerFilterChips(applied);
  const filteredOfficers = useMemo(() => {
    const q = officerQuery.trim().toLowerCase();
    if (!q) return officers.slice(0, 8);
    return officers
      .filter((officer) => officer.label.toLowerCase().includes(q))
      .slice(0, 12);
  }, [officerQuery, officers]);

  function applyDraft(nextDraft: BorrowersAdvancedFilters = draft) {
    onApply(resolveOfficerFilter(nextDraft, officerQuery, officers));
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
            onClick={() => onApply(clearBorrowerFilterChip(applied, chip.key))}
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
                aria-label="Borrower filters"
                className="rounded-2xl border border-[#e6ebf0] bg-white p-4 shadow-[0_22px_50px_rgba(15,23,42,0.22)]"
                style={panelStyle}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <section className="space-y-2">
                  <h4 className="text-[12px] font-bold text-[#0b1220]">
                    Registered by
                  </h4>
                  <div className="relative" ref={officerBoxRef}>
                    <label className="flex h-10 items-center gap-2 rounded-xl border border-[#e6ebf0] px-3">
                      <Search className="size-3.5 shrink-0 text-slate-400" />
                      <input
                        value={officerQuery}
                        onChange={(event) => {
                          setOfficerQuery(event.target.value);
                          setDraft((current) => ({
                            ...current,
                            officerKey: null,
                            officerLabel: null,
                          }));
                          setOfficerMenuOpen(true);
                        }}
                        onFocus={() => setOfficerMenuOpen(true)}
                        placeholder="Search agent…"
                        className="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none"
                      />
                      {officerQuery ? (
                        <button
                          type="button"
                          className="grid size-5 place-items-center rounded-full text-slate-400 hover:bg-slate-100"
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
                          <X className="size-3" />
                        </button>
                      ) : (
                        <ChevronDown className="size-3.5 text-slate-400" />
                      )}
                    </label>
                    {officerMenuOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-10 max-h-48 overflow-y-auto rounded-xl border border-[#e6ebf0] bg-white py-1 shadow-[0_14px_34px_rgba(15,23,42,0.12)]">
                        {filteredOfficers.length === 0 ? (
                          <p className="px-3 py-2 text-[11px] font-medium text-slate-500">
                            No matching agents
                          </p>
                        ) : (
                          filteredOfficers.map((officer) => (
                            <button
                              key={officer.key}
                              type="button"
                              className="block w-full px-3 py-2 text-left text-xs font-semibold text-[#0b1220] hover:bg-[#f4f7f6]"
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
                    Verification status
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {VERIFICATION_OPTIONS.map((option) => (
                      <FilterPill
                        key={option.value}
                        active={draft.verification === option.value}
                        label={option.label}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            verification: option.value,
                          }))
                        }
                      />
                    ))}
                  </div>
                </section>

                <section className="mt-4 space-y-2">
                  <h4 className="text-[12px] font-bold text-[#0b1220]">
                    Loan status
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {LOAN_STATUS_OPTIONS.map((option) => (
                      <FilterPill
                        key={option.value}
                        active={draft.loanStatus === option.value}
                        label={option.label}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            loanStatus: option.value,
                          }))
                        }
                      />
                    ))}
                  </div>
                </section>

                <section className="mt-4 space-y-2">
                  <h4 className="text-[12px] font-bold text-[#0b1220]">
                    Date registered
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {DATE_OPTIONS.map((option) => (
                      <FilterPill
                        key={option.value}
                        active={draft.dateRegistered === option.value}
                        label={option.label}
                        onClick={() =>
                          setDraft((current) => {
                            const nextDate =
                              current.dateRegistered === option.value
                                ? "all"
                                : option.value;
                            const clearCustom =
                              nextDate === "all" || nextDate !== "custom";
                            return {
                              ...current,
                              dateRegistered: nextDate,
                              customFrom: clearCustom ? "" : current.customFrom,
                              customTo: clearCustom ? "" : current.customTo,
                            };
                          })
                        }
                      />
                    ))}
                  </div>
                  {draft.dateRegistered === "custom" ? (
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

                <div className="mt-5 flex items-center justify-between gap-2 border-t border-[#edf1f5] pt-3">
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-500 hover:text-[#0b1220]"
                    onClick={() => {
                      setDraft(EMPTY_BORROWERS_FILTERS);
                      setOfficerQuery("");
                      onApply(EMPTY_BORROWERS_FILTERS);
                      setOpen(false);
                    }}
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-xl bg-[var(--forest-emerald)] px-4 text-xs font-semibold text-white"
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
