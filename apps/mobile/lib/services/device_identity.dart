import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

const _deviceIdKey = 'rembeh.device.installation_id';

class DeviceIdentity {
  const DeviceIdentity({
    required this.deviceId,
    required this.deviceName,
    required this.deviceType,
    required this.platform,
  });

  final String deviceId;
  final String deviceName;
  final String deviceType;
  final String platform;

  Map<String, String> toJson() => {
        'deviceId': deviceId,
        'deviceName': deviceName,
        'deviceType': deviceType,
        'platform': platform,
      };
}

Future<DeviceIdentity> resolveDeviceIdentity() async {
  final prefs = await SharedPreferences.getInstance();
  var deviceId = prefs.getString(_deviceIdKey);
  if (deviceId == null || deviceId.isEmpty) {
    deviceId = const Uuid().v4();
    await prefs.setString(_deviceIdKey, deviceId);
  }

  final plugin = DeviceInfoPlugin();
  var deviceName = 'Mobile device';
  var platform = 'ANDROID';
  var deviceType = 'Mobile App (Android)';

  if (kIsWeb) {
    platform = 'WEB';
    deviceName = 'Web browser';
    deviceType = 'Web App';
  } else {
    switch (defaultTargetPlatform) {
      case TargetPlatform.iOS:
        final ios = await plugin.iosInfo;
        platform = 'IOS';
        deviceType = 'Mobile App (iOS)';
        deviceName = _friendlyIosName(ios.utsname.machine, ios.name);
      case TargetPlatform.android:
        final android = await plugin.androidInfo;
        platform = 'ANDROID';
        deviceType = 'Mobile App (Android)';
        final manufacturer = android.manufacturer.trim();
        final model = android.model.trim();
        deviceName = ('$manufacturer $model').trim().isEmpty
            ? 'Android device'
            : ('$manufacturer $model').trim();
      default:
        deviceName = defaultTargetPlatform.name;
        platform = defaultTargetPlatform.name.toUpperCase();
        deviceType = 'Mobile App';
    }
  }

  return DeviceIdentity(
    deviceId: deviceId,
    deviceName: deviceName,
    deviceType: deviceType,
    platform: platform,
  );
}

String _friendlyIosName(String machine, String fallbackName) {
  final map = <String, String>{
    'iPhone14,5': 'iPhone 13',
    'iPhone14,2': 'iPhone 13 Pro',
    'iPhone14,3': 'iPhone 13 Pro Max',
    'iPhone14,4': 'iPhone 13 mini',
    'iPhone15,2': 'iPhone 14 Pro',
    'iPhone15,3': 'iPhone 14 Pro Max',
    'iPhone15,4': 'iPhone 14',
    'iPhone15,5': 'iPhone 14 Plus',
    'iPhone16,1': 'iPhone 15 Pro',
    'iPhone16,2': 'iPhone 15 Pro Max',
    'iPhone17,1': 'iPhone 16 Pro',
    'iPhone17,2': 'iPhone 16 Pro Max',
  };
  if (map.containsKey(machine)) return map[machine]!;
  if (machine.startsWith('iPhone')) return machine.replaceAll(',', ' ');
  if (fallbackName.trim().isNotEmpty) return fallbackName.trim();
  return 'iPhone';
}
