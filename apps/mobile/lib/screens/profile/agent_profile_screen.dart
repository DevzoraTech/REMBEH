import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../core/auth/offline_auth_service.dart';
import '../../services/api_client.dart';
import '../../services/session_cleanup.dart';
import '../../services/session_store.dart';
import '../../theme.dart';
import '../../utils/friendly_errors.dart';
import '../login_screen.dart';

class AgentProfileScreen extends StatefulWidget {
  const AgentProfileScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<AgentProfileScreen> createState() => _AgentProfileScreenState();
}

class _AgentProfileScreenState extends State<AgentProfileScreen> {
  String _versionLabel = '';
  bool _fieldExpensesEnabled = true;
  bool _fieldExpensesLoading = false;
  bool _fieldExpensesSaving = false;
  String? _fieldExpensesError;

  bool get _canManageFieldExpenses =>
      widget.session.hasPermission('branch.staff.invite') &&
      !widget.session.isOrganisationOwner &&
      (widget.session.branchId?.isNotEmpty ?? false);

  @override
  void initState() {
    super.initState();
    _loadVersion();
    if (_canManageFieldExpenses) {
      _loadFieldExpenseSettings();
    }
  }

  Future<void> _loadVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (!mounted) return;
      setState(() => _versionLabel = info.version);
    } catch (_) {
      // Version is decorative; ignore lookup failures.
    }
  }

  Future<void> _loadFieldExpenseSettings() async {
    final branchId = widget.session.branchId;
    if (branchId == null || branchId.isEmpty) return;
    setState(() {
      _fieldExpensesLoading = true;
      _fieldExpensesError = null;
    });
    try {
      final payload = await ApiClient(SessionStore()).listBranches(widget.session);
      final branches = payload['branches'] as List<dynamic>? ?? const [];
      Map<String, dynamic>? match;
      for (final item in branches) {
        if (item is Map<String, dynamic> && item['id'] == branchId) {
          match = item;
          break;
        }
      }
      match ??= branches.isNotEmpty && branches.first is Map<String, dynamic>
          ? branches.first as Map<String, dynamic>
          : null;
      if (!mounted) return;
      setState(() {
        _fieldExpensesEnabled =
            match?['agentFieldExpensesEnabled'] as bool? ?? true;
        _fieldExpensesLoading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _fieldExpensesLoading = false;
        _fieldExpensesError = friendlyErrorMessage(error);
      });
    }
  }

  Future<void> _setFieldExpensesEnabled(bool enabled) async {
    final branchId = widget.session.branchId;
    if (branchId == null || branchId.isEmpty || _fieldExpensesSaving) return;
    final previous = _fieldExpensesEnabled;
    setState(() {
      _fieldExpensesEnabled = enabled;
      _fieldExpensesSaving = true;
      _fieldExpensesError = null;
    });
    try {
      await ApiClient(SessionStore()).updateBranchSettings(
        session: widget.session,
        branchId: branchId,
        agentFieldExpensesEnabled: enabled,
      );
      if (!mounted) return;
      setState(() => _fieldExpensesSaving = false);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _fieldExpensesEnabled = previous;
        _fieldExpensesSaving = false;
        _fieldExpensesError = friendlyErrorMessage(error);
      });
    }
  }

  Future<void> _confirmSignOut() async {
    final shouldSignOut = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Sign out?'),
          content: const Text(
            'You will need your email and password to sign back in.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFFB42318),
              ),
              child: const Text('Sign out'),
            ),
          ],
        );
      },
    );
    if (shouldSignOut != true || !mounted) return;
    await clearTenantScopedClientState();
    await SessionStore().clear();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Future<void> _openChangePassword() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
      builder: (context) => _ChangePasswordSheet(session: widget.session),
    );
    if (changed == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Password updated. Other devices have been signed out.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final initials = _initials(session.userName);
    final role = session.roleName?.trim().isNotEmpty == true
        ? session.roleName!
        : 'Field officer';

    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        title: const Text('Settings'),
        backgroundColor: midnightNavy,
        surfaceTintColor: Colors.transparent,
        shape: const Border(),
      ),
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          _HeroHeader(session: session, initials: initials, role: role),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SectionLabel('Account'),
                _SettingsGroup(
                  children: [
                    _InfoTile(
                      icon: Icons.person_outline_rounded,
                      label: 'Name',
                      value: session.userName,
                    ),
                    _InfoTile(
                      icon: Icons.mail_outline_rounded,
                      label: 'Email',
                      value: session.userEmail,
                    ),
                    if (session.publicId != null &&
                        session.publicId!.isNotEmpty)
                      _InfoTile(
                        icon: Icons.badge_outlined,
                        label: 'Staff ID',
                        value: session.publicId!,
                      ),
                    _InfoTile(
                      icon: Icons.work_outline_rounded,
                      label: 'Role',
                      value: role,
                    ),
                    _InfoTile(
                      icon: Icons.apartment_outlined,
                      label: 'Workspace',
                      value: session.workspaceName,
                    ),
                    _InfoTile(
                      icon: Icons.location_on_outlined,
                      label: 'Branch',
                      value: session.branchName ?? 'Unassigned',
                      showDivider: session.branchAddress != null,
                    ),
                    if (session.branchAddress != null)
                      _InfoTile(
                        icon: Icons.map_outlined,
                        label: 'Address',
                        value: session.branchAddress!,
                        showDivider: false,
                      ),
                  ],
                ),
                if (_canManageFieldExpenses) ...[
                  const SizedBox(height: 22),
                  _SectionLabel('Branch'),
                  _SettingsGroup(
                    children: [
                      _ToggleTile(
                        icon: Icons.payments_outlined,
                        title: 'Field officer expenses',
                        subtitle: _fieldExpensesLoading
                            ? 'Loading…'
                            : 'Allow officers to record expenses from remaining float',
                        value: _fieldExpensesEnabled,
                        enabled:
                            !_fieldExpensesLoading && !_fieldExpensesSaving,
                        onChanged: _setFieldExpensesEnabled,
                        showDivider: false,
                      ),
                    ],
                  ),
                  if (_fieldExpensesError != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
                      child: Text(
                        _fieldExpensesError!,
                        style: const TextStyle(
                          color: Color(0xFFB42318),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                ],
                const SizedBox(height: 22),
                _SectionLabel('Security'),
                _SettingsGroup(
                  children: [
                    _ActionTile(
                      icon: Icons.lock_reset_rounded,
                      title: 'Change password',
                      subtitle: 'Other signed-in devices will be signed out',
                      onTap: _openChangePassword,
                      showDivider: false,
                    ),
                  ],
                ),
                const SizedBox(height: 22),
                _SettingsGroup(
                  children: [
                    _ActionTile(
                      icon: Icons.logout_rounded,
                      title: 'Sign out',
                      subtitle: 'End this session on this device',
                      onTap: _confirmSignOut,
                      tone: const Color(0xFFB42318),
                      showDivider: false,
                    ),
                  ],
                ),
                const SizedBox(height: 28),
                Center(
                  child: Column(
                    children: [
                      Text(
                        'REMBEH',
                        style: TextStyle(
                          color: slateText.withValues(alpha: 0.45),
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _versionLabel.isEmpty
                            ? 'Your data is safe and secure'
                            : 'Version $_versionLabel',
                        style: TextStyle(
                          color: slateText.withValues(alpha: 0.38),
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _initials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'A';
    if (parts.length == 1) {
      return parts.first
          .substring(0, parts.first.length.clamp(0, 2))
          .toUpperCase();
    }
    return ('${parts.first[0]}${parts.last[0]}').toUpperCase();
  }
}

class _HeroHeader extends StatelessWidget {
  const _HeroHeader({
    required this.session,
    required this.initials,
    required this.role,
  });

  final RembehSession session;
  final String initials;
  final String role;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: midnightNavy,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: warmGold.withValues(alpha: 0.85),
                width: 1.6,
              ),
            ),
            child: ClipOval(
              child:
                  session.profilePhotoUrl != null &&
                      session.profilePhotoUrl!.isNotEmpty
                  ? Image.network(
                      session.profilePhotoUrl!,
                      width: 72,
                      height: 72,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) =>
                          _InitialsAvatar(initials: initials, size: 72),
                    )
                  : _InitialsAvatar(initials: initials, size: 72),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            session.userName,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 20,
              height: 1.15,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
            ),
            child: Text(
              role,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            [
              session.workspaceName,
              if (session.branchName != null && session.branchName!.isNotEmpty)
                session.branchName,
            ].join('  ·  '),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.7),
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          color: slateText.withValues(alpha: 0.55),
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.7,
        ),
      ),
    );
  }
}

