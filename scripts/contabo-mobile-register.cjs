'use strict';
// Runs ONLY inside the authorized production API container.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

async function main() {
  const [apkPath, version, buildText, epochText, expectedHash, forceText] = process.argv.slice(2);
  if (!apkPath || !/^\d+\.\d+\.\d+$/.test(version || '') || !/^[1-9]\d*$/.test(buildText || '') || !/^[1-9]\d*$/.test(epochText || '') || !/^[a-f0-9]{64}$/.test(expectedHash || '') || !['true','false'].includes(forceText)) throw Error('Invalid release arguments');
  const buildNumber = Number(buildText), releaseEpoch = Number(epochText);
  if (!Number.isSafeInteger(buildNumber) || !Number.isSafeInteger(releaseEpoch)) throw Error('Unsafe build/epoch');
  const url = new URL(process.env.DATABASE_URL || '');
  if (url.hostname !== 'antikra-postgres' || decodeURIComponent(url.pathname.slice(1)) !== 'rembeh_prod') throw Error('Production database target mismatch');
  if (process.env.S3_BUCKET !== 'antikra-rembeh-files' || !process.env.S3_ENDPOINT || !process.env.S3_REGION) throw Error('Production object storage target mismatch');
  if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) throw Error('Object storage credentials unavailable');
  const body = fs.readFileSync(apkPath);
  if (!body.length || crypto.createHash('sha256').update(body).digest('hex') !== expectedHash) throw Error('APK checksum mismatch');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const s3 = new S3Client({ region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } });
  const key = `releases/mobile/android/line-${releaseEpoch}/build-${buildNumber}/rembeh-v${version}.apk`;
  let uploaded = false;
  try {
    const rows = await prisma.$queryRaw`select current_database() as database`;
    if (rows[0]?.database !== 'rembeh_prod') throw Error('Connected database mismatch');
    const existing = await prisma.appRelease.findFirst({ where: { appName:'mobile', platform:'android', OR: [{ version }, { buildNumber: { gte: buildNumber } }] } });
    if (existing) throw Error(`Version or build is already used or outdated. Rebuild with ./scripts/deploy-mobile.sh; signed APKs cannot be renumbered`);
    // Prevent overwriting any pre-existing object even when no DB record exists.
    try { await s3.send(new HeadObjectCommand({Bucket:process.env.S3_BUCKET, Key:key})); throw Error('Object key already exists; refusing overwrite'); }
    catch (e) { if (e.message?.includes('refusing overwrite')) throw e; if (!(e.$metadata?.httpStatusCode === 404 || e.name === 'NotFound' || e.name === 'NoSuchKey')) throw e; }
    await s3.send(new PutObjectCommand({Bucket:process.env.S3_BUCKET, Key:key, Body:body, ContentType:'application/vnd.android.package-archive', Metadata:{'sha256-hash':expectedHash}}));
    uploaded = true;
    const head = await s3.send(new HeadObjectCommand({Bucket:process.env.S3_BUCKET, Key:key}));
    if (head.ContentLength !== body.length) throw Error('Object size verification failed');
    const created = await prisma.appRelease.create({ data:{appName:'mobile', platform:'android', version, releaseEpoch, buildNumber, updateMode:'full', forceUpdate:forceText==='true', minSupportedBuild:1, apkUrl:key, apkHash:expectedHash, changelog:['Mobile app update'], message:'A new REMBEH update is ready.', isActive:false} });
    uploaded = false; // Object is now referenced by the release record.
    console.log(JSON.stringify({id:created.id,version,buildNumber,releaseEpoch,isActive:false,apkHash:expectedHash,apkUrl:key}));
  } catch (error) {
    if (uploaded) { try { await s3.send(new DeleteObjectCommand({Bucket:process.env.S3_BUCKET,Key:key})); } catch (cleanupError) { console.error('WARNING: orphan object cleanup failed:',cleanupError.message); } }
    throw error;
  } finally { await prisma.$disconnect(); await pool.end(); }
}
main().catch(e=>{console.error('RELEASE FAILED:',e.message);process.exitCode=1});
