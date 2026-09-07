import 'dart:async';

import 'package:flutter/widgets.dart';

import '../../../services/api_client.dart';
import '../../../services/session_store.dart';

/// Live SMS credit balance for header chrome.
class SmsCreditsStore extends ChangeNotifier {
  SmsCreditsStore._();

  static final SmsCreditsStore instance = SmsCreditsStore._();

  final _api = ApiClient(SessionStore());
  RembehSession? _session;
  int? _credits;
  bool _loading = false;
  Timer? _pollTimer;
  bool _started = false;

  int? get credits => _credits;
  bool get loading => _loading;

  Future<void> start(RembehSession session) async {
    _session = session;
    if (!_started) {
      _started = true;
      _pollTimer?.cancel();
      _pollTimer = Timer.periodic(const Duration(seconds: 45), (_) {
        // ignore: discarded_futures
        refresh(silent: true);
      });
    }
    await refresh();
  }

  void stop() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _started = false;
    _session = null;
    _credits = null;
    _loading = false;
    notifyListeners();
  }

  Future<void> refresh({bool silent = false}) async {
    final session = _session;
    if (session == null) return;

    if (!silent) {
      _loading = true;
      notifyListeners();
    }

    try {
      final payload = await _api.getSmsCreditsBalance(session: session);
      final raw = payload['availableUnits'] ?? payload['creditsRemaining'];
      final next = raw is num
          ? raw.floor()
          : int.tryParse('$raw') ?? _credits ?? 0;
      _credits = next < 0 ? 0 : next;
    } catch (_) {
      // Header chrome is optional; keep last known value.
    } finally {
      if (!silent) {
        _loading = false;
      }
      notifyListeners();
    }
  }
}

enum SmsCreditTone { red, orange, green }

SmsCreditTone smsCreditTone(int credits) {
  if (credits <= 50) return SmsCreditTone.red;
  if (credits <= 70) return SmsCreditTone.orange;
  return SmsCreditTone.green;
}
