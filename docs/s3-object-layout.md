# S3 object layout (per company / tenant)

REMBEH never stores objects at the bucket root. Every company gets a dedicated
prefix when the workspace is registered.

## Layout

```
tenants/{tenantId}/
  meta/company.json
  loans/{loanApplicationId}/
    media/{mediaType}/{uuid}.{ext}
    signatures/{signerRole}/{uuid}/
      signature.png
      strokes.json
      metadata.json
    documents/SignedLoanAgreement-{version}.pdf
  products/                  # reserved for future config snapshots
```

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
