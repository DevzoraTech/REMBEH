type DateGroupHeaderProps = {
  label: string;
  count: number;
};

/** Sticky day divider used by live applications + payments lists. */
export function DateGroupHeader({ label, count }: DateGroupHeaderProps) {
  return (
    <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--soft-mist)_92%,white)] px-3 py-1.5 backdrop-blur-[2px]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </p>
      <p className="text-[10px] font-medium tabular-nums text-slate-400">
        {count}
      </p>
    </div>
  );
}
