import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/features/salaries/domain/models/salary_models.dart';
import 'package:rembeh_mobile/features/salaries/presentation/sheets/record_salary_payment_sheet.dart';

void main() {
  testWidgets('salary payment amount remains visible while typing', (
    tester,
  ) async {
    await tester.pumpWidget(_frame(_sheet(_employee())));

    const amountField = ValueKey('salary-payment-amount-field');
    await tester.enterText(find.byKey(amountField), '250000');
    await tester.pump();

    final field = tester.widget<TextField>(find.byKey(amountField));
    expect(field.controller?.text, '250000');
    expect(find.text('250000'), findsOneWidget);
  });

  testWidgets('salary payment sheet acknowledges employee shortage', (
    tester,
  ) async {
    await tester.pumpWidget(_frame(_sheet(_employee(shortage: 25000))));

    expect(find.text('Outstanding shortage: UGX 25,000'), findsOneWidget);

    await tester.tap(find.text('Hold shortage'));
    await tester.pump();

    const amountField = ValueKey('salary-payment-amount-field');
    var field = tester.widget<TextField>(find.byKey(amountField));
    expect(field.controller?.text, '575000');

    await tester.tap(find.text('Pay full salary'));
    await tester.pump();

    field = tester.widget<TextField>(find.byKey(amountField));
    expect(field.controller?.text, '600000');
  });
}

Widget _frame(Widget child) {
  return MaterialApp(
    home: Scaffold(
      body: MediaQuery(
        data: const MediaQueryData(size: Size(390, 844)),
        child: child,
      ),
    ),
  );
}

Widget _sheet(SalaryEmployee employee) {
  return RecordSalaryPaymentSheet(
    employee: employee,
    cycleLabel: '22 Aug - 21 Sep 2026',
  );
}

SalaryEmployee _employee({num shortage = 0}) {
  return SalaryEmployee(
    id: 'employee-1',
    branchId: 'branch-1',
    fullName: 'Kenyi Waiswa',
    phone: '+256765445566',
    email: 'kenyi@example.com',
    ninNumber: 'CM123456789',
    roleName: 'Agent',
    status: 'ACTIVE',
    monthlySalary: 600000,
    salaryDue: 600000,
    paid: 0,
    outstanding: 600000,
    shortageOutstanding: shortage,
    paymentStatus: 'UNPAID',
    isProrated: false,
    cycleDays: 31,
    eligibleDays: 31,
    dateJoined: DateTime(2026, 8, 1),
    payments: const [],
  );
}
