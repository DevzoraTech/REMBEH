import 'api_client.dart';
import 'session_store.dart';

/// Small auth bridge used by the offline sync layer.
class AuthService {
  AuthService({SessionStore? sessionStore})
    : _sessionStore = sessionStore ?? SessionStore();

  final SessionStore _sessionStore;

  Future<String?> getAccessToken() async {
    final session = await _sessionStore.read();
    if (session == null || session.accessToken.isEmpty) {
      return null;
    }

    if (session.tokenType.toLowerCase() == 'offline') {
      return null;
    }

    if (!session.isAccessExpired) {
      return session.accessToken;
    }

    if (!session.canRefresh) {
      return null;
    }

    final refreshed = await ApiClient(_sessionStore).refreshSession(session);
    return refreshed?.accessToken;
  }
}
