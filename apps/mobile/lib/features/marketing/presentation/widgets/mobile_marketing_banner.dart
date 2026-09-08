import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../domain/models/mobile_marketing_campaign.dart';
import '../marketing_campaign_actions.dart';

const _criticalSurface = Color(0xFFFFF1F2);
const _criticalBorder = Color(0xFFFECACA);
const _criticalAccent = Color(0xFFDC2626);
const _criticalIconBg = Color(0xFFFFE4E6);

const _updateSurface = Color(0xFFEFF6FF);
const _updateBorder = Color(0xFFBFDBFE);
const _updateAccent = Color(0xFF2563EB);
const _updateIconBg = Color(0xFFDBEAFE);

const _promoSurface = Color(0xFFECFDF5);
const _promoBorder = Color(0xFFA7F3D0);
const _promoAccent = Color(0xFF059669);
const _promoIconBg = Color(0xFFD1FAE5);

class MobileMarketingBanner extends StatelessWidget {
  const MobileMarketingBanner({
    super.key,
    required this.campaign,
    this.onDismiss,
    this.onCta,
    this.onTap,
  });

  final MobileMarketingCampaign campaign;
  final VoidCallback? onDismiss;
  final VoidCallback? onCta;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = _themeFor(campaign.category);
    final ctaLabel = campaign.hasCta
        ? marketingCtaButtonLabel(campaign.ctaLabel)
        : null;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        child: Ink(
          decoration: BoxDecoration(
            color: theme.surface,
            border: Border.all(color: theme.border),
            borderRadius: rembehBorderRadius(rembehRadiusLg),
          ),
          child: ClipRRect(
            borderRadius: rembehBorderRadius(rembehRadiusLg),
            child: Stack(
              children: [
                if (theme.watermark != null)
                  Positioned(
                    right: theme.watermarkRight,
                    bottom: theme.watermarkBottom,
                    child: IgnorePointer(
                      child: Opacity(
                        opacity: theme.watermarkOpacity,
                        child: theme.watermark!,
                      ),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 14, 36, 14),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _LeadingIcon(
                        background: theme.iconBackground,
                        accent: theme.accent,
                        icon: theme.icon,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              campaign.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: midnightNavy,
                                fontSize: 14,
                                fontWeight: FontWeight.w900,
                                height: 1.2,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              campaign.body,
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: slateText,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                height: 1.35,
                              ),
                            ),
                            if (ctaLabel != null) ...[
                              const SizedBox(height: 10),
                              Align(
                                alignment: Alignment.centerLeft,
                                child: _CtaPill(
                                  label: ctaLabel,
                                  color: theme.accent,
                                  onPressed: onCta,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (theme.trailing != null) ...[
                        const SizedBox(width: 8),
                        IgnorePointer(child: theme.trailing!),
                      ],
                    ],
                  ),
                ),
                if (onDismiss != null)
                  Positioned(
                    top: 4,
                    right: 4,
                    child: IconButton(
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 32,
                        minHeight: 32,
                      ),
                      onPressed: () {
                        onDismiss?.call();
                      },
                      icon: Icon(
                        Icons.close_rounded,
                        size: 18,
                        color: slateText.withValues(alpha: 0.55),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BannerTheme {
  const _BannerTheme({
    required this.surface,
    required this.border,
    required this.accent,
    required this.iconBackground,
    required this.icon,
    this.watermark,
    this.watermarkOpacity = 0.12,
    this.watermarkRight = 8,
    this.watermarkBottom = 4,
    this.trailing,
  });

  final Color surface;
  final Color border;
  final Color accent;
  final Color iconBackground;
  final IconData icon;
  final Widget? watermark;
  final double watermarkOpacity;
  final double watermarkRight;
  final double watermarkBottom;
  final Widget? trailing;
}

_BannerTheme _themeFor(String category) {
  switch (category) {
    case 'CRITICAL_WARNING':
      return const _BannerTheme(
        surface: _criticalSurface,
        border: _criticalBorder,
        accent: _criticalAccent,
        iconBackground: _criticalIconBg,
        icon: Icons.warning_rounded,
        watermark: Icon(
          Icons.chat_bubble_outline_rounded,
          size: 72,
          color: _criticalAccent,
        ),
        watermarkOpacity: 0.10,
        watermarkRight: 4,
        watermarkBottom: -4,
      );
    case 'PROMOTIONAL':
      return const _BannerTheme(
        surface: _promoSurface,
        border: _promoBorder,
        accent: _promoAccent,
        iconBackground: _promoIconBg,
        icon: Icons.card_giftcard_rounded,
        watermark: _BarChartWatermark(),
        watermarkOpacity: 0.14,
        watermarkRight: 10,
        watermarkBottom: 8,
      );
    case 'PRODUCT_UPDATE':
    default:
      return const _BannerTheme(
        surface: _updateSurface,
        border: _updateBorder,
        accent: _updateAccent,
        iconBackground: _updateIconBg,
        icon: Icons.campaign_rounded,
        trailing: _DocumentPlusIllustration(),
      );
  }
}

class _LeadingIcon extends StatelessWidget {
  const _LeadingIcon({
    required this.background,
    required this.accent,
    required this.icon,
  });

  final Color background;
  final Color accent;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(color: background, shape: BoxShape.circle),
      child: Icon(icon, color: accent, size: 24),
    );
  }
}

class _CtaPill extends StatelessWidget {
  const _CtaPill({
    required this.label,
    required this.color,
    required this.onPressed,
  });

  final String label;
  final Color color;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: rembehBorderRadius(999),
      child: InkWell(
        onTap: onPressed == null
            ? null
            : () {
                onPressed!();
              },
        borderRadius: rembehBorderRadius(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w900,
              height: 1,
            ),
          ),
        ),
      ),
    );
  }
}

class _DocumentPlusIllustration extends StatelessWidget {
  const _DocumentPlusIllustration();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 54,
      height: 64,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 4,
            top: 6,
            child: Container(
              width: 36,
              height: 46,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: rembehBorderRadius(8),
                border: Border.all(color: const Color(0xFFBFDBFE)),
                boxShadow: [
                  BoxShadow(
                    color: _updateAccent.withValues(alpha: 0.12),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              padding: const EdgeInsets.fromLTRB(7, 10, 7, 8),
              child: Column(
                children: [
                  Container(
                    height: 3,
                    decoration: BoxDecoration(
                      color: const Color(0xFF93C5FD),
                      borderRadius: rembehBorderRadius(2),
                    ),
                  ),
                  const SizedBox(height: 5),
                  Container(
                    height: 3,
                    decoration: BoxDecoration(
                      color: const Color(0xFFBFDBFE),
                      borderRadius: rembehBorderRadius(2),
                    ),
                  ),
                  const SizedBox(height: 5),
                  Container(
                    height: 3,
                    width: 14,
                    decoration: BoxDecoration(
                      color: const Color(0xFFBFDBFE),
                      borderRadius: rembehBorderRadius(2),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Positioned(
            right: 0,
            bottom: 4,
            child: Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: forestEmerald,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
                boxShadow: [
                  BoxShadow(
                    color: forestEmerald.withValues(alpha: 0.28),
                    blurRadius: 6,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: const Icon(Icons.add, color: Colors.white, size: 14),
            ),
          ),
        ],
      ),
    );
  }
}

class _BarChartWatermark extends StatelessWidget {
  const _BarChartWatermark();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 56,
      height: 48,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: const [
          _Bar(height: 18),
          SizedBox(width: 5),
          _Bar(height: 30),
          SizedBox(width: 5),
          _Bar(height: 22),
          SizedBox(width: 5),
          _Bar(height: 40),
        ],
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({required this.height});

  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 8,
      height: height,
      decoration: BoxDecoration(
        color: _promoAccent,
        borderRadius: rembehBorderRadius(3),
      ),
    );
  }
}
