import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { LoanApplicationMediaType, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { calculateOpeningPosition } from './opening-position';

type OpeningRecord = {
  requestId: string;
  fullName: string;
  givenNames?: string;
  surname?: string;
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
  loanProductName?: string;
  loanProductTemplateId?: string;
  approvalDate?: string;
  collateralType?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  issueDate: string;
  paymentStartDate?: string;
  principal?: string;
  repayable: string;
  outstanding: string;
  flatInterestPercent?: string;
  durationDays?: number;
  repaymentFrequency?: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'LUMP_SUM';
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

function applicationNames(
  input: Pick<OpeningRecord, 'fullName' | 'givenNames' | 'surname'>,
) {
  const { fullName, givenNames, surname } = input;
  if (givenNames && surname) {
    if (
      `${givenNames} ${surname}` !== fullName &&
      `${surname} ${givenNames}` !== fullName
    )
      throw new BadRequestException(
        'Given names and surname must match the full name.',
      );
    return { givenNames, surname };
  }
  if (surname) {
    if (fullName === surname) return { givenNames: undefined, surname };
    if (fullName.startsWith(`${surname} `))
      return { givenNames: fullName.slice(surname.length).trim(), surname };
    if (!fullName.endsWith(` ${surname}`))
      throw new BadRequestException('Surname must match the full name.');
    return { givenNames: fullName.slice(0, -surname.length).trim(), surname };
  }
  if (givenNames) {
    if (fullName === givenNames) return { givenNames, surname: undefined };
    if (fullName.endsWith(` ${givenNames}`))
      return {
        givenNames,
        surname: fullName.slice(0, -givenNames.length).trim(),
      };
    if (!fullName.startsWith(`${givenNames} `))
      throw new BadRequestException('Given names must match the full name.');
    return { givenNames, surname: fullName.slice(givenNames.length).trim() };
  }
  return { givenNames: fullName, surname: undefined };
}

function normalize(value: unknown): OpeningRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid borrower record.');
  const x = value as Record<string, unknown>;
  const allowed = new Set([
    'requestId',
    'fullName',
    'givenNames',
    'surname',
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
    'loanProductName',
    'loanProductTemplateId',
    'approvalDate',
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
  if (x.loanProductTemplateId !== undefined && (typeof x.loanProductTemplateId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x.loanProductTemplateId)))
    throw new BadRequestException('Invalid loan type.');
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
    'givenNames',
    'surname',
    'district',
    'subCounty',
    'parish',
    'village',
    'loanPurpose',
    'loanProductName',
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
  for (const key of ['repayable', 'outstanding'])
    if (typeof x[key] !== 'string')
      throw new BadRequestException(
        `${key} must be provided as a decimal string.`,
      );
  for (const key of ['principal', 'flatInterestPercent'])
    if (x[key] !== undefined && typeof x[key] !== 'string')
      throw new BadRequestException(`${key} must be a decimal string.`);
  if (
    x.durationDays !== undefined &&
    (!Number.isInteger(x.durationDays) ||
      (x.durationDays as number) < 1 ||
      (x.durationDays as number) > 3650)
  )
    throw new BadRequestException('A valid loan duration is required.');
  if (
    x.repaymentFrequency !== undefined &&
    (typeof x.repaymentFrequency !== 'string' ||
      !['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'LUMP_SUM'].includes(
        x.repaymentFrequency,
      ))
  )
    throw new BadRequestException('A valid repayment frequency is required.');
  const issue = date(x.issueDate, 'Issue date');
  const approved =
    x.approvalDate === undefined ? null : date(x.approvalDate, 'Approval date');
  const start =
    x.paymentStartDate === undefined
      ? null
      : date(x.paymentStartDate, 'Repayment start date');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (
    issue.toISOString().slice(0, 10) > today ||
    (start && start < issue) ||
    (approved && approved > issue)
  )
    throw new BadRequestException('Check the issue and repayment start dates.');
  applicationNames({
    fullName: x.fullName.trim().replace(/\s+/g, ' ').toUpperCase(),
    givenNames:
      typeof x.givenNames === 'string'
        ? x.givenNames.trim().replace(/\s+/g, ' ').toUpperCase()
        : undefined,
    surname:
      typeof x.surname === 'string'
        ? x.surname.trim().replace(/\s+/g, ' ').toUpperCase()
        : undefined,
  });
  return {
    requestId: x.requestId.toLowerCase(),
    fullName: x.fullName.trim().replace(/\s+/g, ' ').toUpperCase(),
    ...(typeof x.givenNames === 'string'
      ? { givenNames: x.givenNames.trim().replace(/\s+/g, ' ').toUpperCase() }
      : {}),
    ...(typeof x.surname === 'string'
      ? { surname: x.surname.trim().replace(/\s+/g, ' ').toUpperCase() }
      : {}),
    ...(x.approvalDate !== undefined
      ? { approvalDate: x.approvalDate as string }
      : {}),
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
    ...(x.loanProductTemplateId ? { loanProductTemplateId: x.loanProductTemplateId as string } : {}),
    ...Object.fromEntries(
      [
        'district',
        'subCounty',
        'parish',
        'village',
        'loanPurpose',
        'loanProductName',
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
    ...(x.paymentStartDate !== undefined
      ? { paymentStartDate: x.paymentStartDate as string }
      : {}),
    ...(x.principal !== undefined ? { principal: x.principal as string } : {}),
    repayable: x.repayable as string,
    outstanding: x.outstanding as string,
    ...(x.flatInterestPercent !== undefined
      ? { flatInterestPercent: x.flatInterestPercent as string }
      : {}),
    ...(x.durationDays !== undefined
      ? { durationDays: x.durationDays as number }
      : {}),
    ...(x.repaymentFrequency !== undefined
      ? {
          repaymentFrequency:
            x.repaymentFrequency as OpeningRecord['repaymentFrequency'],
        }
      : {}),
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

async function lockBorrowerIdentity(
  tx: Prisma.TransactionClient,
  tenantId: string,
  nationalId: string | undefined,
  phone: string,
) {
  const identity = nationalId
    ? `NIN:${nationalId.trim().toUpperCase()}`
    : `PHONE:${phone.trim().toUpperCase()}`;
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${identity}))`,
  );
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
        select: {
          customerId: true,
          loanId: true,
          requestId: true,
          createdAt: true,
        },
      }),
    ]);
    const customers = await this.prisma.customer.findMany({
      where: {
        ...scope,
        id: { in: receipts.map((receipt) => receipt.customerId) },
      },
      select: { id: true, fullName: true, phone: true },
    });
    const pending =
      await this.prisma.borrowerOnboardingPendingPosition.findMany({
        where: {
          ...scope,
          completedAt: null,
          customerId: { in: receipts.map((receipt) => receipt.customerId) },
        },
        select: {
          customerId: true,
          repayable: true,
          outstanding: true,
          issueDate: true,
        },
      });
    const names = new Map(customers.map((customer) => [customer.id, customer]));
    const positions = new Map(
      pending.map((position) => [position.customerId, position]),
    );
    return {
      total,
      records: receipts.map((receipt) => ({
        ...receipt,
        status: receipt.loanId ? 'COMPLETE' : 'NEEDS_LOAN_DETAILS',
        customer: names.get(receipt.customerId) ?? null,
        repayable:
          positions.get(receipt.customerId)?.repayable.toString() ?? null,
        outstanding:
          positions.get(receipt.customerId)?.outstanding.toString() ?? null,
        issueDate:
          positions.get(receipt.customerId)?.issueDate.toISOString() ?? null,
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

  async complete(user: AuthenticatedUser, requestId: string, raw: unknown) {
    if (!user.branchId)
      throw new ForbiddenException('A branch assignment is required.');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new BadRequestException('Invalid loan details.');
    const changes = raw as Record<string, unknown>;
    const allowed = [
      'principal',
      'flatInterestPercent',
      'durationDays',
      'repaymentFrequency',
      'paymentStartDate',
      'loanProductName',
      'loanProductTemplateId',
      'repayable',
      'expectedRepayable',
      'confirmRepayableCorrection',
    ];
    if (Object.keys(changes).some((key) => !allowed.includes(key)))
      throw new BadRequestException('Unsupported loan detail.');
    const scope = { tenantId: user.tenantId, branchId: user.branchId };
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM borrower_onboarding_pending_positions WHERE tenant_id = ${scope.tenantId}::uuid AND branch_id = ${scope.branchId}::uuid AND request_id = ${requestId}::uuid FOR UPDATE`;
        if (rows.length !== 1)
          throw new BadRequestException('Pending borrower record not found.');
        const pending =
          await tx.borrowerOnboardingPendingPosition.findUniqueOrThrow({
            where: { id: rows[0].id },
          });
        const receipt = await tx.borrowerOnboardingReceipt.findUniqueOrThrow({
          where: { tenantId_branchId_requestId: { ...scope, requestId } },
        });
        if (receipt.loanId)
          return {
            customerId: pending.customerId,
            loanId: receipt.loanId,
            status: 'COMPLETE',
            replayed: true,
          };
        const correctionRequested =
          changes.repayable !== undefined ||
          changes.expectedRepayable !== undefined ||
          changes.confirmRepayableCorrection !== undefined;
        if (correctionRequested) {
          const money = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
          if (
            changes.confirmRepayableCorrection !== true ||
            typeof changes.repayable !== 'string' ||
            typeof changes.expectedRepayable !== 'string' ||
            !money.test(changes.repayable) ||
            !money.test(changes.expectedRepayable)
          )
            throw new BadRequestException(
              'Provide the original and corrected repayment totals.',
            );
          if (
            !pending.repayable.eq(new Prisma.Decimal(changes.expectedRepayable))
          )
            throw new ConflictException(
              'The recorded repayment total has changed. Refresh the borrower and try again.',
            );
        }
        const {
          expectedRepayable: _expectedRepayable,
          confirmRepayableCorrection: _confirmRepayableCorrection,
          loanProductTemplateId,
          ...loanChanges
        } = changes;
        let product: { id: string; name: string } | null = null;
        if (loanProductTemplateId !== undefined) {
          if (typeof loanProductTemplateId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(loanProductTemplateId))
            throw new BadRequestException('Invalid loan type.');
          product = await tx.loanProductTemplate.findFirst({
            where: { id: loanProductTemplateId, tenantId: scope.tenantId, isActive: true, interestType: 'FLAT', OR: [{ branchId: scope.branchId }, { branchId: null }] },
            select: { id: true, name: true },
          });
          if (!product) throw new BadRequestException('Loan type is no longer available for this branch.');
          loanChanges.loanProductName = product.name;
        }
        const input = normalize({
          ...(pending.details as Record<string, unknown>),
          ...loanChanges,
          issueDate: pending.issueDate.toISOString().slice(0, 10),
          outstanding: pending.outstanding.toString(),
          repayable: correctionRequested
            ? changes.repayable
            : pending.repayable.toString(),
        });
        await lockBorrowerIdentity(
          tx,
          scope.tenantId,
          input.nationalId,
          input.phone,
        );
        if (
          !input.principal ||
          input.flatInterestPercent === undefined ||
          !input.durationDays ||
          !input.repaymentFrequency ||
          !input.paymentStartDate
        )
          throw new BadRequestException(
            'Complete the loan terms before creating a repayment schedule.',
          );
        let position: ReturnType<typeof calculateOpeningPosition>;
        try {
          position = calculateOpeningPosition(input);
        } catch (error) {
          throw new BadRequestException(
            error instanceof Error ? error.message : 'Invalid loan amounts.',
          );
        }
        const existing = await tx.loan.findFirst({
          where: {
            tenantId: scope.tenantId,
            customer: {
              OR: [
                { id: pending.customerId },
                {
                  phone: {
                    equals: input.phone,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                ...(input.nationalId
                  ? [
                      {
                        nationalId: {
                          equals: input.nationalId,
                          mode: Prisma.QueryMode.insensitive,
                        },
                      },
                    ]
                  : []),
              ],
            },
            status: { notIn: ['REJECTED', 'WRITTEN_OFF', 'CLOSED'] },
          },
          select: { id: true },
        });
        if (existing)
          throw new ConflictException(
            'This borrower already has an open loan.',
          );
        const start = date(input.paymentStartDate, 'Repayment start date');
        const loan = await tx.loan.create({
          data: {
            ...scope,
            customerId: pending.customerId,
            principal: position.principal!,
            balance: position.outstanding,
            currency: 'UGX',
            status: position.closed ? 'CLOSED' : 'CURRENT',
            approvedAt: input.approvalDate
              ? date(input.approvalDate, 'Approval date')
              : undefined,
            disbursedAt: pending.issueDate,
            paymentStartDate: start,
          },
        });
        const application = await tx.loanApplication.create({
          data: {
            ...scope,
            officerUserId: user.userId,
            customerId: pending.customerId,
            loanId: loan.id,
            status: 'SUBMITTED',
            ...applicationNames(input),
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
            templateName: input.loanProductName,
            loanProductTemplateId: product?.id,
            collateralType: input.collateralType,
            principalAmount: position.principal!,
            interestRatePercent: new Prisma.Decimal(input.flatInterestPercent),
            interestType: 'FLAT',
            durationDays: input.durationDays,
            termValue: input.durationDays,
            termUnit: 'DAYS',
            repaymentFrequency: input.repaymentFrequency,
            paymentStartDate: start,
            isOpeningMigration: true,
          },
        });
        const pendingMedia = await tx.borrowerOnboardingPendingMedia.findMany({
          where: { pendingId: pending.id },
        });
        for (const media of pendingMedia)
          await tx.loanApplicationMedia.create({
            data: {
              loanApplicationId: application.id,
              type: media.mediaType as LoanApplicationMediaType,
              storageKey: media.storageKey,
              mimeType: media.mimeType,
              byteSize: media.byteSize,
              fileName: media.fileName,
            },
          });
        if (input.guarantorName || input.guarantorPhone)
          await tx.loanApplicationGuarantor.create({
            data: {
              loanApplicationId: application.id,
              fullName: input.guarantorName,
              phone: input.guarantorPhone,
            },
          });
        await tx.clientWallet.create({
          data: {
            ...scope,
            customerId: pending.customerId,
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
            disbursedAt: pending.issueDate,
            note: 'Historical loan imported as an opening position; cash source was not provided.',
          },
        });
        await tx.borrowerOnboardingReceipt.update({
          where: { id: receipt.id },
          data: { loanId: loan.id },
        });
        await tx.borrowerOnboardingPendingPosition.update({
          where: { id: pending.id },
          data: { completedAt: new Date(), repayable: position.repayable },
        });
        await tx.auditLog.create({
          data: {
            tenantId: scope.tenantId,
            actorUserId: user.userId,
            action: 'borrower_onboarding.completed',
            entityType: 'loan',
            entityId: loan.id,
            ...(correctionRequested
              ? {
                  oldValue: {
                    repayable: pending.repayable.toString(),
                    outstanding: pending.outstanding.toString(),
                  },
                }
              : {}),
            newValue: {
              branchId: scope.branchId,
              customerId: pending.customerId,
              requestId,
              ...(correctionRequested
                ? {
                    repayable: position.repayable.toString(),
                    outstanding: position.outstanding.toString(),
                  }
                : {}),
            },
          },
        });
        return {
          customerId: pending.customerId,
          loanId: loan.id,
          status: 'COMPLETE',
          replayed: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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
    const complete = Boolean(
      input.principal &&
      input.flatInterestPercent !== undefined &&
      input.durationDays &&
      input.repaymentFrequency &&
      input.paymentStartDate,
    );
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
        status: existing.loanId ? 'COMPLETE' : 'NEEDS_LOAN_DETAILS',
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
              status: previous.loanId ? 'COMPLETE' : 'NEEDS_LOAN_DETAILS',
              replayed: true,
            };
          }
          await lockBorrowerIdentity(
            tx,
            scope.tenantId,
            input.nationalId,
            input.phone,
          );
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
          const product = input.loanProductTemplateId ? await tx.loanProductTemplate.findFirst({
            where: { id: input.loanProductTemplateId, tenantId: scope.tenantId, isActive: true, interestType: 'FLAT', OR: [{ branchId }, { branchId: null }] },
            select: { id: true, name: true },
          }) : null;
          if (input.loanProductTemplateId && !product) throw new BadRequestException('Loan type is no longer available for this branch.');
          const issue = date(input.issueDate, 'Issue date');
          const customer = await tx.customer.create({
            data: {
              ...scope,
              fullName: input.fullName,
              phone: input.phone,
              nationalId: input.nationalId,
              email: input.email,
            },
          });
          if (!complete) {
            await tx.borrowerOnboardingPendingPosition.create({
              data: {
                ...scope,
                customerId: customer.id,
                requestId: input.requestId,
                issueDate: issue,
                repayable: position.repayable,
                outstanding: position.outstanding,
                details: input as Prisma.InputJsonObject,
              },
            });
            await tx.borrowerOnboardingReceipt.create({
              data: {
                ...scope,
                requestId: input.requestId,
                requestHash: hash,
                customerId: customer.id,
              },
            });
            await tx.auditLog.create({
              data: {
                tenantId: user.tenantId,
                actorUserId: user.userId,
                action: 'borrower_onboarding.needs_loan_details',
                entityType: 'customer',
                entityId: customer.id,
                newValue: { branchId, requestId: input.requestId },
              },
            });
            return {
              customerId: customer.id,
              loanId: null,
              status: 'NEEDS_LOAN_DETAILS',
              replayed: false,
            };
          }
          const start = date(input.paymentStartDate, 'Repayment start date');
          const loan = await tx.loan.create({
            data: {
              ...scope,
              customerId: customer.id,
              principal: position.principal!,
              balance: position.outstanding,
              currency: 'UGX',
              status: position.closed ? 'CLOSED' : 'CURRENT',
              approvedAt: input.approvalDate
                ? date(input.approvalDate, 'Approval date')
                : undefined,
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
              ...applicationNames(input),
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
              templateName: product?.name ?? input.loanProductName,
              loanProductTemplateId: product?.id,
              collateralType: input.collateralType,
              principalAmount: position.principal!,
              interestRatePercent: new Prisma.Decimal(
                input.flatInterestPercent!,
              ),
              interestType: 'FLAT',
              durationDays: input.durationDays!,
              termValue: input.durationDays!,
              termUnit: 'DAYS',
              repaymentFrequency: input.repaymentFrequency!,
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
          return {
            customerId: customer.id,
            loanId: loan.id,
            status: 'COMPLETE',
            replayed: false,
          };
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
            status: receipt.loanId ? 'COMPLETE' : 'NEEDS_LOAN_DETAILS',
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
