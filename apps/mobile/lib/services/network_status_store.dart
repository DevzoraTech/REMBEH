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

  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  // Until the first reachability check completes, favour the saved branch
  // snapshot. Treating this as online caused every app launch to fire API
  // requests before a rural connection had actually been established.
  bool _online = false;
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
  }

  void disposeStore() {
    _connectivitySubscription?.cancel();
    _connectivitySubscription = null;
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

      final base = Uri.parse(rembehApiBaseUrl);
      final uri = base.replace(path: '${base.path}/platform/health');
      final response = await http.get(uri).timeout(const Duration(seconds: 6));
      // A reachable API may return 401/404 to a probe in older deployments.
      // Only transport failure or a server outage should put field staff into
      // offline mode and stop their queued-work recovery.
      _setOnline(response.statusCode < 500);
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

  bool _hasNetworkFromResults(List<ConnectivityResult> results) {
    return results.any((result) => result != ConnectivityResult.none);
  }
}
