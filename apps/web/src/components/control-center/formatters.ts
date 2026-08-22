export function ccMoney(value: number | null | undefined, currency = "UGX") {
  return `${currency} ${ccAmount(value)}`;
}

export function ccAmount(value: number | null | undefined) {
  return Math.round(value ?? 0).toLocaleString("en-UG");
}

export function ccNumber(value: number | null | undefined) {
  return Math.round(value ?? 0).toLocaleString("en-UG");
}

export function ccDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function ccDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function ccDateInputValue(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function titleText(value: string | null | undefined) {
  const text = value?.replace(/_/g, " ").trim();
  if (!text) return "-";
  return text
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "R";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function compactAction(value: string) {
  return titleText(value.replace(/^control_center\./, "").replace(/\./g, " "));
}
