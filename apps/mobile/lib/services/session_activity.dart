import 'dart:async';

import 'package:flutter/widgets.dart';

import 'api_client.dart';
import 'session_cleanup.dart';
import 'session_store.dart';

/// Idle logout after [idleTimeout] with no taps / scrolls / navigation.
/// While active, refreshes the access token so the session does not expire mid-use.
class SessionActivityController with WidgetsBindingObserver {
  SessionActivityController({
    required this.sessionStore,
    required this.onIdleLogout,
    this.idleTimeout = const Duration(minutes: 5),
    this.tickInterval = const Duration(seconds: 15),
  });

  final SessionStore sessionStore;
  final Future<void> Function() onIdleLogout;
  final Duration idleTimeout;
  final Duration tickInterval;

  Timer? _timer;
  bool _loggingOut = false;
  DateTime _lastActivity = DateTime.now();
  DateTime? _lastPersisted;

  void start() {
    WidgetsBinding.instance.addObserver(this);
    _timer?.cancel();
    _timer = Timer.periodic(tickInterval, (_) => _checkIdle());
    unawaited(touch(refreshIfNeeded: true));
  }

  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
  }

  Future<void> touch({bool refreshIfNeeded = false}) async {
    _lastActivity = DateTime.now();
    final shouldPersist = _lastPersisted == null ||
        _lastActivity.difference(_lastPersisted!) >=
            const Duration(seconds: 5);
    if (shouldPersist) {
      _lastPersisted = _lastActivity;
      await sessionStore.markActivity(_lastActivity);
    }
    if (refreshIfNeeded) {
      await _refreshAccessIfNeeded();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_onResume());
    }
  }

  Future<void> _onResume() async {
    final last = await sessionStore.readLastActivityAt() ?? _lastActivity;
    _lastActivity = last;
    if (_isIdle(last)) {
      await _logout();
      return;
    }
    await touch(refreshIfNeeded: true);
  }

  Future<void> _checkIdle() async {
    final last = await sessionStore.readLastActivityAt() ?? _lastActivity;
    if (_isIdle(last)) {
      await _logout();
      return;
    }
    await _refreshAccessIfNeeded();
  }

  bool _isIdle(DateTime last) {
    return DateTime.now().difference(last) >= idleTimeout;
  }

  Future<void> _refreshAccessIfNeeded() async {
    final session = await sessionStore.read();
    if (session == null || !session.canRefresh) return;
    // Refresh when access is expired or within 10 minutes of expiry.
    final expiry = DateTime.tryParse(session.expiresAt);
    final needsRefresh = session.isAccessExpired ||
        (expiry != null &&
            expiry.isBefore(DateTime.now().add(const Duration(minutes: 10))));
    if (!needsRefresh) return;
    await ApiClient(sessionStore).refreshSession(session);
  }

  Future<void> _logout() async {
    if (_loggingOut) return;
    _loggingOut = true;
    _timer?.cancel();
    await clearTenantScopedClientState();
    await sessionStore.clear();
    await onIdleLogout();
  }
}

/// Records pointer / scroll activity for idle timeout.
class SessionActivityListener extends StatelessWidget {
  const SessionActivityListener({
    super.key,
    required this.controller,
    required this.child,
  });

  final SessionActivityController controller;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) => unawaited(controller.touch()),
      onPointerMove: (_) => unawaited(controller.touch()),
      onPointerSignal: (_) => unawaited(controller.touch()),
      child: child,
    );
  }
}
