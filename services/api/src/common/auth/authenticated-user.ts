export type AuthenticatedUser = {
  userId: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  displayName: string;
  permissions: string[];
  /** Active auth session id when the access token carries one. */
  sessionId?: string | null;
};

export type AccessTokenPayload = {
  typ: 'access';
  sub: string;
  tenantId: string;
  /** Auth session id — used to revoke individual devices. */
  sid?: string;
  iat: number;
  exp: number;
};

export type RefreshTokenPayload = {
  typ: 'refresh';
  sub: string;
  tenantId: string;
  /** Auth session id — used to rotate / revoke refresh tokens. */
  sid?: string;
  iat: number;
  exp: number;
};
