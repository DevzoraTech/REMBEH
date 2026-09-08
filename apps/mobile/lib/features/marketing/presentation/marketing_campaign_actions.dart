import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../domain/models/mobile_marketing_campaign.dart';

Future<void> handleMarketingCampaignCta({
  required BuildContext context,
  required MobileMarketingCampaign campaign,
  required void Function(String routeKey) onInternalRoute,
}) async {
  if (campaign.ctaAction == 'INTERNAL_ROUTE') {
    final routeKey = campaign.ctaRoute?.trim() ?? '';
    if (routeKey.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('This campaign has no destination.')),
        );
      }
      return;
    }
    onInternalRoute(routeKey);
    return;
  }

  final value = campaign.ctaUrl?.trim() ?? '';
  final uri = Uri.tryParse(value);
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

String marketingCtaButtonLabel(String? label) {
  final trimmed = label?.trim() ?? '';
  if (trimmed.isEmpty) return 'Learn more →';
  if (trimmed.endsWith('→') || trimmed.endsWith('->')) return trimmed;
  return '$trimmed →';
}
