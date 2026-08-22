import 'dart:async';
import '../sync/connectivity_monitor.dart';
import 'offline_auth_service.dart';
import '../../services/api_client.dart';
import '../../services/session_store.dart';
import '../../utils/account_access.dart';
import '../../utils/friendly_errors.dart';

/// Unified authentication manager handling both online and offline auth
class AuthManager {
  final SessionStore _sessionStore = SessionStore();
  final OfflineAuthService _offlineAuth = OfflineAuthService();
  final ConnectivityMonitor _connectivity = ConnectivityMonitor.instance;

  /// Current session stream
  final _sessionController = StreamController<RembehSession?>.broadcast();
  Stream<RembehSession?> get sessionStream => _sessionController.stream;

  /// Current auth mode (online/offline)
  final _authModeController = StreamController<AuthMode>.broadcast();
  Stream<AuthMode> get authModeStream => _authModeController.stream;

  AuthMode _currentMode = AuthMode.unknown;
  AuthMode get currentMode => _currentMode;

  RembehSession? _currentSession;
  RembehSession? get currentSession => _currentSession;

  /// Initialize auth manager
  Future<void> initialize() async {
    await _connectivity.initialize();

    // Try to restore session
    _currentSession = await _sessionStore.read();
    if (_currentSession != null) {
      _currentMode = _currentSession!.tokenType == 'Offline'
          ? AuthMode.offline
          : AuthMode.online;
      _sessionController.add(_currentSession);
      _authModeController.add(_currentMode);
    }

    // Listen for connectivity changes
    _connectivity.onConnectivityChanged.listen((isOnline) {
      if (isOnline && _currentMode == AuthMode.offline) {
        // Opportunity to switch back to online mode
        _notifyOnlineAvailable();
      }
    });
  }

  /// Login with automatic online/offline detection
  Future<AuthResult> login({
    required String email,
    required String password,
  }) async {
    final isOnline = await _connectivity.checkConnectivity();

    if (isOnline) {
      return _loginOnline(email: email, password: password);
    } else {
      return _loginOffline(email: email, password: password);
    }
  }

  /// Online login
  Future<AuthResult> _loginOnline({
    required String email,
    required String password,
  }) async {
    try {
      final apiClient = ApiClient(_sessionStore);
      await apiClient.login(email: email, password: password);

      // Retrieve the saved session
      _currentSession = await _sessionStore.read();
      if (_currentSession == null) {
        return AuthResult(success: false, error: 'Failed to create session');
      }

      // Cache credentials for offline use
      final passwordHash = _offlineAuth.hashPassword(password);
      await _offlineAuth.cacheCredentials(
        email: email,
        passwordHash: passwordHash,
        session: _currentSession!,
      );

      _currentMode = AuthMode.online;
      _sessionController.add(_currentSession);
      _authModeController.add(_currentMode);

      return AuthResult(
        success: true,
        session: _currentSession,
        mode: AuthMode.online,
      );
    } catch (e) {
      final message = friendlyErrorMessage(e);
      if (isAccountAccessBlockedMessage(message)) {
        return AuthResult(success: false, error: message);
      }

      // If online login fails, try offline as fallback
      if (await _offlineAuth.hasCachedCredentials(email)) {
        return _loginOffline(email: email, password: password);
      }
      return AuthResult(success: false, error: e.toString());
    }
  }

  /// Offline login
  Future<AuthResult> _loginOffline({
    required String email,
    required String password,
  }) async {
    final result = await _offlineAuth.verifyOfflineLogin(
      email: email,
      password: password,
    );

    if (!result.success) {
      return AuthResult(
        success: false,
        error: result.error ?? 'Offline login failed',
      );
    }

    // Create offline session
    _currentSession = result.sessionData!.toRembehSession();
    await _sessionStore.save(_currentSession!);

    _currentMode = AuthMode.offline;
    _sessionController.add(_currentSession);
    _authModeController.add(_currentMode);

    return AuthResult(
      success: true,
      session: _currentSession,
      mode: AuthMode.offline,
      message: 'Logged in offline mode',
    );
  }

  /// Logout
  Future<void> logout({bool clearOfflineData = false}) async {
    if (_currentSession != null && clearOfflineData) {
      await _offlineAuth.clearCachedCredentials(_currentSession!.userEmail);
    }

    await _sessionStore.clear();
    _currentSession = null;
    _currentMode = AuthMode.unknown;
    _sessionController.add(null);
  }

  /// Switch from offline to online mode
  Future<AuthResult> switchToOnlineMode({required String password}) async {
    if (_currentSession == null || _currentMode != AuthMode.offline) {
      return AuthResult(success: false, error: 'Not in offline mode');
    }

    final email = _currentSession!.userEmail;
    return _loginOnline(email: email, password: password);
  }

  /// Refresh online session if needed
  Future<bool> refreshSessionIfNeeded() async {
    if (_currentSession == null || _currentMode == AuthMode.offline) {
      return false;
    }

    if (!_currentSession!.isAccessExpired) {
      return true;
    }

    if (!_currentSession!.canRefresh) {
      return false;
    }

    try {
      final apiClient = ApiClient(_sessionStore);
      final refreshed = await apiClient.refreshSession(_currentSession!);
      if (refreshed != null) {
        _currentSession = refreshed;
        _sessionController.add(_currentSession);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /// Get access token for API calls
  Future<String?> getAccessToken() async {
    if (_currentSession == null) return null;

    // Offline mode returns null (use offline data instead)
    if (_currentMode == AuthMode.offline) return null;

    // Try to refresh if expired
    if (_currentSession!.isAccessExpired) {
      final refreshed = await refreshSessionIfNeeded();
      if (!refreshed) return null;
    }

    return _currentSession?.accessToken;
  }

  /// Check if currently authenticated
  bool get isAuthenticated => _currentSession != null;

  /// Check if in offline mode
  bool get isOfflineMode => _currentMode == AuthMode.offline;

  /// Check if in online mode
  bool get isOnlineMode => _currentMode == AuthMode.online;

  /// Notify that online connectivity is available
  void _notifyOnlineAvailable() {
    // UI can listen to this and prompt user to sync/switch to online
  }

  /// Dispose resources
  void dispose() {
    _sessionController.close();
    _authModeController.close();
  }
}

/// Authentication mode
enum AuthMode { unknown, online, offline }

/// Authentication result
class AuthResult {
  final bool success;
  final RembehSession? session;
  final AuthMode? mode;
  final String? error;
  final String? message;

  AuthResult({
    required this.success,
    this.session,
    this.mode,
    this.error,
    this.message,
  });
}
