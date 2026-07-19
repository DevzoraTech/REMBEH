export const BRANCH_PERMISSIONS = {
  read: 'branch.read',
  create: 'branch.create',
  update: 'branch.update',
  deactivate: 'branch.deactivate',
  staffRead: 'branch.staff.read',
  staffInvite: 'branch.staff.invite',
} as const;

export const BRANCH_PERMISSION_LIST = Object.values(BRANCH_PERMISSIONS);
