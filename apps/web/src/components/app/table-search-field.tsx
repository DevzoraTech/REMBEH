"use client";

import { Search } from "lucide-react";

export function TableSearchField({
  value,
  onChange,
  placeholder,
  title,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  title?: string;
  className?: string;
}) {
  return (
    <label
      className={`flex h-9 min-w-[180px] max-w-[320px] flex-1 items-center gap-2 rounded-xl border border-[#e6ebf0] bg-white px-3 shadow-[0_8px_18px_rgba(15,23,42,0.035)] ${className}`}
      title={title}
    >
      <Search className="size-3.5 shrink-0 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[var(--midnight-navy)] outline-none placeholder:text-slate-400"
      />
    </label>
  );
}
