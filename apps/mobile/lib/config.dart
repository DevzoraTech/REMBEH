import 'package:flutter/foundation.dart';

import 'config_dev_host.dart';

const String _apiPrefix = '/api/v1';

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
///
/// All values are normalized so the Nest global prefix `/api/v1` is present.
String get rembehApiBaseUrl {
  if (_forcedApiUrl.isNotEmpty) {
    return normalizeRembehApiBaseUrl(_forcedApiUrl);
  }

  // Production / TestFlight / Play release builds → live HTTPS API
  if (kReleaseMode) {
    return normalizeRembehApiBaseUrl(rembehProductionApiBaseUrl);
  }

  // Debug: prefer synced LAN IP (physical device ↔ Mac)
  if (rembehDevApiHost.isNotEmpty) {
    return normalizeRembehApiBaseUrl(
      'http://$rembehDevApiHost:4000$_apiPrefix',
    );
  }

  // Android emulator → host machine
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:4000$_apiPrefix';
  }

  // iOS simulator / desktop debug
  return 'http://127.0.0.1:4000$_apiPrefix';
}

/// True when talking to the production API.
bool get rembehIsProductionApi =>
    rembehApiBaseUrl.contains('rembeh-api.antikra.com') ||
    rembehApiBaseUrl == rembehProductionApiBaseUrl;

/// Ensures the base URL includes Nest's global prefix (`/api/v1`).
///
/// Wrong bases that become Nest `Cannot POST /api/auth/login`:
/// - `https://rembeh-api.antikra.com/api` (missing `/v1`)
/// - `https://rembeh-api.antikra.com` (missing `/api/v1`) when joined with `/auth/login`
String normalizeRembehApiBaseUrl(String raw) {
  var url = raw.trim();
  while (url.endsWith('/')) {
    url = url.substring(0, url.length - 1);
  }
  if (url.isEmpty) {
    return rembehProductionApiBaseUrl;
  }

  if (url.endsWith(_apiPrefix)) {
    return url;
  }
  if (url.endsWith('/api')) {
    return '$url/v1';
  }

  final uri = Uri.tryParse(url);
  if (uri != null &&
      uri.hasScheme &&
      uri.host.isNotEmpty &&
      (uri.path.isEmpty || uri.path == '/')) {
    return '$url$_apiPrefix';
  }

  return url;
}
