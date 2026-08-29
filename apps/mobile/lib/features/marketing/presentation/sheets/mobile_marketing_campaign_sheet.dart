import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../theme.dart';
import '../../domain/models/mobile_marketing_campaign.dart';

const _campaignRed = Color(0xFFDC2626);
const _campaignAmber = Color(0xFFF59E0B);

Future<void> showMobileMarketingCampaignSheet(
  BuildContext context,
  MobileMarketingCampaign campaign,
) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: false,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
    builder: (sheetContext) {
      final important = campaign.priority >= 70;
      final accent = important ? _campaignRed : _campaignAmber;
      final hasCta =
          campaign.ctaLabel != null &&
          campaign.ctaLabel!.trim().isNotEmpty &&
          campaign.ctaUrl != null &&
          campaign.ctaUrl!.trim().isNotEmpty;
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
                      child: Icon(
                        important
                            ? Icons.notifications_active_outlined
                            : Icons.campaign_outlined,
                        color: accent,
                      ),
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
                              important ? 'Important update' : 'Campaign',
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
                    campaign.mediaType == 'VIDEO' && hasMediaLink) ...[
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: () {
                      Navigator.of(sheetContext).pop();
                      unawaited(
                        _openCampaignLink(
                          context,
                          hasCta ? campaign.ctaUrl! : campaign.mediaUrl!,
                        ),
                      );
                    },
                    icon: Icon(
                      campaign.mediaType == 'VIDEO' && !hasCta
                          ? Icons.play_circle_outline
                          : Icons.open_in_new,
                    ),
                    label: Text(
                      hasCta ? campaign.ctaLabel! : 'Open campaign video',
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

Future<void> _openCampaignLink(BuildContext context, String value) async {
  final uri = Uri.tryParse(value.trim());
  if (uri == null || !uri.hasScheme) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This campaign link is not valid.')),
      );
    }
    return;
  }

  final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!opened && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Could not open this campaign link.')),
    );
  }
}
