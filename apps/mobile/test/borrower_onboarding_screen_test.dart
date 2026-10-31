import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/screens/profile/borrower_onboarding_screen.dart';
import 'package:rembeh_mobile/services/api_client.dart';
import 'package:rembeh_mobile/services/session_store.dart';

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
  Future<Map<String, dynamic>> saveBorrowerOnboardingSetup({required RembehSession session, required List<String> selectedFields, required int revision}) async => {'revision': revision + 1, 'selectedFields': selectedFields};
}

class _OfflineApi extends _Api {
  _OfflineApi() : super({});
  @override
  Future<Map<String, dynamic>> getBorrowerOnboardingSetup({
    required RembehSession session,
  }) async => throw Exception('offline');
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
    await tester.pumpWidget(MaterialApp(home: BorrowerOnboardingScreen(session: session, api: _Api({}))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'national identification');
    await tester.pumpAndSettle();
    expect(find.text('National identification number (NIN)'), findsOneWidget);
    expect(find.text('Loan terms'), findsNothing);
    expect(tester.takeException(), isNull);
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
    expect(find.text('3 records saved'), findsOneWidget);
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
        await tester.tap(find.text('Sync'));
        await tester.pumpAndSettle();
        expect(api.submissions, duplicate ? 0 : 1);
        final raw = await const FlutterSecureStorage().read(key: draftKey);
        final pending = (jsonDecode(raw!) as Map)['pendingRecords'] as List;
        expect(pending.length, duplicate ? 1 : 0);
      },
    );
  }

  testWidgets('keeps the entry and offers a queue when the connection drops', (
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
    expect(find.text('OFFLINE BORROWER'), findsOneWidget);
    expect(find.text('Queue & Add Another'), findsOneWidget);
  });
}
