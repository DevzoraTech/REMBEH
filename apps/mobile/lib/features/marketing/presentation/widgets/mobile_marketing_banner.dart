import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../domain/models/mobile_marketing_campaign.dart';

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
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: const Color(0xFFF3FAF5),
          border: Border.all(color: const Color(0xFFD9EEDF)),
          borderRadius: rembehBorderRadius(rembehRadiusMd),
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
                  color: sage,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.campaign_outlined,
                  color: forestEmerald,
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    campaign.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 13,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    campaign.body,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: slateText,
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
                          color: forestEmerald,
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: forestEmerald),
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
          color: const Color(0xFFE8F1FF),
          borderRadius: rembehBorderRadius(10),
        ),
        child: const Icon(Icons.play_circle_outline, color: Color(0xFF2563EB)),
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
          color: sage,
          child: const Icon(Icons.image_outlined, color: forestEmerald),
        ),
      ),
    );
  }
}
