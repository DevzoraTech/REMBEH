# REMBEH Mobile (Field)

Agents use this app after invitation + activation.

## Flow

1. Manager invites Agent on web
2. Agent accepts invite link (web) and sets credentials
3. Agent signs in here
4. Agent registers customers / loan applications for their assigned branch

Customer data is branch-scoped. Manager/owner consoles read what agents capture.

## Run

API (and MinIO for media) must be running on your machine first.

### Local run (simulator, emulator, or physical device)

1. Sync your Mac’s LAN IP (needed for phones + media uploads):

```bash
cd apps/mobile
chmod +x tool/sync_dev_host.sh
./tool/sync_dev_host.sh
```

2. Restart the API if `S3_PUBLIC_ENDPOINT` changed.

3. Cold-start the app (hot reload does **not** update the API host):

```bash
flutter run --dart-define-from-file=dart_defines.dev.json
```

`tool/sync_dev_host.sh` also writes `lib/config_dev_host.dart`, so even a plain `flutter run` uses your LAN IP after a full restart.

Phone and Mac must be on the same Wi‑Fi. Allow macOS firewall prompts for Node if shown.

### Override manually

```bash
flutter run --dart-define=REMBEH_API_URL=http://192.168.x.x:4000/api/v1
```
