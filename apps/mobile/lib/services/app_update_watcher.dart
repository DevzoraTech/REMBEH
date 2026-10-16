import 'dart:async';

import 'package:flutter/widgets.dart';

import '../core/network/realtime_client.dart';
import '../services/session_store.dart';
import 'update_prompt.dart';

/// Keeps listening for Control Center rollout changes while the user is signed in.
///
/// Checks on open/resume and on each `app_release.updated` socket event.
/// Realtime delivery avoids a permanent release-check poll for every device.
class AppUpdateWatcher with WidgetsBindingObserver {
  AppUpdateWatcher._();

  static final AppUpdateWatcher instance = AppUpdateWatcher._();

  BuildContext Function()? _contextFinder;
  RembehSession? _session;
  bool _started = false;
  bool _checking = false;

  void start({
    required RembehSession session,
    required BuildContext Function() contextFinder,
  }) {
    _session = session;
    _contextFinder = contextFinder;
    if (_started) {
      unawaited(_check(UpdatePromptTrigger.open));
      return;
    }
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    RealtimeClient.instance.on('app_release.updated', _onReleaseEvent);
    unawaited(_connectAndCheck());
  }

  void stop() {
    if (!_started) return;
    _started = false;
    WidgetsBinding.instance.removeObserver(this);
    RealtimeClient.instance.off('app_release.updated', _onReleaseEvent);
    _contextFinder = null;
    _session = null;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_check(UpdatePromptTrigger.open));
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
    await _check(UpdatePromptTrigger.open);
  }

  void _onReleaseEvent(Map<String, dynamic> payload) {
    final appName = (payload['appName'] as String?)?.trim().toLowerCase();
    if (appName != null && appName.isNotEmpty && appName != 'mobile') {
      return;
    }
    unawaited(_check(UpdatePromptTrigger.rollout));
  }

  Future<void> _check(UpdatePromptTrigger trigger) async {
    if (_checking) return;
    final finder = _contextFinder;
    if (finder == null) return;
    _checking = true;
    try {
      final context = finder();
      if (!context.mounted) return;
      await promptAppUpdateIfNeeded(context, trigger: trigger);
    } finally {
      _checking = false;
    }
  }
}
