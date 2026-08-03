# S3 object layout (per organisation → branch → file type)

REMBEH never stores objects at the bucket root. Every organisation gets a
dedicated prefix when the workspace is registered. Branch and file-type
folders keep records easy to browse and audit.

## Layout

```
tenants/{organisationId}/
  meta/company.json
  products/                                    # org-level config snapshots
  branches/{branchId}/
    media/{mediaType}/{applicationId}/{uuid}.{ext}
      # e.g. media/passport/…, media/nin_front/…
    signatures/{signerRole}/{applicationId}/{assetId}/
      signature.png
      strokes.json
      metadata.json
    loan-agreements/{applicationId}/SignedLoanAgreement-{version}.pdf
    agent-profiles/{userId}/{uuid}.{ext}
```

Existing objects keep the key already stored in the database. **New** uploads
and agreement PDFs use the organisation → branch → file-type layout above.

## Platform releases (not tenant-scoped)

Android APKs for the field app (private bucket, presigned download only):

```
releases/mobile/android/build-{buildNumber}/rembeh-v{version}.apk
```

See [`docs/mobile-releases.md`](mobile-releases.md).

## Provisioning

On `POST /auth/workspace/register`:

1. DB row `tenants.storage_prefix` is set to `tenants/{tenantId}/`
2. Object storage writes `tenants/{tenantId}/meta/company.json` (best-effort;
   registration still succeeds if S3 is temporarily unavailable)

## Environment

| Variable | Behavior |
|----------|----------|
| `S3_ENDPOINT` empty | Real AWS S3 (virtual-hosted) |
| `S3_ENDPOINT` set | Custom endpoint (MinIO / local); path-style |
| `S3_ACCESS_KEY` + `S3_SECRET_KEY` empty | Default provider chain (EC2 IAM role) |
| `S3_BUCKET` | Bucket name (default `rembeh-local`) |

Key builders live in `ObjectStorageService`
(`services/api/src/modules/storage/object-storage.service.ts`).
