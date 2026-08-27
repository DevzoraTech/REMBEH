import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../domain/models/mobile_marketing_campaign.dart';

const _campaignRed = Color(0xFFDC2626);
const _campaignDark = Color(0xFF7F1D1D);
const _campaignSurface = Color(0xFFFFF1F2);
const _campaignBorder = Color(0xFFFFCDD2);
const _campaignIconSurface = Color(0xFFFFE4E6);

class MobileMarketingBanner extends StatelessWidget {
  const MobileMarketingBanner({super.key, required this.campaign, this.onTap});

  final MobileMarketingCampaign campaign;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final hasMedia =
        campaign.mediaUrl != null && campaign.mediaUrl!.trim().isNotEmpty;

    return InkWell(
      onTap: onTap,
      borderRadius: rembehBorderRadius(rembehRadiusMd),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(11),
        decoration: BoxDecoration(
          color: _campaignSurface,
          border: Border.all(color: _campaignBorder),
          borderRadius: rembehBorderRadius(rembehRadiusMd),
          boxShadow: [
            BoxShadow(
              color: _campaignRed.withValues(alpha: 0.08),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          children: [
            if (hasMedia) ...[
              _MarketingMediaThumb(campaign: campaign),
              const SizedBox(width: 10),
            ] else ...[
              Container(
                width: 38,
                height: 38,
                decoration: const BoxDecoration(
                  color: _campaignIconSurface,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.campaign_outlined,
                  color: _campaignRed,
                  size: 20,
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
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          border: Border.all(color: _campaignBorder),
                          borderRadius: rembehBorderRadius(99),
                        ),
                        child: const Text(
                          'Notice',
                          style: TextStyle(
                            color: _campaignRed,
                            fontSize: 9,
                            fontWeight: FontWeight.w900,
                            height: 1,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    campaign.body,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: _campaignDark,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      height: 1.25,
                    ),
                  ),
                  if (campaign.ctaLabel != null &&
                      campaign.ctaLabel!.trim().isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Text(
                        campaign.ctaLabel!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: _campaignRed,
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: _campaignRed),
          ],
        ),
      ),
    );
  }
}

class _MarketingMediaThumb extends StatelessWidget {
  const _MarketingMediaThumb({required this.campaign});

  final MobileMarketingCampaign campaign;

  @override
  Widget build(BuildContext context) {
    if (campaign.mediaType == 'VIDEO') {
      return Container(
        width: 46,
        height: 46,
        decoration: BoxDecoration(
          color: _campaignIconSurface,
          borderRadius: rembehBorderRadius(10),
        ),
        child: const Icon(Icons.play_circle_outline, color: _campaignRed),
      );
    }

    return ClipRRect(
      borderRadius: rembehBorderRadius(10),
      child: Image.network(
        campaign.mediaUrl!,
        width: 46,
        height: 46,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) => Container(
          width: 46,
          height: 46,
          color: _campaignIconSurface,
          child: const Icon(Icons.image_outlined, color: _campaignRed),
        ),
      ),
    );
  }
}
