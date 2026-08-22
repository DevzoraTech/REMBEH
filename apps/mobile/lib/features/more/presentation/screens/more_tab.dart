import 'package:flutter/material.dart';

import '../../../../theme.dart';

class MoreTab extends StatelessWidget {
  const MoreTab({
    super.key,
    required this.onAgentsTap,
    required this.onSalariesTap,
    required this.onShortagesTap,
    required this.onReportsTap,
    required this.onBranchTap,
    required this.onSubscriptionTap,
    required this.onSettingsTap,
    required this.onSupportTap,
  });

  final VoidCallback onAgentsTap;
  final VoidCallback onSalariesTap;
  final VoidCallback onShortagesTap;
  final VoidCallback onReportsTap;
  final VoidCallback onBranchTap;
  final VoidCallback onSubscriptionTap;
  final VoidCallback onSettingsTap;
  final VoidCallback onSupportTap;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        16,
        18,
        16,
        28,
      ),
      children: [
        _MoreSection(
          title: 'Management',
          children: [
            _MoreMenuItem(
              icon: Icons.people_outline_rounded,
              title: 'Agents',
              subtitle: 'View, manage and monitor your agents',
              onTap: onAgentsTap,
            ),
            _MoreMenuItem(
              icon: Icons.payments_outlined,
              title: 'Salaries',
              subtitle: 'Manage salaries and view payment history',
              onTap: onSalariesTap,
            ),
            _MoreMenuItem(
              icon: Icons.warning_amber_rounded,
              title: 'Shortages',
              subtitle: 'View shortage records and their status',
              onTap: onShortagesTap,
            ),
            _MoreMenuItem(
              icon: Icons.description_outlined,
              title: 'Reports',
              subtitle: 'View and manage daily reports',
              onTap: onReportsTap,
              showDivider: false,
            ),
          ],
        ),

        const SizedBox(height: 12),

        _MoreSection(
          title: 'Branch',
          children: [
            _MoreMenuItem(
              icon: Icons.apartment_outlined,
              title: 'Your branch',
              subtitle: 'Branch information and configuration',
              onTap: onBranchTap,
            ),
            _MoreMenuItem(
              icon: Icons.credit_card_outlined,
              title: 'Subscription',
              subtitle: 'Manage your subscription and payment',
              onTap: onSubscriptionTap,
              showDivider: false,
            ),
          ],
        ),

        const SizedBox(height: 12),

        _MoreSection(
          title: 'Preferences & support',
          children: [
            _MoreMenuItem(
              icon: Icons.settings_outlined,
              title: 'Settings',
              subtitle: 'App preferences and branch settings',
              onTap: onSettingsTap,
            ),
            _MoreMenuItem(
              icon: Icons.headset_mic_outlined,
              title: 'Help & support',
              subtitle: 'Get help and contact support',
              onTap: onSupportTap,
              showDivider: false,
            ),
          ],
        ),
      ],
    );
  }
}

class _MoreSection extends StatelessWidget {
  const _MoreSection({
    required this.title,
    required this.children,
  });

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(
          color: line,
        ),
        borderRadius: rembehBorderRadius(
          rembehRadiusLg,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              14,
              12,
              14,
              4,
            ),
            child: Text(
              title,
              style: const TextStyle(
                color: slateText,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          ...children,
        ],
      ),
    );
  }
}

class _MoreMenuItem extends StatelessWidget {
  const _MoreMenuItem({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.showDivider = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: 14,
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(
                  vertical: 10,
                ),
                child: Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: forestEmerald.withValues(
                          alpha: 0.07,
                        ),
                        borderRadius: BorderRadius.circular(
                          11,
                        ),
                      ),
                      child: Icon(
                        icon,
                        size: 20,
                        color: forestEmerald,
                      ),
                    ),

                    const SizedBox(width: 12),

                    Expanded(
                      child: Column(
                        crossAxisAlignment:
                            CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: const TextStyle(
                              color: midnightNavy,
                              fontSize: 13,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: slateText,
                              fontSize: 10,
                              height: 1.2,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(width: 8),

                    const Icon(
                      Icons.chevron_right_rounded,
                      size: 20,
                      color: slateText,
                    ),
                  ],
                ),
              ),

              if (showDivider)
                const Padding(
                  padding: EdgeInsets.only(
                    left: 50,
                  ),
                  child: Divider(
                    height: 1,
                    color: line,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}