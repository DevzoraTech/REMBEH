export const PHONE_COUNTRIES = [
  { code: "UG", flag: "🇺🇬", name: "Uganda", dialCode: "+256", currency: "UGX" },
  { code: "KE", flag: "🇰🇪", name: "Kenya", dialCode: "+254", currency: "KES" },
  { code: "TZ", flag: "🇹🇿", name: "Tanzania", dialCode: "+255", currency: "TZS" },
  { code: "RW", flag: "🇷🇼", name: "Rwanda", dialCode: "+250", currency: "RWF" },
  { code: "BI", flag: "🇧🇮", name: "Burundi", dialCode: "+257", currency: "BIF" },
  { code: "SS", flag: "🇸🇸", name: "South Sudan", dialCode: "+211", currency: "SSP" },
  { code: "CD", flag: "🇨🇩", name: "DR Congo", dialCode: "+243", currency: "CDF" },
  { code: "NG", flag: "🇳🇬", name: "Nigeria", dialCode: "+234", currency: "NGN" },
  { code: "GH", flag: "🇬🇭", name: "Ghana", dialCode: "+233", currency: "GHS" },
  { code: "ZA", flag: "🇿🇦", name: "South Africa", dialCode: "+27", currency: "ZAR" },
] as const;

export function formatInternationalPhone(dialCode: string, value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+/, "");
  const phone = `${dialCode}${digits}`;

  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return null;
  }

  return phone;
}

export function countryByDialCode(dialCode: string) {
  return PHONE_COUNTRIES.find((country) => country.dialCode === dialCode);
}
