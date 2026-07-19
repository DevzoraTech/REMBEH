import type { RembehSession, RembehUser } from "./auth-session";

export type OperatorRole = "owner" | "manager" | "staff";

export function resolveOperatorRole(
  session: RembehSession,
  user: RembehUser | null,
): OperatorRole {
  if (session.permissions.includes("branch.create")) {
    return "owner";
  }

  const roleName = user?.roleName?.toLowerCase() ?? "";

  // Field agents and other staff use mobile — never treat them as managers.
  if (roleName.includes("agent")) {
    return "staff";
  }

  if (
    roleName.includes("manager") ||
    session.permissions.includes("branch.staff.invite")
  ) {
    return "manager";
  }

  return "staff";
}

/** Roles an account owner invites onto a branch. */
export const OWNER_INVITE_ROLES = ["Branch Manager"] as const;

/** Roles a branch manager invites for day-to-day field/ops work. */
export const MANAGER_INVITE_ROLES = [
  "Agent",
  "Loan Officer",
  "Cashier",
  "Supervisor",
  "Recovery Officer",
] as const;
