import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/main.dart';

void main() {
  testWidgets('boots REMBEH app', (tester) async {
    await tester.pumpWidget(const RembehApp());
    expect(find.byType(RembehApp), findsOneWidget);
  });
}
