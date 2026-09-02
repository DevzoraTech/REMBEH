"use client";

import { Check, KeyRound, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FormError, PasswordField } from "../auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../lib/api";
import type { RembehSession } from "../../lib/auth-session";
import { SettingsCard } from "./settings-chrome";

export function ChangePasswordCard({ session }: { session: RembehSession }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (currentPassword && newPassword === currentPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/change-password`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password updated. Other devices have been signed out.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not change password. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Password"
      description="Choose a new password for this account. Other signed-in devices will be signed out."
    >
      <form onSubmit={onSubmit} className="max-w-md space-y-3.5">
        {success ? (
          <p className="flex items-start gap-2 rounded-[12px] border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <Check className="mt-0.5 size-4 shrink-0" />
            {success}
          </p>
        ) : null}
        <FormError error={error} />
        <PasswordField
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          placeholder="Enter your current password"
        />
        <PasswordField
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
        <PasswordField
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          placeholder="Re-enter the new password"
        />
        <button
          type="submit"
          disabled={saving}
          className="mt-1 flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--forest-emerald)] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,143,104,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}
          Update password
        </button>
      </form>
    </SettingsCard>
  );
}
