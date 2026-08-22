import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config.dart';

/// Tracks online/offline for the field app.
class NetworkStatusStore extends ChangeNotifier {
  NetworkStatusStore._();
  static final NetworkStatusStore instance = NetworkStatusStore._();

  final Connectivity _connectivity = Connectivity();

  Timer? _timer;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  bool _online = true;
  bool _started = false;
  bool _checking = false;

  bool get isOnline => _online;
  bool get isOffline => !_online;

  Future<void> start() async {
    if (_started) return;
    _started = true;
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen((
      results,
    ) {
      if (_hasNetworkFromResults(results)) {
        // ignore: discarded_futures
        checkNow();
      } else {
        _setOnline(false);
      }
    });
    await checkNow();
    _timer = Timer.periodic(const Duration(seconds: 12), (_) {
      // ignore: discarded_futures
      checkNow();
    });
  }

  void disposeStore() {
    _connectivitySubscription?.cancel();
    _connectivitySubscription = null;
    _timer?.cancel();
    _timer = null;
    _started = false;
  }

  Future<bool> checkNow() async {
    if (_checking) return _online;
    _checking = true;
    try {
      final results = await _connectivity.checkConnectivity();
      if (!_hasNetworkFromResults(results)) {
        _setOnline(false);
        return _online;
      }

      final uri = Uri.parse(rembehApiBaseUrl);
      await http.get(uri).timeout(const Duration(seconds: 4));
      _setOnline(true);
    } catch (_) {
      /*
       * A transport probe can fail on networks that still allow ordinary app
       * requests shortly after reconnecting. Do not leave the app pinned in
       * offline mode when the OS reports usable connectivity.
       */
      _setOnline(true);
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

  bool _hasNetworkFromResults(List<ConnectivityResult> results) {
    return results.any((result) => result != ConnectivityResult.none);
  }
}
