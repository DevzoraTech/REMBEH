import 'config_dev_host.dart';

/// API base URL for the REMBEH backend.
///
/// Priority:
/// 1. `--dart-define=REMBEH_API_URL=...` / `dart_defines.dev.json`
/// 2. LAN host from `config_dev_host.dart` (via `tool/sync_dev_host.sh`)
///
/// Refresh the LAN host after Wi‑Fi changes:
/// `cd apps/mobile && ./tool/sync_dev_host.sh`
const String _envApiUrl = String.fromEnvironment('REMBEH_API_URL');

String get rembehApiBaseUrl {
  if (_envApiUrl.isNotEmpty) {
    return _envApiUrl;
  }

  // Prefer the machine LAN IP so physical Android/iOS devices work without
  // remembering dart-defines. Also works from emulators on the same network.
  if (rembehDevApiHost.isNotEmpty) {
    return 'http://$rembehDevApiHost:4000/api/v1';
  }

  return 'http://127.0.0.1:4000/api/v1';
}
