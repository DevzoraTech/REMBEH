import 'package:flutter_test/flutter_test.dart';
import 'package:rembeh_mobile/screens/supervisor/supervisor_workspace_screen.dart';
import 'package:rembeh_mobile/screens/workspace_router.dart';
import 'package:rembeh_mobile/services/session_store.dart';

void main() {
  test('supervisor role takes precedence over other workspace roles', () {
    final session = RembehSession(
      accessToken: 'token',
      expiresAt: DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
      tokenType: 'Bearer',
      permissions: const ['branch.create', 'operation.read'],
      userName: 'Supervisor',
      userEmail: 'supervisor@example.com',
      roleName: 'Branch Manager',
      roleNames: const ['Branch Manager', 'Supervisor'],
      workspaceName: 'Branch',
    );

    expect(rembehWorkspaceFor(session), isA<SupervisorWorkspaceScreen>());
    expect(RembehSession.fromJson(session.toJson()).isSupervisor, isTrue);
  });
}
