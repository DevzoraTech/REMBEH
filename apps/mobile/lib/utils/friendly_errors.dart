import 'account_access.dart';

String friendlyErrorMessage(
  Object? error, {
  String fallback = 'Something went wrong. Please try again.',
}) {
  final raw = (error ?? '').toString().trim();
  if (raw.isEmpty) return fallback;

  final cleaned = raw
      .replaceFirst(RegExp(r'^(Exception|ApiException):\s*'), '')
      .replaceFirst(RegExp(r'^ClientException:\s*'), '')
      .trim();
  final lower = cleaned.toLowerCase();

  if (isAccountAccessBlockedMessage(cleaned)) {
    return cleaned;
  }

  if (_looksTechnical(cleaned)) {
    if (lower.contains('unauthorized') ||
        lower.contains('bearer token') ||
        lower.contains('session expired') ||
        lower.contains('401')) {
      return 'Your session has expired. Please sign in again.';
    }
    if (lower.contains('forbidden') ||
        lower.contains('missing permission') ||
        lower.contains('403')) {
      return 'You do not have access to do that. Contact your manager.';
    }
    if (lower.contains('socket') ||
        lower.contains('network') ||
        lower.contains('connection') ||
        lower.contains('timed out') ||
        lower.contains('host lookup')) {
      return 'We could not connect. Check your internet and try again.';
    }
    return 'We could not complete that request. Please refresh and try again.';
  }

  if (cleaned.length > 140) return fallback;
  return cleaned;
}

bool _looksTechnical(String message) {
  final lower = message.toLowerCase();
  return lower.contains('cannot get') ||
      lower.contains('cannot post') ||
      lower.contains('cannot patch') ||
      lower.contains('cannot put') ||
      lower.contains('/api/') ||
      lower.contains('http://') ||
      lower.contains('https://') ||
      lower.contains('rembeh-api') ||
      lower.contains('socketexception') ||
      lower.contains('clientexception') ||
      lower.contains('formatexception') ||
      lower.contains('handshakeexception') ||
      lower.contains('xmlhttprequest') ||
      lower.contains('prisma') ||
      lower.contains('postgres') ||
      lower.contains('database') ||
      lower.contains('tenant scope') ||
      lower.contains('branch scope') ||
      lower.contains('null check operator') ||
      lower.contains('nosuchmethod') ||
      lower.contains('type ') && lower.contains(' is not a subtype') ||
      lower.contains('statuscode') ||
      lower.contains('status code');
}
