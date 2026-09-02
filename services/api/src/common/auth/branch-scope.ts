import type { AuthenticatedUser } from './authenticated-user';
import { BRANCH_PERMISSIONS } from '../../modules/branches/branches.permissions';

export function canSeeAllBranches(user: AuthenticatedUser) {
  return user.permissions.includes(BRANCH_PERMISSIONS.create);
}

/** Owners may request one branch; everyone else stays on their assigned branch. */
export function resolveListBranchId(
  user: AuthenticatedUser,
  requestedBranchId?: string | null,
): string | null {
  if (!canSeeAllBranches(user)) {
    return user.branchId ?? null;
  }
  const requested = requestedBranchId?.trim();
  return requested || null;
}
