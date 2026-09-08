import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../domain/models/mobile_marketing_campaign.dart';
import '../marketing_campaign_actions.dart';

Future<void> showMobileMarketingCampaignSheet(
  BuildContext context,
  MobileMarketingCampaign campaign, {
  void Function(String routeKey)? onInternalRoute,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: false,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
    builder: (sheetContext) {
      final accent = _accentFor(campaign.category);
      final hasCta = campaign.hasCta;
      final hasMediaLink =
          campaign.mediaUrl != null && campaign.mediaUrl!.trim().isNotEmpty;

      return SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.82,
          ),
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              18,
              8,
              18,
              18 + MediaQuery.of(sheetContext).viewInsets.bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 42,
                    height: 4,
                    decoration: BoxDecoration(
                      color: line,
                      borderRadius: rembehBorderRadius(999),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: 0.12),
                        borderRadius: rembehBorderRadius(12),
                      ),
                      child: Icon(_iconFor(campaign.category), color: accent),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: accent,
                              borderRadius: rembehBorderRadius(6),
                            ),
                            child: Text(
                              _badgeFor(campaign.category),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                height: 1,
                              ),
                            ),
                          ),
                          const SizedBox(height: 7),
                          Text(
                            campaign.title,
                            style: const TextStyle(
                              color: midnightNavy,
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              height: 1.15,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(sheetContext).pop(),
                      icon: const Icon(Icons.close, color: slateText),
                    ),
                  ],
                ),
                if (campaign.mediaUrl != null &&
                    campaign.mediaUrl!.trim().isNotEmpty) ...[
                  const SizedBox(height: 14),
                  _MarketingCampaignMedia(campaign: campaign, accent: accent),
                ],
                const SizedBox(height: 14),
                Text(
                  campaign.body,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    height: 1.45,
                  ),
                ),
                if (hasCta ||
                    (campaign.mediaType == 'VIDEO' && hasMediaLink)) ...[
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: () {
                      Navigator.of(sheetContext).pop();
                      if (hasCta) {
                        unawaited(
                          handleMarketingCampaignCta(
                            context: context,
                            campaign: campaign,
                            onInternalRoute: onInternalRoute ?? (_) {},
                          ),
                        );
                        return;
                      }
                      unawaited(
                        handleMarketingCampaignCta(
                          context: context,
                          campaign: MobileMarketingCampaign(
                            id: campaign.id,
                            title: campaign.title,
                            body: campaign.body,
                            priority: campaign.priority,
                            startsAt: campaign.startsAt,
                            ctaLabel: 'Open',
                            ctaUrl: campaign.mediaUrl,
                            ctaAction: 'EXTERNAL_URL',
                            category: campaign.category,
                          ),
                          onInternalRoute: (_) {},
                        ),
                      );
                    },
                    icon: Icon(
                      campaign.mediaType == 'VIDEO' && !hasCta
                          ? Icons.play_circle_outline
                          : campaign.ctaAction == 'INTERNAL_ROUTE'
                          ? Icons.arrow_forward_rounded
                          : Icons.open_in_new,
                    ),
                    label: Text(
                      hasCta
                          ? marketingCtaButtonLabel(campaign.ctaLabel)
                          : 'Open campaign video',
                    ),
                    style: FilledButton.styleFrom(backgroundColor: accent),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    },
  );
}

Color _accentFor(String category) {
  switch (category) {
    case 'CRITICAL_WARNING':
      return const Color(0xFFDC2626);
    case 'PROMOTIONAL':
      return forestEmerald;
    case 'PRODUCT_UPDATE':
    default:
      return const Color(0xFF2563EB);
  }
}

IconData _iconFor(String category) {
  switch (category) {
    case 'CRITICAL_WARNING':
      return Icons.warning_rounded;
    case 'PROMOTIONAL':
      return Icons.card_giftcard_rounded;
    case 'PRODUCT_UPDATE':
    default:
      return Icons.campaign_rounded;
  }
}

String _badgeFor(String category) {
  switch (category) {
    case 'CRITICAL_WARNING':
      return 'Important update';
    case 'PROMOTIONAL':
      return 'Offer';
    case 'PRODUCT_UPDATE':
    default:
      return 'Product update';
  }
}

class _MarketingCampaignMedia extends StatelessWidget {
  const _MarketingCampaignMedia({required this.campaign, required this.accent});

  final MobileMarketingCampaign campaign;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    if (campaign.mediaType == 'VIDEO') {
      return Container(
        width: double.infinity,
        height: 132,
        decoration: BoxDecoration(
          color: accent.withValues(alpha: 0.1),
          borderRadius: rembehBorderRadius(rembehRadiusMd),
          border: Border.all(color: accent.withValues(alpha: 0.22)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.play_circle_outline, color: accent, size: 38),
            const SizedBox(height: 6),
            Text(
              'Video attached',
              style: TextStyle(color: accent, fontWeight: FontWeight.w900),
            ),
          ],
        ),
      );
    }

    return ClipRRect(
      borderRadius: rembehBorderRadius(rembehRadiusMd),
      child: Image.network(
        campaign.mediaUrl!,
        width: double.infinity,
        height: 168,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) => Container(
          width: double.infinity,
          height: 124,
          color: sage,
          child: const Icon(Icons.image_outlined, color: forestEmerald),
        ),
      ),
    );
  }
}
