import 'dart:convert';
import 'dart:io';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/screens/profile/borrower_onboarding_screen.dart';
import 'package:rembeh_mobile/services/api_client.dart';
import 'package:rembeh_mobile/services/session_store.dart';
import 'package:rembeh_mobile/core/di/loan_application_locator.dart';

const _product = LoanProductTemplateOption(
  id: 'dffea409-9b5a-4408-8451-3f264a2af7b1',
  name: 'Enterprise',
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

class _Api extends Fake implements ApiClient {
  _Api(this.setup);
  final Map<String, dynamic> setup;

  @override
  Future<Map<String, dynamic>> getBorrowerOnboardingSetup({
    required RembehSession session,
  }) async => setup;

  @override
  Future<Map<String, dynamic>> listOpeningBorrowers({
    required RembehSession session,
  }) async => {'total': 3, 'records': <dynamic>[]};

  @override
  Future<Map<String, dynamic>> saveBorrowerOnboardingSetup({
    required RembehSession session,
    required List<String> selectedFields,
    required int revision,
  }) async => {'revision': revision + 1, 'selectedFields': selectedFields};
}

class _OfflineApi extends _Api {
  _OfflineApi() : super({});
  @override
  Future<Map<String, dynamic>> getBorrowerOnboardingSetup({
    required RembehSession session,
  }) async => throw const SocketException('offline');
}

class _SyncApi extends _Api {
  _SyncApi({this.duplicate = false})
    : super({
        'revision': 1,
        'selectedFields': [
          'full_name',
          'phone',
          'repayable',
          'outstanding',
          'date_issued',
        ],
      });
  final bool duplicate;
  int submissions = 0;
  @override
  Future<Map<String, dynamic>> checkOpeningBorrowerDuplicates({
    required RembehSession session,
    required Map<String, dynamic> record,
  }) async => {
    'alreadySaved': false,
    'phoneExists': duplicate,
    'nationalIdExists': false,
    'matchingNames': 0,
  };
  @override
  Future<Map<String, dynamic>> createOpeningBorrower({
    required RembehSession session,
    required Map<String, dynamic> record,
  }) async {
    submissions++;
    return {'loanId': 'dffea409-9b5a-4408-8451-3f264a2af7b4'};
  }
}

class _ConnectionLossApi extends _SyncApi {
  @override
  Future<Map<String, dynamic>> checkOpeningBorrowerDuplicates({
    required RembehSession session,
    required Map<String, dynamic> record,
  }) async => throw const SocketException('offline');
}

class _SlowSyncApi extends _SyncApi {
  final gate = Completer<void>();
  @override
  Future<Map<String, dynamic>> checkOpeningBorrowerDuplicates({
    required RembehSession session,
    required Map<String, dynamic> record,
  }) async {
    await gate.future;
    return super.checkOpeningBorrowerDuplicates(
      session: session,
      record: record,
    );
  }
}

class _CaptureApi extends _Api {
  _CaptureApi(super.setup);
  Map<String, dynamic>? saved;
  @override
  Future<Map<String, dynamic>> checkOpeningBorrowerDuplicates({
    required RembehSession session,
    required Map<String, dynamic> record,
  }) async => {
    'alreadySaved': false,
    'phoneExists': false,
    'nationalIdExists': false,
    'matchingNames': 0,
  };
  @override
  Future<Map<String, dynamic>> createOpeningBorrower({
    required RembehSession session,
    required Map<String, dynamic> record,
  }) async {
    saved = Map.of(record);
    return {
      'loanId': 'dffea409-9b5a-4408-8451-3f264a2af7b4',
      'status': 'COMPLETE',
    };
  }
}

void main() {
  final session = RembehSession(
    accessToken: 'token',
    expiresAt: '',
    tokenType: 'Bearer',
    permissions: const [],
    userName: 'Manager',
    userEmail: 'manager@example.test',
    roleName: 'Manager',
    workspaceName: 'Test',
    tenantId: 'tenant',
    branchId: 'branch',
    userId: 'user',
  );
  const draftKey = 'borrower_onboarding_draft_v1:tenant:branch:user';

  testWidgets('opens introduction for a branch without an existing setup', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({});
    await tester.pumpWidget(
      MaterialApp(
        home: BorrowerOnboardingScreen(session: session, api: _Api({})),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Set up your existing borrowers'), findsOneWidget);
    expect(find.text('Step 1 of 3'), findsOneWidget);
  });

  testWidgets('selection is searchable on a small screen', (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    FlutterSecureStorage.setMockInitialValues({});
    await tester.pumpWidget(
      MaterialApp(
        home: BorrowerOnboardingScreen(session: session, api: _Api({})),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField).first,
      'national identification',
    );
    await tester.pumpAndSettle();
    expect(find.text('National identification number (NIN)'), findsOneWidget);
    expect(find.text('Loan terms'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'clear all removes every selection and checks required fields before continuing',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      await tester.pumpWidget(
        MaterialApp(
          home: BorrowerOnboardingScreen(session: session, api: _Api({})),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Recommended 5'), findsNothing);
      expect(find.text('Selected only'), findsNothing);
      await tester.ensureVisible(find.text('Clear all fields'));
      await tester.tap(find.text('Clear all fields'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Clear all'));
      await tester.pumpAndSettle();
      expect(find.text('Continue with 0 fields'), findsOneWidget);
      await tester.tap(find.text('Continue with 0 fields'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Select full name, phone number, repayable amount, outstanding balance and date issued to continue.',
        ),
        findsWidgets,
      );
      expect(find.text('Step 2 of 3'), findsOneWidget);
    },
  );

  testWidgets('clear section keeps selections in other sections', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({});
    await tester.pumpWidget(
      MaterialApp(
        home: BorrowerOnboardingScreen(session: session, api: _Api({})),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Clear section').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Clear section').first);
    await tester.pumpAndSettle();
    expect(find.text('Continue with 3 fields'), findsOneWidget);
  });

  testWidgets('borrower identity fields can be selected', (tester) async {
    FlutterSecureStorage.setMockInitialValues({});
    await tester.pumpWidget(
      MaterialApp(
        home: BorrowerOnboardingScreen(session: session, api: _Api({})),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    for (final label in [
      'Surname',
      'Given names',
      'National identification number (NIN)',
      'Email address',
      'Gender',
      'Date of birth',
      'District',
      'Sub-county',
      'Parish',
      'Village',
    ]) {
      await tester.enterText(find.byType(TextField).first, label);
      await tester.pumpAndSettle();
      expect(find.widgetWithText(CheckboxListTile, label), findsOneWidget);
      expect(find.text('Not available yet'), findsNothing);
    }
  });

  testWidgets('selected loan fields appear in the entry form', (tester) async {
    FlutterSecureStorage.setMockInitialValues({});
    await tester.pumpWidget(
      MaterialApp(
        home: BorrowerOnboardingScreen(session: session, api: _Api({})),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField).first,
      'loan amount or principal issued',
    );
    await tester.pumpAndSettle();
    tester.testTextInput.hide();
    await tester.ensureVisible(find.text('Loan amount or principal issued'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Loan amount or principal issued'));
    await tester.pumpAndSettle();
    expect(find.text('Continue with 6 fields'), findsOneWidget);
    await tester.tap(find.text('Continue with 6 fields'));
    await tester.pumpAndSettle();
    expect(find.text('Loan amount issued'), findsOneWidget);
    expect(find.text('Repayment start date'), findsNothing);
    expect(find.text('Finish Onboarding'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'borrower entry calculates the repayment total from loan amount and interest',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      final api = _Api({
        'revision': 1,
        'selectedFields': [
          'full_name',
          'phone',
          'repayable',
          'outstanding',
          'date_issued',
          'principal',
          'interest_rate',
        ],
      });
      await tester.pumpWidget(
        MaterialApp(
          home: BorrowerOnboardingScreen(session: session, api: api),
        ),
      );
      await tester.pumpAndSettle();
      final principal = find.widgetWithText(
        TextFormField,
        'Loan amount issued',
      );
      final rate = find.widgetWithText(TextFormField, 'Flat interest rate (%)');
      await tester.ensureVisible(principal);
      await tester.enterText(principal, '100000');
      await tester.ensureVisible(rate);
      await tester.enterText(rate, '20');
      await tester.pumpAndSettle();
      final repayable = tester.widget<TextFormField>(
        find.widgetWithText(TextFormField, 'Repayable amount *'),
      );
      expect(repayable.controller?.text, '120000');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('finishing preserves an existing draft', (tester) async {
    FlutterSecureStorage.setMockInitialValues({
      draftKey: jsonEncode({
        'requestId': 'dffea409-9b5a-4408-8451-3f264a2af7b3',
        'revision': 1,
        'selectedFields': [
          'full_name',
          'phone',
          'repayable',
          'outstanding',
          'date_issued',
        ],
        'fields': {'fullName': 'DRAFT BORROWER'},
      }),
    });
    await tester.pumpWidget(
      MaterialApp(
        home: BorrowerOnboardingScreen(session: session, api: _OfflineApi()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Finish Onboarding'));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Your current draft and pending records will remain on this device.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Continue entering'));
    await tester.pumpAndSettle();
    expect(find.text('DRAFT BORROWER'), findsOneWidget);
  });

  testWidgets('selected identity and loan information fields are editable', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({});
    final api = _Api({
      'revision': 1,
      'selectedFields': [
        'full_name',
        'phone',
        'repayable',
        'outstanding',
        'date_issued',
        'given_names',
        'surname',
        'date_approved',
        'loan_product',
      ],
    });
    await tester.pumpWidget(
      MaterialApp(
        home: BorrowerOnboardingScreen(session: session, api: api),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Given names'), findsOneWidget);
    expect(find.text('Surname'), findsOneWidget);
    expect(find.text('Date approved'), findsOneWidget);
    expect(find.text('Loan type *'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('selected identity fields are included in the saved record', (
    tester,
  ) async {
    final fields = [
      'full_name',
      'phone',
      'repayable',
      'outstanding',
      'date_issued',
      'given_names',
      'surname',
      'date_approved',
      'loan_product',
    ];
    FlutterSecureStorage.setMockInitialValues({
      draftKey: jsonEncode({
        'requestId': 'dffea409-9b5a-4408-8451-3f264a2af7b3',
        'revision': 1,
        'loanProductId': 'dffea409-9b5a-4408-8451-3f264a2af7b1',
        'selectedFields': fields,
        'fields': {
          'fullName': 'TEST BORROWER',
          'givenNames': 'TEST',
          'surname': 'BORROWER',
          'phone': '0701234567',
          'issueDate': '2025-01-01',
          'approvalDate': '2024-12-30',
          'repayable': '120000',
          'outstanding': '90000',
          'loanProductName': 'Enterprise',
        },
      }),
    });
    final api = _CaptureApi({'revision': 1, 'selectedFields': fields});
    await tester.pumpWidget(
      MaterialApp(
        home: BorrowerOnboardingScreen(
          session: session,
          api: api,
          productLoader: () async => [_product],
        ),
      ),
    );
    await tester.pumpAndSettle();
    final issued = find.widgetWithText(TextFormField, 'Date issued *');
    await tester.ensureVisible(issued);
    await tester.enterText(issued, '010125');
    expect(find.text('01-01-25'), findsOneWidget);
    await tester.tap(find.text('Save & Add Another'));
    await tester.pumpAndSettle();
    expect(api.saved, containsPair('givenNames', 'TEST'));
    expect(api.saved, containsPair('surname', 'BORROWER'));
    expect(api.saved, containsPair('approvalDate', '2024-12-30'));
    expect(api.saved, containsPair('issueDate', '2025-01-01'));
    expect(api.saved, containsPair('loanProductName', 'Enterprise'));
    expect(api.saved, containsPair('loanProductTemplateId', _product.id));
    expect(api.saved, containsPair('principal', '100000'));
    expect(api.saved, containsPair('paymentStartDate', '2025-01-02'));
  });

  testWidgets('resumes at step three and restores a secure draft', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({
      draftKey: jsonEncode({
        'requestId': 'dffea409-9b5a-4408-8451-3f264a2af7b3',
        'fields': {'fullName': 'RESTORED BORROWER'},
        'frequency': 'DAILY',
      }),
    });
    await tester.pumpWidget(
      MaterialApp(
        home: BorrowerOnboardingScreen(
          session: session,
          api: _Api({
            'revision': 1,
            'selectedFields': [
              'full_name',
              'phone',
              'repayable',
              'outstanding',
              'date_issued',
            ],
          }),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Step 3 of 3'), findsOneWidget);
    expect(find.text('RESTORED BORROWER'), findsOneWidget);
    expect(find.text('Records saved'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
  });

  testWidgets(
    'opens a previously started draft offline without submitting it',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({
        draftKey: jsonEncode({
          'requestId': 'dffea409-9b5a-4408-8451-3f264a2af7b3',
          'revision': 1,
          'selectedFields': [
            'full_name',
            'phone',
            'repayable',
            'outstanding',
            'date_issued',
          ],
          'fields': {'fullName': 'OFFLINE BORROWER'},
        }),
      });
      await tester.pumpWidget(
        MaterialApp(
          home: BorrowerOnboardingScreen(session: session, api: _OfflineApi()),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Step 3 of 3'), findsOneWidget);
      expect(find.text('OFFLINE BORROWER'), findsOneWidget);
      expect(find.text('Offline'), findsOneWidget);
      expect(find.text('Queue & Add Another'), findsOneWidget);
    },
  );

  testWidgets(
    'queues a complete offline borrower without claiming server submission',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({
        draftKey: jsonEncode({
          'requestId': 'dffea409-9b5a-4408-8451-3f264a2af7b3',
          'revision': 1,
          'selectedFields': [
            'full_name',
            'phone',
            'repayable',
            'outstanding',
            'date_issued',
          ],
          'frequency': 'DAILY',
          'fields': {
            'fullName': 'OFFLINE BORROWER',
            'phone': '0701234567',
            'issueDate': '2025-01-01',
            'paymentStartDate': '2025-01-02',
            'principal': '100000',
            'repayable': '120000',
            'outstanding': '90000',
            'flatInterestPercent': '20',
            'durationDays': '30',
          },
        }),
      });
      await tester.pumpWidget(
        MaterialApp(
          home: BorrowerOnboardingScreen(session: session, api: _OfflineApi()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Queue & Add Another'));
      await tester.pumpAndSettle();
      expect(find.text('1 pending record'), findsOneWidget);
      final raw = await const FlutterSecureStorage().read(key: draftKey);
      final saved = jsonDecode(raw!) as Map<String, dynamic>;
      expect((saved['pendingRecords'] as List).length, 1);
      expect((saved['fields'] as Map)['fullName'], '');
    },
  );

  testWidgets('queues known opening amounts without inventing missing terms', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({
      draftKey: jsonEncode({
        'requestId': 'dffea409-9b5a-4408-8451-3f264a2af7b3',
        'revision': 1,
        'selectedFields': [
          'full_name',
          'phone',
          'repayable',
          'outstanding',
          'date_issued',
        ],
        'fields': {
          'fullName': 'BORROWER',
          'phone': '0701234567',
          'issueDate': '2025-01-01',
          'repayable': '120000',
          'outstanding': '90000',
        },
      }),
    });
    await tester.pumpWidget(
      MaterialApp(
        home: BorrowerOnboardingScreen(session: session, api: _OfflineApi()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Queue & Add Another'));
    await tester.pumpAndSettle();
    final saved =
        jsonDecode((await const FlutterSecureStorage().read(key: draftKey))!)
            as Map;
    final record =
        ((saved['pendingRecords'] as List).single as Map)['record'] as Map;
    expect(record['repayable'], '120000');
    expect(record.containsKey('principal'), isFalse);
    expect(record.containsKey('repaymentFrequency'), isFalse);
  });

  for (final duplicate in [false, true]) {
    testWidgets(
      duplicate
          ? 'does not submit a duplicate queued borrower'
          : 'checks and submits a queued borrower',
      (tester) async {
        final record = {
          'requestId': 'dffea409-9b5a-4408-8451-3f264a2af7b3',
          'fullName': 'PENDING BORROWER',
          'phone': '0701234567',
          'issueDate': '2025-01-01',
          'paymentStartDate': '2025-01-02',
          'principal': '100000',
          'repayable': '120000',
          'outstanding': '90000',
          'flatInterestPercent': '20',
          'durationDays': 30,
          'repaymentFrequency': 'DAILY',
        };
        FlutterSecureStorage.setMockInitialValues({
          draftKey: jsonEncode({
            'requestId': 'dffea409-9b5a-4408-8451-3f264a2af7b5',
            'revision': 1,
            'selectedFields': [
              'full_name',
              'phone',
              'repayable',
              'outstanding',
              'date_issued',
            ],
            'fields': {},
            'pendingRecords': [
              {'record': record, 'attachments': {}},
            ],
          }),
        });
        final api = _SyncApi(duplicate: duplicate);
        await tester.pumpWidget(
          MaterialApp(
            home: BorrowerOnboardingScreen(session: session, api: api),
          ),
        );
        await tester.pumpAndSettle();
        expect(api.submissions, duplicate ? 0 : 1);
        final raw = await const FlutterSecureStorage().read(key: draftKey);
        final pending = (jsonDecode(raw!) as Map)['pendingRecords'] as List;
        expect(pending.length, duplicate ? 1 : 0);
      },
    );
  }

  testWidgets('keeps a queued entry when the connection drops', (tester) async {
    FlutterSecureStorage.setMockInitialValues({
      draftKey: jsonEncode({
        'requestId': 'dffea409-9b5a-4408-8451-3f264a2af7b3',
        'revision': 1,
        'selectedFields': [
          'full_name',
          'phone',
          'repayable',
          'outstanding',
          'date_issued',
        ],
        'frequency': 'DAILY',
        'fields': {
          'fullName': 'OFFLINE BORROWER',
          'phone': '0701234567',
          'issueDate': '2025-01-01',
          'paymentStartDate': '2025-01-02',
          'principal': '100000',
          'repayable': '120000',
          'outstanding': '90000',
          'flatInterestPercent': '20',
          'durationDays': '30',
        },
      }),
    });
    await tester.pumpWidget(
      MaterialApp(
        home: BorrowerOnboardingScreen(
          session: session,
          api: _ConnectionLossApi(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save & Add Another'));
    await tester.pumpAndSettle();
    final raw = await const FlutterSecureStorage().read(key: draftKey);
    final pending = (jsonDecode(raw!) as Map)['pendingRecords'] as List;
    expect((pending.single['record'] as Map)['fullName'], 'OFFLINE BORROWER');
    expect(find.text('OFFLINE BORROWER'), findsNothing);
  });

  testWidgets('allows another record while the previous one is sending', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({
      draftKey: jsonEncode({
        'requestId': 'dffea409-9b5a-4408-8451-3f264a2af7b3',
        'revision': 1,
        'selectedFields': [
          'full_name',
          'phone',
          'repayable',
          'outstanding',
          'date_issued',
        ],
        'fields': {
          'fullName': 'FIRST BORROWER',
          'phone': '0701234567',
          'issueDate': '2025-01-01',
          'repayable': '120000',
          'outstanding': '90000',
        },
      }),
    });
    final api = _SlowSyncApi();
    await tester.pumpWidget(
      MaterialApp(
        home: BorrowerOnboardingScreen(session: session, api: api),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save & Add Another'));
    await tester.pumpAndSettle();
    expect(find.text('FIRST BORROWER'), findsNothing);
    expect(api.submissions, 0);
    final raw = await const FlutterSecureStorage().read(key: draftKey);
    expect(((jsonDecode(raw!) as Map)['pendingRecords'] as List).length, 1);
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Full name *'),
      'SECOND BORROWER',
    );
    expect(find.text('SECOND BORROWER'), findsOneWidget);
    api.gate.complete();
    await tester.pumpAndSettle();
    expect(api.submissions, 1);
    expect(find.text('SECOND BORROWER'), findsOneWidget);
  });
}
