class MobileMarketingCampaign {
  const MobileMarketingCampaign({
    required this.id,
    required this.title,
    required this.body,
    required this.priority,
    required this.startsAt,
    this.endsAt,
    this.ctaLabel,
    this.ctaUrl,
    this.ctaAction = 'EXTERNAL_URL',
    this.ctaRoute,
    this.category = 'PRODUCT_UPDATE',
    this.mediaUrl,
    this.mediaType = 'NONE',
  });

  final String id;
  final String title;
  final String body;
  final String? ctaLabel;
  final String? ctaUrl;
  final String ctaAction;
  final String? ctaRoute;
  final String category;
  final String? mediaUrl;
  final String mediaType;
  final int priority;
  final DateTime startsAt;
  final DateTime? endsAt;

  bool get isExpired {
    final end = endsAt;
    return end != null && DateTime.now().isAfter(end);
  }

  bool get isCriticalWarning => category == 'CRITICAL_WARNING';
  bool get isProductUpdate => category == 'PRODUCT_UPDATE';
  bool get isPromotional => category == 'PROMOTIONAL';

  bool get hasCta {
    final label = ctaLabel?.trim() ?? '';
    if (label.isEmpty) return false;
    if (ctaAction == 'INTERNAL_ROUTE') {
      return (ctaRoute?.trim() ?? '').isNotEmpty;
    }
    // Show the button whenever a label exists; invalid URLs are handled on tap.
    return true;
  }

  factory MobileMarketingCampaign.fromJson(Map<String, dynamic> json) {
    final category = (json['category'] as String?)?.trim();
    final ctaAction = (json['ctaAction'] as String?)?.trim();
    return MobileMarketingCampaign(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      ctaLabel: json['ctaLabel'] as String?,
      ctaUrl: json['ctaUrl'] as String?,
      ctaAction: ctaAction == 'INTERNAL_ROUTE' || ctaAction == 'EXTERNAL_URL'
          ? ctaAction!
          : 'EXTERNAL_URL',
      ctaRoute: json['ctaRoute'] as String?,
      category:
          category == 'CRITICAL_WARNING' ||
              category == 'PRODUCT_UPDATE' ||
              category == 'PROMOTIONAL'
          ? category!
          : 'PRODUCT_UPDATE',
      mediaUrl: json['mediaUrl'] as String?,
      mediaType: json['mediaType'] as String? ?? 'NONE',
      priority: (json['priority'] as num?)?.round() ?? 0,
      startsAt:
          DateTime.tryParse(json['startsAt'] as String? ?? '') ??
          DateTime.now(),
      endsAt: DateTime.tryParse(json['endsAt'] as String? ?? ''),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'body': body,
    'ctaLabel': ctaLabel,
    'ctaUrl': ctaUrl,
    'ctaAction': ctaAction,
    'ctaRoute': ctaRoute,
    'category': category,
    'mediaUrl': mediaUrl,
    'mediaType': mediaType,
    'priority': priority,
    'startsAt': startsAt.toIso8601String(),
    'endsAt': endsAt?.toIso8601String(),
  };
}
