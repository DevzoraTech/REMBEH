import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/screens/profile/onboarding_date.dart';

void main() {
  test('formats typed dates and validates calendar dates', () {
    final formatted = OnboardingDateFormatter().formatEditUpdate(
      TextEditingValue.empty,
      const TextEditingValue(
        text: '311026',
        selection: TextSelection.collapsed(offset: 6),
      ),
    );
    expect(formatted.text, '31-10-26');
    expect(
      onboardingDateIso(parseOnboardingDate(formatted.text)!),
      '2026-10-31',
    );
    expect(parseOnboardingDate('31-09-26'), isNull);
    expect(onboardingDateIso(parseOnboardingDate('29-02-24')!), '2024-02-29');
    expect(onboardingDateIso(parseOnboardingDate('01-01-99')!), '1999-01-01');
    expect(
      onboardingDateDisplay(parseOnboardingDate('2025-01-02')!),
      '02-01-25',
    );
  });
}
