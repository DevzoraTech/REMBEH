String normalizePhoneForApi(String raw) {
  final digits = raw.trim().replaceAll(RegExp(r'[\s()-]'), '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0') && digits.length >= 9) {
    return '+256${digits.substring(1)}';
  }
  if (digits.startsWith('256')) {
    return '+$digits';
  }
  return digits.startsWith('+') ? digits : '+$digits';
}

bool looksLikePhoneQuery(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return false;
  final digits = trimmed.replaceAll(RegExp(r'\D'), '');
  if (digits.length < 7) return false;
  final compact = trimmed.replaceAll(RegExp(r'[\s()+-]'), '');
  return digits.length / compact.length >= 0.7;
}

/// Prefer normalized phone for search when the query looks like a number.
String normalizeClientSearchQuery(String raw) {
  final trimmed = raw.trim();
  if (!looksLikePhoneQuery(trimmed)) return trimmed;
  return normalizePhoneForApi(trimmed);
}
