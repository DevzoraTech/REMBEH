import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { calculateOpeningPosition } from './opening-position';

type OpeningRecord = {
  requestId: string;
  fullName: string;
  phone: string;
  nationalId?: string;
  email?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  dateOfBirth?: string;
  district?: string;
  subCounty?: string;
  parish?: string;
  village?: string;
  loanPurpose?: string;
  collateralType?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  issueDate: string;
  paymentStartDate: string;
  principal: string;
  repayable: string;
  outstanding: string;
  flatInterestPercent: string;
  durationDays: number;
  repaymentFrequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'LUMP_SUM';
  allowNameMatch: boolean;
};

function date(value: unknown, label: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException(
      `${label} must be a date in YYYY-MM-DD format.`,
    );
  const result = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(result.valueOf()) ||
    result.toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException(`${label} is not a valid date.`);
  return result;
}

function normalize(value: unknown): OpeningRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid borrower record.');
  const x = value as Record<string, unknown>;
  const allowed = new Set([
    'requestId',
    'fullName',
    'phone',
    'nationalId',
    'email',
    'gender',
    'dateOfBirth',
    'district',
    'subCounty',
    'parish',
    'village',
    'loanPurpose',
    'collateralType',
    'guarantorName',
    'guarantorPhone',
    'issueDate',
    'paymentStartDate',
    'principal',
    'repayable',
    'outstanding',
    'flatInterestPercent',
    'durationDays',
    'repaymentFrequency',
    'allowNameMatch',
  ]);
  if (Object.keys(x).some((k) => !allowed.has(k)))
    throw new BadRequestException('Unsupported field in borrower record.');
  if (x.allowNameMatch !== undefined && typeof x.allowNameMatch !== 'boolean')
    throw new BadRequestException('Invalid duplicate confirmation.');
  if (
    typeof x.requestId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      x.requestId,
    )
  )
    throw new BadRequestException('A valid request ID is required.');
  if (
    typeof x.fullName !== 'string' ||
    x.fullName.trim().length < 2 ||
    x.fullName.trim().length > 160
  )
    throw new BadRequestException('A borrower name is required.');
  if (
    typeof x.phone !== 'string' ||
    !/^(?:0[0-9]{9}|\+256[0-9]{9})$/.test(x.phone)
  )
    throw new BadRequestException('Enter a valid borrower phone number.');
  if (
    x.nationalId !== undefined &&
    (typeof x.nationalId !== 'string' ||
      !/^[a-z0-9]{1,32}$/i.test(x.nationalId.replace(/\s/g, '')))
  )
    throw new BadRequestException('Invalid national ID.');
  for (const key of [
    'email',
    'district',
    'subCounty',
    'parish',
    'village',
    'loanPurpose',
    'collateralType',
    'guarantorName',
    'guarantorPhone',
  ]) {
    if (
      x[key] !== undefined &&
      (typeof x[key] !== 'string' ||
        !(x[key] as string).trim() ||
        (x[key] as string).trim().length > 160)
    )
      throw new BadRequestException(`Invalid ${key}.`);
  }
  if (
    typeof x.email === 'string' &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email.trim())
  )
    throw new BadRequestException('Invalid email address.');
  if (
    x.gender !== undefined &&
    !['MALE', 'FEMALE', 'OTHER'].includes(x.gender as string)
  )
    throw new BadRequestException('Invalid gender.');
  if (
    x.dateOfBirth !== undefined &&
    date(x.dateOfBirth, 'Date of birth') > new Date()
  )
    throw new BadRequestException('Date of birth cannot be in the future.');
  if (
    x.guarantorPhone !== undefined &&
    !/^(?:0[0-9]{9}|\+256[0-9]{9})$/.test(x.guarantorPhone as string)
  )
    throw new BadRequestException('Invalid guarantor phone number.');
  for (const key of [
    'principal',
    'repayable',
    'outstanding',
    'flatInterestPercent',
  ])
    if (typeof x[key] !== 'string')
      throw new BadRequestException(
        `${key} must be provided as a decimal string.`,
      );
  if (
    !Number.isInteger(x.durationDays) ||
    (x.durationDays as number) < 1 ||
    (x.durationDays as number) > 3650
  )
    throw new BadRequestException('A valid loan duration is required.');
  if (
    typeof x.repaymentFrequency !== 'string' ||
    !['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'LUMP_SUM'].includes(
      x.repaymentFrequency,
    )
  )
    throw new BadRequestException('A valid repayment frequency is required.');
  const issue = date(x.issueDate, 'Issue date');
  const start = date(x.paymentStartDate, 'Repayment start date');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (issue.toISOString().slice(0, 10) > today || start < issue)
    throw new BadRequestException('Check the issue and repayment start dates.');
  return {
    requestId: x.requestId.toLowerCase(),
    fullName: x.fullName.trim().replace(/\s+/g, ' ').toUpperCase(),
    phone: x.phone.startsWith('0') ? `+256${x.phone.slice(1)}` : x.phone,
    ...(x.nationalId
      ? {
          nationalId: (x.nationalId as string).replace(/\s/g, '').toUpperCase(),
        }
      : {}),
    ...(typeof x.email === 'string'
      ? { email: x.email.trim().toLowerCase() }
      : {}),
    ...(x.gender ? { gender: x.gender as OpeningRecord['gender'] } : {}),
    ...(x.dateOfBirth ? { dateOfBirth: x.dateOfBirth as string } : {}),
    ...Object.fromEntries(
      [
        'district',
        'subCounty',
        'parish',
        'village',
        'loanPurpose',
        'collateralType',
      ]
        .filter((key) => typeof x[key] === 'string')
        .map((key) => [key, (x[key] as string).trim()]),
    ),
    ...(typeof x.guarantorName === 'string'
      ? {
          guarantorName: x.guarantorName
            .trim()
            .replace(/\s+/g, ' ')
            .toUpperCase(),
        }
      : {}),
    ...(typeof x.guarantorPhone === 'string'
      ? {
          guarantorPhone: x.guarantorPhone.startsWith('0')
            ? `+256${x.guarantorPhone.slice(1)}`
            : x.guarantorPhone,
        }
      : {}),
    issueDate: x.issueDate as string,
    paymentStartDate: x.paymentStartDate as string,
    principal: x.principal as string,
    repayable: x.repayable as string,
    outstanding: x.outstanding as string,
    flatInterestPercent: x.flatInterestPercent as string,
    durationDays: x.durationDays as number,
    repaymentFrequency:
      x.repaymentFrequency as OpeningRecord['repaymentFrequency'],
    allowNameMatch: x.allowNameMatch === true,
  };
}

