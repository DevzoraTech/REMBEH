import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';

/// Monitors network connectivity state
class ConnectivityMonitor {
  static final ConnectivityMonitor instance = ConnectivityMonitor._internal();

  ConnectivityMonitor._internal();

  final Connectivity _connectivity = Connectivity();

  /// Stream of connectivity changes
  late final Stream<bool> onConnectivityChanged =
      _connectivity.onConnectivityChanged.map(
    (result) => !result.contains(ConnectivityResult.none),
  );

  bool _isConnected = false;

  /// Whether the device is currently connected to a network
  bool get isOnline => _isConnected;

  /// Initialize connectivity monitoring
  Future<void> initialize() async {
    final result = await _connectivity.checkConnectivity();
    _isConnected = !result.contains(ConnectivityResult.none);

    _connectivity.onConnectivityChanged.listen((result) {
      _isConnected = !result.contains(ConnectivityResult.none);
    });
  }

  /// Check current connectivity status
  Future<bool> checkConnectivity() async {
    final result = await _connectivity.checkConnectivity();
    _isConnected = !result.contains(ConnectivityResult.none);
    return _isConnected;
  }
}
