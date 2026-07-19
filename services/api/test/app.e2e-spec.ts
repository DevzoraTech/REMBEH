import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

type RegisterWorkspaceResponse = {
  workspace: {
    status: string;
    currency: string;
    country: string;
  };
  owner: {
    status: string;
    emailVerified: boolean;
    phoneVerified: boolean;
  };
  emailChallenge: {
    id: string;
    channel: string;
    resendCount: number;
    maxResends: number;
  };
  emailDelivery: {
    provider: string;
    delivered: boolean;
  };
};

type VerifyWorkspaceResponse = {
  workspace: {
    status: string;
  };
  owner: {
    status: string;
    emailVerified: boolean;
    phoneVerified: boolean;
  };
  verification: {
    emailVerified: boolean;
    phoneVerified: boolean;
    activated: boolean;
  };
  session: {
    tokenType: 'Bearer';
    accessToken: string;
    permissions: string[];
  } | null;
};

type BranchResponse = {
  branch: {
    id: string;
    name: string;
    address: string;
  };
};

type BranchStaffInvitationResponse = {
  staffUser: {
    id: string;
    roleName: string;
    email: string;
    status: string;
  };
  emailDelivery: {
    provider: string;
    delivered: boolean;
  };
};

type StaffInvitationAcceptanceResponse = {
  staffUser: {
    id: string;
    status: string;
    emailVerified: boolean;
    phoneVerified: boolean;
  };
  session: {
    tokenType: 'Bearer';
    accessToken: string;
    permissions: string[];
  };
};

