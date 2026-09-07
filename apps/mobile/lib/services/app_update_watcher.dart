import 'dart:async';

import 'package:flutter/widgets.dart';

import '../core/network/realtime_client.dart';
import '../services/session_store.dart';
import 'update_prompt.dart';

/// Keeps listening for Control Center rollout changes while the user is signed in.
///
/// Checks immediately, on each `app_release.updated` socket event, and on a
/// short poll so Send/Stop in Control Center reaches open phones without a
/// full app restart.
class AppUpdateWatcher with WidgetsBindingObserver {
  AppUpdateWatcher._();

  static final AppUpdateWatcher instance = AppUpdateWatcher._();

  static const Duration pollInterval = Duration(seconds: 20);

  BuildContext Function()? _contextFinder;
  RembehSession? _session;
  Timer? _timer;
  bool _started = false;
  bool _checking = false;

  void start({
    required RembehSession session,
    required BuildContext Function() contextFinder,
  }) {
    _session = session;
    _contextFinder = contextFinder;
    if (_started) {
      unawaited(_check());
      return;
    }
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    RealtimeClient.instance.on('app_release.updated', _onReleaseEvent);
    _timer = Timer.periodic(pollInterval, (_) => unawaited(_check()));
    unawaited(_connectAndCheck());
  }

  void stop() {
    if (!_started) return;
    _started = false;
    _timer?.cancel();
    _timer = null;
    WidgetsBinding.instance.removeObserver(this);
    RealtimeClient.instance.off('app_release.updated', _onReleaseEvent);
    _contextFinder = null;
    _session = null;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_check());
    }
  }

  Future<void> _connectAndCheck() async {
    final session = _session;
    if (session != null) {
      try {
        await RealtimeClient.instance.connect(session);
      } catch (_) {
        // Non-fatal — polling still covers Control Center sends.
      }
    }
    await _check();
  }

  void _onReleaseEvent(Map<String, dynamic> payload) {
    final appName = (payload['appName'] as String?)?.trim().toLowerCase();
    if (appName != null && appName.isNotEmpty && appName != 'mobile') {
      return;
    }
    unawaited(_check());
  }

  Future<void> _check() async {
    if (_checking) return;
    final finder = _contextFinder;
    if (finder == null) return;
    _checking = true;
    try {
      final context = finder();
      if (!context.mounted) return;
      await promptAppUpdateIfNeeded(context);
    } finally {
      _checking = false;
    }
  }
}
