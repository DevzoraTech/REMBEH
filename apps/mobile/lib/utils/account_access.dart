// Helpers for account-level lockouts (suspended / deactivated).

bool isAccountAccessBlockedMessage(String? message) {
  if (message == null || message.trim().isEmpty) return false;
  final lower = message.toLowerCase();
  return lower.contains('suspended') ||
      lower.contains('deactivated') ||
      lower.contains('account or user is not active');
}

/// Pulls the manager reason from API text like:
/// "Your account is suspended. Reason: Performance issue. Contact your manager."
String? extractSuspensionReason(String? message) {
  if (message == null) return null;
  final match = RegExp(
    r'Reason:\s*(.+?)(?:\.\s*Contact|\.\s*$)',
    caseSensitive: false,
  ).firstMatch(message);
  final reason = match?.group(1)?.trim();
  if (reason == null || reason.isEmpty) return null;
  return reason;
}
