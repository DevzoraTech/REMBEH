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
