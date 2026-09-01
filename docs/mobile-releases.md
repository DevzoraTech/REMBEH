# REMBEH mobile releases (S3 APK)

## Overview

| Channel | What it delivers | When to use |
|---------|------------------|-------------|
| **Full APK (S3)** | Complete Android package | Native changes, first install, forced upgrades |

Private S3 bucket: `rembeh-production-file-bk`
Prefix: `releases/mobile/android/line-{epoch}/build-{N}/rembeh-v{version}.apk`

Mobile build numbers were restarted at `2.0.0+2` on release line `2`.
Old releases remain on line `1`, so a new line-2 release can force-update
older apps even if those old apps had higher build numbers like `+26`.

API (public):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/app/download/mobile?platform=android` | Presigned APK URL for website |
| `GET` | `/api/v1/app/download/android` | Alias → mobile + android |
| `GET` | `/api/v1/app/check-update?app=mobile&currentReleaseEpoch=2&currentBuild=N&platform=android` | In-app update check |

Admin (JWT + `workspace.update`):

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/app/upload-url` | Presigned PutObject for APK |
| `POST` | `/api/v1/app/upload-apk` | Multipart upload alternative |
| `POST` | `/api/v1/app/releases` | Register release metadata |

Marketing download CTA: [get.rembeh.antikra.com/#apps](http://get.rembeh.antikra.com/#apps) calls the download API.

---

## Full APK release flow

```bash
# Build, upload to S3 through EC2, and register as a forced update.
./scripts/build-forced-mobile-release.sh \
  --increment none \
  --message "A new REMBEH update is ready." \
  --changelog "Works better offline,Syncs latest records when internet returns,Keeps daily work smoother"
```

Script steps:

1. Builds `apps/mobile/build/app/outputs/flutter-apk/app-release.apk`
2. Uploads to `s3://rembeh-production-file-bk/releases/mobile/android/line-2/...`
3. Registers `AppRelease` with `releaseEpoch: 2`, `updateMode: full`, and `forceUpdate: true`

## Admin-token upload alternative

```bash
REMBEH_ADMIN_TOKEN=<jwt> ./scripts/release-mobile-apk.sh \
  --release-epoch 2 \
  --version 2.0.0 \
  --build 2 \
  --apk apps/mobile/build/app/outputs/flutter-apk/app-release.apk \
  --force \
  --min-build 2
```

## Website & in-app

- Landing `#apps` → `GET /api/v1/app/download/mobile?platform=android`
- Mobile boot → `UpdateService.checkForUpdate()` → full APK screen when `updateMode=full`

## DNS for marketing site

Spaceship → A record:

| Host | Type | Value |
|------|------|-------|
| `get.rembeh.antikra.com` | A | `15.240.28.47` |

Then on EC2:

```bash
sudo certbot --nginx -d get.rembeh.antikra.com
bash /home/ubuntu/rembeh/scripts/ensure-nginx-web.sh
```
