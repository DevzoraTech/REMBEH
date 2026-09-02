#!/usr/bin/env node

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const OPENING = 2_292_000;
const BRANCH_ID = 'd1e902f2-9c3f-4e5b-81ad-3cd855394ded';

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
      ca: readFileSync(caPath, 'utf8'),
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

function previousDateLabel(todayLabel) {
  const today = new Date(`${todayLabel}T00:00:00.000Z`);
  today.setUTCDate(today.getUTCDate() - 1);
  return today.toISOString().slice(0, 10);
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env'));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');

  const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ['error'],
  });
  const todayLabel = kampalaToday();
  const yesterdayLabel = previousDateLabel(todayLabel);
  const yesterday = new Date(`${yesterdayLabel}T00:00:00.000Z`);
  const today = new Date(`${todayLabel}T00:00:00.000Z`);
  const amount = new Prisma.Decimal(OPENING.toFixed(2));

  try {
    const branch = await prisma.branch.findUnique({
      where: { id: BRANCH_ID },
      include: { tenant: true },
    });
    if (!branch) throw new Error('Kakinga branch not found');

    let yesterdayOp = await prisma.branchDailyOperation.findUnique({
      where: {
        tenantId_branchId_operationDate: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          operationDate: yesterday,
        },
      },
    });

    if (!yesterdayOp) {
      const recorder = await prisma.user.findFirst({
        where: { tenantId: branch.tenantId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      });
      if (!recorder) throw new Error('No active user to close yesterday');
      yesterdayOp = await prisma.branchDailyOperation.create({
        data: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          operationDate: yesterday,
          status: 'CLOSED',
          openedAt: new Date(`${yesterdayLabel}T09:00:00.000Z`),
          openedByUserId: recorder.id,
          closedAt: new Date(`${yesterdayLabel}T18:00:00.000Z`),
          closedByUserId: recorder.id,
          cashInVault: amount,
          cashInSafe: new Prisma.Decimal(0),
          cashAddedToday: new Prisma.Decimal(0),
          openingFloatAvailable: amount,
          previousClosingBalance: amount,
          floatSetAsideAmount: amount,
          closingBalance: amount,
          notes:
            '[COGLIM-KAKINGA] Cutover cash. Yesterday closing / today opening UGX 2,292,000.',
          closingNotes:
            '[COGLIM-KAKINGA] Confirmed office closing cash UGX 2,292,000.',
        },
      });
    } else {
      yesterdayOp = await prisma.branchDailyOperation.update({
        where: { id: yesterdayOp.id },
        data: {
          status: 'CLOSED',
          closedAt:
            yesterdayOp.closedAt ||
            new Date(`${yesterdayLabel}T18:00:00.000Z`),
          closingBalance: amount,
          closingNotes:
            '[COGLIM-KAKINGA] Confirmed office closing cash UGX 2,292,000.',
        },
      });
    }

    const todayOp = await prisma.branchDailyOperation.findUnique({
      where: {
        tenantId_branchId_operationDate: {
          tenantId: branch.tenantId,
          branchId: branch.id,
          operationDate: today,
        },
      },
    });

    let todayUpdate = null;
    if (todayOp) {
      const cashAdded = Number(todayOp.cashAddedToday || 0);
      const available = OPENING + cashAdded;
      todayUpdate = await prisma.branchDailyOperation.update({
        where: { id: todayOp.id },
        data: {
          previousClosingBalance: amount,
          openingFloatAvailable: new Prisma.Decimal(available.toFixed(2)),
          floatSetAsideAmount: new Prisma.Decimal(available.toFixed(2)),
        },
      });
    }

    console.log(
      JSON.stringify(
        {
          branch: branch.name,
          tenant: branch.tenant.name,
          yesterday: {
            date: yesterdayLabel,
            status: yesterdayOp.status,
            closingBalance: Number(yesterdayOp.closingBalance),
          },
          today: todayOp
            ? {
                date: todayLabel,
                status: todayUpdate?.status || todayOp.status,
                previousClosingBalance: Number(
                  (todayUpdate || todayOp).previousClosingBalance,
                ),
                openingFloatAvailable: Number(
                  (todayUpdate || todayOp).openingFloatAvailable,
                ),
              }
            : {
                date: todayLabel,
                status: 'not opened yet',
                willOpenWith: OPENING,
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
