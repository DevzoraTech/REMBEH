import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;

import '../config.dart';
import '../firebase_options.dart';
import 'session_store.dart';

/// Top-level background handler (must be a top-level or static function).
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
}

class PushNotificationService {
  PushNotificationService(this._sessionStore);

  final SessionStore _sessionStore;
  late final FirebaseMessaging _messaging;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  static const _androidChannel = AndroidNotificationChannel(
    'rembeh_alerts',
    'REMBEH Alerts',
    description: 'Loan, collection, and operations alerts',
    importance: Importance.high,
  );

  Future<void> initialize() async {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    _messaging = FirebaseMessaging.instance;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _local.initialize(
      settings: const InitializationSettings(android: androidInit, iOS: iosInit),
    );

    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_androidChannel);

    FirebaseMessaging.onMessage.listen(_showForegroundNotification);
  }

  Future<void> requestPermissionAndSync() async {
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      return;
    }

    if (Platform.isIOS) {
      await _messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
    }

    try {
      final token = await _messaging.getToken();
      if (token != null) {
        await _registerToken(token);
      }
    } catch (error, stack) {
      debugPrint('Push token fetch failed: $error');
      debugPrint('$stack');
      return;
    }

    _messaging.onTokenRefresh.listen(_registerToken);
  }

  Future<void> _registerToken(String token) async {
    final session = await _sessionStore.read();
    if (session == null || session.isAccessExpired) {
      return;
    }

    final platform = Platform.isIOS
        ? 'IOS'
        : Platform.isAndroid
            ? 'ANDROID'
            : 'ANDROID';

    try {
      await http.post(
        Uri.parse('$rembehApiBaseUrl/notifications/push/tokens'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': '${session.tokenType} ${session.accessToken}',
        },
        body: jsonEncode({
          'token': token,
          'platform': platform,
          'projectKey': 'MOBILE',
        }),
      );
    } catch (_) {
      // Best-effort; next launch will retry.
    }
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    final notification = message.notification;
    final title = notification?.title ?? message.data['title'] ?? 'REMBEH';
    final body = notification?.body ?? message.data['body'] ?? '';

    await _local.show(
      id: message.hashCode,
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _androidChannel.id,
          _androidChannel.name,
          channelDescription: _androidChannel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      payload: jsonEncode(message.data),
    );
  }
}

Future<PushNotificationService?> bootstrapPush(SessionStore store) async {
  if (kIsWeb) {
    return null;
  }
  try {
    // Must be registered before runApp / after WidgetsFlutterBinding.
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    final service = PushNotificationService(store);
    await service.initialize();
    return service;
  } catch (error, stack) {
    debugPrint('Push bootstrap failed: $error\n$stack');
    return null;
  }
}
