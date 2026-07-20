# REMBEH mobile releases (Shorebird + S3 APK)

## Overview

| Channel | What it delivers | When to use |
|---------|------------------|-------------|
| **Shorebird patch** | Dart/Flutter code OTA | Bug fixes / UI without native changes |
| **Full APK (S3)** | Complete Android package | Native changes, first install, forced upgrades |

Private S3 bucket: `rembeh-prod-bucket`  
Prefix: `releases/mobile/android/build-{N}/rembeh-v{version}.apk`

API (public):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/app/download/mobile?platform=android` | Presigned APK URL for website |
| `GET` | `/api/v1/app/download/android` | Alias → mobile + android |
| `GET` | `/api/v1/app/check-update?app=mobile&currentBuild=N&platform=android` | In-app update check |

Admin (JWT + `workspace.update`):

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/app/upload-url` | Presigned PutObject for APK |
| `POST` | `/api/v1/app/upload-apk` | Multipart upload alternative |
| `POST` | `/api/v1/app/releases` | Register release metadata |

Marketing download CTA: [get.rembeh.antikra.com/#apps](http://get.rembeh.antikra.com/#apps) calls the download API.

---

## One-time Shorebird setup

```bash
cd apps/mobile
shorebird login
shorebird init          # writes real app_id into shorebird.yaml
git add shorebird.yaml && git commit -m "chore(mobile): set Shorebird app_id"
```

## Full APK release flow

```bash
# 1) Build with Shorebird (preferred) or flutter
cd apps/mobile
shorebird release android --artifact apk
# APK typically under build/app/outputs/flutter-apk/app-release.apk

# 2) Upload + register (helper script)
cd ../..
REMBEH_ADMIN_TOKEN=<jwt> ./scripts/release-mobile-apk.sh \
  --version 1.0.1 \
  --build 2 \
  --apk apps/mobile/build/app/outputs/flutter-apk/app-release.apk \
  --message "Bug fixes and collections improvements" \
  --changelog "Collections sync,KYC media fixes"
```

Script steps:

1. `POST /app/upload-url` → PutObject to S3 key  
2. `POST /app/releases` with `updateMode: full`, `apkUrl: releases/mobile/android/...`

EC2 IAM role already allows S3 on `rembeh-prod-bucket` — uploads from the API process use the instance role when `S3_ACCESS_KEY` is empty.

## Shorebird patch (no new APK)

```bash
cd apps/mobile
shorebird patch android
# Optionally register a shorebird-mode release in the API (same buildNumber)
# so ops dashboards show the patch note — in-app Shorebird auto_update applies it.
```

## Website & in-app

- Landing `#apps` → `GET /api/v1/app/download/mobile?platform=android`
- Mobile boot → `UpdateService.checkForUpdate()` → full APK screen when `updateMode=full`
- Shorebird mode → app does nothing special (Shorebird downloads patch)

## DNS for marketing site

Spaceship → A record:

| Host | Type | Value |
|------|------|-------|
| `get.rembeh.antikra.com` | A | `13.63.130.241` |

Then on EC2:

```bash
sudo certbot --nginx -d get.rembeh.antikra.com
bash /home/ubuntu/rembeh/scripts/ensure-nginx-web.sh
```
