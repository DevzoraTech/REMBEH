import 'package:flutter/material.dart';

import 'screens/agent_shell.dart';
import 'screens/login_screen.dart';
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
    final session = await store.read();
    if (!mounted) return;

    if (session != null && !session.isExpired) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => AgentShell(session: session)),
      );
      return;
    }

    await store.clear();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
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
