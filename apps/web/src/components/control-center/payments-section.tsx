"use client";

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  CreditCard,
  Download,
  Landmark,
  MessageSquareText,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { controlCenterFetch } from "../../lib/control-center-api";
import type { ControlCenterSession } from "../../lib/control-center-session";
import type {
  ControlCenterPaymentMethod,
  ControlCenterPaymentRecord,
  ControlCenterPaymentsResponse,
  ControlCenterPaymentStatus,
} from "./types";
import { ccMoney, ccNumber } from "./formatters";

type PaymentView =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "ALL";

type PaymentRecord = ControlCenterPaymentRecord;
type PaymentStatus = ControlCenterPaymentStatus;
type PaymentMethod = ControlCenterPaymentMethod;

const PAGE_SIZE = 10;

export function PaymentsSection({
  session,
}: {
  session: ControlCenterSession;
}) {
  const [data, setData] =
    useState<ControlCenterPaymentsResponse | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [loadError, setLoadError] =
    useState<string | null>(null);
  const [actionError, setActionError] =
    useState<string | null>(null);
  const [busyPaymentId, setBusyPaymentId] =
    useState<string | null>(null);

  const [view, setView] =
    useState<PaymentView>("PENDING");

  const [query, setQuery] = useState("");

  const [organization, setOrganization] =
    useState("ALL");

  const [plan, setPlan] =
    useState("ALL");

  const [dateFilter, setDateFilter] =
    useState("ALL");

  const [page, setPage] =
    useState(1);

  const [selected, setSelected] =
    useState<PaymentRecord | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const next =
        await controlCenterFetch<ControlCenterPaymentsResponse>(
          "/payments",
          session,
        );
      setData({
        ...next,
        payments: Array.isArray(next.payments) ? next.payments : [],
      });
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load payments.",
      );
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadPayments();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadPayments]);

  const rows = useMemo(
    () => data?.payments ?? [],
    [data?.payments],
  );

  const counts = useMemo(() => {
    return {
      all: rows.length,

      pending:
        rows.filter(
          (row) =>
            row.status === "PENDING",
        ).length,

      completed:
        rows.filter(
          (row) =>
            row.status === "COMPLETED",
        ).length,

      failed:
        rows.filter((row) =>
          [
            "FAILED",
            "CANCELLED",
            "REVERSED",
          ].includes(row.status),
        ).length,
    };
  }, [rows]);

  const organizations = useMemo(
    () =>
      [
        ...new Set(
          rows.map(
            (row) =>
              row.organizationName,
          ),
        ),
      ].sort((a, b) =>
        a.localeCompare(b),
      ),
    [rows],
  );

  const plans = useMemo(
    () =>
      [
        ...new Set(
          rows.map(
            (row) =>
              row.kind === "sms"
                ? "SMS"
                : row.planCode,
          ),
        ),
      ]
        .filter((value): value is string => Boolean(value))
        .sort((a, b) =>
          a.localeCompare(b),
        ),
    [rows],
  );

  const filteredRows =
    useMemo(() => {
      const needle =
        query
          .trim()
          .toLowerCase();

      return rows.filter((row) => {
        const matchesView =
          view === "ALL"
            ? true
            : view === "PENDING"
              ? row.status === "PENDING"
              : view === "COMPLETED"
                ? row.status === "COMPLETED"
                : [
                    "FAILED",
                    "CANCELLED",
                    "REVERSED",
                  ].includes(
                    row.status,
                  );

        const matchesSearch =
          !needle ||
          [
            row.organizationName,
            row.branchName,
            row.planCode,
            row.planName,
            row.kind,
            row.merchantReference,
            row.verificationCode,
            row.transactionId,
          ].some((value) =>
            (value ?? "")
              .toLowerCase()
              .includes(needle),
          );

        const matchesOrganization =
          organization === "ALL" ||
          row.organizationName ===
            organization;

        const matchesPlan =
          plan === "ALL" ||
          (plan === "SMS"
            ? row.kind === "sms"
            : row.planCode === plan);

        const matchesDate =
          matchesDateFilter(
            row.createdAt,
            dateFilter,
          );

        return (
          matchesView &&
          matchesSearch &&
          matchesOrganization &&
          matchesPlan &&
          matchesDate
        );
      });
    }, [
      dateFilter,
      organization,
      plan,
      query,
      rows,
      view,
    ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredRows.length /
          PAGE_SIZE,
      ),
    );

  const currentPage =
    Math.min(
      page,
      totalPages,
    );

  const pageRows =
    filteredRows.slice(
      (currentPage - 1) *
        PAGE_SIZE,
      currentPage *
        PAGE_SIZE,
    );

  const completedRevenue =
    data?.stats.completedRevenue ??
    0;

  const completedPayments =
    data?.stats.completedPayments ??
    counts.completed;

  function changeView(
    next: PaymentView,
  ) {
    setView(next);
    setPage(1);
  }

  async function verifyPayment(
    payment: PaymentRecord,
  ) {
    setBusyPaymentId(payment.id);
    setActionError(null);

    try {
      await controlCenterFetch(
        `/payments/${payment.id}/verify`,
        session,
        {
          method: "PATCH",
          body: JSON.stringify({
            kind: payment.kind,
            transactionId:
              payment.transactionId ??
              payment.verificationCode ??
              undefined,
          }),
        },
      );
      setSelected(null);
      await loadPayments();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not verify payment.",
      );
    } finally {
      setBusyPaymentId(null);
    }
  }

  async function rejectPayment(
    payment: PaymentRecord,
    reason: string,
  ) {
    setBusyPaymentId(payment.id);
    setActionError(null);

    try {
      await controlCenterFetch(
        `/payments/${payment.id}/reject`,
        session,
        {
          method: "PATCH",
          body: JSON.stringify({
            kind: payment.kind,
            reason,
          }),
        },
      );
      setSelected(null);
      await loadPayments();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not reject payment.",
      );
    } finally {
      setBusyPaymentId(null);
    }
  }

  function exportCsv() {
    const header = [
      "Organization",
      "Branch",
      "Product",
      "Amount",
      "Currency",
      "Payment Method",
      "Reference",
      "Verification Code",
      "Submitted",
      "Status",
      "Verified By",
    ];

    const body =
      filteredRows.map((row) => [
        row.organizationName,
        row.branchName,
        formatPaymentProduct(row),
        row.amount,
        row.currency,
        paymentMethodLabel(
          row.paymentMethod,
        ),
        row.merchantReference ?? "",
        row.verificationCode ?? "",
        row.createdAt,
        paymentStatusLabel(
          row.status,
        ),
        row.verifiedBy ?? "",
      ]);

    const csv = [
      header,
      ...body,
    ]
      .map((line) =>
        line
          .map((cell) => {
            const value =
              String(
                cell ?? "",
              ).replace(
                /"/g,
                '""',
              );

            return `"${value}"`;
          })
          .join(","),
      )
      .join("\n");

    const blob =
      new Blob(
        [csv],
        {
          type:
            "text/csv;charset=utf-8;",
        },
      );

    const url =
      URL.createObjectURL(
        blob,
      );

    const link =
      document.createElement(
        "a",
      );

    link.href = url;

    link.download =
      `rembeh-payments-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

    document.body.appendChild(
      link,
    );

    link.click();
    link.remove();

    URL.revokeObjectURL(
      url,
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[1500px]">
        <PageHeader />

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Clock3}
            tone="amber"
            label="Pending verification"
            value={ccNumber(
              counts.pending,
            )}
            secondary="Awaiting administrator action"
          />

          <MetricCard
            icon={CheckCircle2}
            tone="green"
            label="Completed payments"
            value={ccNumber(
              completedPayments,
            )}
            secondary="Successfully verified"
          />

          <MetricCard
            icon={TriangleAlert}
            tone="red"
            label="Failed / rejected"
            value={ccNumber(
              counts.failed,
            )}
            secondary="Requires follow-up"
          />

          <MetricCard
            icon={CreditCard}
            tone="blue"
            label="Subscription revenue"
            value={ccMoney(
              completedRevenue,
            )}
            secondary={`${ccNumber(
              completedPayments,
            )} completed ${
              completedPayments === 1
                ? "payment"
                : "payments"
            }`}
          />
        </div>

        <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <PaymentNavigation
            active={view}
            counts={counts}
            onChange={
              changeView
            }
          />

          {loadError ? (
            <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-[11px] font-medium text-red-700">
              {loadError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2.5 border-t border-[#edf1f4] px-4 py-3">
            <SearchControl
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
            />

            <SelectControl
              icon={Building2}
              value={
                organization
              }
              onChange={(value) => {
                setOrganization(
                  value,
                );

                setPage(1);
              }}
              options={[
                {
                  value:
                    "ALL",
                  label:
                    "All organizations",
                },

                ...organizations.map(
                  (name) => ({
                    value:
                      name,

                    label:
                      name,
                  }),
                ),
              ]}
            />

            <SelectControl
              icon={CreditCard}
              value={plan}
              onChange={(value) => {
                setPlan(value);
                setPage(1);
              }}
              options={[
                {
                  value:
                    "ALL",
                  label:
                    "All products",
                },

                ...plans.map(
                  (item) => ({
                    value:
                      item,

                    label:
                      formatPlan(
                        item,
                      ),
                  }),
                ),
              ]}
            />

            <SelectControl
              icon={CalendarDays}
              value={
                dateFilter
              }
              onChange={(value) => {
                setDateFilter(
                  value,
                );

                setPage(1);
              }}
              options={[
                {
                  value:
                    "ALL",
                  label:
                    "All dates",
                },
                {
                  value:
                    "TODAY",
                  label:
                    "Today",
                },
                {
                  value:
                    "7_DAYS",
                  label:
                    "Last 7 days",
                },
                {
                  value:
                    "30_DAYS",
                  label:
                    "Last 30 days",
                },
                {
                  value:
                    "90_DAYS",
                  label:
                    "Last 90 days",
                },
              ]}
            />

            <button
              type="button"
              onClick={
                exportCsv
              }
              disabled={
                !filteredRows.length
              }
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-[#cde8d9] bg-[#f2fbf6] px-3.5 text-[10.5px] font-semibold text-[#168650] transition hover:bg-[#eaf7ef] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="size-3.5" />
              Export
            </button>
          </div>

          {loading ? (
            <LoadingState />
          ) : view === "PENDING" ? (
            <PendingVerificationQueue
              records={
                pageRows
              }
              onReview={
                setSelected
              }
            />
          ) : (
            <PaymentHistoryTable
              records={
                pageRows
              }
              onReview={
                setSelected
              }
            />
          )}

          {filteredRows.length ? (
            <PaginationFooter
              page={
                currentPage
              }
              totalPages={
                totalPages
              }
              totalItems={
                filteredRows.length
              }
              firstItem={
                (currentPage -
                  1) *
                  PAGE_SIZE +
                1
              }
              lastItem={Math.min(
                currentPage *
                  PAGE_SIZE,
                filteredRows.length,
              )}
              onPageChange={
                setPage
              }
            />
          ) : null}
        </section>

        <VerificationNote />
      </div>

      {selected ? (
        <PaymentReviewDrawer
          payment={
            selected
          }
          busy={
            busyPaymentId === selected.id
          }
          error={
            actionError
          }
          onVerify={() =>
            void verifyPayment(selected)
          }
          onReject={(reason) =>
            void rejectPayment(selected, reason)
          }
          onClose={() =>
            setSelected(null)
          }
        />
      ) : null}
    </>
  );
}

function PageHeader() {
  const date =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        weekday:
          "long",
        day:
          "2-digit",
        month:
          "long",
        year:
          "numeric",
      },
    ).format(
      new Date(),
    );

  return (
    <div className="mb-5 flex items-start justify-between gap-5">
      <div>
        <h1 className="text-[27px] font-bold tracking-[-0.025em] text-[#111d36]">
          Payments
        </h1>

        <p className="mt-1 text-[12.5px] font-normal text-[#63718b]">
          Review payment submissions,
          verify transactions and
          resolve failed or rejected
          payments.
        </p>
      </div>

      <p className="mt-2 hidden text-[11px] font-medium text-[#61708a] md:block">
        {date}
      </p>
    </div>
  );
}

function PaymentNavigation({
  active,
  counts,
  onChange,
}: {
  active: PaymentView;

  counts: {
    all: number;
    pending: number;
    completed: number;
    failed: number;
  };

  onChange: (
    view: PaymentView,
  ) => void;
}) {
  const items: Array<{
    value: PaymentView;
    label: string;
    count: number;
  }> = [
    {
      value:
        "PENDING",
      label:
        "Pending verification",
      count:
        counts.pending,
    },
    {
      value:
        "COMPLETED",
      label:
        "Completed",
      count:
        counts.completed,
    },
    {
      value:
        "FAILED",
      label:
        "Failed / rejected",
      count:
        counts.failed,
    },
    {
      value:
        "ALL",
      label:
        "All transactions",
      count:
        counts.all,
    },
  ];

  return (
    <div className="flex min-h-[53px] items-end gap-1 overflow-x-auto px-3 sm:px-4">
      {items.map(
        (item) => {
          const selected =
            active ===
            item.value;

          return (
            <button
              key={
                item.value
              }
              type="button"
              onClick={() =>
                onChange(
                  item.value,
                )
              }
              className={`relative flex h-[52px] shrink-0 items-center gap-2 px-3 text-[11px] transition ${
                selected
                  ? "font-semibold text-[#168650]"
                  : "font-medium text-[#58677f] hover:text-[#17233c]"
              }`}
            >
              {item.label}

              <span
                className={`grid min-w-[21px] place-items-center rounded-full px-1.5 py-[2px] text-[9px] font-semibold ${
                  selected
                    ? "bg-[#e5f5eb] text-[#188651]"
                    : "bg-[#f1f3f6] text-[#6b7890]"
                }`}
              >
                {
                  item.count
                }
              </span>

              {selected ? (
                <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t-full bg-[#21935e]" />
              ) : null}
            </button>
          );
        },
      )}
    </div>
  );
}

function PendingVerificationQueue({
  records,
  onReview,
}: {
  records: PaymentRecord[];

  onReview: (
    record: PaymentRecord,
  ) => void;
}) {
  if (!records.length) {
    return (
      <EmptyState
        icon={
          ShieldCheck
        }
        title="No payments awaiting verification"
        description="There are currently no subscription payments requiring administrator review."
      />
    );
  }

  return (
    <div className="border-t border-[#edf1f4]">
      <div className="border-b border-[#edf1f4] bg-[#fcfdfe] px-4 py-3">
        <p className="text-[10.5px] font-semibold text-[#17233c]">
          Verification queue
        </p>

        <p className="mt-1 text-[9.5px] font-normal text-[#69768f]">
          Review each transaction
          against the relevant
          merchant account before
          confirming payment.
        </p>
      </div>

      <div className="divide-y divide-[#edf1f4]">
        {records.map(
          (
            record,
            index,
          ) => (
            <PendingPaymentRow
              key={
                record.id
              }
              record={
                record
              }
              index={
                index
              }
              onReview={() =>
                onReview(
                  record,
                )
              }
            />
          ),
        )}
      </div>
    </div>
  );
}

function PendingPaymentRow({
  record,
  index,
  onReview,
}: {
  record: PaymentRecord;
  index: number;
  onReview: () => void;
}) {
  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(130px,0.45fr)_minmax(170px,0.55fr)_minmax(180px,0.65fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <SmallIcon
          icon={
            record.kind === "sms"
              ? MessageSquareText
              : Landmark
          }
          tone={
            index % 3 ===
            0
              ? "green"
              : index %
                    3 ===
                  1
                ? "blue"
                : "amber"
          }
        />

        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-[#15223a]">
            {
              record.organizationName
            }
          </p>

          <p className="mt-1 truncate text-[9.5px] font-medium text-[#61708a]">
            {
              record.branchName
            }
          </p>

          <p className="mt-0.5 text-[9px] font-normal text-[#8a94a5]">
            Submitted{" "}
            {relativeTime(
              record.createdAt,
            )}
          </p>
        </div>
      </div>

      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.04em] text-[#8a94a5]">
          Amount
        </p>

        <p className="mt-1 text-[11px] font-semibold text-[#17233c]">
          {ccMoney(
            record.amount,
            record.currency,
          )}
        </p>

        <p className="mt-0.5 text-[9px] font-normal text-[#6b7890]">
          {formatPaymentProduct(record)}
        </p>
      </div>

      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.04em] text-[#8a94a5]">
          Payment method
        </p>

        <div className="mt-1">
          <PaymentMethodDisplay
            method={
              record.paymentMethod
            }
          />
        </div>
      </div>

      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.04em] text-[#8a94a5]">
          Reference
        </p>

        {record.merchantReference ||
        record.verificationCode ? (
          <div className="mt-1 space-y-1">
            {record.merchantReference ? (
              <CopyableReference
                value={
                  record.merchantReference
                }
              />
            ) : null}

            {record.verificationCode ? (
              <CopyableReference
                value={
                  record.verificationCode
                }
              />
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-[9.5px] font-medium text-[#8a95a6]">
            Not available
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={
          onReview
        }
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#cfe3d7] bg-[#f4faf6] px-3 text-[10px] font-semibold text-[#168650] transition hover:bg-[#eaf6ef]"
      >
        Review payment
        <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}

function PaymentHistoryTable({
  records,
  onReview,
}: {
  records: PaymentRecord[];

  onReview: (
    record: PaymentRecord,
  ) => void;
}) {
  if (!records.length) {
    return (
      <EmptyState
        icon={
          CreditCard
        }
        title="No payments found"
        description="No payments match the selected view and filters."
      />
    );
  }

  return (
    <div className="overflow-x-auto border-t border-[#edf1f4]">
      <table className="w-full min-w-[1050px] table-fixed text-left">
        <thead>
          <tr className="bg-[#fcfdfe] text-[9.5px] font-semibold text-[#56647d]">
            <th className="w-[25%] px-4 py-2.5">
              Organization / Branch
            </th>

            <th className="w-[12%] px-3 py-2.5">
              Product
            </th>

            <th className="w-[14%] px-3 py-2.5">
              Amount
            </th>

            <th className="w-[14%] px-3 py-2.5">
              Method
            </th>

            <th className="w-[13%] px-3 py-2.5">
              Status
            </th>

            <th className="w-[14%] px-3 py-2.5">
              Submitted
            </th>

            <th className="w-[8%] px-3 py-2.5 text-right">
              Action
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-[#edf1f4]">
          {records.map(
            (
              record,
              index,
            ) => (
              <tr
                key={
                  record.id
                }
                className="h-[66px] transition hover:bg-[#fbfcfd]"
              >
                <td className="px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <SmallIcon
                      icon={
                        record.kind === "sms"
                          ? MessageSquareText
                          : Landmark
                      }
                      tone={
                        index %
                            3 ===
                          0
                          ? "green"
                          : index %
                                3 ===
                              1
                            ? "blue"
                            : "amber"
                      }
                    />

                    <div className="min-w-0">
                      <p className="truncate text-[10.5px] font-semibold text-[#17233c]">
                        {
                          record.organizationName
                        }
                      </p>

                      <p className="mt-1 truncate text-[9.5px] font-normal text-[#64738d]">
                        {
                          record.branchName
                        }
                      </p>
                    </div>
                  </div>
                </td>

                <td className="px-3 py-2.5 text-[10.5px] font-medium text-[#26344d]">
                  {formatPaymentProduct(record)}
                </td>

                <td className="px-3 py-2.5 text-[10.5px] font-semibold text-[#17233c]">
                  {ccMoney(
                    record.amount,
                    record.currency,
                  )}
                </td>

                <td className="px-3 py-2.5">
                  <PaymentMethodDisplay
                    method={
                      record.paymentMethod
                    }
                  />
                </td>

                <td className="px-3 py-2.5">
                  <PaymentStatusBadge
                    status={
                      record.status
                    }
                  />
                </td>

                <td className="px-3 py-2.5">
                  <p className="text-[9.5px] font-medium text-[#26354f]">
                    {formatDate(
                      record.createdAt,
                    )}
                  </p>

                  <p className="mt-1 text-[9px] font-normal text-[#68768f]">
                    {formatTime(
                      record.createdAt,
                    )}
                  </p>
                </td>

                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      onReview(
                        record,
                      )
                    }
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold text-[#168650] transition hover:bg-[#f0f8f3]"
                  >
                    View
                    <ChevronRight className="size-3.5" />
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function PaymentReviewDrawer({
  payment,
  busy,
  error,
  onVerify,
  onReject,
  onClose,
}: {
  payment: PaymentRecord;
  busy: boolean;
  error: string | null;
  onVerify: () => void;
  onReject: (reason: string) => void;
  onClose: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const canReject = reason.trim().length >= 3 && !busy;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        className="absolute inset-0 bg-[#0f172a]/30 backdrop-blur-[1px]"
        onClick={
          onClose
        }
        aria-label="Close payment review"
      />

      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[490px] flex-col border-l border-[#dfe5eb] bg-white shadow-[-12px_0_35px_rgba(15,23,42,0.1)]">
        <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-[#e7ebef] px-5">
          <div>
            <p className="text-[13px] font-semibold text-[#15223a]">
              {payment.status ===
              "PENDING"
                ? "Payment verification"
                : "Payment details"}
            </p>

            <p className="mt-0.5 text-[9.5px] font-normal text-[#718099]">
              Review transaction
              information and
              payment outcome.
            </p>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="grid size-8 place-items-center rounded-md text-[#64738d] transition hover:bg-[#f4f6f8]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-[#edf1f4] px-5 py-5">
            <div className="flex items-start gap-3">
              <SmallIcon
                icon={
                  payment.kind === "sms"
                    ? MessageSquareText
                    : Landmark
                }
                tone={payment.kind === "sms" ? "blue" : "green"}
              />

              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#15223a]">
                  {
                    payment.organizationName
                  }
                </p>

                <p className="mt-1 text-[10px] font-medium text-[#61708a]">
                  {
                    payment.branchName
                  }
                </p>
              </div>
            </div>

            <div className="mt-4">
              <PaymentStatusBadge
                status={
                  payment.status
                }
              />
            </div>
          </div>

          <DrawerSection title="Payment">
            <DetailRow
              label="Submitted amount"
              value={ccMoney(
                payment.amount,
                payment.currency,
              )}
            />

            <DetailRow
              label="Expected amount"
              value={
                payment.expectedAmount ===
                null
                  ? "Not available"
                  : ccMoney(
                      payment.expectedAmount,
                      payment.currency,
                    )
              }
            />

            <DetailRow
              label="Product"
              value={formatPaymentProduct(payment)}
            />

            <DetailRow
              label="Submitted"
              value={`${formatDate(
                payment.createdAt,
              )} · ${formatTime(
                payment.createdAt,
              )}`}
            />
          </DrawerSection>

          <DrawerSection title="Payment method">
            <div className="pb-1">
              <PaymentMethodDisplay
                method={
                  payment.paymentMethod
                }
              />
            </div>

            <DetailRow
              label="Merchant reference"
              value={
                payment.merchantReference ??
                "Not available"
              }
            />

            <DetailRow
              label="Verification code"
              value={
                payment.verificationCode ??
                "Not available"
              }
            />

            <DetailRow
              label="Submitted transaction ID"
              value={
                payment.transactionId ??
                "Not available"
              }
            />

            <DetailRow
              label="Merchant code"
              value={
                payment.merchantCode ??
                "Not available"
              }
            />
          </DrawerSection>

          {payment.status ===
          "COMPLETED" ? (
            <DrawerSection title="Verification">
              <DetailRow
                label="Verified by"
                value={
                  payment.verifiedBy ??
                  "Not available"
                }
              />

              <DetailRow
                label="Verified at"
                value={
                  payment.verifiedAt
                    ? `${formatDate(
                        payment.verifiedAt,
                      )} · ${formatTime(
                        payment.verifiedAt,
                      )}`
                    : "Not available"
                }
              />
            </DrawerSection>
          ) : null}

          {payment.status ===
          "PENDING" ? (
            <div className="mx-5 my-5 rounded-lg border border-[#f0dfc4] bg-[#fffaf1] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#c77917]" />

                <div>
                  <p className="text-[10.5px] font-semibold text-[#4a371c]">
                    Verification required
                  </p>

                  <p className="mt-1 text-[9.5px] font-normal leading-4 text-[#7b6748]">
                    Confirm this transaction
                    against the relevant
                    MTN or Airtel merchant
                    account before approving
                    it.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[#e7ebef] bg-[#fbfcfd] px-5 py-4">
          {payment.status ===
          "PENDING" ? (
            <div className="space-y-3">
              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-medium text-red-700">
                  {error}
                </div>
              ) : null}

              {rejecting ? (
                <div className="rounded-lg border border-[#efcaca] bg-white p-3">
                  <label className="text-[10px] font-semibold text-[#713434]">
                    Rejection reason
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={3}
                      className="mt-2 w-full resize-none rounded-md border border-[#efcaca] px-3 py-2 text-[10.5px] font-medium text-[#27354f] outline-none focus:border-[#c64040]"
                      placeholder="For example: transaction not found in merchant account"
                    />
                  </label>
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy || (rejecting && !canReject)}
                  onClick={() => {
                    if (!rejecting) {
                      setRejecting(true);
                      return;
                    }
                    if (canReject) {
                      onReject(reason.trim());
                    }
                  }}
                  className="h-9 rounded-md border border-[#efcaca] bg-white px-3.5 text-[10px] font-semibold text-[#c64040] transition hover:bg-[#fff5f5] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {rejecting ? "Confirm rejection" : "Reject payment"}
                </button>

                <button
                  type="button"
                  disabled={busy || rejecting || !payment.canReview}
                  onClick={onVerify}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-3.5 text-[10px] font-semibold text-white transition hover:bg-[#147849] disabled:cursor-not-allowed disabled:opacity-60"
                  title={
                    payment.canReview
                      ? undefined
                      : "Only pending manual merchant payments can be verified here"
                  }
                >
                  <CheckCircle2 className="size-3.5" />
                  {busy ? "Working..." : "Verify payment"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={
                  onClose
                }
                className="h-9 rounded-md border border-[#dce2e8] bg-white px-3.5 text-[10px] font-semibold text-[#526078] transition hover:bg-[#f6f8fa]"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function PaymentMethodDisplay({
  method,
}: {
  method: PaymentMethod;
}) {
  if (
    method === "MTN"
  ) {
    return (
      <div className="flex items-center gap-2">
        <span className="grid h-[24px] w-[38px] shrink-0 place-items-center overflow-hidden rounded-[4px] border border-[#f1d900] bg-[#ffdc00]">
          <img
            src="/assets/payments/mtn.png"
            alt="MTN"
            className="max-h-[20px] max-w-[34px] object-contain"
          />
        </span>

        <span className="text-[10px] font-semibold text-[#24324b]">
          MTN Mobile Money
        </span>
      </div>
    );
  }

  if (
    method === "AIRTEL"
  ) {
    return (
      <div className="flex items-center gap-2">
        <span className="grid h-[24px] w-[38px] shrink-0 place-items-center overflow-hidden rounded-[4px] border border-[#eadadd] bg-white">
          <img
            src="/assets/payments/airtel.png"
            alt="Airtel"
            className="max-h-[20px] max-w-[34px] object-contain"
          />
        </span>

        <span className="text-[10px] font-semibold text-[#24324b]">
          Airtel Money
        </span>
      </div>
    );
  }

  if (
    method === "OTHER"
  ) {
    return (
      <span className="text-[10px] font-medium text-[#526078]">
        Other
      </span>
    );
  }

  return (
    <span className="text-[9.5px] font-medium text-[#8b96a7]">
      Not available
    </span>
  );
}

function CopyableReference({
  value,
}: {
  value: string;
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        value,
      );
    } catch {
      // Clipboard unavailable.
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <p className="truncate text-[9.5px] font-semibold text-[#26354f]">
        {value}
      </p>

      <button
        type="button"
        onClick={
          copy
        }
        className="grid size-5 shrink-0 place-items-center rounded text-[#718099] transition hover:bg-[#f0f3f6] hover:text-[#17233c]"
      >
        <Copy className="size-3" />
      </button>
    </div>
  );
}

function VerificationNote() {
  return (
    <section className="mt-4 flex flex-wrap items-start justify-between gap-4 rounded-[10px] border border-[#dfe5eb] bg-white px-4 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-[#eaf3ff] text-[#3475de]">
          <ShieldCheck className="size-3.5" />
        </div>

        <div>
          <p className="text-[10.5px] font-semibold text-[#17233c]">
            Payment verification
          </p>

          <p className="mt-1 max-w-4xl text-[9.5px] font-normal leading-4 text-[#69768e]">
            Verify only after confirming
            the transaction on the
            corresponding merchant
            account. Verification will
            eventually activate or renew
            the branch subscription
            automatically.
          </p>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  icon,
  tone,
  label,
  value,
  secondary,
}: {
  icon: LucideIcon;
  tone: IconTone;
  label: string;
  value: string;
  secondary: string;
}) {
  return (
    <section className="flex min-h-[108px] items-center gap-4 rounded-[10px] border border-[#dfe5eb] bg-white px-4">
      <LargeIcon
        icon={icon}
        tone={tone}
      />

      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-[#5e6c84]">
          {label}
        </p>

        <p className="mt-1 truncate text-[22px] font-bold leading-7 tracking-[-0.02em] text-[#101d37]">
          {value}
        </p>

        <p className="mt-1 text-[9.5px] font-normal text-[#68758d]">
          {secondary}
        </p>
      </div>
    </section>
  );
}

function SearchControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (
    value: string,
  ) => void;
}) {
  return (
    <label className="flex h-9 min-w-[260px] flex-1 items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3 focus-within:border-[#87bfa1] focus-within:ring-2 focus-within:ring-[#e6f4eb]">
      <Search className="size-3.5 shrink-0 text-[#64738c]" />

      <input
        type="search"
        value={
          value
        }
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        placeholder="Search organization, branch or reference..."
        className="min-w-0 flex-1 bg-transparent text-[10.5px] font-normal text-[#17233c] outline-none placeholder:text-[#8c97a9]"
      />
    </label>
  );
}

function SelectControl({
  icon: Icon,
  value,
  onChange,
  options,
}: {
  icon: LucideIcon;
  value: string;
  onChange: (
    value: string,
  ) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
}) {
  return (
    <label className="relative flex h-9 min-w-[180px] items-center gap-2 rounded-md border border-[#dfe5eb] bg-white px-3">
      <Icon className="size-3.5 shrink-0 text-[#52627c]" />

      <select
        value={
          value
        }
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        className="min-w-0 flex-1 appearance-none bg-transparent pr-5 text-[10px] font-medium text-[#34425b] outline-none"
      >
        {options.map(
          (option) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {
                option.label
              }
            </option>
          ),
        )}
      </select>

      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-[#68768f]" />
    </label>
  );
}

function PaymentStatusBadge({
  status,
}: {
  status: PaymentStatus;
}) {
  const styles =
    status === "COMPLETED"
      ? "bg-[#eaf6ee] text-[#1b804e]"
      : status === "PENDING"
        ? "bg-[#fff3df] text-[#ba6a12]"
        : status === "FAILED" ||
            status === "CANCELLED" ||
            status === "REVERSED"
          ? "bg-[#fff0f0] text-[#c94040]"
          : "bg-[#eef2f6] text-[#59677d]";

  return (
    <span
      className={`inline-flex min-h-[21px] items-center rounded-[5px] px-2 text-[9px] font-semibold ${styles}`}
    >
      {paymentStatusLabel(
        status,
      )}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-[250px] place-items-center border-t border-[#edf1f4] px-6 py-12 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-[#eef6f1] text-[#168650]">
          <Icon className="size-5" />
        </div>

        <p className="mt-3 text-[12px] font-semibold text-[#17233c]">
          {title}
        </p>

        <p className="mx-auto mt-1 max-w-md text-[10px] font-normal leading-5 text-[#6b7890]">
          {description}
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-0 border-t border-[#edf1f4]">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="grid gap-4 border-b border-[#edf1f4] px-4 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(130px,0.45fr)_minmax(170px,0.55fr)_minmax(180px,0.65fr)_auto]"
        >
          <div className="h-9 rounded-md bg-[#eef2f5]" />
          <div className="h-9 rounded-md bg-[#f3f6f8]" />
          <div className="h-9 rounded-md bg-[#eef2f5]" />
          <div className="h-9 rounded-md bg-[#f3f6f8]" />
          <div className="h-9 rounded-md bg-[#eef2f5]" />
        </div>
      ))}
    </div>
  );
}

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children:
    React.ReactNode;
}) {
  return (
    <section className="border-b border-[#edf1f4] px-5 py-5">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-[#728097]">
        {title}
      </p>

      <div className="space-y-3">
        {children}
      </div>
    </section>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[10px] font-normal text-[#718099]">
        {label}
      </span>

      <span className="max-w-[260px] text-right text-[10.5px] font-semibold text-[#26344d]">
        {value}
      </span>
    </div>
  );
}

function PaginationFooter({
  page,
  totalPages,
  totalItems,
  firstItem,
  lastItem,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  firstItem: number;
  lastItem: number;
  onPageChange: (
    page: number,
  ) => void;
}) {
  const pages =
    paginationPages(
      page,
      totalPages,
    );

  return (
    <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-3 border-t border-[#edf1f4] px-4 py-2">
      <p className="text-[9.5px] font-normal text-[#68768f]">
        Showing {firstItem} to{" "}
        {lastItem} of{" "}
        {totalItems}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={
            page <= 1
          }
          onClick={() =>
            onPageChange(
              page - 1,
            )
          }
          className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] bg-white text-[#60708a] disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        {pages.map(
          (
            item,
            index,
          ) =>
            item ===
            "..." ? (
              <span
                key={`ellipsis-${index}`}
                className="grid size-8 place-items-center text-[10px] text-[#748097]"
              >
                …
              </span>
            ) : (
              <button
                key={
                  item
                }
                type="button"
                onClick={() =>
                  onPageChange(
                    item,
                  )
                }
                className={`grid size-8 place-items-center rounded-md border text-[10px] font-semibold ${
                  item ===
                  page
                    ? "border-[#24915d] bg-[#f0f8f3] text-[#168650]"
                    : "border-[#dfe5eb] bg-white text-[#53627a]"
                }`}
              >
                {
                  item
                }
              </button>
            ),
        )}

        <button
          type="button"
          disabled={
            page >=
            totalPages
          }
          onClick={() =>
            onPageChange(
              page + 1,
            )
          }
          className="grid size-8 place-items-center rounded-md border border-[#dfe5eb] bg-white text-[#60708a] disabled:opacity-40"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

type IconTone =
  | "green"
  | "blue"
  | "amber"
  | "red";

function LargeIcon({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon;
  tone: IconTone;
}) {
  return (
    <span
      className={`grid size-[52px] shrink-0 place-items-center rounded-[11px] ${iconTone(
        tone,
      )}`}
    >
      <Icon
        className="size-[22px]"
        strokeWidth={1.9}
      />
    </span>
  );
}

function SmallIcon({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon;
  tone: IconTone;
}) {
  return (
    <span
      className={`grid size-[35px] shrink-0 place-items-center rounded-[8px] ${iconTone(
        tone,
      )}`}
    >
      <Icon
        className="size-[16px]"
        strokeWidth={1.9}
      />
    </span>
  );
}

function iconTone(
  tone: IconTone,
) {
  if (
    tone === "blue"
  ) {
    return "bg-[#edf4ff] text-[#276de9]";
  }

  if (
    tone === "amber"
  ) {
    return "bg-[#fff3df] text-[#e38012]";
  }

  if (
    tone === "red"
  ) {
    return "bg-[#fff0f0] text-[#df4545]";
  }

  return "bg-[#eaf6ee] text-[#198b55]";
}

function paymentStatusLabel(
  status: PaymentStatus,
) {
  if (
    status ===
    "PENDING"
  ) {
    return "Pending verification";
  }

  if (
    status ===
    "COMPLETED"
  ) {
    return "Completed";
  }

  if (
    status ===
    "FAILED"
  ) {
    return "Failed / rejected";
  }

  if (
    status ===
    "CANCELLED"
  ) {
    return "Cancelled";
  }

  if (
    status ===
    "REVERSED"
  ) {
    return "Reversed";
  }

  return "Unknown";
}

function paymentMethodLabel(
  method: PaymentMethod,
) {
  if (
    method === "MTN"
  ) {
    return "MTN Mobile Money";
  }

  if (
    method === "AIRTEL"
  ) {
    return "Airtel Money";
  }

  if (
    method === "OTHER"
  ) {
    return "Other";
  }

  return "";
}

function matchesDateFilter(
  value: string,
  filter: string,
) {
  if (
    filter === "ALL"
  ) {
    return true;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return false;
  }

  const now =
    new Date();

  const today =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

  const transactionDate =
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );

  const difference =
    (today.getTime() -
      transactionDate.getTime()) /
    86_400_000;

  if (
    filter === "TODAY"
  ) {
    return (
      difference === 0
    );
  }

  if (
    filter === "7_DAYS"
  ) {
    return (
      difference >= 0 &&
      difference <= 7
    );
  }

  if (
    filter === "30_DAYS"
  ) {
    return (
      difference >= 0 &&
      difference <= 30
    );
  }

  if (
    filter === "90_DAYS"
  ) {
    return (
      difference >= 0 &&
      difference <= 90
    );
  }

  return true;
}

function relativeTime(
  value: string,
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "recently";
  }

  const difference =
    Date.now() -
    date.getTime();

  const minutes =
    Math.floor(
      difference /
        60_000,
    );

  if (
    minutes < 1
  ) {
    return "just now";
  }

  if (
    minutes < 60
  ) {
    return `${minutes} ${
      minutes === 1
        ? "minute"
        : "minutes"
    } ago`;
  }

  const hours =
    Math.floor(
      minutes / 60,
    );

  if (
    hours < 24
  ) {
    return `${hours} ${
      hours === 1
        ? "hour"
        : "hours"
    } ago`;
  }

  const days =
    Math.floor(
      hours / 24,
    );

  return `${days} ${
    days === 1
      ? "day"
      : "days"
  } ago`;
}

function formatPlan(
  value: string | null,
) {
  if (!value) {
    return "No plan";
  }

  const normalized =
    value.toUpperCase();

  if (
    normalized.includes(
      "6M",
    ) ||
    normalized.includes(
      "6_MONTH",
    )
  ) {
    return "6 Months";
  }

  if (
    normalized.includes(
      "3M",
    ) ||
    normalized.includes(
      "3_MONTH",
    )
  ) {
    return "3 Months";
  }

  if (
    normalized.includes(
      "MONTH",
    ) ||
    normalized ===
      "PRO"
  ) {
    return "Monthly";
  }

  return value
    .replace(
      /^PRO_?/i,
      "",
    )
    .replace(
      /_/g,
      " ",
    );
}

function formatPaymentProduct(
  payment: PaymentRecord,
) {
  if (payment.kind === "sms") {
    const units =
      payment.smsUnits === null
        ? "SMS"
        : `${ccNumber(payment.smsUnits)} SMS`;

    return payment.planName
      ? `${payment.planName} · ${units}`
      : units;
  }

  return formatPlan(payment.planCode);
}

function formatDate(
  value: string,
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day:
        "2-digit",
      month:
        "short",
      year:
        "numeric",
    },
  ).format(date);
}

function formatTime(
  value: string,
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      hour:
        "2-digit",
      minute:
        "2-digit",
    },
  ).format(date);
}

function paginationPages(
  current: number,
  total: number,
): Array<
  number | "..."
> {
  if (
    total <= 5
  ) {
    return Array.from(
      {
        length:
          total,
      },
      (_, index) =>
        index + 1,
    );
  }

  if (
    current <= 3
  ) {
    return [
      1,
      2,
      3,
      "...",
      total,
    ];
  }

  if (
    current >=
    total - 2
  ) {
    return [
      1,
      "...",
      total - 2,
      total - 1,
      total,
    ];
  }

  return [
    1,
    "...",
    current,
    "...",
    total,
  ];
}
