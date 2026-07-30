"use client";

import { Loader2, MoreVertical } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";

export type RowActionItem = {
  label: string;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  danger?: boolean;
};

type RowActionsProps = {
  label: string;
  items: RowActionItem[];
  busy?: boolean;
};

export function RowActions({ label, items, busy = false }: RowActionsProps) {
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!menu) return;

    function closeMenu() {
      setMenu(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  function toggleMenu(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 164;
    setMenu((current) =>
      current
        ? null
        : {
            top: rect.bottom + 6,
            left: Math.max(
              8,
              Math.min(
                window.innerWidth - menuWidth - 8,
                rect.right - menuWidth,
              ),
            ),
          },
    );
  }

  const visibleItems = items.filter((item) => item.href || item.onSelect);

  return (
    <div
      className="flex justify-end"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="grid size-8 place-items-center rounded-xl border border-[var(--line)] bg-white text-[var(--midnight-navy)] shadow-[0_6px_14px_rgba(20,33,61,0.06)] transition hover:bg-[var(--soft-mist)] disabled:opacity-50"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        disabled={busy || visibleItems.length === 0}
        onClick={toggleMenu}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <MoreVertical className="size-4" />
        )}
      </button>

      {menu ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close actions"
            onClick={() => setMenu(null)}
          />
          <div
            role="menu"
            className="fixed z-50 w-[164px] rounded-xl border border-[var(--line)] bg-white p-1 text-left shadow-[0_16px_34px_rgba(20,33,61,0.18)]"
            style={{ top: menu.top, left: menu.left }}
          >
            {visibleItems.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  className={`block w-full rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold transition hover:bg-[var(--soft-mist)] ${
                    item.danger ? "text-red-700" : "text-[var(--midnight-navy)]"
                  } ${item.disabled ? "pointer-events-none opacity-50" : ""}`}
                  onClick={() => setMenu(null)}
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={`block w-full rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold transition hover:bg-[var(--soft-mist)] ${
                    item.danger ? "text-red-700" : "text-[var(--midnight-navy)]"
                  } disabled:opacity-50`}
                  disabled={item.disabled}
                  onClick={() => {
                    setMenu(null);
                    item.onSelect?.();
                  }}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
