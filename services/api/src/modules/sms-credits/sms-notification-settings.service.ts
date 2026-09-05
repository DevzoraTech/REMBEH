import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SmsSupportContactSource } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { BRANCH_PERMISSIONS } from '../branches/branches.permissions';
import {
  DEFAULT_SMS_NOTIFICATION_SETTINGS,
  SMS_NOTIFICATION_TEMPLATES,
  type SmsNotificationKind,
  type SmsNotificationSettingsContract,
  type SmsSupportContactSource as SupportSource,
} from './sms-notification-templates';

@Injectable()
export class SmsNotificationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(
    user: AuthenticatedUser,
  ): Promise<SmsNotificationSettingsContract> {
    this.assertCanRead(user);
    const settings = await this.getOrCreate(user.tenantId!);
    return this.withSupportContact(user, settings);
  }

  async updateSettings(
    user: AuthenticatedUser,
    input: {
      enabled?: boolean;
      loanRecordedEnabled?: boolean;
      paymentConfirmationEnabled?: boolean;
      paymentReminderEnabled?: boolean;
      overdueNoticeEnabled?: boolean;
      supportContactSource?: SmsSupportContactSource;
      supportContactLocked?: boolean;
      supportPhone?: string | null;
    },
  ): Promise<SmsNotificationSettingsContract> {
    this.assertCanWrite(user);
    const tenantId = user.tenantId!;
    const existing = await this.prisma.tenantSmsNotificationSettings.findUnique(
      {
        where: { tenantId },
      },
    );
    const isOwner = this.isOwner(user);
    const locked = existing?.supportContactLocked ?? false;
    const phoneTouched = Object.prototype.hasOwnProperty.call(
      input,
      'supportPhone',
    );

    if (!isOwner && locked) {
      if (
        input.supportContactSource != null ||
        input.supportContactLocked != null ||
        phoneTouched
      ) {
        throw new ForbiddenException(
          'The organisation owner has locked the support contact. Managers cannot change it.',
        );
      }
    }

    if (!isOwner && (input.supportContactLocked != null || phoneTouched)) {
      throw new ForbiddenException(
        'Only the organisation owner can change the support number.',
      );
    }

    const nextSupportPhone = phoneTouched
      ? this.normalizeSupportPhone(input.supportPhone)
      : (existing?.supportPhone ?? null);

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
      supportContactSource:
        input.supportContactSource ??
        existing?.supportContactSource ??
        SmsSupportContactSource.OWNER,
      supportContactLocked: isOwner
        ? (input.supportContactLocked ?? existing?.supportContactLocked ?? false)
        : (existing?.supportContactLocked ?? false),
      supportPhone: nextSupportPhone,
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

    return this.withSupportContact(user, this.toRowContract(row));
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
      select: { tenantId: true },
    });
    if (!branch) return '';
    const settings = await this.getOrCreate(branch.tenantId);
    const contacts = await this.loadContacts(branch.tenantId, branchId);
    return this.resolvePhone(settings.supportPhone, settings.supportContactSource, contacts);
  }

  private resolvePhone(
    supportPhone: string | null | undefined,
    source: SupportSource | SmsSupportContactSource,
    contacts: {
      ownerPhone: string;
      managerPhone: string;
    },
  ) {
    const custom = supportPhone?.trim() || '';
    if (custom) return custom;
    const preferOwner =
      source === 'OWNER' ||
      String(source) === String(SmsSupportContactSource.OWNER);
    if (preferOwner) {
      return contacts.ownerPhone || contacts.managerPhone || '';
    }
    return contacts.managerPhone || contacts.ownerPhone || '';
  }

  private async withSupportContact(
    user: AuthenticatedUser,
    settings: Omit<SmsNotificationSettingsContract, 'supportContact'> & {
      supportContact?: SmsNotificationSettingsContract['supportContact'];
    },
  ): Promise<SmsNotificationSettingsContract> {
    const contacts = await this.loadContacts(
      user.tenantId!,
      user.branchId ?? null,
    );
    const isOwner = this.isOwner(user);
    const locked = settings.supportContactLocked;
    const custom = settings.supportPhone?.trim() || '';
    const resolvedPhone = this.resolvePhone(
      settings.supportPhone,
      settings.supportContactSource,
      contacts,
    );

    return {
      ...settings,
      supportContact: {
        ownerName: contacts.ownerName,
        ownerPhone: contacts.ownerPhone || null,
        managerName: contacts.managerName,
        managerPhone: contacts.managerPhone || null,
        resolvedPhone,
        usingCustomPhone: Boolean(custom),
        canEditSource: isOwner || !locked,
        canEditPhone: isOwner,
        canLock: isOwner,
      },
    };
  }

  private async loadContacts(tenantId: string, branchId: string | null) {
    const owner = await this.prisma.user.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
        roles: { some: { role: { name: 'Account Owner' } } },
      },
      select: { displayName: true, phone: true },
      orderBy: { createdAt: 'asc' },
    });

    let managerName: string | null = null;
    let managerPhone = '';
    if (branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: {
          phone: true,
          users: {
            where: {
              status: 'ACTIVE',
              roles: {
                some: {
                  role: { name: { in: ['Branch Manager', 'Cashier'] } },
                },
              },
            },
            select: { displayName: true, phone: true },
            take: 5,
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      const manager = branch?.users.find((row) => row.phone?.trim()) ??
        branch?.users[0] ??
        null;
      managerName = manager?.displayName ?? null;
      managerPhone =
        (manager?.phone?.trim() || branch?.phone?.trim() || '').trim();
    }

    return {
      ownerName: owner?.displayName ?? null,
      ownerPhone: owner?.phone?.trim() || '',
      managerName,
      managerPhone,
    };
  }

  private async getOrCreate(
    tenantId: string,
  ): Promise<
    Omit<SmsNotificationSettingsContract, 'supportContact'> & {
      supportContact?: SmsNotificationSettingsContract['supportContact'];
    }
  > {
    if (!tenantId.trim()) {
      throw new NotFoundException('Account was not found.');
    }
    const existing = await this.prisma.tenantSmsNotificationSettings.findUnique(
      {
        where: { tenantId },
      },
    );
    if (existing) return this.toRowContract(existing);

    try {
      const created = await this.prisma.tenantSmsNotificationSettings.create({
        data: {
          tenantId,
          enabled: true,
          loanRecordedEnabled: true,
          paymentConfirmationEnabled: true,
          paymentReminderEnabled: true,
          overdueNoticeEnabled: true,
          supportContactSource: SmsSupportContactSource.OWNER,
        },
      });
      return this.toRowContract(created);
    } catch {
      const raced = await this.prisma.tenantSmsNotificationSettings.findUnique(
        {
          where: { tenantId },
        },
      );
      if (raced) return this.toRowContract(raced);
      return {
        ...DEFAULT_SMS_NOTIFICATION_SETTINGS,
        updatedAt: null,
      };
    }
  }

  private toRowContract(row: {
    enabled: boolean;
    loanRecordedEnabled: boolean;
    paymentConfirmationEnabled: boolean;
    paymentReminderEnabled: boolean;
    overdueNoticeEnabled: boolean;
    supportContactSource: SmsSupportContactSource;
    supportContactLocked: boolean;
    supportPhone: string | null;
    updatedAt: Date;
  }): Omit<SmsNotificationSettingsContract, 'supportContact'> {
    return {
      enabled: row.enabled,
      loanRecordedEnabled: row.loanRecordedEnabled,
      paymentConfirmationEnabled: row.paymentConfirmationEnabled,
      paymentReminderEnabled: row.paymentReminderEnabled,
      overdueNoticeEnabled: row.overdueNoticeEnabled,
      supportContactSource: row.supportContactSource as SupportSource,
      supportContactLocked: row.supportContactLocked,
      supportPhone: row.supportPhone?.trim() || null,
      templates: { ...SMS_NOTIFICATION_TEMPLATES },
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private normalizeSupportPhone(value: string | null | undefined) {
    if (value == null) return null;
    const cleaned = value.trim().replace(/\s+/g, ' ');
    if (!cleaned) return null;
    if (cleaned.length > 32) {
      throw new BadRequestException('Support phone is too long.');
    }
    if (!/^[\d+\s()-]+$/.test(cleaned)) {
      throw new BadRequestException(
        'Support phone may only contain digits and phone punctuation.',
      );
    }
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 9) {
      throw new BadRequestException('Enter a valid support phone number.');
    }
    return cleaned;
  }

  private isOwner(user: AuthenticatedUser) {
    return user.permissions.includes(BRANCH_PERMISSIONS.create);
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
