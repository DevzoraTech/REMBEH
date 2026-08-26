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
    this.mediaUrl,
    this.mediaType = 'NONE',
  });

  final String id;
  final String title;
  final String body;
  final String? ctaLabel;
  final String? ctaUrl;
  final String? mediaUrl;
  final String mediaType;
  final int priority;
  final DateTime startsAt;
  final DateTime? endsAt;

  bool get isExpired {
    final end = endsAt;
    return end != null && DateTime.now().isAfter(end);
  }

  factory MobileMarketingCampaign.fromJson(Map<String, dynamic> json) {
    return MobileMarketingCampaign(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      ctaLabel: json['ctaLabel'] as String?,
      ctaUrl: json['ctaUrl'] as String?,
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
    'mediaUrl': mediaUrl,
    'mediaType': mediaType,
    'priority': priority,
    'startsAt': startsAt.toIso8601String(),
    'endsAt': endsAt?.toIso8601String(),
  };
}
