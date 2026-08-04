import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config.dart';

/// Tracks online/offline for the field app without extra plugins.
class NetworkStatusStore extends ChangeNotifier {
  NetworkStatusStore._();
  static final NetworkStatusStore instance = NetworkStatusStore._();

  Timer? _timer;
  bool _online = true;
  bool _started = false;
  bool _checking = false;

  bool get isOnline => _online;
  bool get isOffline => !_online;

  Future<void> start() async {
    if (_started) return;
    _started = true;
    await checkNow();
    _timer = Timer.periodic(const Duration(seconds: 12), (_) {
      // ignore: discarded_futures
      checkNow();
    });
  }

  void disposeStore() {
    _timer?.cancel();
    _timer = null;
    _started = false;
  }

  Future<bool> checkNow() async {
    if (_checking) return _online;
    _checking = true;
    try {
      final uri = Uri.parse(rembehApiBaseUrl);
      final response = await http
          .get(uri)
          .timeout(const Duration(seconds: 4));
      _setOnline(response.statusCode >= 200 && response.statusCode < 500);
    } catch (_) {
      _setOnline(false);
    } finally {
      _checking = false;
    }
    return _online;
  }

  void markOffline() => _setOnline(false);

  void markOnline() => _setOnline(true);

  void _setOnline(bool next) {
    if (_online == next) return;
    _online = next;
    notifyListeners();
  }
}
