#!/usr/bin/env node
/**
 * Buremba day accountability dump (Cashboss).
 * Run on EC2 (has DB access): node scripts/inspect-buremba-accountability.cjs [YYYY-MM-DD]
 */
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function stripEnvQuotes(value) {
  const t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function buildPoolConfig(connectionString) {
  const url = new URL(stripEnvQuotes(connectionString));
  const host = url.hostname;
  const sslmode = url.searchParams.get('sslmode');
  const sslrootcert = url.searchParams.get('sslrootcert');
  const local =
    !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const wantsSsl = Boolean(sslmode && sslmode !== 'disable') || !local;
  const config = {
    host,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionTimeoutMillis: 30000,
  };
  if (wantsSsl) {
    const caPath =
      sslrootcert && existsSync(sslrootcert)
        ? sslrootcert
        : resolve(process.cwd(), 'global-bundle.pem');
    config.ssl = {
      rejectUnauthorized: sslmode !== 'no-verify',
      ca: existsSync(caPath) ? readFileSync(caPath, 'utf8') : undefined,
      ...(existsSync(caPath) ? {} : { rejectUnauthorized: false }),
    };
  }
  return config;
}

function kampalaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function n(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber();
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function money(v) {
  return Math.round(n(v) * 100) / 100;
}

function dateKey(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function agentExpectedHandover({
  amountGiven,
  assignedFloatDisbursed,
  amountCollected,
  collectedRepaymentsDisbursed,
  processingFees,
  expensesTotal,
}) {
  const unusedFloat = Math.max(0, amountGiven - assignedFloatDisbursed);
  const collectedRepaymentsAvail = Math.max(
    0,
    amountCollected - collectedRepaymentsDisbursed,
  );
  const expectedHandover = Math.max(
    0,
    unusedFloat + collectedRepaymentsAvail + processingFees - expensesTotal,
  );
  return {
    unusedFloat: money(unusedFloat),
    collectedRepaymentsAvail: money(collectedRepaymentsAvail),
    expectedHandover: money(expectedHandover),
  };
}

loadEnvFile('/home/ubuntu/rembeh/.env');
loadEnvFile(resolve(process.cwd(), '.env'));

const DATE = process.argv[2] || kampalaToday();
const HISTORY_DAYS = Number(process.argv[3] || 21);
const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ['error'] });

async function main() {
  const branches = await prisma.branch.findMany({
    where: { name: { contains: 'burem', mode: 'insensitive' } },
    include: { tenant: { select: { id: true, name: true } } },
  });
  if (!branches.length) {
    console.log(JSON.stringify({ error: 'No Burem* branch found' }));
    return;
  }
  const branch =
    branches.find((b) => /buremba/i.test(b.name)) || branches[0];

  const users = await prisma.user.findMany({
    where: { tenantId: branch.tenantId },
    select: { id: true, displayName: true, phone: true, branchId: true },
  });
  const userName = (id) =>
    users.find((u) => u.id === id)?.displayName || (id ? id.slice(0, 8) : null);

  const dayDate = new Date(`${DATE}T00:00:00.000Z`);
  const operation = await prisma.branchDailyOperation.findFirst({
    where: { branchId: branch.id, operationDate: dayDate },
  });

  const dayFrom = new Date(`${DATE}T00:00:00.000+03:00`);
  const dayTo = new Date(`${DATE}T23:59:59.999+03:00`);

  const floats = await prisma.agentDailyFloat.findMany({
    where: {
      tenantId: branch.tenantId,
      OR: [{ branchId: branch.id }, { branchId: null, agent: { branchId: branch.id } }],
      floatDate: dayDate,
    },
    include: { agent: { select: { id: true, displayName: true, branchId: true } } },
  });

  const expenses = operation
    ? await prisma.branchOperationExpense.findMany({
        where: { operationId: operation.id, voidedAt: null },
        orderBy: { incurredAt: 'asc' },
      })
    : [];

  const topUps = operation
    ? await prisma.branchOperationTopUp.findMany({
        where: { operationId: operation.id },
        orderBy: { addedAt: 'asc' },
      })
    : [];

  const disbursements = await prisma.loanDisbursement.findMany({
    where: {
      tenantId: branch.tenantId,
      branchId: branch.id,
      disbursedAt: { gte: dayFrom, lte: dayTo },
    },
    include: {
      loan: {
        select: {
          id: true,
          customer: { select: { fullName: true } },
          application: {
            select: { processingFee: true, officerUserId: true },
          },
        },
      },
      recordedBy: { select: { id: true, displayName: true } },
    },
    orderBy: { disbursedAt: 'asc' },
  });

  const repayments = await prisma.repayment.findMany({
    where: {
      tenantId: branch.tenantId,
      branchId: branch.id,
      paidAt: { gte: dayFrom, lte: dayTo },
    },
    include: {
      recordedBy: { select: { id: true, displayName: true } },
      loan: { select: { customer: { select: { fullName: true } } } },
    },
    orderBy: { paidAt: 'asc' },
  });

  const applications = await prisma.loanApplication.findMany({
    where: {
      tenantId: branch.tenantId,
      branchId: branch.id,
      status: 'SUBMITTED',
      submittedAt: { gte: dayFrom, lte: dayTo },
    },
    select: {
      id: true,
      officerUserId: true,
      processingFee: true,
      customer: { select: { fullName: true } },
    },
  });

  const salaries = operation
    ? await prisma.salaryPayment.findMany({
        where: { operationId: operation.id, reversedAt: null },
      })
    : [];

  const shortagePayments = operation
    ? await prisma.cashShortagePayment.findMany({
        where: { operationId: operation.id },
      })
    : [];

  const officerIds = new Set([
    ...floats.map((f) => f.agentId),
    ...disbursements.map((d) => d.recordedByUserId),
    ...repayments.map((r) => r.recordedByUserId),
    ...expenses.map((e) => e.agentId).filter(Boolean),
  ]);

  const officers = [];
  for (const officerId of officerIds) {
    const float = floats.find((f) => f.agentId === officerId);
    const amountGiven = money(float?.amountGiven);
    const amountReturned =
      float?.amountReturned != null ? money(float.amountReturned) : null;
    const amountCollected = money(
      repayments
        .filter((r) => r.recordedByUserId === officerId)
        .reduce((s, r) => s + n(r.amount), 0),
    );
    const offsDisb = disbursements.filter(
      (d) => d.recordedByUserId === officerId,
    );
    const assignedFloatDisbursed = money(
      offsDisb.reduce((s, d) => s + n(d.assignedFloatAmount), 0),
    );
    const collectedRepaymentsDisbursed = money(
      offsDisb.reduce((s, d) => s + n(d.collectedRepaymentsAmount), 0),
    );
    const loansTotal = money(offsDisb.reduce((s, d) => s + n(d.amount), 0));
    const processingFees = money(
      applications
        .filter((a) => a.officerUserId === officerId)
        .reduce((s, a) => s + n(a.processingFee), 0),
    );
    const floatExpenses = money(
      expenses
        .filter(
          (e) =>
            e.paidFrom === 'AGENT_FLOAT' &&
            (e.agentId === officerId ||
              (!e.agentId && e.recordedByUserId === officerId)),
        )
        .reduce((s, e) => s + n(e.amount), 0),
    );
    const handover = agentExpectedHandover({
      amountGiven,
      assignedFloatDisbursed,
      amountCollected,
      collectedRepaymentsDisbursed,
      processingFees,
      expensesTotal: floatExpenses,
    });
    officers.push({
      officerId,
      name: userName(officerId),
      amountGiven,
      amountCollected,
      loansTotal,
      assignedFloatDisbursed,
      collectedRepaymentsDisbursed,
      processingFees,
      floatExpenses,
      ...handover,
      amountReturned,
      variance:
        amountReturned == null
          ? null
          : money(amountReturned - handover.expectedHandover),
      loans: offsDisb.map((d) => ({
        amount: money(d.amount),
        fromFloat: money(d.assignedFloatAmount),
        fromCollections: money(d.collectedRepaymentsAmount),
        source: d.source,
        borrower: d.loan?.customer?.fullName ?? null,
        recordedBy: d.recordedBy?.displayName ?? userName(d.recordedByUserId),
        at: d.disbursedAt,
      })),
      collections: repayments
        .filter((r) => r.recordedByUserId === officerId)
        .map((r) => ({
          amount: money(r.amount),
          borrower: r.loan?.customer?.fullName ?? null,
          at: r.paidAt,
        })),
    });
  }

  let opening = money(
    n(operation?.previousClosingBalance) + n(operation?.cashAddedToday),
  );
  if (opening === 0 && n(operation?.openingFloatAvailable) > 0) {
    opening = money(operation.openingFloatAvailable);
  }

  const loansIssuedPrincipal = money(
    disbursements.reduce((s, d) => s + n(d.amount), 0),
  );
  const processingFeesTotal = money(
    applications.reduce((s, a) => s + n(a.processingFee), 0),
  );
  const collectionsReceived = money(
    repayments.reduce((s, r) => s + n(r.amount), 0),
  );
  const shortageRecoveriesTotal = money(
    shortagePayments.reduce((s, p) => s + n(p.amount), 0),
  );
  const expensesTotal = money(expenses.reduce((s, e) => s + n(e.amount), 0));
  const salariesTotal = money(salaries.reduce((s, srow) => s + n(srow.amount), 0));
  const floatIssued = money(floats.reduce((s, f) => s + n(f.amountGiven), 0));
  const cashReturnedByAgents = money(
    floats.reduce((s, f) => s + n(f.amountReturned), 0),
  );
  const branchCashExpenses = money(
    expenses
      .filter((e) => e.paidFrom === 'BRANCH_CASH')
      .reduce((s, e) => s + n(e.amount), 0),
  );

  const expectedClosingBalance = money(
    opening -
      loansIssuedPrincipal +
      processingFeesTotal +
      collectionsReceived +
      shortageRecoveriesTotal -
      expensesTotal -
      salariesTotal,
  );

  const branchCashRemaining = money(
    opening -
      floatIssued -
      branchCashExpenses -
      salariesTotal +
      cashReturnedByAgents +
      shortageRecoveriesTotal,
  );

  const recentOps = await prisma.branchDailyOperation.findMany({
    where: { branchId: branch.id },
    orderBy: { operationDate: 'desc' },
    take: HISTORY_DAYS,
  });

  const history = [];
  for (const dayOp of recentOps) {
    const d = dateKey(dayOp.operationDate);
    const dFrom = new Date(`${d}T00:00:00.000+03:00`);
    const dTo = new Date(`${d}T23:59:59.999+03:00`);
    const opDate = new Date(`${d}T00:00:00.000Z`);

    const [dayFloats, dayExpenses, dayDisb, dayRepay, dayApps, dayTopUps, daySalaries] =
      await Promise.all([
        prisma.agentDailyFloat.findMany({
          where: {
            tenantId: branch.tenantId,
            floatDate: opDate,
            OR: [
              { branchId: branch.id },
              { branchId: null, agent: { branchId: branch.id } },
            ],
          },
        }),
        prisma.branchOperationExpense.findMany({
          where: { operationId: dayOp.id, voidedAt: null },
        }),
        prisma.loanDisbursement.findMany({
          where: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            disbursedAt: { gte: dFrom, lte: dTo },
          },
        }),
        prisma.repayment.findMany({
          where: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            paidAt: { gte: dFrom, lte: dTo },
          },
        }),
        prisma.loanApplication.findMany({
          where: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            status: 'SUBMITTED',
            submittedAt: { gte: dFrom, lte: dTo },
          },
          select: { processingFee: true, officerUserId: true },
        }),
        prisma.branchOperationTopUp.findMany({
          where: { operationId: dayOp.id },
        }),
        prisma.salaryPayment.findMany({
          where: { operationId: dayOp.id, reversedAt: null },
        }),
      ]);

    let dayOpening = money(
      n(dayOp.previousClosingBalance) + n(dayOp.cashAddedToday),
    );
    if (dayOpening === 0 && n(dayOp.openingFloatAvailable) > 0) {
      dayOpening = money(dayOp.openingFloatAvailable);
    }
    const dayLoans = money(dayDisb.reduce((s, x) => s + n(x.amount), 0));
    const dayFees = money(dayApps.reduce((s, x) => s + n(x.processingFee), 0));
    const dayCols = money(dayRepay.reduce((s, x) => s + n(x.amount), 0));
    const dayExp = money(dayExpenses.reduce((s, x) => s + n(x.amount), 0));
    const daySal = money(daySalaries.reduce((s, x) => s + n(x.amount), 0));
    const dayExpected = money(
      dayOpening - dayLoans + dayFees + dayCols - dayExp - daySal,
    );

    const officerMap = new Map();
    for (const f of dayFloats) {
      officerMap.set(f.agentId, {
        name: userName(f.agentId),
        amountGiven: money(f.amountGiven),
        amountReturned:
          f.amountReturned != null ? money(f.amountReturned) : null,
      });
    }
    for (const drow of dayDisb) {
      if (!officerMap.has(drow.recordedByUserId)) {
        officerMap.set(drow.recordedByUserId, {
          name: userName(drow.recordedByUserId),
          amountGiven: 0,
          amountReturned: null,
        });
      }
    }
    for (const [oid, base] of officerMap) {
      const offsDisb = dayDisb.filter((x) => x.recordedByUserId === oid);
      const amountCollected = money(
        dayRepay
          .filter((r) => r.recordedByUserId === oid)
          .reduce((s, r) => s + n(r.amount), 0),
      );
      const assignedFloatDisbursed = money(
        offsDisb.reduce((s, x) => s + n(x.assignedFloatAmount), 0),
      );
      const collectedRepaymentsDisbursed = money(
        offsDisb.reduce((s, x) => s + n(x.collectedRepaymentsAmount), 0),
      );
      const floatExpenses = money(
        dayExpenses
          .filter(
            (e) =>
              e.paidFrom === 'AGENT_FLOAT' &&
              (e.agentId === oid ||
                (!e.agentId && e.recordedByUserId === oid)),
          )
          .reduce((s, e) => s + n(e.amount), 0),
      );
      const fees = money(
        dayApps
          .filter((a) => a.officerUserId === oid)
          .reduce((s, a) => s + n(a.processingFee), 0),
      );
      const h = agentExpectedHandover({
        amountGiven: base.amountGiven,
        assignedFloatDisbursed,
        amountCollected,
        collectedRepaymentsDisbursed,
        processingFees: fees,
        expensesTotal: floatExpenses,
      });
      Object.assign(base, {
        amountCollected,
        loans: money(offsDisb.reduce((s, x) => s + n(x.amount), 0)),
        fromFloat: assignedFloatDisbursed,
        fromCollections: collectedRepaymentsDisbursed,
        fees,
        floatExpenses,
        expectedHandover: h.expectedHandover,
        variance:
          base.amountReturned == null
            ? null
            : money(base.amountReturned - h.expectedHandover),
      });
    }

    history.push({
      date: d,
      status: dayOp.status,
      previousClosing: money(dayOp.previousClosingBalance),
      cashAdded: money(dayOp.cashAddedToday),
      topUps: dayTopUps.map((t) => ({
        amount: money(t.amount),
        description: t.description,
      })),
      opening: dayOpening,
      loans: dayLoans,
      collections: dayCols,
      fees: dayFees,
      expenses: dayExp,
      salaries: daySal,
      floatIssued: money(dayFloats.reduce((s, f) => s + n(f.amountGiven), 0)),
      returned: money(dayFloats.reduce((s, f) => s + n(f.amountReturned), 0)),
      expectedClosing: dayExpected,
      countedClosing:
        dayOp.closingBalance != null ? money(dayOp.closingBalance) : null,
      closeVariance:
        dayOp.closingBalance != null
          ? money(n(dayOp.closingBalance) - dayExpected)
          : null,
      officers: [...officerMap.values()],
    });
  }

  const out = {
    asOfKampala: kampalaToday(),
    date: DATE,
    branch: {
      id: branch.id,
      name: branch.name,
      tenant: branch.tenant.name,
      tenantId: branch.tenantId,
    },
    operation: operation
      ? {
          id: operation.id,
          status: operation.status,
          previousClosingBalance: money(operation.previousClosingBalance),
          cashAddedToday: money(operation.cashAddedToday),
          openingFloatAvailable: money(operation.openingFloatAvailable),
          cashInVault: money(operation.cashInVault),
          cashInSafe: money(operation.cashInSafe),
          closingBalance:
            operation.closingBalance != null
              ? money(operation.closingBalance)
              : null,
          notes: operation.notes,
        }
      : null,
    openingCash: opening,
    topUps: topUps.map((t) => ({
      amount: money(t.amount),
      description: t.description,
      recordedBy: userName(t.recordedByUserId),
      at: t.addedAt,
    })),
    floatIssued,
    cashReturnedByAgents,
    loansIssuedPrincipal,
    collectionsReceived,
    processingFeesTotal,
    expensesTotal,
    branchCashExpenses,
    salariesTotal,
    shortageRecoveriesTotal,
    expectedClosingBalance,
    branchCashRemaining,
    formulas: {
      agentExpectedHandover:
        'max(0, unusedFloat + collectionsStillOnHand + fees − agentFloatExpenses) where unusedFloat=max(0,float−floatUsedInLoans), collectionsStillOnHand=max(0,collected−collectionsUsedInLoans)',
      managerExpectedClose:
        'opening − loans + fees + collections + shortageRecoveries − allExpenses − salaries',
      branchVaultRemaining:
        'opening − floatIssued − branchCashExpenses − salaries + agentReturns + shortageRecoveries',
    },
    loans: disbursements.map((d) => ({
      amount: money(d.amount),
      fromFloat: money(d.assignedFloatAmount),
      fromCollections: money(d.collectedRepaymentsAmount),
      source: d.source,
      borrower: d.loan?.customer?.fullName ?? null,
      recordedBy: d.recordedBy?.displayName ?? userName(d.recordedByUserId),
      at: d.disbursedAt,
    })),
    expensesDetail: expenses.map((e) => ({
      amount: money(e.amount),
      paidFrom: e.paidFrom,
      description: e.description,
      agent: e.agentId ? userName(e.agentId) : null,
      recordedBy: userName(e.recordedByUserId),
      at: e.incurredAt,
    })),
    officers,
    history,
  };

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
