export const AGENT_PERMISSIONS = {
  read: 'branch.staff.read',
  manage: 'user.activate',
  /** Managers who invite staff may also manage floats / status. */
  invite: 'branch.staff.invite',
} as const;

export const AGENT_READ_PERMISSIONS = [
  AGENT_PERMISSIONS.read,
  'user.read',
  'collection.read',
] as const;

export const AGENT_MANAGE_PERMISSIONS = [
  AGENT_PERMISSIONS.manage,
  AGENT_PERMISSIONS.invite,
  'branch.create',
] as const;
