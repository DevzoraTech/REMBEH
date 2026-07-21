import { UnauthorizedException } from '@nestjs/common';
import { TenantStatus, UserStatus } from '@prisma/client';

type StatusUser = {
  status: UserStatus;
  tenant: {
    name: string;
    status: TenantStatus;
  };
};

/**
 * Returns a login/refresh error when the user or tenant cannot authenticate.
 * ACTIVE users with an ACTIVE tenant return null.
 */
export function resolveAuthStatusBlock(user: StatusUser): string | null {
  if (user.tenant.status !== TenantStatus.ACTIVE) {
    return 'Account or user is not active.';
  }

  if (user.status === UserStatus.ACTIVE) {
    return null;
  }

  if (user.status === UserStatus.SUSPENDED) {
    return `You were suspended from "${user.tenant.name}". Contact your manager.`;
  }

  if (user.status === UserStatus.INACTIVE) {
    return 'Your account is deactivated. Contact your supervisor.';
  }

  return 'Account or user is not active.';
}

export function assertUserCanAuthenticate(user: StatusUser): void {
  const message = resolveAuthStatusBlock(user);
  if (message) {
    throw new UnauthorizedException(message);
  }
}
