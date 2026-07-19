# REMBEH Mobile (Field)

Agents use this app after invitation + activation.

## Flow

1. Manager invites Agent on web
2. Agent accepts invite link (web) and sets credentials
3. Agent signs in here
4. Agent registers customers / loan applications for their assigned branch

Customer data is branch-scoped. Manager/owner consoles read what agents capture.

## API environment (automatic)

| Build | API |
| --- | --- |
| **Debug** (`flutter run`) | Local Mac on LAN (`config_dev_host.dart`) |
| **Release** (`flutter build` / store) | `https://rembeh-api.antikra.com/api/v1` |

Override anytime: `--dart-define=REMBEH_API_URL=...`

## Run (local development)

1. Sync your Mac’s LAN IP (phones need this):

```bash
cd apps/mobile
chmod +x tool/sync_dev_host.sh
./tool/sync_dev_host.sh
```

2. Start the API on your Mac (`HOST=0.0.0.0`).

3. Cold-start the app:

```bash
flutter run
```

Phone and Mac must be on the same Wi‑Fi.

## Production builds

```bash
flutter build apk   # or ipa — uses production HTTPS API automatically
```

Optional explicit prod defines: `dart_defines.prod.json.example`.

## Force a URL (debug against production, etc.)

```bash
# Must include /api/v1 (Nest global prefix). Host-only or /api will 404.
flutter run --dart-define-from-file=dart_defines.prod.json
# or:
flutter run --dart-define=REMBEH_API_URL=https://rembeh-api.antikra.com/api/v1
```

Hot reload does **not** pick up dart-define / `config.dart` changes — fully stop the app and cold-start (`flutter run` again).

## Electronic signatures (Syncfusion)

Loan step 6 uses `syncfusion_flutter_signaturepad` for on-device signing (stylus + finger), high-res PNG export, stroke JSON, and audit metadata.

**License note:** Syncfusion Flutter controls require a community or commercial license for production distribution. Register at [Syncfusion licensing](https://www.syncfusion.com/products/communitylicense) (community license is free for qualifying organizations) and follow their Flutter license registration steps before store release. Development/evaluation can proceed without registering a key, but production builds should include a valid license.
