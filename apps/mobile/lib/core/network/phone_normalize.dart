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
