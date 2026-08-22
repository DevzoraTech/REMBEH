class AgentActivityApplication {
  const AgentActivityApplication({
    required this.id,
    required this.clientName,
    required this.principalAmount,
    required this.status,
    required this.submittedAt,
    this.customerId,
    this.phone,
    this.loanId,
  });

  final String id;
  final String? customerId;
  final String clientName;
  final String? phone;
  final num principalAmount;
  final String status;
  final DateTime submittedAt;
  final String? loanId;
}

class AgentActivityCollection {
  const AgentActivityCollection({
    required this.id,
    required this.loanId,
    required this.customerId,
    required this.clientName,
    required this.amount,
    required this.method,
    required this.paidAt,
    this.phone,
    this.note,
  });

  final String id;
  final String loanId;
  final String customerId;
  final String clientName;
  final String? phone;
  final num amount;
  final String method;
  final String? note;
  final DateTime paidAt;
}

class AgentOtherActivity {
  const AgentOtherActivity({
    required this.id,
    required this.type,
    required this.title,
    required this.detail,
    required this.occurredAt,
  });

  final String id;
  final String type;
  final String title;
  final String detail;
  final DateTime occurredAt;
}

class AgentActivity {
  const AgentActivity({
    required this.date,
    required this.range,
    required this.applications,
    required this.collections,
    required this.otherActivity,
  });

  final String date;
  final String range;

  final List<AgentActivityApplication> applications;
  final List<AgentActivityCollection> collections;
  final List<AgentOtherActivity> otherActivity;

  bool get isEmpty =>
      applications.isEmpty && collections.isEmpty && otherActivity.isEmpty;
}
