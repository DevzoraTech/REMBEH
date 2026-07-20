import 'package:flutter/material.dart';

import 'screens/agent_shell.dart';
import 'screens/force_update_screen.dart';
import 'screens/login_screen.dart';
import 'screens/profile/agent_selfie_capture_screen.dart';
import 'services/api_client.dart';
import 'services/session_cleanup.dart';
import 'services/session_store.dart';
import 'services/update_service.dart';
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
    // Non-blocking for Shorebird patches; blocking only for forced full APK.
    final update = await UpdateService.checkForUpdate();
    if (!mounted) return;
    if (update != null && update.requiresFullInstall) {
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ForceUpdateScreen(
            updateResult: update,
            onSkip: update.isBlocking ? null : () => Navigator.of(context).pop(),
          ),
        ),
      );
      if (!mounted) return;
      if (update.isBlocking) {
        // Stay on update screen until user updates — re-show if they popped.
        return _boot();
      }
    }

    final store = SessionStore();
    var session = await store.read();
    if (!mounted) return;

    if (session != null) {
      // Idle timeout survives process death via last-activity timestamp.
      if (await store.isIdleTimedOut()) {
        await clearTenantScopedClientState();
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

    await clearTenantScopedClientState();
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
    final next = session.isAgent && !session.hasProfilePhoto
        ? AgentSelfieCaptureScreen(session: session)
        : AgentShell(session: session);
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => next),
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
