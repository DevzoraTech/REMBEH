#!/usr/bin/env node

// Run only inside the staging API container with its staging storage credentials.
const { randomUUID } = require('node:crypto');
const { S3Client, PutObjectCommand, HeadObjectCommand, CopyObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

async function main() {
  const { S3_BUCKET: bucket, S3_ENDPOINT: endpoint, S3_REGION: region, S3_ACCESS_KEY: accessKeyId, S3_SECRET_KEY: secretAccessKey } = process.env;
  if (!bucket || !/stag/i.test(bucket) || !endpoint || !/^https:\/\/[^/]*contabostorage\.com\/?$/i.test(endpoint) || !accessKeyId || !secretAccessKey) throw new Error('Refusing to run outside configured Contabo staging storage.');
  const client = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  const base = `integration-tests/onboarding/${randomUUID()}`;
  const source = `${base}/source`, destination = `${base}/copy`;
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: source, Body: 'original-image', ContentType: 'image/jpeg' }));
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: source }));
    if (head.ContentLength !== 14 || head.ContentType !== 'image/jpeg' || !head.ETag) throw new Error('Unexpected source metadata.');
    const copy = (etag) => client.send(new CopyObjectCommand({ Bucket: bucket, Key: destination, CopySource: `${encodeURIComponent(bucket)}/${source.split('/').map(encodeURIComponent).join('/')}`, CopySourceIfMatch: etag }));
    let rejected = false;
    try { await copy('"incorrect-etag"'); } catch (error) { if (error.$metadata?.httpStatusCode === 412) rejected = true; else throw error; }
    if (!rejected) throw new Error('Storage ignored the conditional-copy guard.');
    await copy(head.ETag);
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: source, Body: 'replacement', ContentType: 'image/jpeg' }));
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: destination }));
    if (await result.Body.transformToString() !== 'original-image') throw new Error('Verified copy changed after replacing the upload.');
    console.log('Staging storage conditional copy and immutable destination verified.');
  } finally {
    await Promise.all([source, destination].map((Key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key }))));
    client.destroy();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
