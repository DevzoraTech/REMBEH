import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/main.dart';
import 'package:rembeh_mobile/services/session_store.dart';

void main() {
  testWidgets('boots REMBEH app', (tester) async {
    await tester.pumpWidget(RembehApp(sessionStore: SessionStore()));
    expect(find.byType(RembehApp), findsOneWidget);
  });
}
