import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/screens/profile/flat_loan_amount.dart';
import 'package:rembeh_mobile/screens/profile/loan_details_sheet.dart';
import 'package:rembeh_mobile/core/di/loan_application_locator.dart';

void main() {
  test('flat repayment uses exact decimal arithmetic and server tolerance', () {
    expect(flatLoanRepayable('100000', '20'), '120000');
    expect(flatLoanRepayable('0.05', '10'), '0.06');
    expect(flatLoanRepayable('100000', ''), isNull);
    expect(flatLoanRepayable('0', '20'), isNull);
    expect(flatLoanPrincipal('2500000', '20'), '2083333.33');
    expect(flatLoanPrincipal('0.05', '10'), '0.05');
    expect(flatLoanPrincipal('', '20'), isNull);
    expect(flatLoanMatchesRepayable('100000', '20', '120000'), isTrue);
    expect(flatLoanMatchesRepayable('100000', '20', '150000'), isFalse);
  });

  testWidgets(
    'loan type fills terms and derives principal from the recorded total',
    (tester) async {
      const product = LoanProductTemplateOption(
        id: 'daily',
        name: 'Daily loan',
        interestRatePercent: 20,
        interestType: 'FLAT',
        termValue: 30,
        termUnit: 'DAYS',
        durationDays: 30,
        repaymentFrequency: 'DAILY',
        processingFeeType: 'FIXED',
        processingFeePercent: 0,
        processingFeeFixedAmount: 0,
        penaltyRatePercent: 0,
        finePeriodDays: 1,
        paymentStartPolicy: 'NEXT_DAY',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showLoanDetailsSheet(
                  context,
                  savedRepayable: '2500000',
                  issueDate: '2026-10-01',
                  products: const [product],
                  onSave: (_) async {},
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Loan type'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Daily loan').last);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextFormField>(
              find.widgetWithText(TextFormField, 'Loan amount'),
            )
            .controller!
            .text,
        '2083333.33',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.widgetWithText(TextFormField, 'Flat interest rate'),
            )
            .controller!
            .text,
        '20.0',
      );
      expect(
        tester
            .widget<TextFormField>(
              find.widgetWithText(TextFormField, 'Repayment start date'),
            )
            .controller!
            .text,
        '02-10-26',
      );
      expect(find.text('UGX 2,500,000'), findsOneWidget);
    },
  );

  testWidgets('calculates the amount and closes without a lifecycle error', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () =>
                  showLoanDetailsSheet(context, onSave: (_) async {}),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Loan amount'),
      '100000',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Flat interest rate'),
      '20',
    );
    await tester.pumpAndSettle();
    expect(find.text('UGX 120,000'), findsOneWidget);
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(find.text('Complete loan details'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('warns when the calculation conflicts with the saved total', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showLoanDetailsSheet(
                context,
                savedRepayable: '150000',
                onSave: (_) async {},
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Loan amount'),
      '100000',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Flat interest rate'),
      '20',
    );
    await tester.pumpAndSettle();
    expect(find.text('Previously recorded: UGX 150,000'), findsOneWidget);
    expect(
      find.textContaining('differs from the recorded total'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'asks before correcting a recorded total and preserves the form on failure',
    (tester) async {
      Map<String, dynamic>? submitted;
      var shouldFail = true;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showLoanDetailsSheet(
                  context,
                  savedRepayable: '150000',
                  onSave: (terms) async {
                    submitted = terms;
                    if (shouldFail)
                      throw Exception('Unable to save this record.');
                  },
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Loan amount'),
        '100000',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Flat interest rate'),
        '20',
      );
      final duration = find.widgetWithText(TextFormField, 'Duration in days');
      await tester.ensureVisible(duration);
      await tester.enterText(duration, '30');
      final start = find.widgetWithText(TextFormField, 'Repayment start date');
      await tester.ensureVisible(start);
      await tester.tap(find.byTooltip('Choose repayment start date'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      final frequency = find.text('Repayment frequency');
      await tester.ensureVisible(frequency);
      await tester.tap(frequency);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Daily').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save loan details'));
      await tester.pumpAndSettle();
      expect(find.text('Update recorded total?'), findsOneWidget);
      expect(submitted, isNull);
      await tester.tap(find.text('Confirm update'));
      await tester.pumpAndSettle();
      expect(submitted, containsPair('repayable', '120000'));
      expect(submitted, containsPair('expectedRepayable', '150000'));
      expect(submitted, containsPair('confirmRepayableCorrection', true));
      expect(find.text('Complete loan details'), findsOneWidget);
      expect(find.text('Unable to save this record.'), findsOneWidget);
      shouldFail = false;
      await tester.tap(find.text('Save loan details'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm update'));
      await tester.pumpAndSettle();
      expect(find.text('Complete loan details'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
