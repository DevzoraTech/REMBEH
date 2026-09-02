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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
function stripEnvQuotes(value) {
  const t = value.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}
function isLocal(host) {
  return !host || host === 'localhost' || host === '127.0.0.1';
}
function buildPoolConfig(connectionString) {
  const url = new URL(stripEnvQuotes(connectionString));
  const sslrootcert = url.searchParams.get('sslrootcert');
  const sslmode = url.searchParams.get('sslmode');
  const wantsSsl = Boolean(sslmode && sslmode !== 'disable') || !isLocal(url.hostname);
  const config = {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionTimeoutMillis: 20000,
  };
  if (wantsSsl) {
    const caPath = sslrootcert && existsSync(sslrootcert) ? sslrootcert : resolve(process.cwd(), 'global-bundle.pem');
    config.ssl = { rejectUnauthorized: sslmode !== 'no-verify', ca: readFileSync(caPath, 'utf8') };
  }
  return config;
}

loadEnvFile('/home/ubuntu/rembeh/.env');
loadEnvFile(resolve(process.cwd(), '.env'));

const BRANCH = '2d0be4c2-cf83-4b29-9ebb-1f15f0988243';
const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ['error'] });

async function main() {
  const ops = await prisma.branchDailyOperation.findMany({
    where: { branchId: BRANCH },
    orderBy: { operationDate: 'desc' },
    take: 15,
    select: {
      operationDate: true,
      status: true,
      previousClosingBalance: true,
      closingBalance: true,
      cashInVault: true,
      cashInSafe: true,
      cashAddedToday: true,
      openingFloatAvailable: true,
      notes: true,
    },
  });
  const counts = await prisma.branchDailyOperation.groupBy({
    by: ['status'],
    where: { branchId: BRANCH },
    _count: true,
  });
  const withClose = await prisma.branchDailyOperation.count({
    where: { branchId: BRANCH, closingBalance: { not: null } },
  });
  console.log(JSON.stringify({ counts, withClose, latest: ops }, null, 2));
}
main().finally(async () => { await prisma.$disconnect(); await pool.end(); });
