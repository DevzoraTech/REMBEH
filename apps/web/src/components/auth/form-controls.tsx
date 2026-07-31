"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  ChangeEvent,
  ClipboardEvent,
  KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { PHONE_COUNTRIES } from "../../lib/phone";

export function FormError({ error }: { error: string | null }) {
  if (!error) {
    return null;
  }

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] leading-5 text-red-700"
    >
      {error}
    </div>
  );
}

export function FieldLabel({
  label,
  hint,
  compact = false,
}: {
  label: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-end justify-between gap-3 ${compact ? "mb-1" : "mb-2"}`}
    >
      <span
        className={`font-semibold capitalize text-[var(--midnight-navy)] ${compact ? "text-xs" : "text-sm"}`}
      >
        {label}
      </span>
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  maxLength,
  minLength,
  placeholder,
  autoComplete,
  hint,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <FieldLabel label={label} hint={hint} compact={compact} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`field-input ${compact ? "h-9 text-sm" : ""}`}
        type={type}
        required={required}
        maxLength={maxLength}
        minLength={minLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    </label>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  placeholder = "Minimum 8 characters",
  autoComplete = "current-password",
  minLength = 8,
  required = true,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  compact?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <FieldLabel label={label} compact={compact} />
      <div className="relative">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`field-input pr-12 ${compact ? "h-9 text-sm" : ""}`}
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 transition hover:text-[var(--midnight-navy)]"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  required = false,
  placeholder,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <FieldLabel label={label} compact={compact} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`field-input appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%228%22 fill=%22none%22%3E%3Cpath d=%22M1 1.5 6 6.5 11 1.5%22 stroke=%22%2366756E%22 stroke-width=%221.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E')] bg-[length:12px_8px] bg-[right_14px_center] bg-no-repeat pr-10 ${compact ? "h-9 text-sm" : ""}`}
        required={required}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PhoneField({
  label,
  countryCode,
  nationalNumber,
  onCountryCodeChange,
  onNationalNumberChange,
  required = false,
  placeholder = "700 000 000",
  compact = false,
}: {
  label: string;
  countryCode: string;
  nationalNumber: string;
  onCountryCodeChange: (value: string) => void;
  onNationalNumberChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  compact?: boolean;
}) {
  const height = compact ? "h-9" : "h-11";

  return (
    <label className="block">
      <FieldLabel label={label} compact={compact} />
      <div className="grid grid-cols-[7.5rem_1fr] overflow-hidden rounded-xl border border-[#d7dee6] bg-white focus-within:border-[var(--forest-emerald)] focus-within:shadow-[0_0_0_3px_rgba(15,138,108,0.12)]">
        <select
          value={countryCode}
          onChange={(event) => onCountryCodeChange(event.target.value)}
          className={`${height} border-r border-[#d7dee6] bg-[#f4f7f9] px-1.5 text-xs font-semibold outline-none sm:px-2 sm:text-sm`}
          aria-label={`${label} country code`}
        >
          {PHONE_COUNTRIES.map((country) => (
            <option key={country.code} value={country.dialCode}>
              {country.flag} {country.dialCode}
            </option>
          ))}
        </select>
        <input
          value={nationalNumber}
          onChange={(event) => onNationalNumberChange(event.target.value)}
          className={`${height} w-full px-3 text-sm text-[var(--midnight-navy)] outline-none`}
          inputMode="tel"
          required={required}
          placeholder={placeholder}
          autoComplete="tel-national"
        />
      </div>
    </label>
  );
}

export function PrimaryButton({
  children,
  loading = false,
  disabled = false,
  type = "button",
  onClick,
  variant = "primary",
}: {
  children: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  variant?: "primary" | "navy" | "ghost";
}) {
  const variantClass =
    variant === "navy"
      ? "bg-[var(--midnight-navy)] text-white hover:bg-[#1a2c52]"
      : variant === "ghost"
        ? "border border-[var(--line)] bg-white text-[var(--midnight-navy)] hover:bg-[var(--soft-mist)]"
        : "bg-[var(--forest-emerald)] text-white hover:bg-[#0c745c]";

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold normal-case tracking-normal transition disabled:cursor-not-allowed disabled:opacity-65 ${variantClass}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  function commit(nextDigits: string[]) {
    onChange(nextDigits.join("").slice(0, length));
  }

  function handleChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value.replace(/\D/g, "");
    const nextDigits = [...digits];

    if (!next) {
      nextDigits[index] = "";
      commit(nextDigits);
      return;
    }

    const chars = next.split("");
    chars.forEach((char, offset) => {
      if (index + offset < length) {
        nextDigits[index + offset] = char;
      }
    });
    commit(nextDigits);

    const focusIndex = Math.min(index + chars.length, length - 1);
    inputsRef.current[focusIndex]?.focus();
  }

  function handleKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);

    if (!pasted) {
      return;
    }

    const nextDigits = Array.from(
      { length },
      (_, index) => pasted[index] ?? "",
    );
    commit(nextDigits);
    inputsRef.current[Math.min(pasted.length, length) - 1]?.focus();
  }

  return (
    <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputsRef.current[index] = element;
          }}
          value={digit}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1}`}
          className="h-10 rounded-xl border border-[#d7dee6] bg-white text-center text-base font-bold text-[var(--midnight-navy)] outline-none focus:border-[var(--forest-emerald)] focus:shadow-[0_0_0_3px_rgba(15,138,108,0.12)] disabled:opacity-60"
        />
      ))}
    </div>
  );
}
