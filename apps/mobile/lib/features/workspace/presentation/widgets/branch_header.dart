import 'package:flutter/material.dart';

import '../../../marketing/domain/models/mobile_marketing_campaign.dart';
import '../../../marketing/presentation/widgets/mobile_marketing_banner.dart';
import '../../../sms/data/sms_credits_store.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import 'sign_out_confirm_dialog.dart';

class BranchHeader extends StatefulWidget {
  const BranchHeader({
    super.key,
    required this.session,
    required this.workspaceName,
    required this.branchName,
    required this.roleName,
    required this.loading,
    required this.onRefresh,
    required this.onSignOut,
    this.onOpenProfile,
    this.onOpenSettings,
    this.onSmsTap,
    this.showSmsCredits = true,
    this.marketingCampaign,
    this.onMarketingTap,
    this.onMarketingDismiss,
    this.onMarketingCta,
  });

  final RembehSession session;
  final String workspaceName;
  final String branchName;
  final String roleName;
  final bool loading;
  final VoidCallback onRefresh;
  final Future<void> Function() onSignOut;
  final VoidCallback? onOpenProfile;
  final VoidCallback? onOpenSettings;
  /// Opens SMS subscription management. Falls back to a silent credit refresh.
  final VoidCallback? onSmsTap;
  final bool showSmsCredits;
  final MobileMarketingCampaign? marketingCampaign;
  final VoidCallback? onMarketingTap;
  final VoidCallback? onMarketingDismiss;
  final VoidCallback? onMarketingCta;

  @override
  State<BranchHeader> createState() => _BranchHeaderState();
}

class _BranchHeaderState extends State<BranchHeader>
    with WidgetsBindingObserver {
  final _smsStore = SmsCreditsStore.instance;
  final _profileMenuKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _smsStore.addListener(_onSmsChanged);
    if (widget.showSmsCredits) {
      // ignore: discarded_futures
      _smsStore.start(widget.session);
    }
  }

  @override
  void didUpdateWidget(covariant BranchHeader oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.showSmsCredits &&
        (oldWidget.session.accessToken != widget.session.accessToken ||
            oldWidget.session.branchId != widget.session.branchId)) {
      // ignore: discarded_futures
      _smsStore.start(widget.session);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _smsStore.removeListener(_onSmsChanged);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && widget.showSmsCredits) {
      // ignore: discarded_futures
      _smsStore.refresh(silent: true);
    }
  }

  void _onSmsChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _confirmSignOut() async {
    final confirmed = await showSignOutConfirmDialog(context);
    if (!confirmed || !mounted) return;
    await widget.onSignOut();
  }

  Future<void> _openProfileMenu() async {
    final box =
        _profileMenuKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;

    final origin = box.localToGlobal(Offset.zero);
    final size = box.size;
    final selected = await showMenu<_ProfileMenuAction>(
      context: context,
      position: RelativeRect.fromLTRB(
        origin.dx,
        origin.dy + size.height + 6,
        origin.dx + size.width,
        origin.dy,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      items: [
        const PopupMenuItem(
          value: _ProfileMenuAction.profile,
          child: _ProfileMenuRow(
            icon: Icons.person_outline_rounded,
            label: 'Profile',
          ),
        ),
        const PopupMenuItem(
          value: _ProfileMenuAction.settings,
          child: _ProfileMenuRow(
            icon: Icons.settings_outlined,
            label: 'Settings',
          ),
        ),
        const PopupMenuItem(
          value: _ProfileMenuAction.signOut,
          child: _ProfileMenuRow(
            icon: Icons.logout_rounded,
            label: 'Sign out',
            danger: true,
          ),
        ),
      ],
    );

    if (!mounted || selected == null) return;

    switch (selected) {
      case _ProfileMenuAction.profile:
        widget.onOpenProfile?.call();
      case _ProfileMenuAction.settings:
        (widget.onOpenSettings ?? widget.onOpenProfile)?.call();
      case _ProfileMenuAction.signOut:
        await _confirmSignOut();
    }
  }

  @override
  Widget build(BuildContext context) {
    final campaign = widget.marketingCampaign;
    final credits = _smsStore.credits;
    final showSms = widget.showSmsCredits && credits != null;
    final tone = showSms ? smsCreditTone(credits) : SmsCreditTone.green;
    final stripColor = switch (tone) {
      // Keep the strip lighter than a healthy green pill so green status
      // still reads clearly against the full-bleed banner.
      SmsCreditTone.green => const Color(0xFFF3FBF5),
      SmsCreditTone.orange => const Color(0xFFFFF8F1),
      SmsCreditTone.red => const Color(0xFFFFF5F5),
    };

    return Material(
      color: Colors.white,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: sage,
                    borderRadius: rembehBorderRadius(rembehRadiusMd),
                  ),
                  child: const Icon(
                    Icons.business_outlined,
                    color: forestEmerald,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.workspaceName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontSize: 15,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Text(
                        '${widget.branchName} - ${widget.roleName}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: slateText,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Refresh',
                  onPressed: widget.loading ? null : widget.onRefresh,
                  icon: widget.loading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: forestEmerald,
                          ),
                        )
                      : const Icon(Icons.refresh, color: forestEmerald),
                ),
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: InkWell(
                    key: _profileMenuKey,
                    onTap: _openProfileMenu,
                    customBorder: const CircleBorder(),
                    child: _HeaderProfileAvatar(session: widget.session),
                  ),
                ),
              ],
            ),
          ),
          if (showSms)
            Container(
              width: double.infinity,
              color: stripColor,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: _SmsCreditsPill(
                  credits: credits,
                  tone: tone,
                  onTap: () {
                    final openSms = widget.onSmsTap;
                    if (openSms != null) {
                      openSms();
                      return;
                    }
                    // ignore: discarded_futures
                    _smsStore.refresh(silent: true);
                  },
                ),
              ),
            ),
          if (campaign != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
              child: MobileMarketingBanner(
                campaign: campaign,
                onTap: widget.onMarketingTap,
                onDismiss: widget.onMarketingDismiss,
                onCta: widget.onMarketingCta,
              ),
            ),
        ],
      ),
    );
  }
}

