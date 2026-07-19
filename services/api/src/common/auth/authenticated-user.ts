export type AuthenticatedUser = {
  userId: string;
  tenantId: string;
  branchId: string | null;
  email: string;
  displayName: string;
  permissions: string[];
};

export type AccessTokenPayload = {
  typ: 'access';
  sub: string;
  tenantId: string;
  iat: number;
  exp: number;
};

export type RefreshTokenPayload = {
  typ: 'refresh';
  sub: string;
  tenantId: string;
  iat: number;
  exp: number;
};
