"use client";

import {
  ArrowLeft,
  FileText,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../components/app/app-shell";
import { AppBootSkeleton } from "../../../components/app/skeleton";
import { apiBaseUrl, formatApiError, readApiJson } from "../../../lib/api";
import {
  RembehBranch,
  RembehSession,
  RembehUser,
  RembehWorkspace,
  clearAuthState,
  readAuthState,
  refreshAuthSession,
} from "../../../lib/auth-session";

type TransferType = "BANKING" | "MOBILE_MONEY";
type Period = "today" | "week" | "month" | "all";

type TransferRecord = {
  id: string;
  operationDate: string;
  type: TransferType;
  amount: number;
  recordedByName: string;
  receiptUrl: string | null;
  receiptFileName: string | null;
};

function dateValue(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function rangeFor(period: Period) {
  const today = new Date();
  if (period === "all") return {};
  if (period === "today") {
    const value = dateValue(today);
    return { from: value, to: value };
  }
  const from = new Date(today);
  if (period === "week") from.setDate(today.getDate() - today.getDay() + 1);
  if (period === "month") from.setDate(1);
  return { from: dateValue(from), to: dateValue(today) };
}

function money(value: number) {
  return `UGX ${Math.round(value).toLocaleString("en-UG")}`;
}

function typeLabel(type: TransferType) {
  return type === "MOBILE_MONEY" ? "Mobile Money" : "Banking";
}

export default function BankingAndMobileMoneyPage() {
  const router = useRouter();
  const [session, setSession] = useState<RembehSession | null>(null);
  const [workspace, setWorkspace] = useState<RembehWorkspace | null>(null);
  const [user, setUser] = useState<RembehUser | null>(null);
  const [branch, setBranch] = useState<RembehBranch | null>(null);
  const [records, setRecords] = useState<TransferRecord[]>([]);
  const [period, setPeriod] = useState<Period>("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [operationDate, setOperationDate] = useState(dateValue());

  useEffect(() => {
    const boot = window.setTimeout(() => {
      const auth = readAuthState();
      if (!auth.session) {
        router.replace("/login?next=/operations/banking");
        return;
      }
      setSession(auth.session);
      setWorkspace(auth.workspace);
      setUser(auth.user);
      setBranch(auth.branch);
      const requestedDate = new URLSearchParams(window.location.search).get(
        "date",
      );
      if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate ?? "")) {
        setOperationDate(requestedDate!);
      }
    }, 0);
    return () => window.clearTimeout(boot);
  }, [router]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const range = rangeFor(period);
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      if (branch?.id) params.set("branchId", branch.id);
      let activeSession = session;
      let response = await fetch(
        `${apiBaseUrl}/operations/bankings?${params.toString()}`,
        {
          headers: {
            Authorization: `${activeSession.tokenType} ${activeSession.accessToken}`,
          },
        },
      );
      if (response.status === 401) {
        const refreshed = await refreshAuthSession(activeSession, apiBaseUrl);
        if (!refreshed) {
          clearAuthState();
          router.replace("/login?next=/operations/banking");
          return;
        }
        activeSession = refreshed;
        setSession(refreshed);
        response = await fetch(
          `${apiBaseUrl}/operations/bankings?${params.toString()}`,
          {
            headers: {
              Authorization: `${refreshed.tokenType} ${refreshed.accessToken}`,
            },
          },
        );
      }
      const payload = await readApiJson<{
        records?: TransferRecord[];
        message?: string | string[];
      }>(response);
      if (!response.ok) throw new Error(formatApiError(payload.message));
      setRecords(payload.records ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load records.",
      );
    } finally {
      setLoading(false);
    }
  }, [branch, period, router, session]);

  useEffect(() => {
    const request = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(request);
  }, [load]);

  const total = useMemo(
    () => records.reduce((sum, record) => sum + Number(record.amount || 0), 0),
    [records],
  );

  if (!session) return <AppBootSkeleton />;

  return (
    <AppShell
      session={session}
      workspace={workspace}
      user={user}
      branch={branch}
    >
      <main className="space-y-4 p-4 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/operations?date=${encodeURIComponent(operationDate)}`,
                )
              }
              className="grid size-10 place-items-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-800"
              aria-label="Back to operations"
            >
              <ArrowLeft className="size-5" />
            </button>
            <div>
              <h1 className="text-lg font-extrabold text-slate-950">
                Banking &amp; Mobile Money
              </h1>
              <p className="text-sm text-slate-500">
                View and manage banking &amp; mobile money records
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRecordOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white"
          >
            <Plus className="size-4" /> Record
          </button>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <Summary
            icon={<FileText className="size-5" />}
            label="Records"
            value={String(records.length)}
          />
          <Summary
            icon={<Landmark className="size-5" />}
            label="Banking"
            value={money(
              records
                .filter((item) => item.type === "BANKING")
                .reduce((sum, item) => sum + item.amount, 0),
            )}
          />
          <Summary
            icon={<Smartphone className="size-5" />}
            label="Mobile Money"
            value={money(
              records
                .filter((item) => item.type === "MOBILE_MONEY")
                .reduce((sum, item) => sum + item.amount, 0),
            )}
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3">
            <div className="inline-flex rounded-lg border border-slate-200 p-1">
              {(["today", "week", "month", "all"] as Period[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={`rounded-md px-3 py-2 text-xs font-bold ${period === value ? "bg-emerald-50 text-emerald-800" : "text-slate-500"}`}
                >
                  {value === "today"
                    ? "Today"
                    : value === "week"
                      ? "This week"
                      : value === "month"
                        ? "This month"
                        : "All"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
              <span>Total: {money(total)}</span>
              <button
                type="button"
                onClick={() => void load()}
                aria-label="Refresh records"
                className="grid size-9 place-items-center rounded-lg border border-slate-200"
              >
                <RefreshCw
                  className={`size-4 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>
          {error ? (
            <p className="p-6 text-sm font-semibold text-red-700">{error}</p>
          ) : loading ? (
            <div className="grid min-h-52 place-items-center">
              <Loader2 className="size-6 animate-spin text-emerald-700" />
            </div>
          ) : records.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-500">
              No banking or mobile money records for this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Recorded by</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Business day</th>
                    <th className="px-4 py-3">Attachment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {typeLabel(record.type)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {record.recordedByName}
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold tabular-nums text-emerald-700">
                        {money(record.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {record.operationDate}
                      </td>
                      <td className="px-4 py-3">
                        {record.receiptUrl ? (
                          <a
                            className="font-bold text-emerald-700 hover:underline"
                            href={record.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View proof
                          </a>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      {recordOpen ? (
        <RecordTransferDialog
          session={session}
          branchId={branch?.id}
          operationDate={operationDate}
          onClose={() => setRecordOpen(false)}
          onSaved={() => {
            setRecordOpen(false);
            void load();
          }}
        />
      ) : null}
    </AppShell>
  );
}

function Summary({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-emerald-700">
        {icon}
        <span className="text-xs font-bold uppercase">{label}</span>
      </div>
      <p className="mt-2 text-lg font-extrabold text-slate-950">{value}</p>
    </div>
  );
}

function RecordTransferDialog({
  session,
  branchId,
  operationDate,
  onClose,
  onSaved,
}: {
  session: RembehSession;
  branchId?: string;
  operationDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<TransferType | "">("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = Number(amount.replaceAll(",", ""));
    if (!type) return setError("Select Banking or Mobile Money.");
    if (!Number.isFinite(parsed) || parsed <= 0)
      return setError("Enter a valid amount.");
    setSaving(true);
    setError(null);
    try {
      let receipt: {
        storageKey?: string;
        mimeType?: string;
        fileName?: string;
      } = {};
      if (file) {
        const presignResponse = await fetch(
          `${apiBaseUrl}/operations/bankings/receipt/presign`,
          {
            method: "POST",
            headers: {
              Authorization: `${session.tokenType} ${session.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              branchId,
              mimeType: file.type || "application/octet-stream",
              fileName: file.name,
            }),
          },
        );
        const presign = await readApiJson<{
          uploadUrl?: string;
          storageKey?: string;
          message?: string | string[];
        }>(presignResponse);
        if (!presignResponse.ok || !presign.uploadUrl || !presign.storageKey)
          throw new Error(formatApiError(presign.message));
        const upload = await fetch(presign.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!upload.ok)
          throw new Error("Could not upload the receipt or proof.");
        receipt = {
          storageKey: presign.storageKey,
          mimeType: file.type,
          fileName: file.name,
        };
      }
      const response = await fetch(`${apiBaseUrl}/operations/bankings`, {
        method: "POST",
        headers: {
          Authorization: `${session.tokenType} ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchId,
          date: operationDate,
          type,
          amount: parsed,
          receiptStorageKey: receipt.storageKey,
          receiptMimeType: receipt.mimeType,
          receiptFileName: receipt.fileName,
        }),
      });
      const payload = await readApiJson<{ message?: string | string[] }>(
        response,
      );
      if (!response.ok) throw new Error(formatApiError(payload.message));
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the record.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-extrabold">
              Record Banking &amp; Mobile Money
            </h2>
            <p className="text-xs text-slate-500">
              This is recorded against the {operationDate} business day.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full bg-slate-100"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="space-y-4 p-5">
          <label className="block text-sm font-bold">
            Type *
            <select
              value={type}
              onChange={(event) => setType(event.target.value as TransferType)}
              className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-medium"
            >
              <option value="">Select type</option>
              <option value="BANKING">Banking</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
            </select>
          </label>
          <label className="block text-sm font-bold">
            Amount *
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="Enter amount"
              className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </label>
          <label className="block text-sm font-bold">
            Attachment (optional)
            <span className="mt-2 flex min-h-24 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-emerald-700">
              <Upload className="size-5" />
              {file?.name ?? "Add receipt or proof"}
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </span>
          </label>
          {error ? (
            <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="grid grid-cols-2 gap-3 border-t border-slate-200 p-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-11 rounded-lg border border-slate-300 font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 font-bold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}Save
          </button>
        </footer>
      </div>
    </div>
  );
}
