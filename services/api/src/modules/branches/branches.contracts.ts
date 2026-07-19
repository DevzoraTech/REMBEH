import { PublicOtpDelivery } from '../notifications/notifications.contracts';

export type BranchStaffInviteStatus =
  | 'ACTIVE'
  | 'INVITE_PENDING'
  | 'INVITE_EXPIRED'
  | 'SUSPENDED'
  | 'PENDING_VERIFICATION';

export type BranchStaffMemberContract = {
  id: string;
  branchId: string;
  roleName: string;
  name: string;
  email: string;
  phone: string | null;
  publicId: string | null;
  status: string;
  inviteStatus: BranchStaffInviteStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  invitedAt: Date | null;
  inviteExpiresAt: Date | null;
};

export type BranchApiContract = {
  id: string;
  name: string;
  address: string;
  gpsLatitude: string | null;
  gpsLongitude: string | null;
  phone: string | null;
  workingHours: unknown;
  createdAt: Date;
  manager: BranchStaffMemberContract | null;
  staff: BranchStaffMemberContract[];
  staffSummary: {
    total: number;
    active: number;
    pendingInvites: number;
    expiredInvites: number;
  };
};

export type BranchResponseContract = {
  branch: BranchApiContract;
};

export type BranchListResponseContract = {
  branches: BranchApiContract[];
};

export type BranchStaffListResponseContract = {
  staff: BranchStaffMemberContract[];
};

export type BranchStaffUserContract = {
  id: string;
  branchId: string;
  roleName: string;
  name: string;
  email: string;
  phone: string | null;
  publicId: string | null;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
};

export type BranchStaffInvitationLookupResponseContract = {
  invitation: {
    email: string;
    name: string;
    roleName: string;
    branchName: string;
    branchAddress: string | null;
    workspaceName: string;
    workspaceCountry: string;
    workspaceCurrency: string;
    invitedByName: string | null;
    expiresAt: Date;
    status: 'OPEN';
  };
};

export type BranchStaffInvitationResponseContract = {
  staffUser: BranchStaffUserContract;
  emailDelivery: PublicOtpDelivery;
  invitation: {
    status: 'INVITE_PENDING';
    expiresAt: Date;
    /** Present only in local/dev when email delivery is unavailable. */
    acceptUrl?: string;
  };
};

export type BranchStaffInvitationAcceptanceResponseContract = {
  staffUser: BranchStaffUserContract;
  workspace: {
    id: string;
    name: string;
    status: string;
    currency: string;
    country: string;
  };
  branch: {
    id: string;
    name: string;
    address: string;
  } | null;
  session: {
    accessToken: string;
    expiresAt: string;
    tokenType: 'Bearer';
    permissions: string[];
  };
  onboarding: {
    required: boolean;
    nextStep: 'invite_agents' | 'operations';
  };
};
