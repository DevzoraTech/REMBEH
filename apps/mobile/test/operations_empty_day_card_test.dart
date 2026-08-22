import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/features/operations/presentation/widgets/empty_day_card.dart';

void main() {
  testWidgets('blocked empty day explains why open is unavailable', (
    tester,
  ) async {
    var opened = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: EmptyDayCard(
            canOpen: false,
            blockedMessage:
                'This branch is paused. Renew on Subscription to continue.',
            onOpenDay: () {
              opened = true;
            },
          ),
        ),
      ),
    );

    expect(
      find.text('This branch is paused. Renew on Subscription to continue.'),
      findsOneWidget,
    );

    await tester.tap(find.widgetWithText(FilledButton, 'Open Day'));
    await tester.pump();

    expect(opened, isFalse);
  });
}
