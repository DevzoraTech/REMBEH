export const BRANCH_EVENTS = {
  created: 'branch.created',
  updated: 'branch.updated',
  deactivated: 'branch.deactivated',
  staffInvited: 'branch.staff_invited',
  staffInvitationResent: 'branch.staff_invitation_resent',
  staffInvitationAccepted: 'branch.staff_invitation_accepted',
  staffActivated: 'branch.staff_activated',
  staffTransferred: 'branch.staff_transferred',
} as const;

export type BranchCreatedEventPayload = {
  branchId: string;
  createdByUserId: string;
  name: string;
};

export type BranchStaffInvitedEventPayload = {
  branchId: string;
  invitedUserId: string;
  invitedByUserId: string;
  roleName: string;
  email: string;
};

export type BranchStaffInvitationResentEventPayload = {
  branchId: string;
  invitedUserId: string;
  resentByUserId: string;
  email: string;
  resendCount: number;
};
