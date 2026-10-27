#!/usr/bin/env node

// One-off, evidence-backed repair of an offline application uploaded without
// its loan/disbursement ledger. Dry-run by default; --apply is explicit.
require('reflect-metadata');

const { NestFactory } = require('@nestjs/core');
const { Prisma } = require('@prisma/client');
const { resolve } = require('node:path');
const { AppModule } = require(resolve(process.cwd(), 'services/api/dist/src/app.module'));
const {
  OperationsService,
} = require(resolve(process.cwd(), 'services/api/dist/src/modules/operations/operations.service'));

const BRANCH_ID = '2d0be4c2-cf83-4b29-9ebb-1f15f0988243';
const APPLICATION_ID = 'a3760e61-0b36-45e4-bdec-16cf3e389abb';
const REPORT_ID = '9bf4226e-dedc-4a04-823c-b28fa37ea74d';
const BUSINESS_DATE = '2026-10-26';
const AMOUNT = 200000;
const REPAIR_LOCAL_ID = `confirmed-offline-cashout-${APPLICATION_ID}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const operations = app.get(OperationsService);
    const prisma = operations.repository.prisma;
    const bounds = operations.parseDayBounds(BUSINESS_DATE);
    const application = await prisma.loanApplication.findUnique({
      where: { id: APPLICATION_ID },
    });
    assert(application, 'Application is missing.');
    assert(application.branchId === BRANCH_ID, 'Wrong branch.');
    assert(application.status === 'SUBMITTED', 'Unexpected application status.');
    assert(!application.loanId && !application.customerId && !application.syncedAt,
      'Application has already been linked or repaired.');
    assert(Number(application.principalAmount) === AMOUNT, 'Principal changed.');
    assert(Number(application.interestRatePercent) === 20, 'Interest changed.');
    assert(Number(application.processingFee) === 5000, 'Fee changed.');
    assert(application.durationDays === 30, 'Duration changed.');
    assert(application.paymentStartPolicy === 'NEXT_DAY', 'Payment policy changed.');
    assert(application.submittedAt >= bounds.dayStart &&
      application.submittedAt <= bounds.dayEnd, 'Wrong business date.');
    assert(application.nationalId === 'CIL10429', 'Borrower identity changed.');

    const customers = await prisma.customer.findMany({
      where: {
        tenantId: application.tenantId,
        branchId: BRANCH_ID,
        nationalId: application.nationalId,
        phone: application.phone,
        voidedAt: null,
      },
      select: { id: true },
    });
    assert(customers.length === 1, 'Borrower match is not unique.');
    const customerId = customers[0].id;
    const activeLoans = await prisma.loan.count({
      where: {
        tenantId: application.tenantId,
        customerId,
        status: { notIn: ['CLOSED', 'REJECTED', 'WRITTEN_OFF'] },
      },
    });
    assert(activeLoans === 0, 'Borrower already has an open loan.');
    assert(!(await prisma.loanDisbursement.findUnique({
      where: { localId: REPAIR_LOCAL_ID },
    })), 'Repair disbursement already exists.');

    const operation = await operations.repository.findOperationForDay({
      tenantId: application.tenantId,
      branchId: BRANCH_ID,
      operationDate: bounds.dateOnly,
    });
    assert(operation?.status === 'CLOSED', 'Target day is not closed.');
    const report = await prisma.branchOperationReport.findUnique({
      where: { id: REPORT_ID },
    });
    assert(report?.operationId === operation.id, 'Wrong report.');
    assert(report.status === 'SENT_TO_OWNER', 'Report status changed.');

    const float = await prisma.agentDailyFloat.findFirst({
      where: {
        tenantId: application.tenantId,
        branchId: BRANCH_ID,
        agentId: application.officerUserId,
        floatDate: bounds.dateOnly,
      },
    });
    assert(float && Number(float.amountGiven) === 650000 &&
      Number(float.amountReturned) === 880500,
      'Confirmed officer float or return changed.');

    const before = await operations.toContract(
      operation,
      bounds.dayStart,
      bounds.dayEnd,
    );
    const officer = before.agentReturns.find(
      (row) => row.agentId === application.officerUserId,
    );
    assert(before.loansIssuedPrincipal === 750000 &&
      before.expectedClosingBalance === 1032900 &&
      before.closingBalance === 1037900 &&
      officer?.amountDisbursed === 750000 &&
      officer?.amountReturned === 880500,
      'The report baseline changed; review before repairing.');

    const preview = {
      apply,
      applicationId: APPLICATION_ID,
      customerId,
      amount: AMOUNT,
      funding: 'COLLECTED_REPAYMENTS',
      feeFromApplication: 5000,
      loanOpeningBalance: 240000,
      paymentStartDate: '2026-10-27',
      currentReport: {
        loansIssuedPrincipal: before.loansIssuedPrincipal,
        expectedClosingBalance: before.expectedClosingBalance,
        countedCash: before.closingBalance,
        officerReturned: officer.amountReturned,
      },
      projectedReport: {
        loansIssuedPrincipal: 950000,
        expectedClosingBalance: 837900,
        countedCash: 1037900,
        variance: 200000,
      },
      documentation: 'Offline application has no signature or identity media; this repair records the confirmed physical disbursement but does not fabricate those assets.',
    };
    console.log(JSON.stringify(preview, null, 2));
    if (!apply) return;

    const disbursedAt = application.submittedAt;
    const paymentStartDate = new Date('2026-10-27T09:00:00.000Z');
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.loanApplication.findUnique({
        where: { id: APPLICATION_ID },
      });
      assert(current && !current.loanId && !current.customerId &&
        !current.syncedAt, 'Application changed during repair.');
      assert((await tx.loan.count({
        where: {
          tenantId: application.tenantId,
          customerId,
          status: { notIn: ['CLOSED', 'REJECTED', 'WRITTEN_OFF'] },
        },
      })) === 0, 'An open loan appeared during repair.');

      const loan = await tx.loan.create({
        data: {
          tenantId: application.tenantId,
          branchId: BRANCH_ID,
          customerId,
          principal: new Prisma.Decimal(AMOUNT),
          balance: new Prisma.Decimal(240000),
          currency: 'UGX',
          status: 'CURRENT',
          approvedAt: disbursedAt,
          disbursedAt,
          paymentStartDate,
        },
      });
      const disbursement = await tx.loanDisbursement.create({
        data: {
          localId: REPAIR_LOCAL_ID,
          tenantId: application.tenantId,
          branchId: BRANCH_ID,
          loanId: loan.id,
          recordedByUserId: application.officerUserId,
          amount: new Prisma.Decimal(AMOUNT),
          assignedFloatAmount: new Prisma.Decimal(0),
          collectedRepaymentsAmount: new Prisma.Decimal(AMOUNT),
          source: 'COLLECTED_REPAYMENTS',
          disbursedAt,
          note: 'Confirmed 26 Oct 2026 cash-out; repaired from offline application after physical cash and officer return were confirmed by owner.',
        },
      });
      await tx.clientWallet.create({
        data: {
          tenantId: application.tenantId,
          branchId: BRANCH_ID,
          customerId,
          loanId: loan.id,
          loanApplicationId: APPLICATION_ID,
          currency: 'UGX',
          openingBalance: new Prisma.Decimal(240000),
        },
      });
      await tx.loanApplication.update({
        where: { id: APPLICATION_ID },
        data: {
          customerId,
          loanId: loan.id,
          syncedAt: new Date(),
          paymentStartDate,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: application.tenantId,
          actorUserId: null,
          action: 'loan.offline_disbursement.confirmed_repair',
          entityType: 'loan_application',
          entityId: APPLICATION_ID,
          oldValue: {
            loanId: null,
            customerId: null,
            syncedAt: null,
          },
          newValue: {
            loanId: loan.id,
            disbursementId: disbursement.id,
            customerId,
            amount: AMOUNT,
            source: 'COLLECTED_REPAYMENTS',
            businessDate: BUSINESS_DATE,
            confirmedPhysicalCash: true,
            confirmedOfficerReturn: 880500,
            signatureMediaPresent: false,
            note: 'User confirmed Ruth received UGX 200,000 and Joshua returned UGX 880,500. Physical count was preserved.',
          },
        },
      });
      return { loanId: loan.id, disbursementId: disbursement.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const refreshed = await operations.refreshDayAfterRepaymentCorrection({
      tenantId: application.tenantId,
      branchId: BRANCH_ID,
      operationDate: BUSINESS_DATE,
      actorUserId: null,
    });
    console.log(JSON.stringify({ result, refreshed }, null, 2));
    assert(refreshed.refreshed &&
      refreshed.expectedClosingBalance === 837900 &&
      refreshed.countedCash === 1037900 &&
      refreshed.variance === 200000,
      'Ledger posted, but report did not match projected totals. Investigate immediately.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
