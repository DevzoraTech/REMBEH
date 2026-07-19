import { io, type Socket } from "socket.io-client";

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
};

function socketBaseUrl() {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  return api.replace(/\/api\/v1\/?$/, "");
}

export function connectRealtime(accessToken: string): Socket {
  const socket = io(`${socketBaseUrl()}/realtime`, {
    transports: ["websocket"],
    auth: { token: accessToken },
  });

  return socket;
}
