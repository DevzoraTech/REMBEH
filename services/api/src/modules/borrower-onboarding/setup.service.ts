import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../database/prisma.service';

const allowedFields = new Set(
  `full_name surname given_names phone nin email gender dob district subcounty parish village principal repayable outstanding currency loan_status date_approved date_issued repayment_start loan_officer loan_product loan_purpose collateral_type has_fines total_fines interest_rate interest_type duration_days term_value term_unit frequency processing_fee processing_fee_type processing_percent processing_fixed penalty_rate fine_period repayment_policy repayment_delay officer_may_choose history_amount history_date history_method history_receipt history_officer history_principal history_interest history_fees history_note guar_name guar_phone guar_id_front guar_id_back guar_signature borrower_photo borrower_id_front borrower_id_back collateral_doc supporting_doc other_doc borrower_signature officer_signature signed_agreement disbursed_amount disbursed_date disbursed_source disbursed_float disbursed_collections disbursed_officer disbursed_note`.split(
    ' ',
  ),
);
const requiredFields = [
  'full_name',
  'phone',
  'repayable',
  'outstanding',
  'date_issued',
];

@Injectable()
export class BorrowerOnboardingSetupService {
  constructor(private readonly prisma: PrismaService) {}

  private scope(user: AuthenticatedUser) {
    if (!user.branchId)
      throw new ForbiddenException('A branch assignment is required.');
    return { tenantId: user.tenantId, branchId: user.branchId };
  }

  async get(user: AuthenticatedUser) {
    const scope = this.scope(user);
    return this.prisma.borrowerOnboardingSetup.findFirst({ where: scope });
  }

  async save(user: AuthenticatedUser, body: unknown) {
    const scope = this.scope(user);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Invalid setup.');
    const { selectedFields, revision } = body as Record<string, unknown>;
    if (
      !Array.isArray(selectedFields) ||
      selectedFields.length > allowedFields.size ||
      selectedFields.some(
        (x) => typeof x !== 'string' || !allowedFields.has(x),
      ) ||
      new Set(selectedFields).size !== selectedFields.length ||
      requiredFields.some((x) => !selectedFields.includes(x))
    ) {
      throw new BadRequestException(
        'Select the required fields and valid optional fields.',
      );
    }
    if (!Number.isInteger(revision) || (revision as number) < 0)
      throw new BadRequestException('Invalid revision.');
    if (revision === 0) {
      try {
        return await this.prisma.borrowerOnboardingSetup.create({
          data: { ...scope, selectedFields },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          throw new ConflictException(
            'Setup changed on another device. Refresh and try again.',
          );
        throw error;
      }
    }
    const updated = await this.prisma.borrowerOnboardingSetup.updateMany({
      where: { ...scope, revision: revision as number },
      data: { selectedFields, revision: { increment: 1 } },
    });
    if (updated.count !== 1)
      throw new ConflictException(
        'Setup changed on another device. Refresh and try again.',
      );
    return this.get(user);
  }
}
