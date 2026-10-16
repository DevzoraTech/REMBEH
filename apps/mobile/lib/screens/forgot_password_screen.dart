import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/session_store.dart';
import '../theme.dart';
import '../utils/friendly_errors.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail = ''});

  final String initialEmail;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  final _api = ApiClient(SessionStore());

  String? _challengeId;
  bool _sending = false;
  bool _saving = false;
  bool _hidePassword = true;
  String? _error;

  bool get _hasCode => _challengeId != null;

  @override
  void initState() {
    super.initState();
    _email.text = widget.initialEmail.trim();
  }

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _sendCode({bool resend = false}) async {
    final email = _email.text.trim();
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) {
      setState(() => _error = 'Enter the email address used for your account.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final response = await _api.requestPasswordReset(email: email);
      final challenge = response['challenge'] as Map<String, dynamic>?;
      if (!mounted) return;
      if (challenge == null || challenge['id'] is! String) {
        setState(() {
          _error =
              'If an account uses this email, a reset code has been sent. Check the address and try again if you do not receive it.';
        });
        return;
      }
      setState(() => _challengeId = challenge['id'] as String);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            resend
                ? 'A new verification code was sent.'
                : 'Verification code sent to $email.',
          ),
        ),
      );
    } catch (error) {
      if (mounted) setState(() => _error = friendlyErrorMessage(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _resetPassword() async {
    if (_code.text.trim().length != 6) {
      setState(() => _error = 'Enter the six-digit verification code.');
      return;
    }
    if (_password.text.length < 8) {
      setState(() => _error = 'Password must contain at least 8 characters.');
      return;
    }
    if (_password.text != _confirmation.text) {
      setState(() => _error = 'Passwords do not match.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await _api.confirmPasswordReset(
        challengeId: _challengeId!,
        code: _code.text,
        newPassword: _password.text,
        confirmPassword: _confirmation.text,
      );
      if (!mounted) return;
      Navigator.of(context).pop(_email.text.trim());
    } catch (error) {
      if (mounted) setState(() => _error = friendlyErrorMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isBusy = _sending || _saving;
    return Scaffold(
      backgroundColor: const Color(0xFFF4F6F5),
      appBar: AppBar(
        title: const Text('Reset password'),
        backgroundColor: midnightNavy,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: rembehBorderRadius(rembehRadiusLg),
                      border: Border.all(color: line),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Icon(
                          Icons.lock_reset_rounded,
                          size: 40,
                          color: forestEmerald,
                        ),
                        const SizedBox(height: 14),
                        Text(
                          _hasCode
                              ? 'Enter your reset code'
                              : 'Forgot your password?',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: midnightNavy,
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _hasCode
                              ? 'Enter the six-digit code sent to your email, then choose a new password.'
                              : 'We will email a six-digit verification code to the address used for your REMBEH account.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: slateText.withValues(alpha: 0.72),
                          ),
                        ),
                        const SizedBox(height: 22),
                        TextField(
                          controller: _email,
                          enabled: !_hasCode && !isBusy,
                          keyboardType: TextInputType.emailAddress,
                          autocorrect: false,
                          textInputAction: TextInputAction.next,
                          onChanged: (_) {
                            if (_error != null) {
                              setState(() => _error = null);
                            }
                          },
                          decoration: const InputDecoration(
                            labelText: 'Account email',
                            prefixIcon: Icon(Icons.email_outlined),
                          ),
                        ),
                        if (_hasCode) ...[
                          const SizedBox(height: 14),
                          TextField(
                            controller: _code,
                            enabled: !isBusy,
                            keyboardType: TextInputType.number,
                            maxLength: 6,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: 'Verification code',
                              prefixIcon: Icon(Icons.verified_user_outlined),
                              counterText: '',
                            ),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _password,
                            enabled: !isBusy,
                            obscureText: _hidePassword,
                            textInputAction: TextInputAction.next,
                            decoration: InputDecoration(
                              labelText: 'New password',
                              prefixIcon: const Icon(Icons.lock_outline),
                              suffixIcon: IconButton(
                                tooltip: _hidePassword
                                    ? 'Show password'
                                    : 'Hide password',
                                onPressed: () => setState(
                                  () => _hidePassword = !_hidePassword,
                                ),
                                icon: Icon(
                                  _hidePassword
                                      ? Icons.visibility_outlined
                                      : Icons.visibility_off_outlined,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _confirmation,
                            enabled: !isBusy,
                            obscureText: _hidePassword,
                            textInputAction: TextInputAction.done,
                            onSubmitted: (_) => _resetPassword(),
                            decoration: const InputDecoration(
                              labelText: 'Confirm new password',
                              prefixIcon: Icon(Icons.lock_outline),
                            ),
                          ),
                        ],
                        if (_error != null) ...[
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFEBEE),
                              borderRadius: rembehBorderRadius(rembehRadiusSm),
                            ),
                            child: Text(
                              _error!,
                              style: const TextStyle(color: Color(0xFFB3261E)),
                            ),
                          ),
                        ],
                        const SizedBox(height: 20),
                        FilledButton(
                          onPressed: isBusy
                              ? null
                              : _hasCode
                              ? _resetPassword
                              : _sendCode,
                          child: isBusy
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : Text(
                                  _hasCode
                                      ? 'Reset password'
                                      : 'Send verification code',
                                ),
                        ),
                        if (_hasCode) ...[
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: isBusy
                                ? null
                                : () => _sendCode(resend: true),
                            child: const Text('Resend verification code'),
                          ),
                          TextButton(
                            onPressed: isBusy
                                ? null
                                : () => setState(() {
                                    _challengeId = null;
                                    _code.clear();
                                    _password.clear();
                                    _confirmation.clear();
                                    _error = null;
                                  }),
                            child: const Text('Use a different email'),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
