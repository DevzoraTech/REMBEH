import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MerchantPaymentProvider } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ManualMerchantPaymentProvider } from './dto/submit-manual-merchant-payment.dto';

export type ResolvedMerchantPaymentProvider = {
  provider: ManualMerchantPaymentProvider;
  label: string;
  title: string;
  subtitle: string;
  historyLabel: string;
  merchantCode: string | null;
  accountName: string | null;
  enabled: boolean;
  available: boolean;
  source: 'DATABASE' | 'ENVIRONMENT' | 'DEFAULT';
  howToPayTitle: string;
  /** Steps may include {merchantCode} and {amountLabel} placeholders. */
  howToPaySteps: string[];
};

const DEFAULT_ACCOUNT_NAME = 'ANTIKRA HOLDINGS LTD';
const DEFAULT_MTN_CODE = '123456';
const DEFAULT_AIRTEL_CODE = '7170321';

@Injectable()
export class MerchantPaymentConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async listResolved(): Promise<ResolvedMerchantPaymentProvider[]> {
    return Promise.all([
      this.resolve(ManualMerchantPaymentProvider.MTN_MOMO),
      this.resolve(ManualMerchantPaymentProvider.AIRTEL_MONEY),
    ]);
  }

  async resolve(
    provider: ManualMerchantPaymentProvider,
  ): Promise<ResolvedMerchantPaymentProvider> {
    const dbProvider =
      provider === ManualMerchantPaymentProvider.MTN_MOMO
        ? MerchantPaymentProvider.MTN_MOMO
        : MerchantPaymentProvider.AIRTEL_MONEY;

    const row = await this.prisma.merchantPaymentProviderConfig.findUnique({
      where: { provider: dbProvider },
    });

    const envCode =
      provider === ManualMerchantPaymentProvider.MTN_MOMO
        ? this.configService.get<string>('MTN_MOMO_MERCHANT_CODE')?.trim() ||
          null
        : this.configService
            .get<string>('AIRTEL_MONEY_MERCHANT_CODE')
            ?.trim() || null;

    const envName =
      provider === ManualMerchantPaymentProvider.MTN_MOMO
        ? this.configService.get<string>('MTN_MOMO_ACCOUNT_NAME')?.trim() ||
          null
        : this.configService
            .get<string>('AIRTEL_MONEY_ACCOUNT_NAME')
            ?.trim() || null;

    const defaultCode =
      provider === ManualMerchantPaymentProvider.MTN_MOMO
        ? DEFAULT_MTN_CODE
        : DEFAULT_AIRTEL_CODE;

    let merchantCode: string | null;
    let accountName: string | null;
    let enabled = true;
    let source: ResolvedMerchantPaymentProvider['source'];

    if (row) {
      merchantCode = row.merchantCode.trim() || null;
      accountName = row.accountName.trim() || null;
      enabled = row.enabled;
      source = 'DATABASE';
    } else if (envCode || envName) {
      merchantCode = envCode || defaultCode;
      accountName = envName || DEFAULT_ACCOUNT_NAME;
      source = 'ENVIRONMENT';
    } else {
      merchantCode = defaultCode;
      accountName = DEFAULT_ACCOUNT_NAME;
      source = 'DEFAULT';
    }

    const available = Boolean(enabled && merchantCode && accountName);
    const meta = this.metaFor(provider);

    return {
      provider,
      label: meta.label,
      title: meta.title,
      subtitle: meta.subtitle,
      historyLabel: meta.historyLabel,
      merchantCode,
      accountName,
      enabled,
      available,
      source,
      howToPayTitle: meta.howToPayTitle,
      howToPaySteps: meta.howToPaySteps,
    };
  }

  async upsert(input: {
    provider: ManualMerchantPaymentProvider;
    merchantCode: string;
    accountName: string;
    enabled?: boolean;
  }): Promise<ResolvedMerchantPaymentProvider> {
    const dbProvider =
      input.provider === ManualMerchantPaymentProvider.MTN_MOMO
        ? MerchantPaymentProvider.MTN_MOMO
        : MerchantPaymentProvider.AIRTEL_MONEY;

    await this.prisma.merchantPaymentProviderConfig.upsert({
      where: { provider: dbProvider },
      create: {
        provider: dbProvider,
        merchantCode: input.merchantCode.trim(),
        accountName: input.accountName.trim(),
        enabled: input.enabled ?? true,
      },
      update: {
        merchantCode: input.merchantCode.trim(),
        accountName: input.accountName.trim(),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });

    return this.resolve(input.provider);
  }

  private metaFor(provider: ManualMerchantPaymentProvider) {
    if (provider === ManualMerchantPaymentProvider.MTN_MOMO) {
      return {
        label: 'MTN Mobile Money',
        title: 'MTN MoMo',
        subtitle: 'Pay using MTN Mobile Money',
        historyLabel: 'MTN MoMo',
        howToPayTitle: 'How to pay with MTN MoMo',
        howToPaySteps: [
          'Dial *165*3#',
          'Select Merchant Code',
          'Enter merchant code {merchantCode}',
          'Enter {amountLabel}',
          'Confirm the details',
          'Enter your MoMo PIN',
        ],
      };
    }

    return {
      label: 'Airtel Money',
      title: 'Airtel Money',
      subtitle: 'Pay using Airtel Money',
      historyLabel: 'Airtel Money',
      howToPayTitle: 'How to pay with Airtel',
      howToPaySteps: [
        'Dial *185*9#',
        'Enter merchant code {merchantCode}',
        'Enter the reference shown above',
        'Enter the amount and complete the Airtel Money prompts',
      ],
    };
  }
}
