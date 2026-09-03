import 'dart:async';

import 'package:flutter/widgets.dart';

import '../utils/account_access.dart';
import '../utils/friendly_errors.dart';
import 'api_client.dart';
import 'session_cleanup.dart';
import 'session_store.dart';

/// Tracks activity and refreshes the access token so the session stays alive.
class SessionActivityController with WidgetsBindingObserver {
  SessionActivityController({
    required this.sessionStore,
    required this.onSessionCleared,
    this.onAccountBlocked,
    this.onResumed,
    this.tickInterval = const Duration(seconds: 15),
  });

  final SessionStore sessionStore;
  final Future<void> Function() onSessionCleared;
  final Future<void> Function(String message)? onAccountBlocked;
  final Future<void> Function()? onResumed;
  final Duration tickInterval;

  Timer? _timer;
  bool _clearingSession = false;
  DateTime _lastActivity = DateTime.now();
  DateTime? _lastPersisted;

  void start() {
    WidgetsBinding.instance.addObserver(this);
    _timer?.cancel();
    _timer = Timer.periodic(tickInterval, (_) => _checkSession());
    unawaited(touch(refreshIfNeeded: true));
  }

  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
  }

  Future<void> touch({bool refreshIfNeeded = false}) async {
    _lastActivity = DateTime.now();
    final shouldPersist =
        _lastPersisted == null ||
        _lastActivity.difference(_lastPersisted!) >= const Duration(seconds: 5);
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
    await touch(refreshIfNeeded: true);
    final resumed = onResumed;
    if (resumed != null) {
      await resumed();
    }
  }

  Future<void> _checkSession() async {
    await _refreshAccessIfNeeded();
  }

  Future<void> _refreshAccessIfNeeded() async {
    final session = await sessionStore.read();
    if (session == null || !session.canRefresh) return;
    // Refresh when access is expired or within 10 minutes of expiry.
    final expiry = DateTime.tryParse(session.expiresAt);
    final needsRefresh =
        session.isAccessExpired ||
        (expiry != null &&
            expiry.isBefore(DateTime.now().add(const Duration(minutes: 10))));
    if (!needsRefresh) return;
    try {
      await ApiClient(sessionStore).refreshSession(session);
    } catch (error) {
      final message = friendlyErrorMessage(error);
      if (isAccountAccessBlockedMessage(message)) {
        await _lockAccount(message);
      }
    }
  }

  Future<void> _lockAccount(String message) async {
    if (_clearingSession) return;
    _clearingSession = true;
    _timer?.cancel();
    await clearTenantScopedClientState();
    await sessionStore.clear();
    final handler = onAccountBlocked;
    if (handler != null) {
      await handler(message);
      return;
    }
    await onSessionCleared();
  }
}

/// Records pointer / scroll activity for token-refresh bookkeeping.
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
