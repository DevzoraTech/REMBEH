import { PublicOtpDelivery } from '../notifications/notifications.contracts';

export type OtpChallengeContract = {
  id: string;
  channel: string;
  destination: string;
  expiresAt: Date;
  resendAvailableAt: Date;
  resendCount: number;
  maxResends: number;
};

export type WorkspaceOwnerContract = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
};

export type WorkspaceContract = {
  id: string;
  name: string;
  status: string;
  currency: string;
  country: string;
};

export type WorkspaceRegistrationResponse = {
  workspace: WorkspaceContract;
  owner: WorkspaceOwnerContract;
  emailChallenge: OtpChallengeContract;
  emailDelivery: PublicOtpDelivery;
};

export type WorkspaceEmailOtpResendResponse = {
  emailChallenge: OtpChallengeContract;
  emailDelivery: PublicOtpDelivery;
};

export type WorkspaceOtpVerificationResponse = {
  workspace: WorkspaceContract;
  owner: Required<WorkspaceOwnerContract>;
  verification: {
    emailVerified: boolean;
    phoneVerified: boolean;
    activated: boolean;
  };
  session: {
    accessToken: string;
    expiresAt: string;
    tokenType: 'Bearer';
    permissions: string[];
  } | null;
};
