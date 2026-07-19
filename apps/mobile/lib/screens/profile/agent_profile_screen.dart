import 'package:flutter/material.dart';

import '../../services/session_store.dart';
import '../../theme.dart';
import '../login_screen.dart';

class AgentProfileScreen extends StatelessWidget {
  const AgentProfileScreen({super.key, required this.session});

  final RembehSession session;

  Future<void> _logout(BuildContext context) async {
    await SessionStore().clear();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final initials = _initials(session.userName);

    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        title: const Text('Profile'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: line),
            ),
            child: Row(
              children: [
                ClipOval(
                  child: session.profilePhotoUrl != null &&
                          session.profilePhotoUrl!.isNotEmpty
                      ? Image.network(
                          session.profilePhotoUrl!,
                          width: 56,
                          height: 56,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => _InitialsAvatar(
                            initials: initials,
                          ),
                        )
                      : _InitialsAvatar(initials: initials),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        session.userName,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontWeight: FontWeight.w800,
                          fontSize: 17,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        session.roleName ?? 'Agent',
                        style: const TextStyle(
                          color: slateText,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _Section(
            title: 'Account',
            children: [
              _InfoRow(label: 'Email', value: session.userEmail),
              if (session.publicId != null && session.publicId!.isNotEmpty)
                _InfoRow(label: 'Agent ID', value: session.publicId!),
              _InfoRow(label: 'Workspace', value: session.workspaceName),
              _InfoRow(
                label: 'Branch',
                value: session.branchName ?? 'Unassigned',
              ),
              if (session.branchAddress != null)
                _InfoRow(label: 'Address', value: session.branchAddress!),
            ],
          ),
          const SizedBox(height: 12),
          _Section(
            title: 'Settings',
            children: const [
              _SettingRow(
                icon: Icons.notifications_outlined,
                label: 'Notifications',
                value: 'Enabled',
              ),
              _SettingRow(
                icon: Icons.cloud_sync_outlined,
                label: 'Auto sync',
                value: 'When online',
              ),
              _SettingRow(
                icon: Icons.lock_outline,
                label: 'Security',
                value: 'PIN / biometrics',
              ),
            ],
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () => _logout(context),
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
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
      return parts.first.substring(0, parts.first.length.clamp(0, 2)).toUpperCase();
    }
    return ('${parts.first[0]}${parts.last[0]}').toUpperCase();
  }
}

class _InitialsAvatar extends StatelessWidget {
  const _InitialsAvatar({required this.initials});

  final String initials;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56,
      height: 56,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: sage,
        shape: BoxShape.circle,
        border: Border.all(color: line),
      ),
      child: Text(
        initials,
        style: const TextStyle(
          color: forestEmerald,
          fontWeight: FontWeight.w800,
          fontSize: 18,
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            child: Text(
              title,
              style: const TextStyle(
                color: midnightNavy,
                fontWeight: FontWeight.w800,
                fontSize: 13,
              ),
            ),
          ),
          const Divider(height: 1, color: line),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          SizedBox(
            width: 88,
            child: Text(
              label,
              style: const TextStyle(color: slateText, fontSize: 12),
            ),
          ),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: midnightNavy,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingRow extends StatelessWidget {
  const _SettingRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: forestEmerald),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: midnightNavy,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
          Text(
            value,
            style: const TextStyle(color: slateText, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
