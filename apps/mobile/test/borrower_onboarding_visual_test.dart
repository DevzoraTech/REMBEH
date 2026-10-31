import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/screens/profile/borrower_onboarding_screen.dart';
import 'package:rembeh_mobile/services/api_client.dart';
import 'package:rembeh_mobile/services/session_store.dart';

class _VisualApi extends Fake implements ApiClient {
  _VisualApi(this.setup);
  final Map<String, dynamic> setup;
  @override
  Future<Map<String, dynamic>> getBorrowerOnboardingSetup({required RembehSession session}) async => setup;
  @override
  Future<Map<String, dynamic>> listOpeningBorrowers({required RembehSession session}) async => {'total': 0, 'records': <dynamic>[]};
}

void main() {
  testWidgets('renders onboarding at a phone size', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    FlutterSecureStorage.setMockInitialValues({});
    final session = RembehSession(accessToken: 'x', expiresAt: '', tokenType: 'Bearer', permissions: const [], userName: 'Manager', userEmail: 'a@example.test', roleName: 'Manager', workspaceName: 'Test', tenantId: 'tenant', branchId: 'branch', userId: 'user');
    final key = GlobalKey();
    await tester.pumpWidget(RepaintBoundary(key: key, child: MaterialApp(home: BorrowerOnboardingScreen(session: session, api: _VisualApi({})))));
    await tester.pumpAndSettle();
    final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    await tester.runAsync(() async {
      final image = await boundary.toImage(pixelRatio: 1);
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      await File('/tmp/rembeh-onboarding-intro-review.png').writeAsBytes(data!.buffer.asUint8List());
    });
    expect(tester.takeException(), isNull);
  }, skip: !Platform.environment.containsKey('REMBEH_VISUAL_REVIEW'));
}
