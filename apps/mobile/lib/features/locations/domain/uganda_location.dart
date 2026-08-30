class UgandaLocationCatalog {
  const UgandaLocationCatalog({required this.country, required this.districts});

  final String country;
  final List<UgandaDistrict> districts;

  List<String> get districtNames =>
      districts.map((district) => district.name).toList(growable: false);

  UgandaDistrict? district(String? name) {
    if (name == null || name.trim().isEmpty) return null;
    final key = _key(name);
    for (final district in districts) {
      if (_key(district.name) == key) return district;
    }
    return null;
  }

  factory UgandaLocationCatalog.fromJson(Map<String, dynamic> json) {
    final districts = (json['districts'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(UgandaDistrict.fromJson)
        .toList(growable: false);
    return UgandaLocationCatalog(
      country: (json['country'] as String?)?.trim() ?? 'Uganda',
      districts: districts,
    );
  }
}

class UgandaDistrict {
  const UgandaDistrict({required this.name, required this.subCounties});

  final String name;
  final List<UgandaSubCounty> subCounties;

  List<String> get subCountyNames =>
      subCounties.map((subCounty) => subCounty.name).toList(growable: false);

  UgandaSubCounty? subCounty(String? name) {
    if (name == null || name.trim().isEmpty) return null;
    final key = _key(name);
    for (final subCounty in subCounties) {
      if (_key(subCounty.name) == key) return subCounty;
    }
    return null;
  }

  factory UgandaDistrict.fromJson(Map<String, dynamic> json) {
    return UgandaDistrict(
      name: (json['name'] as String?)?.trim() ?? '',
      subCounties: (json['subCounties'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(UgandaSubCounty.fromJson)
          .toList(growable: false),
    );
  }
}

class UgandaSubCounty {
  const UgandaSubCounty({required this.name, required this.parishes});

  final String name;
  final List<UgandaParish> parishes;

  List<String> get parishNames =>
      parishes.map((parish) => parish.name).toList(growable: false);

  UgandaParish? parish(String? name) {
    if (name == null || name.trim().isEmpty) return null;
    final key = _key(name);
    for (final parish in parishes) {
      if (_key(parish.name) == key) return parish;
    }
    return null;
  }

  factory UgandaSubCounty.fromJson(Map<String, dynamic> json) {
    return UgandaSubCounty(
      name: (json['name'] as String?)?.trim() ?? '',
      parishes: (json['parishes'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(UgandaParish.fromJson)
          .toList(growable: false),
    );
  }
}

class UgandaParish {
  const UgandaParish({required this.name, required this.villages});

  final String name;
  final List<String> villages;

  factory UgandaParish.fromJson(Map<String, dynamic> json) {
    return UgandaParish(
      name: (json['name'] as String?)?.trim() ?? '',
      villages: (json['villages'] as List<dynamic>? ?? const [])
          .whereType<String>()
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty)
          .toList(growable: false),
    );
  }
}

String _key(String value) => value.trim().toLowerCase();
