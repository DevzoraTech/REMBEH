import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../services/api_client.dart';
import '../../../services/session_store.dart';
import '../domain/models/mobile_marketing_campaign.dart';

class MobileMarketingCampaignStore {
  const MobileMarketingCampaignStore({required ApiClient api}) : _api = api;

  final ApiClient _api;

  Future<MobileMarketingCampaign?> fetchLatest(RembehSession session) async {
    final campaign = await _api.getMobileHeaderCampaign(session);
    await cache(session, campaign);
    return campaign;
  }

  Future<void> cache(
    RembehSession session,
    MobileMarketingCampaign? campaign,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final key = _key(session);
    if (campaign == null || campaign.isExpired) {
      await prefs.remove(key);
      return;
    }
    await prefs.setString(key, jsonEncode(campaign.toJson()));
  }

  Future<MobileMarketingCampaign?> readCached(RembehSession session) async {
    final prefs = await SharedPreferences.getInstance();
    final key = _key(session);
    final raw = prefs.getString(key);
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return null;
      final campaign = MobileMarketingCampaign.fromJson(decoded);
      if (campaign.id.isEmpty || campaign.title.isEmpty || campaign.isExpired) {
        await prefs.remove(key);
        return null;
      }
      return campaign;
    } catch (_) {
      await prefs.remove(key);
      return null;
    }
  }

  String _key(RembehSession session) {
    final tenantId = session.tenantId ?? 'tenant';
    final branchId = session.branchId ?? 'all';
    return 'rembeh.mobile_header_campaign.$tenantId.$branchId';
  }
}
