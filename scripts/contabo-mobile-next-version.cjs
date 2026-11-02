'use strict';
// Read-only version selection, executed in the production API container.
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

async function main() {
  const [requestedVersion, requestedBuild] = process.argv.slice(1);
  if (!/^\d+\.\d+\.\d+$/.test(requestedVersion || '') || !/^[1-9]\d*$/.test(requestedBuild || '')) throw Error('Invalid version or build');
  const url = new URL(process.env.DATABASE_URL || '');
  if (url.hostname !== 'antikra-postgres' || decodeURIComponent(url.pathname.slice(1)) !== 'rembeh_prod') throw Error('Production database target mismatch');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const rows = await prisma.appRelease.findMany({ where: { appName: 'mobile', platform: 'android' }, select: { version: true, buildNumber: true } });
    const parts = requestedVersion.split('.').map(Number);
    if (parts.some(n => !Number.isSafeInteger(n))) throw Error('Unsafe version');
    const versions = new Set(rows.map(row => row.version));
    let version = requestedVersion;
    while (versions.has(version)) {
      if (!Number.isSafeInteger(++parts[2])) throw Error('Version overflow');
      version = parts.join('.');
    }
    const build = Math.max(Number(requestedBuild), ...rows.map(row => row.buildNumber + 1));
    if (!Number.isSafeInteger(build) || build > 2100000000) throw Error('Android build number limit exceeded');
    console.log(`${version} ${build}`);
  } finally { await prisma.$disconnect(); await pool.end(); }
}
main().catch(error => { console.error('Version lookup failed:', error.message); process.exitCode = 1; });
