"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50];

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const safePageSize = PAGE_SIZE_OPTIONS.includes(pageSize)
    ? pageSize
    : DEFAULT_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const startIndex = total === 0 ? 0 : (currentPage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, total);

  return {
    items: items.slice(startIndex, endIndex),
    currentPage,
    pageCount,
    start: total === 0 ? 0 : startIndex + 1,
    end: endIndex,
    total,
    pageSize: safePageSize,
  };
}

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function PaginationControls({
  page,
  pageSize,
  total,
  itemLabel,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const snapshot = paginateItems(Array.from({ length: total }), page, pageSize);
  const pages = visiblePages(snapshot.currentPage, snapshot.pageCount);

  if (total <= 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-white px-3 py-2.5 text-[11px] text-slate-500">
      <p>
        Showing {snapshot.start} to {snapshot.end} of {snapshot.total}{" "}
        {capitalizeFirst(itemLabel)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="grid size-8 place-items-center border border-[var(--line)] bg-white text-[var(--midnight-navy)] transition hover:bg-[var(--soft-mist)] disabled:opacity-40"
          disabled={snapshot.currentPage <= 1}
          onClick={() => onPageChange(snapshot.currentPage - 1)}
          aria-label="previous page"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-1">
          {pages.map((item, index) =>
            item === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="grid size-8 place-items-center text-slate-400"
              >
                ...
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={`grid size-8 place-items-center border text-xs font-bold transition ${
                  item === snapshot.currentPage
                    ? "border-[var(--midnight-navy)] bg-[var(--midnight-navy)] text-white"
                    : "border-[var(--line)] bg-white text-[var(--midnight-navy)] hover:bg-[var(--soft-mist)]"
                }`}
                onClick={() => onPageChange(item)}
                aria-label={`page ${item}`}
              >
                {item}
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center border border-[var(--line)] bg-white text-[var(--midnight-navy)] transition hover:bg-[var(--soft-mist)] disabled:opacity-40"
          disabled={snapshot.currentPage >= snapshot.pageCount}
          onClick={() => onPageChange(snapshot.currentPage + 1)}
          aria-label="next page"
        >
          <ChevronRight className="size-4" />
        </button>
        <select
          value={snapshot.pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-8 border border-[var(--line)] bg-white px-2 text-[11px] font-semibold text-[var(--midnight-navy)]"
          aria-label="rows per page"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} per page
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function capitalizeFirst(value: string) {
  const text = value.trim();
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function visiblePages(currentPage: number, pageCount: number) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(pageCount - 1, currentPage + 1);

  if (start > 2) pages.push("ellipsis");
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  if (end < pageCount - 1) pages.push("ellipsis");
  pages.push(pageCount);

  return pages;
}
