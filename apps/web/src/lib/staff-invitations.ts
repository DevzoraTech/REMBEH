import { apiBaseUrl, formatApiError, readApiJson } from "./api";

type SessionAuth = {
  tokenType: string;
  accessToken: string;
};

export function canResendStaffInvite(input: {
  status?: string | null;
  inviteStatus?: string | null;
}) {
  const status = (input.status ?? "").toUpperCase();
  const inviteStatus = (input.inviteStatus ?? "").toUpperCase();
  if (status === "INVITED") return true;
  return inviteStatus === "INVITE_PENDING" || inviteStatus === "INVITE_EXPIRED";
}

export async function resendStaffInvitation(input: {
  session: SessionAuth;
  branchId: string;
  userId: string;
}) {
  const response = await fetch(
    `${apiBaseUrl}/branches/${input.branchId}/staff/${input.userId}/invitation/resend`,
    {
      method: "POST",
      headers: {
        Authorization: `${input.session.tokenType} ${input.session.accessToken}`,
      },
    },
  );
  const payload = await readApiJson<{ message?: string | string[] }>(response);
  if (!response.ok) {
    throw new Error(formatApiError(payload.message));
  }
  return payload;
}
