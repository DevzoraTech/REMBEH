String normalizePhoneForApi(String raw) {
  final compact = raw.trim().replaceAll(RegExp(r'[\s()-]'), '');
  if (compact.isEmpty) return compact;
  final digits = compact.replaceAll(RegExp(r'\D'), '');
  if (RegExp(r'^0\d{9}$').hasMatch(digits)) {
    return '+256${digits.substring(1)}';
  }
  if (RegExp(r'^7\d{8}$').hasMatch(digits)) {
    return '+256$digits';
  }
  if (RegExp(r'^256\d{9}$').hasMatch(digits)) {
    return '+$digits';
  }
  if (compact.startsWith('+')) return compact;
  return digits.isEmpty ? compact : '+$digits';
}

bool looksLikePhoneQuery(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return false;
  final digits = trimmed.replaceAll(RegExp(r'\D'), '');
  if (digits.length < 7) return false;
  final compact = trimmed.replaceAll(RegExp(r'[\s()+-]'), '');
  return digits.length / compact.length >= 0.7;
}

/// Light cleanup for client search — do not E.164-normalize.
///
/// The API expands `07…` / `7…` / `256…` / `+256…` variants. Pre-normalizing
/// search queries (especially partial `07…`) breaks substring matching.
String normalizeClientSearchQuery(String raw) {
  final trimmed = raw.trim();
  if (!looksLikePhoneQuery(trimmed)) return trimmed;
  return trimmed.replaceAll(RegExp(r'[\s()-]'), '');
}
