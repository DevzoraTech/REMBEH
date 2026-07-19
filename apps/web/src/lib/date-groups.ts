/** Group ISO timestamps into local calendar-day buckets (newest first). */

export type DateGroup<T> = {
  key: string;
  label: string;
  items: T[];
};

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dayKey(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayLabel(value: Date, now = new Date()) {
  const day = startOfLocalDay(value);
  const today = startOfLocalDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (day.getTime() === today.getTime()) return "Today";
  if (day.getTime() === yesterday.getTime()) return "Yesterday";

  return new Intl.DateTimeFormat("en-UG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(day);
}

export function groupByLocalDate<T>(
  items: T[],
  getIso: (item: T) => string,
  options?: { newestFirst?: boolean },
): DateGroup<T>[] {
  const newestFirst = options?.newestFirst ?? true;
  const sorted = [...items].sort((a, b) => {
    const ta = new Date(getIso(a)).getTime();
    const tb = new Date(getIso(b)).getTime();
    return newestFirst ? tb - ta : ta - tb;
  });

  const groups: DateGroup<T>[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of sorted) {
    const date = new Date(getIso(item));
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    const existing = indexByKey.get(key);
    if (existing === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ key, label: dayLabel(date), items: [item] });
    } else {
      groups[existing]!.items.push(item);
    }
  }

  return groups;
}

export function formatClock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-UG", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
