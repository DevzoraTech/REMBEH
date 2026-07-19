# REMBEH Mobile (Field)

Agents use this app after invitation + activation.

## Flow

1. Manager invites Agent on web
2. Agent accepts invite link (web) and sets credentials
3. Agent signs in here
4. Agent registers customers / loan applications for their assigned branch

Customer data is branch-scoped. Manager/owner consoles read what agents capture.

## API environment

| Build | API |
| --- | --- |
| **Debug** (`flutter run`) | `https://rembeh-api.antikra.com/api/v1` (live) |
| **Release** (`flutter build` / store) | `https://rembeh-api.antikra.com/api/v1` (live) |

All changes ship against the live server by default. Override only for rare local API work:

```bash
flutter run --dart-define=REMBEH_API_URL=http://192.168.x.x:4000/api/v1
# or after syncing a local host:
./tool/sync_dev_host.sh --local
flutter run --dart-define-from-file=dart_defines.dev.json
```

## Run (against live)

```bash
cd apps/mobile
flutter run
```

Optional: reset dart-defines to production defaults:

```bash
./tool/sync_dev_host.sh
```

## Production builds

```bash
flutter build apk   # or ipa — uses production HTTPS API automatically
```

Optional explicit prod defines: `dart_defines.prod.json` / `dart_defines.prod.json.example`.

## Force a URL

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
