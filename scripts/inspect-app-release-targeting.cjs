#!/usr/bin/env node
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

function strip(value) {
  const t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

loadEnvFile('/home/ubuntu/rembeh/.env');
loadEnvFile(resolve(process.cwd(), '.env'));

const url = new URL(strip(process.env.DATABASE_URL));
const pool = new Pool({
  host: url.hostname,
  port: Number(url.port || 5432),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const testOrg = await prisma.tenant.findFirst({
    where: { name: { contains: 'Test Financial', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  const active = await prisma.appRelease.findMany({
    where: { appName: 'mobile', isActive: true },
    include: {
      tenants: { include: { tenant: { select: { id: true, name: true } } } },
    },
    orderBy: [{ releaseEpoch: 'desc' }, { buildNumber: 'desc' }],
  });

  const withoutTenant = await prisma.appRelease.findFirst({
    where: {
      appName: 'mobile',
      platform: 'android',
      isActive: true,
      audience: 'ALL',
    },
    orderBy: [{ releaseEpoch: 'desc' }, { buildNumber: 'desc' }],
  });

  const withTenant = testOrg
    ? await prisma.appRelease.findFirst({
        where: {
          appName: 'mobile',
          platform: 'android',
          isActive: true,
          OR: [
            { audience: 'ALL' },
            {
              audience: 'SELECTED',
              tenants: { some: { tenantId: testOrg.id } },
            },
          ],
        },
        orderBy: [{ releaseEpoch: 'desc' }, { buildNumber: 'desc' }],
      })
    : null;

  console.log(
    JSON.stringify(
      {
        testOrg,
        active: active.map((r) => ({
          version: r.version,
          build: r.buildNumber,
          epoch: r.releaseEpoch,
          audience: r.audience,
          force: r.forceUpdate,
          mode: r.updateMode,
          tenants: r.tenants.map((t) => ({
            id: t.tenant.id,
            name: t.tenant.name,
          })),
        })),
        checkWithoutTenant: withoutTenant && {
          version: withoutTenant.version,
          build: withoutTenant.buildNumber,
        },
        checkWithTestTenant: withTenant && {
          version: withTenant.version,
          build: withTenant.buildNumber,
          audience: withTenant.audience,
        },
      },
      null,
      2,
    ),
  );
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
