import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { SmsService } from './sms.service';

export type OperatorPaymentAlert = {
  kind: 'plan' | 'sms';
  stage: 'submitted' | 'confirmed';
  organizationName: string;
  branchName: string;
  amountUgx: number;
  smsUnits?: number;
  reserveUgx?: number;
  reference?: string | null;
  paymentMethod?: string | null;
};

export type OperatorSmsContact = {
  name: string;
  phone: string;
};

/** One GSM-7 SMS. Unicode would split into 70-char credits. */
export const GSM_SMS_CREDIT_CHARS = 160;

export const DEFAULT_OPERATOR_SMS_CONTACTS: OperatorSmsContact[] = [
  { name: 'Hamza', phone: '+256777823011' },
  { name: 'Bonny', phone: '+256752039673' },
];

export function normalizeOperatorSmsPhone(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, '').replace(/^00/, '+');
  if (!digits) return null;
  let e164 = digits;
  if (digits.startsWith('0') && digits.length >= 9) {
    e164 = `+256${digits.slice(1)}`;
  } else if (digits.startsWith('256')) {
    e164 = `+${digits}`;
  } else if (!digits.startsWith('+')) {
    e164 = `+${digits}`;
  }
  const national = e164.replace(/\D/g, '');
  if (!/^2567\d{8}$/.test(national)) return null;
  return `+${national}`;
}

export function displayOperatorSmsPhone(e164: string) {
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('256') && digits.length === 12) {
    return `0${digits.slice(3)}`;
  }
  return e164;
}

export function buildOperatorPaymentSms(
  input: OperatorPaymentAlert & { recipientName: string },
) {
  const name = asciiClip(firstName(input.recipientName), 12);
  const verify =
    input.stage === 'submitted' && needsManualVerify(input.paymentMethod);
  let action: string;
  let next: string;
  if (verify && input.kind === 'sms') {
    action = 'Verify SMS pack now';
    next = 'Open Control Center Payments.';
  } else if (verify) {
    action = 'Verify PLAN now';
    next = 'Open Control Center Payments.';
  } else if (input.stage === 'submitted' && input.kind === 'sms') {
    action = 'SMS pack checkout started';
    next = 'Wait for confirm SMS.';
  } else if (input.stage === 'submitted') {
    action = 'PLAN checkout started';
    next = 'Wait for confirm SMS.';
  } else if (input.kind === 'sms') {
    action = 'SMS pack credited';
    next = 'No action needed.';
  } else {
    action = 'PLAN paid';
    next = 'No action needed.';
  }

  const org = `${asciiClip(input.organizationName, 28)}/${asciiClip(input.branchName, 18)}`;
  const units =
    input.kind === 'sms' ? `${Math.max(0, input.smsUnits ?? 0)} SMS. ` : '';
  const method =
    verify && input.paymentMethod?.trim()
      ? `${asciiClip(input.paymentMethod.trim(), 10)}. `
      : '';
  const facts = `${org}. ${units}${formatUgx(input.amountUgx)}. ${method}`
    .replace(/\s+/g, ' ')
    .trim();
  const tx = input.reference?.trim()
    ? ` Tx ${asciiClip(input.reference.trim(), 22)}.`
    : '';
  const prefix = `${name}: ${action}. `;
  const suffix = `${tx} ${next}`.replace(/\s+/g, ' ').trim();
  const suffixText = ` ${suffix}`;
  const budget = GSM_SMS_CREDIT_CHARS - prefix.length - suffixText.length;
  const middle = asciiClip(facts, Math.max(8, budget));
  return fitOneGsmCredit(`${prefix}${middle}${suffixText}`);
}

function needsManualVerify(paymentMethod?: string | null) {
  const method = paymentMethod?.trim().toLowerCase() ?? '';
  return method !== 'pesapal' && method !== 'card';
}

function firstName(value: string) {
  const token = value.trim().split(/\s+/)[0] ?? 'Team';
  return token || 'Team';
}

function formatUgx(amount: number) {
  const rounded = Math.round(amount);
  return `UGX ${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function asciiClip(value: string, max: number) {
  const cleaned = toGsmAscii(value).trim() || '-';
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, Math.max(0, max - 1))}.`;
}

function toGsmAscii(value: string) {
  return value
    .replace(/\u2026/g, '...')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ');
}

function fitOneGsmCredit(value: string) {
  const gsm = toGsmAscii(value).trim();
  if (gsm.length <= GSM_SMS_CREDIT_CHARS) return gsm;
  return gsm.slice(0, GSM_SMS_CREDIT_CHARS);
}

/**
 * Ops SMS from the platform Pahappa account.
 * Never touches an organisation SMS wallet.
 */
@Injectable()
export class OperatorAlertService {
  private readonly logger = new Logger(OperatorAlertService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
  ) {}

  async notifyPayment(input: OperatorPaymentAlert) {
    const contacts = await this.recipients();
    if (contacts.length === 0) {
      this.logger.warn(
        'No operator SMS contacts are configured; payment SMS was skipped.',
      );
      return;
    }

    await Promise.all(
      contacts.map(async (contact) => {
        const body = buildOperatorPaymentSms({
          ...input,
          recipientName: contact.name,
        });
        if (body.length > GSM_SMS_CREDIT_CHARS) {
          this.logger.warn(
            `Operator SMS exceeded one credit (${body.length} chars); sending clipped body.`,
          );
        }
        try {
          const result = await this.smsService.sendText({
            destination: contact.phone,
            body,
          });
          if (!result.delivered) {
            this.logger.warn(
              `Operator SMS not accepted for ${contact.name} ${contact.phone}: ${result.failureReason ?? result.message}`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Operator SMS failed for ${contact.name} ${contact.phone}: ${
              error instanceof Error ? error.message : error
            }`,
          );
        }
      }),
    );
  }

  async ensureDefaultContacts() {
    const existing = await this.prisma.controlCenterOperatorSmsContact.count();
    if (existing > 0) return;
    await this.prisma.controlCenterOperatorSmsContact.createMany({
      data: DEFAULT_OPERATOR_SMS_CONTACTS.map((contact, index) => ({
        name: contact.name,
        phone: contact.phone,
        sortOrder: index,
        active: true,
      })),
      skipDuplicates: true,
    });
  }

  private async recipients(): Promise<OperatorSmsContact[]> {
    await this.ensureDefaultContacts();
    const rows = await this.prisma.controlCenterOperatorSmsContact.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { name: true, phone: true },
    });
    if (rows.length > 0) return rows;

    return this.envFallback();
  }

  private envFallback(): OperatorSmsContact[] {
    const configured = this.configService
      .get<string>('PAYMENT_VERIFICATION_PHONES')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return (configured ?? [])
      .map((phone) => {
        const normalized = normalizeOperatorSmsPhone(phone);
        return normalized
          ? { name: 'Team', phone: normalized }
          : null;
      })
      .filter((row): row is OperatorSmsContact => Boolean(row));
  }
}
