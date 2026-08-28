import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../domain/models/mobile_marketing_campaign.dart';

const _campaignRed = Color(0xFFDC2626);
const _campaignDark = Color(0xFF7F1D1D);
const _campaignSurface = Color(0xFFFFF1F2);
const _campaignBorder = Color(0xFFFFCDD2);
const _campaignIconSurface = Color(0xFFFFE4E6);
const _campaignAmber = Color(0xFFF59E0B);

class MobileMarketingBanner extends StatelessWidget {
  const MobileMarketingBanner({super.key, required this.campaign, this.onTap});

  final MobileMarketingCampaign campaign;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final hasMedia =
        campaign.mediaUrl != null && campaign.mediaUrl!.trim().isNotEmpty;
    final important = campaign.priority >= 70;
    final accent = important ? _campaignRed : _campaignAmber;
    final title = important ? 'Important update' : 'Campaign update';

    return InkWell(
      onTap: onTap,
      borderRadius: rembehBorderRadius(rembehRadiusMd),
      child: Container(
        width: double.infinity,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: _campaignSurface,
          border: Border.all(color: _campaignBorder),
          borderRadius: rembehBorderRadius(rembehRadiusMd),
          boxShadow: [
            BoxShadow(
              color: accent.withValues(alpha: 0.16),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 5, color: accent),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(11),
                child: Row(
                  children: [
                    if (hasMedia) ...[
                      _MarketingMediaThumb(campaign: campaign, accent: accent),
                      const SizedBox(width: 10),
                    ] else ...[
                      Container(
                        width: 42,
                        height: 42,
                        decoration: const BoxDecoration(
                          color: _campaignIconSurface,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          important
                              ? Icons.notifications_active_outlined
                              : Icons.campaign_outlined,
                          color: accent,
                          size: 21,
                        ),
                      ),
                      const SizedBox(width: 10),
                    ],
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 7,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: accent,
                                  borderRadius: rembehBorderRadius(6),
                                ),
                                child: Text(
                                  title,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 9,
                                    fontWeight: FontWeight.w900,
                                    height: 1,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  campaign.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: _campaignDark,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            campaign.body,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: _campaignDark,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              height: 1.25,
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    campaign.ctaLabel != null &&
                                            campaign.ctaLabel!.trim().isNotEmpty
                                        ? campaign.ctaLabel!
                                        : 'Tap to read more',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: accent,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                ),
                                Icon(
                                  Icons.chevron_right,
                                  color: accent,
                                  size: 20,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MarketingMediaThumb extends StatelessWidget {
  const _MarketingMediaThumb({required this.campaign, required this.accent});

  final MobileMarketingCampaign campaign;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    if (campaign.mediaType == 'VIDEO') {
      return Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: _campaignIconSurface,
          borderRadius: rembehBorderRadius(10),
        ),
        child: Icon(Icons.play_circle_outline, color: accent),
      );
    }

    return Stack(
      children: [
        ClipRRect(
          borderRadius: rembehBorderRadius(10),
          child: Image.network(
            campaign.mediaUrl!,
            width: 48,
            height: 48,
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) => Container(
              width: 48,
              height: 48,
              color: _campaignIconSurface,
              child: Icon(Icons.image_outlined, color: accent),
            ),
          ),
        ),
        Positioned(
          right: 3,
          bottom: 3,
          child: Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              color: accent,
              border: Border.all(color: Colors.white, width: 1.5),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.campaign_outlined,
              color: Colors.white,
              size: 9,
            ),
          ),
        ),
      ],
    );
  }
}