async function findDuplicates(
  db: Prisma.TransactionClient | PrismaService,
  scope: { tenantId: string; branchId: string },
  input: OpeningRecord,
) {
  const digits = input.phone.slice(1);
  const localDigits = `0${input.phone.slice(4)}`;
  const nationalId = input.nationalId ?? '';
  const rows = await db.$queryRaw<
    Array<{ phones: bigint; identities: bigint; names: bigint }>
  >`
    SELECT
      COUNT(*) FILTER (WHERE branch_id = ${scope.branchId}::uuid AND regexp_replace(phone, '[^0-9]', '', 'g') IN (${digits}, ${localDigits})) AS phones,
      COUNT(*) FILTER (WHERE ${nationalId} <> '' AND regexp_replace(upper(coalesce(national_id, '')), '[[:space:]]', '', 'g') = ${nationalId}) AS identities,
      COUNT(*) FILTER (WHERE branch_id = ${scope.branchId}::uuid AND regexp_replace(upper(trim(full_name)), '[[:space:]]+', ' ', 'g') = ${input.fullName}) AS names
    FROM customers WHERE tenant_id = ${scope.tenantId}::uuid
  `;
  const row = rows[0];
  return {
    phoneExists: row.phones > 0n,
    nationalIdExists: row.identities > 0n,
    matchingNames: Number(row.names),
  };
}

