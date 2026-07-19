"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../components/app/app-shell";
import {
  FormError,
  PrimaryButton,
  TextField,
} from "../../../components/auth/form-controls";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
  isSessionExpired,
  readAuthState,
} from "../../../lib/auth-session";
import { resolveOperatorRole } from "../../../lib/roles";

type RateOption = {
  id: string;
  label: string;
  interestRatePercent: number;
  isActive: boolean;
  sortOrder: number;
  branchId: string | null;
};

type PeriodOption = {
  id: string;
  label: string;
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
  branchId: string | null;
};

export default function LoanProductsPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [rates, setRates] = useState<RateOption[]>([]);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rateLabel, setRateLabel] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [periodDays, setPeriodDays] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const auth = readAuthState();
    if (!auth.session || isSessionExpired(auth.session)) {
      clearAuthState();
      router.replace("/login");
      return;
    }

    const role = resolveOperatorRole(auth.session, auth.user);
    if (role === "staff") {
      router.replace("/dashboard");
      return;
    }

    if (!auth.session.permissions.includes("loan.product.manage")) {
      setError("You do not have permission to manage loan products.");
      setSession(auth.session);
      setWorkspace(auth.workspace);
      setUser(auth.user);
      setBranch(auth.branch);
      setLoading(false);
      return;
    }

    setSession(auth.session);
    setWorkspace(auth.workspace);
    setUser(auth.user);
    setBranch(auth.branch);

    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/loan-products`, {
          headers: {
            Authorization: `${auth.session!.tokenType} ${auth.session!.accessToken}`,
          },
        });
        const payload = await readApiJson<{
          rates?: RateOption[];
          periods?: PeriodOption[];
          message?: string | string[];
        }>(response);
        if (!response.ok) {
          throw new Error(formatApiError(payload.message));
        }
        setRates(payload.rates ?? []);
        setPeriods(payload.periods ?? []);
        setError(null);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load loan products.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function refreshCatalog(activeSession: RembehSession) {
    const response = await fetch(`${apiBaseUrl}/loan-products`, {
      headers: {
        Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
      },
    });
    const payload = await readApiJson<{
      rates?: RateOption[];
      periods?: PeriodOption[];
      message?: string | string[];
    }>(response);
    if (!response.ok) {
      throw new Error(formatApiError(payload.message));
    }
    setRates(payload.rates ?? []);
    setPeriods(payload.periods ?? []);
  }

  async function addRate(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/loan-products/rates`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label: rateLabel.trim() || `${ratePercent}%`,
          interestRatePercent: Number(ratePercent),
        }),
      });
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setRateLabel("");
      setRatePercent("");
      await refreshCatalog(session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add rate.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function addPeriod(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const days = Number(periodDays);
      const response = await fetch(`${apiBaseUrl}/loan-products/periods`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          label: periodLabel.trim() || `${days} days`,
          durationDays: days,
        }),
      });
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) {
        throw new Error(formatApiError(payload.message));
      }
      setPeriodLabel("");
      setPeriodDays("");
      await refreshCatalog(session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add period.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivateRate(id: string) {
    if (!session) return;
    setSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/loan-products/rates/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
        },
      });
      if (!response.ok) {
        const payload = await readApiJson<{ message?: string | string[] }>(
          response,
        );
        throw new Error(formatApiError(payload.message));
      }
      await refreshCatalog(session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not remove rate.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivatePeriod(id: string) {
    if (!session) return;
    setSaving(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/loan-products/periods/${id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `${session.tokenType} ${session.accessToken}`,
          },
        },
      );
      if (!response.ok) {
        const payload = await readApiJson<{ message?: string | string[] }>(
          response,
        );
        throw new Error(formatApiError(payload.message));
      }
      await refreshCatalog(session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not remove period.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[var(--forest-emerald)]" />
      </div>
    );
  }

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={branch}
    >
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <header>
          <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.03em] text-[var(--midnight-navy)]">
            Loan products
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure interest rates and loan periods that field agents select
            when capturing applications.
          </p>
        </header>

        <FormError error={error} />

        {loading ? (
          <p className="text-sm text-slate-500">Loading catalog…</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="panel p-4">
              <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
                Interest rates
              </h2>
              <form onSubmit={addRate} className="mt-3 space-y-2">
                <TextField
                  label="Label"
                  value={rateLabel}
                  onChange={setRateLabel}
                  placeholder="e.g. 12% per annum"
                />
                <TextField
                  label="Rate (%)"
                  value={ratePercent}
                  onChange={setRatePercent}
                  placeholder="12"
                  required
                />
                <PrimaryButton type="submit" disabled={saving}>
                  <Plus className="size-3.5" />
                  Add rate
                </PrimaryButton>
              </form>
              <ul className="mt-4 divide-y divide-[var(--line)]">
                {rates.filter((item) => item.isActive).length === 0 ? (
                  <li className="py-3 text-sm text-slate-500">
                    No active rates yet.
                  </li>
                ) : (
                  rates
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[var(--midnight-navy)]">
                            {item.label}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.interestRatePercent}%
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost h-8 px-2 text-xs text-red-600"
                          onClick={() => void deactivateRate(item.id)}
                          disabled={saving}
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </button>
                      </li>
                    ))
                )}
              </ul>
            </section>

            <section className="panel p-4">
              <h2 className="text-sm font-bold text-[var(--midnight-navy)]">
                Loan periods
              </h2>
              <form onSubmit={addPeriod} className="mt-3 space-y-2">
                <TextField
                  label="Label"
                  value={periodLabel}
                  onChange={setPeriodLabel}
                  placeholder="e.g. 90 days"
                />
                <TextField
                  label="Duration (days)"
                  value={periodDays}
                  onChange={setPeriodDays}
                  placeholder="90"
                  required
                />
                <PrimaryButton type="submit" disabled={saving}>
                  <Plus className="size-3.5" />
                  Add period
                </PrimaryButton>
              </form>
              <ul className="mt-4 divide-y divide-[var(--line)]">
                {periods.filter((item) => item.isActive).length === 0 ? (
                  <li className="py-3 text-sm text-slate-500">
                    No active periods yet.
                  </li>
                ) : (
                  periods
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[var(--midnight-navy)]">
                            {item.label}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.durationDays} days
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost h-8 px-2 text-xs text-red-600"
                          onClick={() => void deactivatePeriod(item.id)}
                          disabled={saving}
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </button>
                      </li>
                    ))
                )}
              </ul>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
