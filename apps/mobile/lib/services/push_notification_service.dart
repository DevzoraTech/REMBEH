import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

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
    playSound: true,
  );

  static const _reminderChannel = AndroidNotificationChannel(
    'rembeh_reminders',
    'REMBEH Reminders',
    description: 'Daily sync, collections, salary, and operations reminders',
    importance: Importance.high,
    playSound: true,
  );

  Future<void> initialize() async {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Africa/Kampala'));

    _messaging = FirebaseMessaging.instance;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _local.initialize(
      settings: const InitializationSettings(
        android: androidInit,
        iOS: iosInit,
      ),
    );

    await _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(_androidChannel);
    await _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(_reminderChannel);

    FirebaseMessaging.onMessage.listen(_showForegroundNotification);
  }

  Future<void> requestPermissionAndSync() async {
    await _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.requestNotificationsPermission();
    await _local
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >()
        ?.requestPermissions(alert: true, badge: true, sound: true);

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

  Future<void> scheduleDefaultReminders() async {
    await scheduleDailyReminder(
      id: 7001,
      hour: 7,
      minute: 30,
      title: 'Sync today before field work',
      body: 'Connect to internet and download the latest REMBEH data.',
      payload: {'type': 'daily_sync'},
    );
    await scheduleDailyReminder(
      id: 7002,
      hour: 17,
      minute: 30,
      title: 'Close the day',
      body: "Reconcile cash, review shortages, and send today's report.",
      payload: {'type': 'close_day'},
    );
    await scheduleDailyReminder(
      id: 7003,
      hour: 9,
      minute: 0,
      title: 'Review salary and shortage actions',
      body: 'Check pending salary payments and employee shortages.',
      payload: {'type': 'salary_shortage_review'},
    );
  }

  Future<void> scheduleDailyReminder({
    required int id,
    required int hour,
    required int minute,
    required String title,
    required String body,
    Map<String, dynamic>? payload,
  }) async {
    await _local.zonedSchedule(
      id: id,
      title: title,
      body: body,
      scheduledDate: _nextDaily(hour: hour, minute: minute),
      notificationDetails: _reminderDetails(),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      matchDateTimeComponents: DateTimeComponents.time,
      payload: payload == null ? null : jsonEncode(payload),
    );
  }

  Future<void> scheduleReminder({
    required int id,
    required DateTime scheduledAt,
    required String title,
    required String body,
    Map<String, dynamic>? payload,
  }) async {
    final scheduled = tz.TZDateTime.from(scheduledAt, tz.local);
    await _local.zonedSchedule(
      id: id,
      title: title,
      body: body,
      scheduledDate: scheduled.isBefore(tz.TZDateTime.now(tz.local))
          ? scheduled.add(const Duration(minutes: 1))
          : scheduled,
      notificationDetails: _reminderDetails(),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      payload: payload == null ? null : jsonEncode(payload),
    );
  }

  Future<void> cancelReminder(int id) => _local.cancel(id: id);

  tz.TZDateTime _nextDaily({required int hour, required int minute}) {
    final now = tz.TZDateTime.now(tz.local);
    var scheduled = tz.TZDateTime(
      tz.local,
      now.year,
      now.month,
      now.day,
      hour,
      minute,
    );
    if (!scheduled.isAfter(now)) {
      scheduled = scheduled.add(const Duration(days: 1));
    }
    return scheduled;
  }

  NotificationDetails _reminderDetails() {
    return NotificationDetails(
      android: AndroidNotificationDetails(
        _reminderChannel.id,
        _reminderChannel.name,
        channelDescription: _reminderChannel.description,
        importance: Importance.high,
        priority: Priority.high,
        playSound: true,
        enableVibration: true,
        icon: '@mipmap/ic_launcher',
      ),
      iOS: const DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      ),
    );
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
          playSound: true,
          enableVibration: true,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
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
