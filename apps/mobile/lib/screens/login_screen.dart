import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/session_store.dart';
import '../theme.dart';
import 'agent_shell.dart';
import 'profile/agent_selfie_capture_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.idleSignedOutMessage});

  final String? idleSignedOutMessage;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _store = SessionStore();
  late final _api = ApiClient(_store);
  late final AnimationController _motion;
  late final Animation<double> _fade;
  late final Animation<Offset> _slide;

  bool _loading = false;
  bool _obscurePassword = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _motion = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    );
    _fade = CurvedAnimation(parent: _motion, curve: Curves.easeOutCubic);
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.04),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _motion, curve: Curves.easeOutCubic));
    _motion.forward();

    final message = widget.idleSignedOutMessage;
    if (message != null && message.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message)),
        );
      });
    }
  }

  @override
  void dispose() {
    _motion.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await _api.login(email: _email.text, password: _password.text);
      final session = await _store.read();
      if (!mounted || session == null) return;
      final next = session.isAgent && !session.hasProfilePhoto
          ? AgentSelfieCaptureScreen(session: session)
          : AgentShell(session: session);
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => next),
      );
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Scaffold(
      backgroundColor: midnightNavy,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const _LoginAtmosphere(),
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  flex: bottomInset > 0 ? 3 : 5,
                  child: FadeTransition(
                    opacity: _fade,
                    child: const _LoginBrandHero(),
                  ),
                ),
                Expanded(
                  flex: bottomInset > 0 ? 7 : 6,
                  child: SlideTransition(
                    position: _slide,
                    child: FadeTransition(
                      opacity: _fade,
                      child: _LoginFormPanel(
                        email: _email,
                        password: _password,
                        obscurePassword: _obscurePassword,
                        loading: _loading,
                        error: _error,
                        onToggleObscure: () {
                          setState(
                            () => _obscurePassword = !_obscurePassword,
                          );
                        },
                        onSubmit: _loading ? null : _submit,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LoginAtmosphere extends StatelessWidget {
  const _LoginAtmosphere();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF0A1F14),
            midnightNavy,
            Color(0xFF0D2A18),
          ],
          stops: [0.0, 0.55, 1.0],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: -80,
            right: -60,
            child: _GlowOrb(
              size: 220,
              color: forestEmerald.withValues(alpha: 0.28),
            ),
          ),
          Positioned(
            bottom: 180,
            left: -70,
            child: _GlowOrb(
              size: 180,
              color: warmGold.withValues(alpha: 0.12),
            ),
          ),
          Positioned(
            top: 120,
            left: 24,
            child: Opacity(
              opacity: 0.06,
              child: Image.asset(
                'assets/rembeh-mark.png',
                width: 220,
                height: 220,
                fit: BoxFit.contain,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GlowOrb extends StatelessWidget {
  const _GlowOrb({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [color, color.withValues(alpha: 0)],
          ),
        ),
      ),
    );
  }
}

class _LoginBrandHero extends StatelessWidget {
  const _LoginBrandHero();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 28, 28, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: rembehBorderRadius(rembehRadiusLg),
            child: Image.asset(
              'assets/rembeh-app-icon.png',
              width: 72,
              height: 72,
              fit: BoxFit.cover,
            ),
          ),
          const Spacer(),
          const Text(
            'REMBEH',
            style: TextStyle(
              color: Colors.white,
              fontSize: 36,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
              height: 1.05,
            ),
          ),
          const SizedBox(height: 6),
          Container(
            width: 44,
            height: 3,
            decoration: BoxDecoration(
              color: warmGold,
              borderRadius: rembehBorderRadius(2),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Field agent',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.78),
              fontSize: 15,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.2,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Peace in every decision.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.52),
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _LoginFormPanel extends StatelessWidget {
  const _LoginFormPanel({
    required this.email,
    required this.password,
    required this.obscurePassword,
    required this.loading,
    required this.error,
    required this.onToggleObscure,
    required this.onSubmit,
  });

  final TextEditingController email;
  final TextEditingController password;
  final bool obscurePassword;
  final bool loading;
  final String? error;
  final VoidCallback onToggleObscure;
  final VoidCallback? onSubmit;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: softIvory,
        borderRadius: rembehSheetRadius(radius: 28),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Sign in',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Use your agent email and password.',
                style: TextStyle(
                  color: slateText,
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 22),
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.username, AutofillHints.email],
                decoration: const InputDecoration(
                  labelText: 'Email',
                  prefixIcon: Icon(Icons.mail_outline, color: forestEmerald),
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: password,
                obscureText: obscurePassword,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => onSubmit?.call(),
                autofillHints: const [AutofillHints.password],
                decoration: InputDecoration(
                  labelText: 'Password',
                  prefixIcon: const Icon(Icons.lock_outline, color: forestEmerald),
                  suffixIcon: IconButton(
                    onPressed: onToggleObscure,
                    icon: Icon(
                      obscurePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                      color: slateText,
                    ),
                  ),
                ),
              ),
              if (error != null) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFEBEE),
                    borderRadius: rembehBorderRadius(rembehRadiusMd),
                    border: Border.all(color: const Color(0xFFFFCDD2)),
                  ),
                  child: Text(
                    error!,
                    style: const TextStyle(
                      color: Color(0xFFB71C1C),
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: onSubmit,
                child: loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Sign in'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
