#!/usr/bin/env node

/**
 * Seed Cognate / Ishongororo from the Coglim export.
 * Does not create users. Existing branch staff record the rows; officer
 * names stay in notes only.
 */

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const NOTE_PREFIX = process.env.COGLIM_NOTE_PREFIX || '[COGLIM-ISHONGORORO]';

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
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isLocalHostname(host) {
  return (
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local')
  );
}

function resolveSslRootCertPath(sslrootcert) {
  const candidates = [];
  if (sslrootcert) {
    if (sslrootcert.startsWith('/')) candidates.push(sslrootcert);
    else {
      candidates.push(resolve(process.cwd(), sslrootcert));
      candidates.push(resolve(process.cwd(), '../../', sslrootcert));
    }
  }
  candidates.push(resolve(process.cwd(), 'global-bundle.pem'));
  candidates.push(resolve(process.cwd(), '../../global-bundle.pem'));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function buildPoolConfig(connectionString) {
  const url = new URL(stripEnvQuotes(connectionString));
  const host = url.hostname;
  const sslmode = url.searchParams.get('sslmode');
  const sslrootcert = url.searchParams.get('sslrootcert');
  const wantsSsl =
    Boolean(sslmode && sslmode !== 'disable') || !isLocalHostname(host);
  const config = {
    host,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionTimeoutMillis: 20000,
    ssl: undefined,
  };
  if (!wantsSsl) return config;
  const caPath = resolveSslRootCertPath(sslrootcert);
  if (!existsSync(caPath)) {
    throw new Error(`RDS SSL root certificate not found at ${caPath}`);
  }
  config.ssl = {
    rejectUnauthorized: sslmode !== 'no-verify',
    ca: readFileSync(caPath, 'utf8'),
  };
  return config;
}

function decimal(value) {
  return new Prisma.Decimal(Number(value || 0).toFixed(2));
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function kampalaDate(isoDate) {
  if (!isoDate) return new Date();
  return new Date(`${isoDate}T09:00:00.000Z`);
}

function dateOnly(isoDate) {
  const value = isoDate || new Date().toISOString().slice(0, 10);
  return new Date(`${value}T00:00:00.000Z`);
}

function allocateRepayment(amount, remainingFees, remainingInterest, remainingPrincipal) {
  let left = round2(Math.max(0, amount));
  const feesAllocated = round2(Math.min(left, Math.max(0, remainingFees)));
  left = round2(Math.max(0, left - feesAllocated));
  const interestAllocated = round2(Math.min(left, Math.max(0, remainingInterest)));
  left = round2(Math.max(0, left - interestAllocated));
  let principalAllocated = round2(Math.min(left, Math.max(0, remainingPrincipal)));
  left = round2(Math.max(0, left - principalAllocated));
  if (left > 0) principalAllocated = round2(principalAllocated + left);
  return { feesAllocated, interestAllocated, principalAllocated };
}

function note(text) {
  return `${NOTE_PREFIX} ${text}`.slice(0, 1000);
}

function resolvePackPath() {
  const candidates = [
    process.env.COGLIM_IMPORT_PATH,
    resolve(process.cwd(), 'data/coglim-export/ishongororo/ishongororo-import.json'),
    resolve(process.cwd(), '../../data/coglim-export/ishongororo/ishongororo-import.json'),
    resolve(__dirname, '../data/coglim-export/ishongororo/ishongororo-import.json'),
    resolve(__dirname, '../data/coglim-export/kakinga/kakinga-import.json'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Import pack not found. Set COGLIM_IMPORT_PATH. Looked in:\n${candidates.join('\n')}`,
  );
}

async function resolveBranch(prisma, pack) {
  if (process.env.LEGACY_BRANCH_ID) {
    const branch = await prisma.branch.findUnique({
      where: { id: process.env.LEGACY_BRANCH_ID },
      include: { tenant: true },
    });
    if (!branch) throw new Error(`Branch ${process.env.LEGACY_BRANCH_ID} not found`);
    return branch;
  }

  const tenantHints = pack.tenantHints || ['Cognate'];
  const branchHints = pack.branchHints || ['Ishongororo'];
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
  });
  const tenant = tenants.find((row) =>
    tenantHints.some((hint) => row.name.toLowerCase().includes(hint.toLowerCase())),
  );
  if (!tenant) {
    throw new Error(
      `No tenant matched ${tenantHints.join(', ')}. Found: ${tenants.map((t) => t.name).join(', ') || '(none)'}`,
    );
  }

  const branches = await prisma.branch.findMany({
    where: { tenantId: tenant.id },
    include: { tenant: true },
  });
  const matches = branches.filter((row) =>
    branchHints.some((hint) => row.name.toLowerCase().includes(hint.toLowerCase())),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(
      `No branch matched ${branchHints.join(', ')} on ${tenant.name}. Found: ${branches.map((b) => b.name).join(', ') || '(none)'}`,
    );
  }
  throw new Error(
    `Multiple matching branches. Set LEGACY_BRANCH_ID:\n${matches
      .map((b) => `${b.name} ${b.id}`)
      .join('\n')}`,
  );
}

async function resolveRecorder(prisma, branch) {
  const users = await prisma.user.findMany({
    where: {
      tenantId: branch.tenantId,
      status: 'ACTIVE',
    },
    include: {
      roles: { include: { role: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!users.length) {
    throw new Error(`No active users on tenant ${branch.tenant.name}. Invite a manager first.`);
  }

  const score = (user) => {
    const names = user.roles.map((row) => (row.role.name || '').toLowerCase()).join(' ');
    if (user.branchId === branch.id && names.includes('manager')) return 5;
    if (names.includes('owner')) return 4;
    if (user.branchId === branch.id) return 3;
    if (names.includes('manager')) return 2;
    return 1;
  };

  return [...users].sort((a, b) => score(b) - score(a))[0];
}

async function ensureOperation(prisma, cache, input) {
  const key = input.isoDate;
  if (cache.has(key)) return cache.get(key);

  const operationDate = dateOnly(input.isoDate);
  const existing = await prisma.branchDailyOperation.findUnique({
    where: {
      tenantId_branchId_operationDate: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        operationDate,
      },
    },
  });
  if (existing) {
    cache.set(key, existing);
    return existing;
  }

  const created = await prisma.branchDailyOperation.create({
    data: {
      tenantId: input.tenantId,
      branchId: input.branchId,
      operationDate,
      status: 'CLOSED',
      openedAt: kampalaDate(input.isoDate),
      openedByUserId: input.userId,
      closedAt: kampalaDate(input.isoDate),
      closedByUserId: input.userId,
      cashInVault: decimal(0),
      cashInSafe: decimal(0),
      cashAddedToday: decimal(0),
      openingFloatAvailable: decimal(0),
      previousClosingBalance: decimal(0),
      floatSetAsideAmount: decimal(0),
      notes: note('Historical Coglim operating day imported for cash books.'),
      closingNotes: note('Closed after Coglim historical import.'),
    },
  });
  cache.set(key, created);
  return created;
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env'));
  loadEnvFile(resolve(process.cwd(), '../../.env'));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const dryRun = process.env.DRY_RUN === '1';
  const packPath = resolvePackPath();
  const pack = JSON.parse(readFileSync(packPath, 'utf8'));
  const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ['error'],
  });

  try {
    await prisma.$connect();
    const branch = await resolveBranch(prisma, pack);
    const recorder = await resolveRecorder(prisma, branch);
    const existing = {
      customers: await prisma.customer.count({
        where: { tenantId: branch.tenantId, branchId: branch.id },
      }),
      loans: await prisma.loan.count({
        where: { tenantId: branch.tenantId, branchId: branch.id },
      }),
      repayments: await prisma.repayment.count({
        where: { tenantId: branch.tenantId, branchId: branch.id },
      }),
    };

    const preview = {
      pack: packPath,
      dryRun,
      tenant: { id: branch.tenantId, name: branch.tenant.name },
      branch: { id: branch.id, name: branch.name },
      recorder: {
        id: recorder.id,
        name: recorder.displayName,
        email: recorder.email,
        role: recorder.roles.map((row) => row.role.name).join(', '),
      },
      existing,
      expected: pack.expected,
      usersCreated: 0,
    };
    console.log(JSON.stringify(preview, null, 2));
    if (dryRun) return;

    const customerIds = new Map();
    let customersCreated = 0;
    let customersUpdated = 0;

    for (const row of pack.customers) {
      const nationalId = row.systemNumber || `${row.sourceId}`;
      const existingByNational = await prisma.customer.findFirst({
        where: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          nationalId,
        },
        select: { id: true, phone: true },
      });
      const existingByPhone = await prisma.customer.findUnique({
        where: {
          tenantId_phone: {
            tenantId: branch.tenantId,
            phone: row.phone,
          },
        },
        select: { id: true, branchId: true },
      });
      const reusableByPhone =
        existingByPhone && existingByPhone.branchId === branch.id
          ? existingByPhone
          : null;

      const data = {
        branchId: branch.id,
        fullName: row.fullName,
        nationalId,
        verifiedAt: kampalaDate(row.registeredOn),
      };

      let customer;
      if (existingByNational) {
        customer = await prisma.customer.update({
          where: { id: existingByNational.id },
          data: {
            ...data,
            phone: existingByNational.phone || row.phone,
          },
        });
        customersUpdated += 1;
      } else if (reusableByPhone) {
        customer = await prisma.customer.update({
          where: { id: reusableByPhone.id },
          data,
        });
        customersUpdated += 1;
      } else {
        let phone = row.phone;
        if (existingByPhone && existingByPhone.branchId !== branch.id) {
          const n = BigInt(
            `0x${String(row.sourceId).replace(/\W/g, '').padEnd(12, '0').slice(0, 12)}`,
          );
          phone = `+2568${String(n % 100000000n).padStart(8, '0')}`;
        }
        customer = await prisma.customer.create({
          data: {
            tenantId: branch.tenantId,
            phone,
            ...data,
            createdAt: kampalaDate(row.registeredOn),
          },
        });
        customersCreated += 1;
      }
      customerIds.set(String(row.sourceId), customer.id);
    }

    let loansCreated = 0;
    let loansUpdated = 0;
    let repaymentsCreated = 0;
    let disbursementsCreated = 0;
    const existingDisbursements = new Set(
      (
        await prisma.loanDisbursement.findMany({
          where: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            localId: { not: null },
          },
          select: { localId: true },
        })
      )
        .map((row) => row.localId)
        .filter(Boolean),
    );
    const existingRepayments = new Set(
      (
        await prisma.repayment.findMany({
          where: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            localId: { not: null },
          },
          select: { localId: true },
        })
      )
        .map((row) => row.localId)
        .filter(Boolean),
    );

    for (const loanRow of pack.loans) {
      const customerId = customerIds.get(String(loanRow.sourceCustomerId));
      if (!customerId) {
        throw new Error(`Missing customer ${loanRow.sourceCustomerId} for ${loanRow.sourceLoanKey}`);
      }

      const disbursementLocalId = `cil-issue-${loanRow.sourceLoanKey}`;
      const issuedAt = kampalaDate(loanRow.issuedOn);
      const dueAt = loanRow.dueOn ? kampalaDate(loanRow.dueOn) : issuedAt;
      const principal = round2(loanRow.principal);
      const opening = round2(loanRow.totalReturn);
      const balance = round2(loanRow.balance);
      const interest = round2(Math.max(0, opening - principal));

      let loan = null;
      const existingIssue = await prisma.loanDisbursement.findUnique({
        where: { localId: disbursementLocalId },
        select: { loanId: true },
      });
      if (existingIssue) {
        loan = await prisma.loan.update({
          where: { id: existingIssue.loanId },
          data: {
            principal: decimal(principal),
            balance: decimal(balance),
            status: loanRow.status,
            approvedAt: issuedAt,
            disbursedAt: issuedAt,
            paymentStartDate: dueAt,
          },
        });
        await prisma.clientWallet.upsert({
          where: { loanId: loan.id },
          update: { openingBalance: decimal(opening) },
          create: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            customerId,
            loanId: loan.id,
            currency: 'UGX',
            openingBalance: decimal(opening),
          },
        });
        loansUpdated += 1;
      } else {
        loan = await prisma.loan.create({
          data: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            customerId,
            principal: decimal(principal),
            balance: decimal(balance),
            currency: 'UGX',
            status: loanRow.status,
            approvedAt: issuedAt,
            disbursedAt: issuedAt,
            paymentStartDate: dueAt,
            createdAt: issuedAt,
          },
        });
        await prisma.clientWallet.create({
          data: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            customerId,
            loanId: loan.id,
            currency: 'UGX',
            openingBalance: decimal(opening),
          },
        });
        loansCreated += 1;
      }

      if (!existingDisbursements.has(disbursementLocalId)) {
        await prisma.loanDisbursement.create({
          data: {
            localId: disbursementLocalId,
            tenantId: branch.tenantId,
            branchId: branch.id,
            loanId: loan.id,
            recordedByUserId: recorder.id,
            amount: decimal(principal),
            assignedFloatAmount: decimal(principal),
            source: 'ASSIGNED_FLOAT',
            disbursedAt: issuedAt,
            note: note(
              `Issued in Coglim. Cycle ${loanRow.sourceLoanKey}` +
                (loanRow.coglimIssueId ? ` issue ${loanRow.coglimIssueId}` : '') +
                (loanRow.isOfficialCurrent ? ' · official open book' : ' · historical cycle'),
            ),
          },
        });
        existingDisbursements.add(disbursementLocalId);
        disbursementsCreated += 1;
      }

      let remainingInterest = interest;
      let remainingPrincipal = principal;
      const repaymentRows = [];
      for (const payment of loanRow.payments) {
        if (existingRepayments.has(payment.sourceKey)) continue;
        const amount = round2(payment.amount);
        const alloc = allocateRepayment(amount, 0, remainingInterest, remainingPrincipal);
        remainingInterest = round2(Math.max(0, remainingInterest - alloc.interestAllocated));
        remainingPrincipal = round2(Math.max(0, remainingPrincipal - alloc.principalAllocated));
        repaymentRows.push({
          localId: payment.sourceKey,
          tenantId: branch.tenantId,
          branchId: branch.id,
          loanId: loan.id,
          recordedByUserId: recorder.id,
          amount: decimal(amount),
          principalAllocated: decimal(alloc.principalAllocated),
          interestAllocated: decimal(alloc.interestAllocated),
          feesAllocated: decimal(alloc.feesAllocated),
          method: 'CASH',
          paidAt: kampalaDate(payment.paidOn),
          note: note(
            `Coglim statement payment` +
              (payment.balanceAfter != null ? ` · balance after ${payment.balanceAfter}` : ''),
          ),
          receiptNumber: payment.sourceKey.slice(0, 40),
        });
      }
      if (repaymentRows.length) {
        await prisma.repayment.createMany({ data: repaymentRows, skipDuplicates: true });
        repaymentsCreated += repaymentRows.length;
        for (const row of repaymentRows) existingRepayments.add(row.localId);
      }

      await prisma.loan.update({
        where: { id: loan.id },
        data: {
          balance: decimal(balance),
          status: loanRow.status,
        },
      });
    }

    const operations = new Map();
    let topUpsCreated = 0;
    let expensesCreated = 0;
    const existingTopUpNotes = new Set(
      (
        await prisma.branchOperationTopUp.findMany({
          where: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            description: { startsWith: NOTE_PREFIX },
          },
          select: { description: true, amount: true, addedAt: true },
        })
      ).map((row) => `${row.description}|${row.amount}|${row.addedAt.toISOString().slice(0, 10)}`),
    );
    const existingExpenseNotes = new Set(
      (
        await prisma.branchOperationExpense.findMany({
          where: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            description: { startsWith: NOTE_PREFIX },
          },
          select: { description: true, amount: true, incurredAt: true },
        })
      ).map((row) => `${row.description}|${row.amount}|${row.incurredAt.toISOString().slice(0, 10)}`),
    );

    for (const row of pack.capital) {
      if (!row.date || !row.amount) continue;
      const description = note(
        `Capital from ${row.source || 'Management'} to ${row.to || 'branch'} via ${row.method || 'cash'} · ${row.sourceKey}`,
      );
      const key = `${description}|${Number(row.amount).toFixed(2)}|${row.date}`;
      if (existingTopUpNotes.has(key)) continue;
      const operation = await ensureOperation(prisma, operations, {
        tenantId: branch.tenantId,
        branchId: branch.id,
        isoDate: row.date,
        userId: recorder.id,
      });
      await prisma.branchOperationTopUp.create({
        data: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          operationId: operation.id,
          amount: decimal(row.amount),
          description,
          addedAt: kampalaDate(row.date),
          recordedByUserId: recorder.id,
        },
      });
      existingTopUpNotes.add(key);
      topUpsCreated += 1;
    }

    for (const row of pack.expenses) {
      if (!row.date || row.amount == null) continue;
      const description = note(`${row.name} · ${row.method || 'Cash'} · ${row.sourceKey}`);
      const key = `${description}|${Number(row.amount).toFixed(2)}|${row.date}`;
      if (existingExpenseNotes.has(key)) continue;
      const operation = await ensureOperation(prisma, operations, {
        tenantId: branch.tenantId,
        branchId: branch.id,
        isoDate: row.date,
        userId: recorder.id,
      });
      await prisma.branchOperationExpense.create({
        data: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          operationId: operation.id,
          amount: decimal(row.amount),
          description,
          incurredAt: kampalaDate(row.date),
          recordedByUserId: recorder.id,
        },
      });
      existingExpenseNotes.add(key);
      expensesCreated += 1;
    }

    for (const row of pack.excess) {
      if (!row.date || row.amount == null) continue;
      const description = note(`Excess/shortage: ${row.reason} · ${row.sourceKey}`);
      const key = `${description}|${Number(row.amount).toFixed(2)}|${row.date}`;
      if (existingExpenseNotes.has(key)) continue;
      const operation = await ensureOperation(prisma, operations, {
        tenantId: branch.tenantId,
        branchId: branch.id,
        isoDate: row.date,
        userId: recorder.id,
      });
      await prisma.branchOperationExpense.create({
        data: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          operationId: operation.id,
          amount: decimal(row.amount),
          description,
          incurredAt: kampalaDate(row.date),
          recordedByUserId: recorder.id,
        },
      });
      existingExpenseNotes.add(key);
      expensesCreated += 1;
    }

    const [customerCount, loanAgg, repaymentAgg, officialLoans, topUpAgg, expenseAgg] =
      await Promise.all([
        prisma.customer.count({
          where: { tenantId: branch.tenantId, branchId: branch.id },
        }),
        prisma.loan.aggregate({
          where: { tenantId: branch.tenantId, branchId: branch.id },
          _count: { _all: true },
          _sum: { principal: true, balance: true },
        }),
        prisma.repayment.aggregate({
          where: { tenantId: branch.tenantId, branchId: branch.id },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        prisma.loan.aggregate({
          where: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            status: { in: ['CURRENT', 'IN_ARREARS'] },
          },
          _count: { _all: true },
          _sum: { balance: true },
        }),
        prisma.branchOperationTopUp.aggregate({
          where: { tenantId: branch.tenantId, branchId: branch.id },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        prisma.branchOperationExpense.aggregate({
          where: { tenantId: branch.tenantId, branchId: branch.id },
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ]);

    const summary = {
      usersCreated: 0,
      customersCreated,
      customersUpdated,
      loansCreated,
      loansUpdated,
      disbursementsCreated,
      repaymentsCreated,
      topUpsCreated,
      expensesCreated,
      after: {
        customers: customerCount,
        loans: loanAgg._count._all,
        principal: Number(loanAgg._sum.principal ?? 0),
        openLoans: officialLoans._count._all,
        openBalance: Number(officialLoans._sum.balance ?? 0),
        repayments: repaymentAgg._count._all,
        collected: Number(repaymentAgg._sum.amount ?? 0),
        capitalRows: topUpAgg._count._all,
        capitalIn: Number(topUpAgg._sum.amount ?? 0),
        expenseRows: expenseAgg._count._all,
        expenses: Number(expenseAgg._sum.amount ?? 0),
      },
      expected: pack.expected,
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