@Injectable()
export class OpeningRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser) {
    if (!user.branchId)
      throw new ForbiddenException('A branch assignment is required.');
    const scope = { tenantId: user.tenantId, branchId: user.branchId };
    const [total, receipts] = await Promise.all([
      this.prisma.borrowerOnboardingReceipt.count({ where: scope }),
      this.prisma.borrowerOnboardingReceipt.findMany({
        where: scope,
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { customerId: true, loanId: true, createdAt: true },
      }),
    ]);
    const customers = await this.prisma.customer.findMany({
      where: {
        ...scope,
        id: { in: receipts.map((receipt) => receipt.customerId) },
      },
      select: { id: true, fullName: true, phone: true },
    });
    const names = new Map(customers.map((customer) => [customer.id, customer]));
    return {
      total,
      records: receipts.map((receipt) => ({
        ...receipt,
        customer: names.get(receipt.customerId) ?? null,
      })),
    };
  }

  async checkDuplicates(user: AuthenticatedUser, raw: unknown) {
    if (!user.branchId)
      throw new ForbiddenException('A branch assignment is required.');
    const input = normalize(raw);
    try {
      calculateOpeningPosition(input);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid loan amounts.',
      );
    }
    const scope = { tenantId: user.tenantId, branchId: user.branchId };
    const receipt = await this.prisma.borrowerOnboardingReceipt.findUnique({
      where: {
        tenantId_branchId_requestId: { ...scope, requestId: input.requestId },
      },
    });
    if (receipt) {
      const hash = createHash('sha256')
        .update(JSON.stringify(input))
        .digest('hex');
      if (receipt.requestHash !== hash)
        throw new ConflictException(
          'This request ID was already used for different details.',
        );
      return {
        alreadySaved: true,
        phoneExists: false,
        nationalIdExists: false,
        matchingNames: 0,
      };
    }
    return {
      alreadySaved: false,
      ...(await findDuplicates(this.prisma, scope, input)),
    };
  }

  async create(user: AuthenticatedUser, raw: unknown) {
    if (!user.branchId)
      throw new ForbiddenException('A branch assignment is required.');
    const branchId = user.branchId;
    const input = normalize(raw);
    let position: ReturnType<typeof calculateOpeningPosition>;
    try {
      position = calculateOpeningPosition(input);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid loan amounts.',
      );
    }
    const hash = createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex');
    const scope = { tenantId: user.tenantId, branchId };
    const replay = async () => {
      const receipt = await this.prisma.borrowerOnboardingReceipt.findUnique({
        where: {
          tenantId_branchId_requestId: { ...scope, requestId: input.requestId },
        },
      });
      if (receipt && receipt.requestHash !== hash)
        throw new ConflictException(
          'This request ID was already used for different details.',
        );
      return receipt;
    };
    const existing = await replay();
    if (existing)
      return {
        customerId: existing.customerId,
        loanId: existing.loanId,
        replayed: true,
      };
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const branches = await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM branches WHERE id = ${branchId}::uuid AND tenant_id = ${user.tenantId}::uuid FOR UPDATE`;
          if (branches.length !== 1)
            throw new ForbiddenException('Branch is not available.');
          const previous = await tx.borrowerOnboardingReceipt.findUnique({
            where: {
              tenantId_branchId_requestId: {
                ...scope,
                requestId: input.requestId,
              },
            },
          });
          if (previous) {
            if (previous.requestHash !== hash)
              throw new ConflictException(
                'This request ID was already used for different details.',
              );
            return {
              customerId: previous.customerId,
              loanId: previous.loanId,
              replayed: true,
            };
          }
          const duplicates = await findDuplicates(tx, scope, input);
          if (duplicates.phoneExists || duplicates.nationalIdExists)
            throw new ConflictException(
              'A borrower with this phone or national ID already exists. Review the existing record.',
            );
          if (!input.allowNameMatch) {
            if (duplicates.matchingNames > 0)
              throw new ConflictException(
                'A borrower with this name already exists. Review the existing record before continuing.',
              );
          }
          const issue = date(input.issueDate, 'Issue date');
          const start = date(input.paymentStartDate, 'Repayment start date');
          const customer = await tx.customer.create({
            data: {
              ...scope,
              fullName: input.fullName,
              phone: input.phone,
              nationalId: input.nationalId,
              email: input.email,
            },
          });
          const loan = await tx.loan.create({
            data: {
              ...scope,
              customerId: customer.id,
              principal: position.principal!,
              balance: position.outstanding,
              currency: 'UGX',
              status: position.closed ? 'CLOSED' : 'CURRENT',
              disbursedAt: issue,
              paymentStartDate: start,
            },
          });
          const application = await tx.loanApplication.create({
            data: {
              ...scope,
              officerUserId: user.userId,
              customerId: customer.id,
              loanId: loan.id,
              status: 'SUBMITTED',
              givenNames: input.fullName,
              phone: input.phone,
              nationalId: input.nationalId,
              gender: input.gender,
              dateOfBirth: input.dateOfBirth
                ? date(input.dateOfBirth, 'Date of birth')
                : undefined,
              district: input.district,
              subCounty: input.subCounty,
              parish: input.parish,
              village: input.village,
              loanPurpose: input.loanPurpose,
              collateralType: input.collateralType,
              principalAmount: position.principal!,
              interestRatePercent: new Prisma.Decimal(
                input.flatInterestPercent,
              ),
              interestType: 'FLAT',
              durationDays: input.durationDays,
              termValue: input.durationDays,
              termUnit: 'DAYS',
              repaymentFrequency: input.repaymentFrequency,
              paymentStartDate: start,
              isOpeningMigration: true,
            },
          });
          if (input.guarantorName || input.guarantorPhone) {
            await tx.loanApplicationGuarantor.create({
              data: {
                loanApplicationId: application.id,
                fullName: input.guarantorName,
                phone: input.guarantorPhone,
              },
            });
          }
          await tx.clientWallet.create({
            data: {
              ...scope,
              customerId: customer.id,
              loanId: loan.id,
              loanApplicationId: application.id,
              currency: 'UGX',
              openingBalance: position.repayable,
            },
          });
          await tx.loanDisbursement.create({
            data: {
              ...scope,
              loanId: loan.id,
              recordedByUserId: user.userId,
              amount: position.principal!,
              assignedFloatAmount: 0,
              collectedRepaymentsAmount: 0,
              source: 'MIXED_CASH',
              isOpeningMigration: true,
              disbursedAt: issue,
              note: 'Historical loan imported as an opening position; cash source was not provided.',
            },
          });
          await tx.borrowerOnboardingReceipt.create({
            data: {
              ...scope,
              requestId: input.requestId,
              requestHash: hash,
              customerId: customer.id,
              loanId: loan.id,
            },
          });
          await tx.auditLog.create({
            data: {
              tenantId: user.tenantId,
              actorUserId: user.userId,
              action: 'borrower_onboarding.created',
              entityType: 'loan',
              entityId: loan.id,
              newValue: {
                branchId,
                customerId: customer.id,
                source: 'opening_migration',
                requestId: input.requestId,
              },
            },
          });
          return { customerId: customer.id, loanId: loan.id, replayed: false };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      ) {
        const receipt = await replay();
        if (receipt)
          return {
            customerId: receipt.customerId,
            loanId: receipt.loanId,
            replayed: true,
          };
        throw new ConflictException(
          'Borrower records changed. Refresh and check for duplicates before retrying.',
        );
      }
      throw error;
    }
  }
}
