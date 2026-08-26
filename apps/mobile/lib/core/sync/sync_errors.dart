import 'dart:convert';

String cleanSyncException(Object error) {
  return error.toString().replaceFirst(RegExp(r'^Exception:\s*'), '');
}

String syncHttpFailureMessage({
  required String action,
  required int statusCode,
  required String responseBody,
}) {
  final message = _messageFromBody(responseBody);
  final lowered = message.toLowerCase();

  if (statusCode == 403 && lowered.contains('sync.download')) {
    return 'Offline data sync is not enabled for this account yet. Connect again after your permissions are updated; your last saved data remains available.';
  }

  if (statusCode == 403 && lowered.contains('sync.upload')) {
    return 'Offline upload is not enabled for this account yet. Your pending work remains saved on this device.';
  }

  if (statusCode == 401) {
    return 'Your saved online session needs to reconnect before syncing.';
  }

  if (message.isNotEmpty) {
    return 'Could not $action: $message';
  }

  return 'Could not $action. Server returned $statusCode.';
}

String _messageFromBody(String responseBody) {
  if (responseBody.trim().isEmpty) {
    return '';
  }

  try {
    final decoded = jsonDecode(responseBody);
    if (decoded is Map<String, dynamic>) {
      final message = decoded['message'];
      if (message is String) {
        return message;
      }
      if (message is List) {
        return message.map((item) => item.toString()).join(', ');
      }
    }
  } catch (_) {
    return responseBody;
  }

  return responseBody;
}