class _SettingsGroup extends StatelessWidget {
  const _SettingsGroup({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        border: Border.all(color: line),
        boxShadow: [
          BoxShadow(
            color: midnightNavy.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(children: children),
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.icon,
    required this.label,
    required this.value,
    this.showDivider = true,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: forestEmerald.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 18, color: forestEmerald),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        color: slateText.withValues(alpha: 0.62),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      value,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        height: 1.25,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (showDivider)
          const Padding(
            padding: EdgeInsets.only(left: 62),
            child: Divider(height: 1, color: line),
          ),
      ],
    );
  }
}

class _ToggleTile extends StatelessWidget {
  const _ToggleTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
    this.enabled = true,
    this.showDivider = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final bool enabled;
  final ValueChanged<bool> onChanged;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 8, 6, 8),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: forestEmerald.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 18, color: forestEmerald),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: slateText.withValues(alpha: 0.62),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              Switch.adaptive(
                value: value,
                onChanged: enabled ? onChanged : null,
              ),
            ],
          ),
        ),
        if (showDivider)
          const Padding(
            padding: EdgeInsets.only(left: 62),
            child: Divider(height: 1, color: line),
          ),
      ],
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.tone,
    this.showDivider = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Color? tone;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final color = tone ?? forestEmerald;
    return Column(
      children: [
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: rembehBorderRadius(rembehRadiusLg),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(icon, size: 18, color: color),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: TextStyle(
                            color: tone ?? midnightNavy,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          style: TextStyle(
                            color: slateText.withValues(alpha: 0.62),
                            fontSize: 12,
                            height: 1.25,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    color: slateText.withValues(alpha: 0.4),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (showDivider)
          const Padding(
            padding: EdgeInsets.only(left: 62),
            child: Divider(height: 1, color: line),
          ),
      ],
    );
  }
}

