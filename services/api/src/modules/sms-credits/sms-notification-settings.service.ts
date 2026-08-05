import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import {
  DEFAULT_SMS_NOTIFICATION_SETTINGS,
  SMS_NOTIFICATION_TEMPLATES,
  type SmsNotificationKind,
  type SmsNotificationSettingsContract,
} from './sms-notification-templates';

@Injectable()
export class SmsNotificationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(
    user: AuthenticatedUser,
  ): Promise<SmsNotificationSettingsContract> {
    this.assertCanRead(user);
    return this.getOrCreate(user.tenantId!);
  }

  async updateSettings(
    user: AuthenticatedUser,
    input: {
      enabled?: boolean;
      loanRecordedEnabled?: boolean;
      paymentConfirmationEnabled?: boolean;
      paymentReminderEnabled?: boolean;
      overdueNoticeEnabled?: boolean;
    },
  ): Promise<SmsNotificationSettingsContract> {
    this.assertCanWrite(user);
    const tenantId = user.tenantId!;
    const existing = await this.prisma.tenantSmsNotificationSettings.findUnique(
      {
        where: { tenantId },
      },
    );

    const data = {
      enabled: input.enabled ?? existing?.enabled ?? true,
      loanRecordedEnabled:
        input.loanRecordedEnabled ?? existing?.loanRecordedEnabled ?? true,
      paymentConfirmationEnabled:
        input.paymentConfirmationEnabled ??
        existing?.paymentConfirmationEnabled ??
        true,
      paymentReminderEnabled:
        input.paymentReminderEnabled ??
        existing?.paymentReminderEnabled ??
        true,
      overdueNoticeEnabled:
        input.overdueNoticeEnabled ?? existing?.overdueNoticeEnabled ?? true,
      updatedByUserId: user.userId,
    };

    const row = existing
      ? await this.prisma.tenantSmsNotificationSettings.update({
          where: { tenantId },
          data,
        })
      : await this.prisma.tenantSmsNotificationSettings.create({
          data: { tenantId, ...data },
        });

    return this.toContract(row);
  }

  /** Internal: check whether a borrower SMS kind is allowed for the tenant. */
  async isKindEnabled(
    tenantId: string,
    kind: SmsNotificationKind,
  ): Promise<boolean> {
    const settings = await this.getOrCreate(tenantId);
    if (!settings.enabled) return false;
    switch (kind) {
      case 'loan_recorded':
        return settings.loanRecordedEnabled;
      case 'payment_confirmation':
        return settings.paymentConfirmationEnabled;
      case 'payment_reminder':
        return settings.paymentReminderEnabled;
      case 'overdue_notice':
        return settings.overdueNoticeEnabled;
      default:
        return false;
    }
  }

  async resolveSupportPhone(branchId: string): Promise<string> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        phone: true,
        name: true,
        users: {
          where: {
            status: 'ACTIVE',
            roles: {
              some: {
                role: {
                  name: { in: ['Branch Manager', 'Cashier'] },
                },
              },
            },
          },
          select: { phone: true },
          take: 5,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!branch) return '';
    const managerPhone =
      branch.users.map((user) => user.phone?.trim()).find(Boolean) ?? '';
    return (branch.phone?.trim() || managerPhone || '').trim();
  }

  private async getOrCreate(
    tenantId: string,
  ): Promise<SmsNotificationSettingsContract> {
    if (!tenantId.trim()) {
      throw new NotFoundException('Account was not found.');
    }
    const existing = await this.prisma.tenantSmsNotificationSettings.findUnique(
      {
        where: { tenantId },
      },
    );
    if (existing) return this.toContract(existing);

    try {
      const created = await this.prisma.tenantSmsNotificationSettings.create({
        data: {
          tenantId,
          enabled: true,
          loanRecordedEnabled: true,
          paymentConfirmationEnabled: true,
          paymentReminderEnabled: true,
          overdueNoticeEnabled: true,
        },
      });
      return this.toContract(created);
    } catch {
      const raced = await this.prisma.tenantSmsNotificationSettings.findUnique({
        where: { tenantId },
      });
      if (raced) return this.toContract(raced);
      return {
        ...DEFAULT_SMS_NOTIFICATION_SETTINGS,
        updatedAt: null,
      };
    }
  }

  private toContract(row: {
    enabled: boolean;
    loanRecordedEnabled: boolean;
    paymentConfirmationEnabled: boolean;
    paymentReminderEnabled: boolean;
    overdueNoticeEnabled: boolean;
    updatedAt: Date;
  }): SmsNotificationSettingsContract {
    return {
      enabled: row.enabled,
      loanRecordedEnabled: row.loanRecordedEnabled,
      paymentConfirmationEnabled: row.paymentConfirmationEnabled,
      paymentReminderEnabled: row.paymentReminderEnabled,
      overdueNoticeEnabled: row.overdueNoticeEnabled,
      templates: { ...SMS_NOTIFICATION_TEMPLATES },
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private assertCanRead(user: AuthenticatedUser) {
    if (!user.tenantId?.trim()) {
      throw new ForbiddenException('Account access is required.');
    }
    if (
      !user.permissions.includes(BRANCH_PERMISSIONS.create) &&
      !user.permissions.includes(BRANCH_PERMISSIONS.staffInvite) &&
      !user.permissions.includes('loan.product.manage') &&
      !user.permissions.includes('operation.read')
    ) {
      throw new ForbiddenException('You cannot view SMS settings.');
    }
  }

  private assertCanWrite(user: AuthenticatedUser) {
    this.assertCanRead(user);
    if (
      !user.permissions.includes(BRANCH_PERMISSIONS.create) &&
      !user.permissions.includes(BRANCH_PERMISSIONS.staffInvite) &&
      !user.permissions.includes('loan.product.manage')
    ) {
      throw new ForbiddenException('You cannot change SMS settings.');
    }
  }
}
