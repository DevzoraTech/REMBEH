import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/features/repayment/data/repayments_live_store.dart';
import 'package:rembeh_mobile/features/repayment/domain/entities/client_loan_detail.dart';
import 'package:rembeh_mobile/screens/search/search_tab.dart';
import 'package:rembeh_mobile/services/session_store.dart';

class _Store extends Fake implements RepaymentsLiveStore {
  final listeners = <VoidCallback>[];
  final List<Map<String, dynamic>> pending = [
    {'customerId': 'customer', 'branchId': 'branch', 'requestId': 'request', 'fullName': 'TEST BORROWER', 'phone': '+256701234597', 'outstanding': 90000},
    {'customerId': 'other', 'branchId': 'other-branch', 'requestId': 'other', 'fullName': 'OTHER BORROWER', 'phone': '+256701234598', 'outstanding': 30000},
  ];
  @override
  void addListener(VoidCallback listener) => listeners.add(listener);
  @override
  void removeListener(VoidCallback listener) => listeners.remove(listener);
  @override
  bool get offlineIndexReady => true;
  @override
  List<ClientLoanDetail> get cachedClients => [];
  @override
  List<Map<String, dynamic>> get pendingBorrowers => pending;
  @override
  RembehSession? get currentSession => null;
  @override
  Future<List<ClientLoanDetail>> searchClients(String query) async => [];
}

void main() {
  testWidgets('searches incomplete borrowers without presenting a loan', (tester) async {
    final store = _Store();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SearchTab(autofocus: false, focusToken: 0, branchId: 'branch', store: store))));
    await tester.pumpAndSettle();
    expect(find.text('TEST BORROWER'), findsOneWidget);
    expect(find.text('OTHER BORROWER'), findsNothing);
    await tester.enterText(find.byType(TextField), '0701234597');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.text('TEST BORROWER'), findsOneWidget);
    await tester.tap(find.text('TEST BORROWER'));
    await tester.pumpAndSettle();
    expect(find.text('Needs loan details'), findsWidgets);
    expect(find.text('A repayment schedule is not available until the loan details are completed.'), findsOneWidget);
    expect(find.text('Record repayment'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
