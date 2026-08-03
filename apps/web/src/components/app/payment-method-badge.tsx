import Image from "next/image";

type PaymentBrand = "mtn" | "airtel" | "visa" | null;

/**
 * Resolve logo only from explicit brand signals.
 * Never treat the old ambiguous "Mobile money / card" fallback as Visa.
 */
function resolveBrand(method: string): PaymentBrand {
  const key = method.toLowerCase().trim();
  if (!key) return null;

  if (key.includes("airtel")) return "airtel";
  if (key.includes("mtn") || key.includes("momo")) return "mtn";

  // Explicit card brands only — bare "card" inside "mobile money / card" is not Visa.
  if (key.includes("visa")) return "visa";
  if (key.includes("master")) return "visa";
  if (
    (/\b(debit|credit)\s*card\b/.test(key) || key === "card") &&
    !key.includes("mobile")
  ) {
    return "visa";
  }

  return null;
}

function brandAsset(brand: Exclude<PaymentBrand, null>) {
  switch (brand) {
    case "mtn":
      return { src: "/assets/payments/mtn.png", alt: "MTN" };
    case "airtel":
      return { src: "/assets/payments/airtel.png", alt: "Airtel" };
    case "visa":
      return { src: "/assets/payments/visa.png", alt: "Visa" };
  }
}

function displayLabel(method: string, brand: PaymentBrand) {
  const trimmed = method.trim();
  if (!trimmed) return "—";
  if (brand === "mtn") {
    return trimmed.toLowerCase().includes("mtn")
      ? trimmed
      : "MTN Mobile Money";
  }
  if (brand === "airtel") {
    return trimmed.toLowerCase().includes("airtel")
      ? trimmed
      : "Airtel Money";
  }
  if (brand === "visa") {
    if (trimmed.toLowerCase().includes("master")) return "Mastercard";
    if (trimmed.toLowerCase().includes("visa")) return "Visa Card";
    return trimmed === "Card" ? "Card" : trimmed;
  }
  return trimmed;
}

export function PaymentMethodBadge({
  method,
  compact = false,
}: {
  method: string;
  compact?: boolean;
}) {
  const brand = resolveBrand(method);
  const label = displayLabel(method, brand);

  if (!brand) {
    return <span className="text-xs text-slate-600">{label}</span>;
  }

  const asset = brandAsset(brand);

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2 ${
        compact ? "" : "max-w-[11rem]"
      }`}
      title={label}
    >
      <Image
        src={asset.src}
        alt={asset.alt}
        width={28}
        height={22}
        className="h-[18px] w-auto shrink-0 object-contain"
      />
      <span className="truncate text-xs font-medium text-slate-700">
        {label}
      </span>
    </span>
  );
}
