import 'package:flutter/material.dart';

import '../services/session_store.dart';
import 'workspace_router.dart';

/// Legacy entry name — routes into the correct workspace.
class AgentHomeScreen extends StatelessWidget {
  const AgentHomeScreen({super.key, required this.session});

  final RembehSession session;

  @override
  Widget build(BuildContext context) {
    return rembehWorkspaceFor(session);
  }
}
