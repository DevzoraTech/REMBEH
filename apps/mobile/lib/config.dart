import 'package:flutter/foundation.dart';

import 'config_dev_host.dart';

/// Production API (HTTPS). Override anytime with `--dart-define=REMBEH_API_URL=...`.
const String rembehProductionApiBaseUrl = String.fromEnvironment(
  'REMBEH_PRODUCTION_API_URL',
  defaultValue: 'https://rembeh-api.antikra.com/api/v1',
);

/// Optional forced URL (CI / explicit dart-defines).
const String _forcedApiUrl = String.fromEnvironment('REMBEH_API_URL');

/// API base URL — auto-selects local (debug) vs production (release).
///
/// - **Release / profile:** EC2 production API
/// - **Debug:** LAN host from `config_dev_host.dart`, else emulator/simulator defaults
/// - Always overridable with `--dart-define=REMBEH_API_URL=...`
String get rembehApiBaseUrl {
  if (_forcedApiUrl.isNotEmpty) {
    return _forcedApiUrl;
  }

  // Production / TestFlight / Play release builds → live HTTPS API
  if (kReleaseMode) {
    return rembehProductionApiBaseUrl;
  }

  // Debug: prefer synced LAN IP (physical device ↔ Mac)
  if (rembehDevApiHost.isNotEmpty) {
    return 'http://$rembehDevApiHost:4000/api/v1';
  }

  // Android emulator → host machine
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:4000/api/v1';
  }

  // iOS simulator / desktop debug
  return 'http://127.0.0.1:4000/api/v1';
}

/// True when talking to the production API.
bool get rembehIsProductionApi =>
    rembehApiBaseUrl.contains('rembeh-api.antikra.com') ||
    rembehApiBaseUrl == rembehProductionApiBaseUrl;
