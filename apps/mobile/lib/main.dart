import 'package:flutter/material.dart';

import 'screens/account_locked_screen.dart';
import 'screens/agent_shell.dart';
import 'screens/force_update_screen.dart';
import 'screens/login_screen.dart';
import 'screens/profile/agent_selfie_capture_screen.dart';
import 'services/api_client.dart';
import 'services/push_notification_service.dart';
import 'services/session_cleanup.dart';
import 'services/session_store.dart';
import 'services/update_service.dart';
import 'theme.dart';
import 'utils/account_access.dart';
import 'utils/friendly_errors.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final store = SessionStore();
  final push = await bootstrapPush(store);

  runApp(RembehApp(sessionStore: store, pushService: push));
}

class RembehApp extends StatelessWidget {
  const RembehApp({
    super.key,
    required this.sessionStore,
    this.pushService,
  });

  final SessionStore sessionStore;
  final PushNotificationService? pushService;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'REMBEH',
      debugShowCheckedModeBanner: false,
      theme: buildRembehTheme(),
      home: _BootScreen(
        sessionStore: sessionStore,
        pushService: pushService,
      ),
    );
  }
}

class _BootScreen extends StatefulWidget {
  const _BootScreen({
    required this.sessionStore,
    this.pushService,
  });

  final SessionStore sessionStore;
  final PushNotificationService? pushService;

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

    final store = widget.sessionStore;
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
        await widget.pushService?.requestPermissionAndSync();
        if (!mounted) return;
        _goShell(session);
        return;
      }

      // Access expired — try refresh before forcing login (if not idle).
      if (session.canRefresh) {
        try {
          final refreshed = await ApiClient(store).refreshSession(session);
          if (!mounted) return;
          if (refreshed != null) {
            await widget.pushService?.requestPermissionAndSync();
            if (!mounted) return;
            _goShell(refreshed);
            return;
          }
        } catch (error) {
          final message = friendlyErrorMessage(error);
          if (isAccountAccessBlockedMessage(message)) {
            await clearTenantScopedClientState();
            await store.clear();
            if (!mounted) return;
            _goAccountLocked(message);
            return;
          }
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
      MaterialPageRoute(
        builder: (_) => LoginScreen(pushService: widget.pushService),
      ),
    );
  }

  void _goAccountLocked(String message) {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => AccountLockedScreen(message: message),
      ),
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
