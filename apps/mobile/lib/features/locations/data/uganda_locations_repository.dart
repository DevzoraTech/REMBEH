import 'dart:convert';

import 'package:flutter/services.dart';

import '../domain/uganda_location.dart';

class UgandaLocationsRepository {
  UgandaLocationsRepository._();

  static final UgandaLocationsRepository instance =
      UgandaLocationsRepository._();

  static const _assetPath = 'assets/data/uganda_locations.json';

  UgandaLocationCatalog? _cached;

  Future<UgandaLocationCatalog> load() async {
    final cached = _cached;
    if (cached != null) return cached;

    final payload = await rootBundle.loadString(_assetPath);
    final decoded = jsonDecode(payload) as Map<String, dynamic>;
    final catalog = UgandaLocationCatalog.fromJson(decoded);
    _cached = catalog;
    return catalog;
  }
}
