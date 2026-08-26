import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../theme.dart';
import '../../domain/models/mobile_marketing_campaign.dart';

Future<void> showMobileMarketingCampaignSheet(
  BuildContext context,
  MobileMarketingCampaign campaign,
) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: rembehBorderRadius(
        rembehRadiusXl,
      ).copyWith(bottomLeft: Radius.zero, bottomRight: Radius.zero),
    ),
    builder: (sheetContext) {
      return SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            0,
            20,
            20 + MediaQuery.of(sheetContext).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (campaign.mediaUrl != null &&
                  campaign.mediaUrl!.trim().isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: _MarketingCampaignMedia(campaign: campaign),
                ),
              Text(
                campaign.title,
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                campaign.body,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  height: 1.45,
                ),
              ),
              if (campaign.ctaLabel != null &&
                  campaign.ctaLabel!.trim().isNotEmpty &&
                  campaign.ctaUrl != null &&
                  campaign.ctaUrl!.trim().isNotEmpty) ...[
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () {
                      Navigator.of(sheetContext).pop();
                      unawaited(_openCampaignLink(context, campaign.ctaUrl!));
                    },
                    child: Text(campaign.ctaLabel!),
                  ),
                ),
              ],
            ],
          ),
        ),
      );
    },
  );
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

class _MarketingCampaignMedia extends StatelessWidget {
  const _MarketingCampaignMedia({required this.campaign});

  final MobileMarketingCampaign campaign;

  @override
  Widget build(BuildContext context) {
    if (campaign.mediaType == 'VIDEO') {
      return Container(
        width: double.infinity,
        height: 154,
        decoration: BoxDecoration(
          color: const Color(0xFFEAF2FF),
          borderRadius: rembehBorderRadius(rembehRadiusMd),
        ),
        child: const Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.play_circle_outline, color: Color(0xFF2563EB), size: 38),
            SizedBox(height: 6),
            Text(
              'Video attached',
              style: TextStyle(
                color: Color(0xFF1D4ED8),
                fontWeight: FontWeight.w800,
              ),
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
        height: 176,
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
