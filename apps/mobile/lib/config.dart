const String _apiPrefix = '/api/v1';

/// Production API (HTTPS). Default for debug and release builds.
const String rembehProductionApiBaseUrl = String.fromEnvironment(
  'REMBEH_PRODUCTION_API_URL',
  defaultValue: 'https://rembeh-api.antikra.com/api/v1',
);

/// Optional forced URL for rare local/staging use:
/// `--dart-define=REMBEH_API_URL=http://192.168.x.x:4000/api/v1`
const String _forcedApiUrl = String.fromEnvironment('REMBEH_API_URL');

/// API base URL — live production by default for every build mode.
///
/// - **Debug and release:** `https://rembeh-api.antikra.com/api/v1`
/// - Override only when needed: `--dart-define=REMBEH_API_URL=...`
///
/// All values are normalized so the Nest global prefix `/api/v1` is present.
String get rembehApiBaseUrl {
  if (_forcedApiUrl.isNotEmpty) {
    return normalizeRembehApiBaseUrl(_forcedApiUrl);
  }
  return normalizeRembehApiBaseUrl(rembehProductionApiBaseUrl);
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
