import 'package:flutter/material.dart';

import 'screens/agent_shell.dart';
import 'screens/login_screen.dart';
import 'services/api_client.dart';
import 'services/session_store.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const RembehApp());
}

class RembehApp extends StatelessWidget {
  const RembehApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'REMBEH',
      debugShowCheckedModeBanner: false,
      theme: buildRembehTheme(),
      home: const _BootScreen(),
    );
  }
}

class _BootScreen extends StatefulWidget {
  const _BootScreen();

  @override
  State<_BootScreen> createState() => _BootScreenState();
}

class _BootScreenState extends State<_BootScreen> {
  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final store = SessionStore();
    var session = await store.read();
    if (!mounted) return;

    if (session != null) {
      // Idle timeout survives process death via last-activity timestamp.
      if (await store.isIdleTimedOut()) {
        await store.clear();
        if (!mounted) return;
        _goLogin();
        return;
      }

      if (!session.isAccessExpired) {
        _goShell(session);
        return;
      }

      // Access expired — try refresh before forcing login (if not idle).
      if (session.canRefresh) {
        final refreshed = await ApiClient(store).refreshSession(session);
        if (!mounted) return;
        if (refreshed != null) {
          _goShell(refreshed);
          return;
        }
      }
    }

    await store.clear();
    if (!mounted) return;
    _goLogin();
  }

  void _goLogin() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  void _goShell(RembehSession session) {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => AgentShell(session: session)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: CircularProgressIndicator(color: forestEmerald),
      ),
    );
  }
}
