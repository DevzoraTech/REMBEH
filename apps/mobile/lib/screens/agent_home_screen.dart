import 'package:flutter/material.dart';

import '../services/session_store.dart';
import 'agent_shell.dart';

/// Legacy entry name — routes into the agent shell (Home / Records / Search).
class AgentHomeScreen extends StatelessWidget {
  const AgentHomeScreen({super.key, required this.session});

  final RembehSession session;

  @override
  Widget build(BuildContext context) {
    return AgentShell(session: session);
  }
}
