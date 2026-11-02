import 'package:flutter/services.dart';

/// Birth dates use the most recent century; other dates use a 1950-2049 window.
DateTime? parseOnboardingDate(String value, {bool birthDate = false}) {
  final text = value.trim();
  final iso = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(text);
  final short = RegExp(r'^(\d{2})-(\d{2})-(\d{2})$').firstMatch(text);
  if (iso == null && short == null) return null;
  final cutoff = birthDate ? DateTime.now().year % 100 + 1 : 50;
  final year = iso != null
      ? int.parse(iso[1]!)
      : (int.parse(short![3]!) >= cutoff ? 1900 : 2000) + int.parse(short[3]!);
  final month = int.parse(iso != null ? iso[2]! : short![2]!);
  final day = int.parse(iso != null ? iso[3]! : short![1]!);
  final parsed = DateTime(year, month, day);
  return parsed.year == year && parsed.month == month && parsed.day == day
      ? parsed
      : null;
}

String onboardingDateDisplay(DateTime date, {bool birthDate = false}) {
  final short =
      '${date.day.toString().padLeft(2, '0')}-${date.month.toString().padLeft(2, '0')}-${(date.year % 100).toString().padLeft(2, '0')}';
  return parseOnboardingDate(short, birthDate: birthDate)?.year == date.year
      ? short
      : onboardingDateIso(date);
}

String onboardingDateIso(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

class OnboardingDateFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 6) return oldValue;
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i == 2 || i == 4) buffer.write('-');
      buffer.write(digits[i]);
    }
    final text = buffer.toString();
    final cursorDigits = newValue.text
        .substring(
          0,
          newValue.selection.baseOffset.clamp(0, newValue.text.length),
        )
        .replaceAll(RegExp(r'\D'), '')
        .length;
    final offset =
        (cursorDigits + (cursorDigits > 2 ? 1 : 0) + (cursorDigits > 4 ? 1 : 0))
            .clamp(0, text.length);
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: offset),
    );
  }
}
