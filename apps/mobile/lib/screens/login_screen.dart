import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api_client.dart';
import '../services/session_store.dart';
import '../theme.dart';
import 'agent_shell.dart';
import 'profile/agent_selfie_capture_screen.dart';

const _rememberEmailKey = 'rembeh.login.remember_email';
const _rememberMeKey = 'rembeh.login.remember_me';

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
  bool _rememberMe = true;
  String? _error;
  String _versionLabel = '1.0.0';

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
    _loadRememberedCredentials();
    _loadVersion();

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

  Future<void> _loadVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (!mounted) return;
      setState(() => _versionLabel = info.version);
    } catch (_) {
      // Keep default Version 1.0.0
    }
  }

  Future<void> _loadRememberedCredentials() async {
    final prefs = await SharedPreferences.getInstance();
    final remember = prefs.getBool(_rememberMeKey) ?? true;
    final email = prefs.getString(_rememberEmailKey) ?? '';
    if (!mounted) return;
    setState(() {
      _rememberMe = remember;
      if (remember && email.isNotEmpty) {
        _email.text = email;
      }
    });
  }

  Future<void> _persistRememberMe() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_rememberMeKey, _rememberMe);
    if (_rememberMe) {
      await prefs.setString(_rememberEmailKey, _email.text.trim());
    } else {
      await prefs.remove(_rememberEmailKey);
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
      await _persistRememberMe();
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

  void _onForgotPassword() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Password reset is managed by your branch admin. Contact your supervisor.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F5),
      body: Stack(
        fit: StackFit.expand,
        children: [
          const _LoginAtmosphere(),
          SafeArea(
            child: FadeTransition(
              opacity: _fade,
              child: SlideTransition(
                position: _slide,
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    return SingleChildScrollView(
                      padding: EdgeInsets.fromLTRB(
                        24,
                        20,
                        24,
                        bottomInset > 0 ? 16 : 20,
                      ),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minHeight: constraints.maxHeight - 40,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const _LoginBrandHeader(),
                            SizedBox(height: bottomInset > 0 ? 20 : 36),
                            _LoginCard(
                              email: _email,
                              password: _password,
                              obscurePassword: _obscurePassword,
                              rememberMe: _rememberMe,
                              loading: _loading,
                              error: _error,
                              onToggleObscure: () {
                                setState(
                                  () => _obscurePassword = !_obscurePassword,
                                );
                              },
                              onRememberChanged: (value) {
                                setState(() => _rememberMe = value);
                              },
                              onForgotPassword: _onForgotPassword,
                              onSubmit: _loading ? null : _submit,
                            ),
                            SizedBox(height: bottomInset > 0 ? 20 : 32),
                            _LoginFooter(versionLabel: _versionLabel),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
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
    return Stack(
      children: [
        const ColoredBox(color: Color(0xFFF4F6F5)),
        Positioned(
          top: 36,
          right: -28,
          child: Opacity(
            opacity: 0.07,
            child: Image.asset(
              'assets/rembeh-mark.png',
              width: 280,
              height: 280,
              fit: BoxFit.contain,
            ),
          ),
        ),
      ],
    );
  }
}

class _LoginBrandHeader extends StatelessWidget {
  const _LoginBrandHeader();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            ClipRRect(
              borderRadius: rembehBorderRadius(14),
              child: Image.asset(
                'assets/rembeh-app-icon.png',
                width: 52,
                height: 52,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 12),
            const Text(
              'REMBEH',
              style: TextStyle(
                color: forestEmerald,
                fontSize: 28,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
                height: 1,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Container(
          width: 48,
          height: 2.5,
          decoration: BoxDecoration(
            color: warmGold,
            borderRadius: rembehBorderRadius(2),
          ),
        ),
        const SizedBox(height: 14),
        const Text(
          'Field agent',
          style: TextStyle(
            color: forestEmerald,
            fontSize: 16,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Peace in every decision.',
          style: TextStyle(
            color: slateText.withValues(alpha: 0.55),
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _LoginCard extends StatelessWidget {
  const _LoginCard({
    required this.email,
    required this.password,
    required this.obscurePassword,
    required this.rememberMe,
    required this.loading,
    required this.error,
    required this.onToggleObscure,
    required this.onRememberChanged,
    required this.onForgotPassword,
    required this.onSubmit,
  });

  final TextEditingController email;
  final TextEditingController password;
  final bool obscurePassword;
  final bool rememberMe;
  final bool loading;
  final String? error;
  final VoidCallback onToggleObscure;
  final ValueChanged<bool> onRememberChanged;
  final VoidCallback onForgotPassword;
  final VoidCallback? onSubmit;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(22, 26, 22, 24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: rembehBorderRadius(20),
        boxShadow: [
          BoxShadow(
            color: midnightNavy.withValues(alpha: 0.07),
            blurRadius: 28,
            offset: const Offset(0, 12),
          ),
          BoxShadow(
            color: midnightNavy.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Welcome back 👋',
            style: TextStyle(
              color: Color(0xFF1A1F27),
              fontSize: 22,
              fontWeight: FontWeight.w800,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Sign in to continue to your account.',
            style: TextStyle(
              color: slateText.withValues(alpha: 0.62),
              fontSize: 13.5,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 24),
          _IconField(
            controller: email,
            label: 'Email',
            hint: 'Enter your email',
            icon: Icons.mail_outline_rounded,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.username, AutofillHints.email],
          ),
          const SizedBox(height: 14),
          _IconField(
            controller: password,
            label: 'Password',
            hint: 'Enter your password',
            icon: Icons.lock_outline_rounded,
            obscureText: obscurePassword,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.password],
            onSubmitted: (_) => onSubmit?.call(),
            suffix: IconButton(
              onPressed: onToggleObscure,
              tooltip: obscurePassword ? 'Show password' : 'Hide password',
              icon: Icon(
                obscurePassword
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
                color: forestEmerald,
                size: 22,
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
          const SizedBox(height: 16),
          Row(
            children: [
              SizedBox(
                height: 24,
                width: 24,
                child: Checkbox(
                  value: rememberMe,
                  onChanged: (value) => onRememberChanged(value ?? false),
                  activeColor: forestEmerald,
                  checkColor: Colors.white,
                  side: BorderSide(
                    color: forestEmerald.withValues(alpha: 0.55),
                    width: 1.6,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: rembehBorderRadius(4),
                  ),
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () => onRememberChanged(!rememberMe),
                child: Text(
                  'Remember me',
                  style: TextStyle(
                    color: slateText.withValues(alpha: 0.72),
                    fontSize: 13.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const Spacer(),
              TextButton(
                onPressed: onForgotPassword,
                style: TextButton.styleFrom(
                  foregroundColor: forestEmerald,
                  padding: EdgeInsets.zero,
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text(
                  'Forgot password?',
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          SizedBox(
            height: 52,
            child: ElevatedButton(
              onPressed: onSubmit,
              style: ElevatedButton.styleFrom(
                backgroundColor: forestEmerald,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: rembehBorderRadius(14),
                ),
              ),
              child: loading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        color: Colors.white,
                      ),
                    )
                  : const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          'Sign in',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.2,
                          ),
                        ),
                        SizedBox(width: 8),
                        Icon(Icons.arrow_forward_rounded, size: 20),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _IconField extends StatelessWidget {
  const _IconField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.onSubmitted,
    this.suffix,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onSubmitted;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      obscureText: obscureText,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      autofillHints: autofillHints,
      onSubmitted: onSubmitted,
      style: const TextStyle(
        color: slateText,
        fontSize: 15,
        fontWeight: FontWeight.w500,
      ),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        floatingLabelBehavior: FloatingLabelBehavior.auto,
        labelStyle: TextStyle(
          color: slateText.withValues(alpha: 0.55),
          fontWeight: FontWeight.w500,
        ),
        hintStyle: TextStyle(
          color: slateText.withValues(alpha: 0.35),
          fontWeight: FontWeight.w400,
        ),
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.fromLTRB(0, 16, 12, 16),
        prefixIcon: Padding(
          padding: const EdgeInsets.only(left: 10, right: 10),
          child: Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: forestEmerald,
              borderRadius: rembehBorderRadius(10),
            ),
            child: Icon(icon, color: Colors.white, size: 20),
          ),
        ),
        prefixIconConstraints: const BoxConstraints(
          minWidth: 60,
          minHeight: 48,
        ),
        suffixIcon: suffix,
        border: OutlineInputBorder(
          borderRadius: rembehBorderRadius(14),
          borderSide: const BorderSide(color: Color(0xFFE2E8E4)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: rembehBorderRadius(14),
          borderSide: const BorderSide(color: Color(0xFFE2E8E4)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: rembehBorderRadius(14),
          borderSide: const BorderSide(color: forestEmerald, width: 1.5),
        ),
      ),
    );
  }
}

class _LoginFooter extends StatelessWidget {
  const _LoginFooter({required this.versionLabel});

  final String versionLabel;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.verified_user_outlined,
              size: 16,
              color: forestEmerald.withValues(alpha: 0.85),
            ),
            const SizedBox(width: 6),
            Text(
              'Your data is safe and secure',
              style: TextStyle(
                color: slateText.withValues(alpha: 0.55),
                fontSize: 12.5,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          'Version $versionLabel',
          style: TextStyle(
            color: slateText.withValues(alpha: 0.38),
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
