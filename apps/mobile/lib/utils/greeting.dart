String timeOfDayGreeting(DateTime now) {
  final hour = now.hour;
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

String greetingSubtext(DateTime now) {
  // First half of the day vs second half.
  if (now.hour < 12) {
    return 'Let’s make today productive.';
  }
  return 'Consistency creates success';
}

String surnameFromFullName(String fullName) {
  final parts = fullName
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) return 'Agent';
  return parts.last;
}
