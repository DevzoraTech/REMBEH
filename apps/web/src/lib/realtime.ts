import { io, type Socket } from "socket.io-client";
import { apiBaseUrl } from "./api";

export type LoanApplicationEvent = {
  applicationId: string;
  tenantId: string;
  branchId: string;
  status: string;
  clientName: string;
  phone: string;
  amountRequested: number | null;
  interestRatePercent: number | null;
  registeredAt: string;
  synced: boolean;
  officerUserId: string;
};

export type PaymentMadeEvent = {
  repaymentId: string;
  loanId: string;
  customerId: string;
  tenantId: string;
  branchId: string;
  clientName: string;
  phone: string;
  amount: number;
  amountPaid?: number;
  loanAmount?: number;
  outstanding?: number;
  recordedAt: string;
  method?: string;
  note?: string | null;
  synced?: boolean;
  recordedByUserId?: string;
  recordedByName?: string;
  agentPhotoUrl?: string | null;
};

export type SubscriptionPaymentUpdatedEvent = {
  paymentId: string;
  tenantId: string;
  branchId: string;
  status: string;
  payment: {
    id: string;
    date: string;
    branchId: string;
    branchName: string;
    kind?: "subscription" | "sms";
    transaction: string;
    periodLabel: string | null;
    amount: number;
    currency: string;
    planCode?: string | null;
    planDurationMonths?: number | null;
    activeUntil?: string | null;
    transactionId?: string | null;
    verifiedAt?: string | null;
    verifiedByName?: string | null;
    failureReason?: string | null;
    credits?: number | null;
    paymentMethod: string;
    status: string;
    receipt: string | null;
    canRetry: boolean;
    canCancel?: boolean;
    bundleId?: string | null;
  };
};

function socketBaseUrl() {
  return apiBaseUrl.replace(/\/api\/v1\/?$/, "");
}

type SharedSocket = {
  socket: Socket;
  references: number;
  disconnect: () => Socket;
};

const sharedSockets = new Map<string, SharedSocket>();

export function connectRealtime(accessToken: string): Socket {
  const existing = sharedSockets.get(accessToken);
  if (existing) {
    existing.references += 1;
    return existing.socket;
  }

  const socket = io(`${socketBaseUrl()}/realtime`, {
    transports: ["websocket"],
    auth: { token: accessToken },
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 15_000,
    randomizationFactor: 0.5,
  });

  const nativeDisconnect = socket.disconnect.bind(socket);
  const shared: SharedSocket = {
    socket,
    references: 1,
    disconnect: nativeDisconnect,
  };
  sharedSockets.set(accessToken, shared);

  // Existing callers own one reference and call disconnect during cleanup.
  // Preserve that API while keeping the underlying transport alive until the
  // final consumer has released it.
  socket.disconnect = (() => {
    const current = sharedSockets.get(accessToken);
    if (!current) return socket;
    current.references = Math.max(0, current.references - 1);
    if (current.references === 0) {
      sharedSockets.delete(accessToken);
      return current.disconnect();
    }
    return socket;
  }) as Socket["disconnect"];

  return socket;
}