class _ChangePasswordSheet extends StatefulWidget {
  const _ChangePasswordSheet({required this.session});

  final RembehSession session;

  @override
  State<_ChangePasswordSheet> createState() => _ChangePasswordSheetState();
}

class _ChangePasswordSheetState extends State<_ChangePasswordSheet> {
  final _currentPassword = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirmPassword = TextEditingController();
  final _api = ApiClient(SessionStore());
  final _offlineAuth = OfflineAuthService();

  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureConfirm = true;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _currentPassword.dispose();
    _newPassword.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final current = _currentPassword.text;
    final next = _newPassword.text;
    final confirm = _confirmPassword.text;

    setState(() => _error = null);

    if (current.isEmpty) {
      setState(() => _error = 'Enter your current password.');
      return;
    }
    if (next.length < 8) {
      setState(() => _error = 'New password must be at least 8 characters.');
      return;
    }
    if (next != confirm) {
      setState(() => _error = 'New password and confirmation do not match.');
      return;
    }
    if (next == current) {
      setState(
        () => _error =
            'New password must be different from your current password.',
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await _api.changePassword(
        session: widget.session,
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      );
      await _offlineAuth.cacheCredentials(
        email: widget.session.userEmail,
        passwordHash: _offlineAuth.hashPassword(next),
        session: widget.session,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = friendlyErrorMessage(
          error,
          fallback: 'Could not change password. Please try again.',
        );
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(16, 10, 16, 16 + bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: line,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Change password',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Use at least 8 characters. Other devices will be signed out.',
              style: TextStyle(
                color: slateText.withValues(alpha: 0.7),
                fontSize: 13,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 16),
            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEBEE),
                  borderRadius: rembehBorderRadius(rembehRadiusSm),
                  border: Border.all(color: const Color(0xFFFFCDD2)),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    color: Color(0xFFB71C1C),
                    fontSize: 12.5,
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
            _PasswordField(
              controller: _currentPassword,
              label: 'Current password',
              obscure: _obscureCurrent,
              onToggle: () =>
                  setState(() => _obscureCurrent = !_obscureCurrent),
              autofillHints: const [AutofillHints.password],
            ),
            const SizedBox(height: 10),
            _PasswordField(
              controller: _newPassword,
              label: 'New password',
              obscure: _obscureNew,
              onToggle: () => setState(() => _obscureNew = !_obscureNew),
              autofillHints: const [AutofillHints.newPassword],
            ),
            const SizedBox(height: 10),
            _PasswordField(
              controller: _confirmPassword,
              label: 'Confirm new password',
              obscure: _obscureConfirm,
              onToggle: () =>
                  setState(() => _obscureConfirm = !_obscureConfirm),
              autofillHints: const [AutofillHints.newPassword],
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: _saving ? null : _submit,
                child: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Update password'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PasswordField extends StatelessWidget {
  const _PasswordField({
    required this.controller,
    required this.label,
    required this.obscure,
    required this.onToggle,
    this.autofillHints,
  });

  final TextEditingController controller;
  final String label;
  final bool obscure;
  final VoidCallback onToggle;
  final Iterable<String>? autofillHints;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      autofillHints: autofillHints,
      style: const TextStyle(
        color: slateText,
        fontSize: 14,
        fontWeight: FontWeight.w500,
      ),
      decoration: InputDecoration(
        isDense: true,
        labelText: label,
        filled: true,
        fillColor: const Color(0xFFF7FAF8),
        suffixIcon: IconButton(
          onPressed: onToggle,
          tooltip: obscure ? 'Show password' : 'Hide password',
          icon: Icon(
            obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
            color: forestEmerald,
            size: 18,
          ),
        ),
      ),
    );
  }
}

class _InitialsAvatar extends StatelessWidget {
  const _InitialsAvatar({required this.initials, this.size = 60});

  final String initials;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: const BoxDecoration(color: sage, shape: BoxShape.circle),
      child: Text(
        initials,
        style: TextStyle(
          color: forestEmerald,
          fontWeight: FontWeight.w800,
          fontSize: size * 0.32,
        ),
      ),
    );
  }
}
