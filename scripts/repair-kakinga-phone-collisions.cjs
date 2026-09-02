#!/usr/bin/env node

/**
 * Split Cognate customers that were reused across Ishongororo and Kakinga
 * because the Coglim phones collided during import.
 */

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const KAKINGA = 'd1e902f2-9c3f-4e5b-81ad-3cd855394ded';
const ISHONGORORO = '2d0be4c2-cf83-4b29-9ebb-1f15f0988243';

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
  const local =
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1';
  const wantsSsl =
    Boolean(sslmode && sslmode !== 'disable') || !local;
  const config = {
    host,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionTimeoutMillis: 20000,
  };
  if (!wantsSsl) return config;
  const caPath = resolveSslRootCertPath(sslrootcert);
  config.ssl = {
    rejectUnauthorized: sslmode !== 'no-verify',
    ca: readFileSync(caPath, 'utf8'),
  };
  return config;
}

function uniquePhone(id) {
  const n = BigInt(`0x${String(id).replace(/-/g, '').slice(0, 12)}`);
  return `+2568${String(n % 100000000n).padStart(8, '0')}`;
}

async function main() {
  loadEnvFile(resolve(process.cwd(), '.env'));
  loadEnvFile(resolve(process.cwd(), '../../.env'));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ['error'],
  });

  try {
    const crossed = await prisma.customer.findMany({
      where: {
        branchId: KAKINGA,
        loans: { some: { branchId: ISHONGORORO } },
      },
        include: {
        loans: { select: { id: true, branchId: true } },
        wallets: { select: { id: true, loanId: true, branchId: true } },
        loanApplications: { select: { id: true, branchId: true } },
      },
    });

    const preview = crossed.map((row) => ({
      id: row.id,
      name: row.fullName,
      phone: row.phone,
      ishongororoLoans: row.loans.filter((loan) => loan.branchId === ISHONGORORO)
        .length,
      kakingaLoans: row.loans.filter((loan) => loan.branchId === KAKINGA).length,
    }));
    console.log(JSON.stringify({ affected: preview.length, preview }, null, 2));
    if (process.env.DRY_RUN === '1') return;

    let cloned = 0;
    for (const row of crossed) {
      const kakingaLoans = row.loans.filter((loan) => loan.branchId === KAKINGA);
      const kakingaApps = row.loanApplications.filter(
        (app) => app.branchId === KAKINGA,
      );
      let phone = uniquePhone(row.id);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const taken = await prisma.customer.findUnique({
          where: {
            tenantId_phone: { tenantId: row.tenantId, phone },
          },
          select: { id: true },
        });
        if (!taken) break;
        phone = `+2568${String((BigInt(phone.slice(-8)) + 1n) % 100000000n).padStart(8, '0')}`;
      }
      const clone = await prisma.customer.create({
        data: {
          tenantId: row.tenantId,
          branchId: KAKINGA,
          fullName: row.fullName,
          phone,
          nationalId: row.nationalId
            ? `KAK-${row.nationalId}`.slice(0, 64)
            : `KAK-${row.id.slice(0, 8)}`,
          email: row.email,
          verifiedAt: row.verifiedAt,
          createdAt: row.createdAt,
        },
      });
      if (kakingaLoans.length) {
        await prisma.loan.updateMany({
          where: { id: { in: kakingaLoans.map((loan) => loan.id) } },
          data: { customerId: clone.id },
        });
        await prisma.clientWallet.updateMany({
          where: {
            loanId: { in: kakingaLoans.map((loan) => loan.id) },
          },
          data: { customerId: clone.id },
        });
      }
      if (kakingaApps.length) {
        await prisma.loanApplication.updateMany({
          where: { id: { in: kakingaApps.map((app) => app.id) } },
          data: { customerId: clone.id },
        });
      }
      await prisma.customer.update({
        where: { id: row.id },
        data: { branchId: ISHONGORORO },
      });
      cloned += 1;
    }

    const after = {
      crossedAfter: await prisma.loan.count({
        where: { branchId: ISHONGORORO, customer: { branchId: KAKINGA } },
      }),
      kakingaCustomers: await prisma.customer.count({
        where: { branchId: KAKINGA },
      }),
      ishongororoCustomers: await prisma.customer.count({
        where: { branchId: ISHONGORORO },
      }),
      cloned,
    };
    console.log(JSON.stringify(after, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
