#!/usr/bin/env node

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const BRANCH_ID = '2d0be4c2-cf83-4b29-9ebb-1f15f0988243';
const CUSTOMER_ID = 'cb2c6430-e1b8-4b25-a936-01c59fd7e570';
const FULL_NAME = 'Musimenta Evelyn';
const PHONE = process.env.CLIENT_PHONE || '+256760347636';
const PHONE_ALIASES = Array.from(
  new Set(
    [
      PHONE,
      PHONE.replace(/^\+/, ''),
      PHONE.replace(/^\+256/, '0'),
      PHONE.replace(/^\+256/, ''),
    ].filter(Boolean),
  ),
);
const OUTSTANDING = 555000;
const NOTE =
  '[CARRY-FORWARD] Seeded outstanding loan so Ishongororo can collect. No application or disbursement on an operations day.';

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
    connectionTimeoutMillis: 20000,
  };
  if (wantsSsl) {
    const caPath =
      sslrootcert && existsSync(sslrootcert)
        ? sslrootcert
        : resolve(process.cwd(), 'global-bundle.pem');
    config.ssl = {
      rejectUnauthorized: sslmode !== 'no-verify',
      ca: existsSync(caPath) ? readFileSync(caPath, 'utf8') : undefined,
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

function decimal(value) {
  return new Prisma.Decimal(Number(value).toFixed(2));
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env'));
  loadEnvFile(resolve(process.cwd(), 'services/api/.env'));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');

  const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ['error'],
  });
  const todayLabel = kampalaToday();
  const paymentStartDate = new Date(`${todayLabel}T00:00:00.000Z`);
  const amount = decimal(OUTSTANDING);

  try {
    const branch = await prisma.branch.findUnique({
      where: { id: BRANCH_ID },
      include: { tenant: true },
    });
    if (!branch) throw new Error('Ishongororo branch not found');

    const customerInclude = {
      loans: {
        where: { status: { in: ['CURRENT', 'IN_ARREARS', 'RESTRUCTURED'] } },
        orderBy: { createdAt: 'desc' },
      },
      branch: { select: { id: true, name: true } },
    };

    const otherBranchWithPhone = await prisma.customer.findMany({
      where: {
        tenantId: branch.tenantId,
        branchId: { not: branch.id },
        OR: PHONE_ALIASES.map((phone) => ({ phone })),
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        branch: { select: { name: true } },
      },
    });

    const existingAtBranch =
      (await prisma.customer.findUnique({
        where: { id: CUSTOMER_ID },
        include: customerInclude,
      })) ??
      (await prisma.customer.findFirst({
        where: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          OR: [
            ...PHONE_ALIASES.map((phone) => ({ phone })),
            { fullName: { equals: FULL_NAME, mode: 'insensitive' } },
          ],
        },
        include: customerInclude,
      }));

    if (existingAtBranch && existingAtBranch.branchId !== branch.id) {
      throw new Error(
        `Ishongororo customer ${existingAtBranch.id} is not on Ishongororo. Refusing to move a client from another branch.`,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      let customer = existingAtBranch;
      let createdCustomer = false;
      let createdLoan = false;

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            tenantId: branch.tenantId,
            branchId: branch.id,
            fullName: FULL_NAME,
            phone: PHONE,
          },
          include: customerInclude,
        });
        createdCustomer = true;
      } else {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            branchId: branch.id,
            fullName: FULL_NAME,
            phone: PHONE,
          },
          include: customerInclude,
        });
      }

      const matchingLoan = customer.loans.find(
        (loan) =>
          loan.branchId === branch.id &&
          Number(loan.balance) === OUTSTANDING,
      );

      if (matchingLoan) {
        return {
          createdCustomer,
          createdLoan,
          customer,
          loan: matchingLoan,
          skipped: true,
        };
      }

      const loan = await tx.loan.create({
        data: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          customerId: customer.id,
          principal: amount,
          balance: amount,
          currency: 'UGX',
          status: 'CURRENT',
          paymentStartDate,
        },
      });

      await tx.clientWallet.create({
        data: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          customerId: customer.id,
          loanId: loan.id,
          currency: 'UGX',
          openingBalance: amount,
        },
      });

      createdLoan = true;
      return { createdCustomer, createdLoan, customer, loan, skipped: false };
    });

    console.log(
      JSON.stringify(
        {
          branch: branch.name,
          tenant: branch.tenant.name,
          note: NOTE,
          createdCustomer: result.createdCustomer,
          createdLoan: result.createdLoan,
          skippedExistingOpenLoan: result.skipped,
          leftOtherBranchClientsUntouched: otherBranchWithPhone.map((row) => ({
            id: row.id,
            fullName: row.fullName,
            phone: row.phone,
            branch: row.branch?.name ?? null,
          })),
          customer: {
            id: result.customer.id,
            fullName: result.customer.fullName,
            phone: result.customer.phone,
            branchId: result.customer.branchId,
          },
          loan: {
            id: result.loan.id,
            principal: Number(result.loan.principal),
            balance: Number(result.loan.balance),
            status: result.loan.status,
            paymentStartDate: result.loan.paymentStartDate,
            disbursedAt: result.loan.disbursedAt,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