type BranchListResponse = {
  branches: Array<{
    id: string;
    name: string;
  }>;
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.AUTH_PHONE_OTP_DEV_MODE = 'true';
    process.env.AUTH_EMAIL_OTP_TEST_CODE = '123456';
    process.env.AUTH_INVITATION_TEST_TOKEN = 'test-invitation-token-1234567890';
    process.env.OTP_RESEND_COOLDOWN_SECONDS = '0';
    process.env.RESEND_API_KEY = '';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          name: 'REMBEH API',
          status: 'online',
          architecture: 'modular-monolith',
        });
      });
  });

  it('rejects invalid and duplicate workspace registration identities', async () => {
    const stamp = Date.now();
    const phoneSuffix = stamp.toString().slice(-8);
    const payload = {
      businessName: `Identity Guard Finance ${stamp}`,
      country: 'Uganda',
      currency: 'UGX',
      ownerName: 'Identity Guard Owner',
      phone: `+2567${phoneSuffix}`,
      email: `Identity+${stamp}@Rembeh.Local`,
      password: 'Rembeh123!',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/workspace/register')
      .send({
        ...payload,
        phone: `0700${phoneSuffix.slice(-6)}`,
        email: `invalid-phone+${stamp}@rembeh.local`,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/auth/workspace/register')
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/workspace/register')
      .send({
        ...payload,
        businessName: `Duplicate Email Finance ${stamp}`,
        phone: `+2566${phoneSuffix}`,
        email: payload.email.toLowerCase(),
      })
      .expect(409)
      .expect(({ body }) => {
        const message = (body as { message?: unknown }).message;
        expect(message).toEqual(expect.stringContaining('email'));
      });

    await request(app.getHttpServer())
      .post('/api/v1/auth/workspace/register')
      .send({
        ...payload,
        businessName: `Duplicate Phone Finance ${stamp}`,
        email: `duplicate-phone+${stamp}@rembeh.local`,
      })
      .expect(409)
      .expect(({ body }) => {
        const message = (body as { message?: unknown }).message;
        expect(message).toEqual(expect.stringContaining('phone'));
      });
  });

  it('registers and activates a workspace owner by email OTP only', async () => {
    const stamp = Date.now();

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/workspace/register')
      .send({
        businessName: `E2E Finance ${stamp}`,
        country: 'Uganda',
        currency: 'UGX',
        ownerName: 'E2E Owner',
        phone: `+2567${stamp.toString().slice(-8)}`,
        email: `owner+${stamp}@rembeh.local`,
        password: 'Rembeh123!',
      })
      .expect(201);

    const registerBody = registerResponse.body as RegisterWorkspaceResponse;

    expect(registerBody).toMatchObject({
      workspace: {
        status: 'PENDING_VERIFICATION',
        currency: 'UGX',
        country: 'Uganda',
      },
      owner: {
        status: 'PENDING_VERIFICATION',
        emailVerified: false,
        phoneVerified: false,
      },
      emailChallenge: {
        channel: 'EMAIL',
        resendCount: 0,
      },
      emailDelivery: {
        provider: 'development',
        delivered: false,
      },
    });
    expect(registerBody).not.toHaveProperty('devOtpCode');
    expect(registerBody).not.toHaveProperty('phoneChallenge');
    expect(registerBody).not.toHaveProperty('phoneDelivery');
    expect(registerBody).not.toHaveProperty('phoneDevOtpCode');

    await request(app.getHttpServer()).get('/api/v1/branches').expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/workspace/verify-email')
      .send({
        challengeId: registerBody.emailChallenge.id,
        code: '000000',
      })
      .expect(400);

    const verifyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/workspace/verify-email')
      .send({
        challengeId: registerBody.emailChallenge.id,
        code: '123456',
      })
      .expect(201);

    const verifyBody = verifyResponse.body as VerifyWorkspaceResponse;

    expect(verifyBody).toMatchObject({
      workspace: {
        status: 'ACTIVE',
      },
      owner: {
        status: 'ACTIVE',
        emailVerified: true,
        phoneVerified: false,
      },
      verification: {
        emailVerified: true,
        phoneVerified: false,
        activated: true,
      },
    });
    expect(verifyBody.session?.accessToken).toEqual(expect.any(String));
    expect(verifyBody.session?.permissions).toContain('branch.create');
    expect(verifyBody.session?.permissions).toContain('branch.staff.invite');

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `owner+${stamp}@rembeh.local`,
        password: 'Rembeh123!',
      })
      .expect(201)
      .expect(({ body }) => {
        const loginBody = body as {
          user?: { email?: string; status?: string };
          session?: { tokenType?: string };
        };

        expect(loginBody).toMatchObject({
          user: {
            email: `owner+${stamp}@rembeh.local`,
            status: 'ACTIVE',
          },
          session: {
            tokenType: 'Bearer',
          },
        });
      });

    const emptyBranchesResponse = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set(
        'Authorization',
        `${verifyBody.session?.tokenType} ${verifyBody.session?.accessToken}`,
      )
      .expect(200);
    const emptyBranchesBody = emptyBranchesResponse.body as BranchListResponse;
    expect(emptyBranchesBody.branches).toHaveLength(0);

    const branchResponse = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set(
        'Authorization',
        `${verifyBody.session?.tokenType} ${verifyBody.session?.accessToken}`,
      )
      .send({
        branchName: 'Central Branch',
        branchAddress: 'Plot 12 Kampala Road, Kampala',
        branchPhone: '+256700123456',
        gpsLatitude: 0.347596,
        gpsLongitude: 32.58252,
        workingHours: {
          timezone: 'Africa/Kampala',
          days: [
            { day: 'monday', opensAt: '08:00', closesAt: '17:00' },
            { day: 'tuesday', opensAt: '08:00', closesAt: '17:00' },
          ],
        },
      })
      .expect(201);

    const branchBody = branchResponse.body as BranchResponse;

    expect(branchBody.branch).toMatchObject({
      name: 'Central Branch',
      address: 'Plot 12 Kampala Road, Kampala',
    });

    const managerStamp = `${stamp}1`;
    const managerInviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/branches/${branchBody.branch.id}/staff-invitations`)
      .set(
        'Authorization',
        `${verifyBody.session?.tokenType} ${verifyBody.session?.accessToken}`,
      )
      .send({
        roleName: 'Branch Manager',
        displayName: 'Branch Manager Invitee',
        email: `manager+${managerStamp}@rembeh.local`,
      })
      .expect(201);

    const managerInviteBody =
      managerInviteResponse.body as BranchStaffInvitationResponse;

    expect(managerInviteBody).toMatchObject({
      staffUser: {
        roleName: 'Branch Manager',
        status: 'INVITED',
      },
      emailDelivery: {
        provider: 'development',
        delivered: false,
      },
    });
    expect(managerInviteBody).not.toHaveProperty('token');

    await request(app.getHttpServer())
      .post('/api/v1/branch-staff/invitations/lookup')
      .send({
        token: 'test-invitation-token-1234567890',
      })
      .expect(201)
      .expect(({ body }) => {
        const lookupBody = body as {
          invitation?: {
            email?: string;
            name?: string;
            roleName?: string;
            branchName?: string;
          };
        };

        expect(lookupBody).toMatchObject({
          invitation: {
            email: `manager+${managerStamp}@rembeh.local`,
            name: 'Branch Manager Invitee',
            roleName: 'Branch Manager',
            branchName: 'Central Branch',
          },
        });
      });

    const managerAcceptResponse = await request(app.getHttpServer())
      .post('/api/v1/branch-staff/invitations/accept')
      .send({
        token: 'test-invitation-token-1234567890',
        phone: `+2567${managerStamp.toString().slice(-8)}`,
        password: 'Rembeh123!',
      })
      .expect(201);

    const managerAcceptBody =
      managerAcceptResponse.body as StaffInvitationAcceptanceResponse;

    expect(managerAcceptBody).toMatchObject({
      staffUser: {
        status: 'ACTIVE',
        emailVerified: true,
        phoneVerified: false,
      },
      session: {
        tokenType: 'Bearer',
      },
    });
    expect(managerAcceptBody.session.permissions).toContain(
      'branch.staff.invite',
    );

    const agentStamp = `${stamp}2`;
    const agentInviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/branches/${branchBody.branch.id}/staff-invitations`)
      .set(
        'Authorization',
        `${managerAcceptBody.session.tokenType} ${managerAcceptBody.session.accessToken}`,
      )
      .send({
        roleName: 'Agent',
        displayName: 'Agent Invitee',
        email: `agent+${agentStamp}@rembeh.local`,
      })
      .expect(201);

    const agentInviteBody =
      agentInviteResponse.body as BranchStaffInvitationResponse;

    expect(agentInviteBody).toMatchObject({
      staffUser: {
        roleName: 'Agent',
        status: 'INVITED',
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set(
        'Authorization',
        `${verifyBody.session?.tokenType} ${verifyBody.session?.accessToken}`,
      )
      .send({
        branchName: 'Central Branch',
        branchAddress: 'Another address',
      })
      .expect(409);

    const populatedBranchesResponse = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set(
        'Authorization',
        `${verifyBody.session?.tokenType} ${verifyBody.session?.accessToken}`,
      )
      .expect(200);
    const populatedBranchesBody =
      populatedBranchesResponse.body as BranchListResponse;
    expect(populatedBranchesBody.branches).toHaveLength(1);
    expect(populatedBranchesBody.branches[0]).toMatchObject({
      id: branchBody.branch.id,
      name: 'Central Branch',
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
