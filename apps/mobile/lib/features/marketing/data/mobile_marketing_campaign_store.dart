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
    return _filterDismissed(campaign);
  }

  Future<void> cache(
    RembehSession session,
    MobileMarketingCampaign? campaign,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final key = _cacheKey(session);
    if (campaign == null || campaign.isExpired) {
      await prefs.remove(key);
      return;
    }
    await prefs.setString(key, jsonEncode(campaign.toJson()));
  }

  Future<MobileMarketingCampaign?> readCached(RembehSession session) async {
    final prefs = await SharedPreferences.getInstance();
    final key = _cacheKey(session);
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
      return _filterDismissed(campaign);
    } catch (_) {
      await prefs.remove(key);
      return null;
    }
  }

  /// Persist dismiss until [campaign.endsAt] passes or a different campaign id.
  Future<void> dismiss(MobileMarketingCampaign campaign) async {
    if (campaign.id.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    final value = campaign.endsAt?.toIso8601String() ?? 'indefinite';
    await prefs.setString(_dismissKey(campaign.id), value);
  }

  Future<bool> isDismissed(MobileMarketingCampaign campaign) async {
    if (campaign.id.isEmpty) return false;
    final prefs = await SharedPreferences.getInstance();
    final key = _dismissKey(campaign.id);
    final raw = prefs.getString(key);
    if (raw == null || raw.isEmpty) return false;

    if (campaign.isExpired) {
      await prefs.remove(key);
      return false;
    }

    if (raw != 'indefinite') {
      final storedEnd = DateTime.tryParse(raw);
      if (storedEnd != null && DateTime.now().isAfter(storedEnd)) {
        await prefs.remove(key);
        return false;
      }
    }

    return true;
  }

  Future<MobileMarketingCampaign?> _filterDismissed(
    MobileMarketingCampaign? campaign,
  ) async {
    if (campaign == null || campaign.isExpired) return null;
    if (await isDismissed(campaign)) return null;
    return campaign;
  }

  String _cacheKey(RembehSession session) {
    final tenantId = session.tenantId ?? 'tenant';
    final branchId = session.branchId ?? 'all';
    return 'rembeh.mobile_header_campaign.$tenantId.$branchId';
  }

  String _dismissKey(String campaignId) => 'marketing_dismissed_$campaignId';
}