enum _ProfileMenuAction { profile, settings, signOut }

class _ProfileMenuRow extends StatelessWidget {
  const _ProfileMenuRow({
    required this.icon,
    required this.label,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? const Color(0xFFE11D2E) : midnightNavy;
    return Row(
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 10),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w700,
            fontSize: 13,
          ),
        ),
      ],
    );
  }
}

class _HeaderProfileAvatar extends StatelessWidget {
  const _HeaderProfileAvatar({required this.session});

  final RembehSession session;

  @override
  Widget build(BuildContext context) {
    final initials = _initials(session.userName);
    final photoUrl = session.profilePhotoUrl;

    return Container(
      width: 40,
      height: 40,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: sage,
        border: Border.all(color: line),
        shape: BoxShape.circle,
      ),
      clipBehavior: Clip.antiAlias,
      child: photoUrl != null && photoUrl.isNotEmpty
          ? Image.network(
              photoUrl,
              width: 40,
              height: 40,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => Text(
                initials,
                style: const TextStyle(
                  color: forestEmerald,
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
            )
          : Text(
              initials,
              style: const TextStyle(
                color: forestEmerald,
                fontWeight: FontWeight.w800,
                fontSize: 13,
              ),
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

class _SmsCreditsPill extends StatelessWidget {
  const _SmsCreditsPill({
    required this.credits,
    required this.tone,
    required this.onTap,
  });

  final int credits;
  final SmsCreditTone tone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = switch (tone) {
      SmsCreditTone.red => (
        bg: const Color(0xFFFFE4E6),
        fg: const Color(0xFFB42318),
        dot: const Color(0xFFE11D2E),
      ),
      SmsCreditTone.orange => (
        bg: const Color(0xFFFFEDD5),
        fg: const Color(0xFFC2410C),
        dot: const Color(0xFFF97316),
      ),
      // Stronger green than the light strip so healthy credit still pops.
      SmsCreditTone.green => (
        bg: const Color(0xFFD8F3E0),
        fg: const Color(0xFF06603A),
        dot: const Color(0xFF059669),
      ),
    };

    return Material(
      color: colors.bg,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  color: colors.dot,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              Icon(
                Icons.chat_bubble_outline_rounded,
                size: 14,
                color: colors.fg,
              ),
              const SizedBox(width: 5),
              Text(
                '$credits SMS',
                style: TextStyle(
                  color: colors.fg,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
