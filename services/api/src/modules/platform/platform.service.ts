import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { REMBEH_MODULES } from './module-registry';

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    let database: 'up' | 'down' = 'down';

    try {
      await this.prisma.ping();
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'rembeh-platform',
      database,
      timestamp: new Date().toISOString(),
    };
  }

  getModules() {
    return {
      strategy: 'account-pays-for-enabled-modules',
      modules: REMBEH_MODULES,
    };
  }

  getWorkspaceBlueprint() {
    return {
      hierarchy: [
        'platform-super-admin',
        'account-owner',
        'company-admin',
        'regional-manager',
        'branch-manager',
        'supervisor',
        'cashier',
        'loan-officer',
        'field-agent',
        'auditor',
        'viewer',
      ],
      registrationFlow: [
        'company-registration',
        'email-otp-verification',
        'account-created',
        'owner-activated',
        'branch-created',
        'branch-manager-invited',
        'team-invited',
      ],
      tenantRules: [
        'tenant_id is mandatory on tenant-owned tables',
        'tenant context is derived from authenticated session',
        'module access is resolved from tenant subscription and permissions',
      ],
    };
  }
}
