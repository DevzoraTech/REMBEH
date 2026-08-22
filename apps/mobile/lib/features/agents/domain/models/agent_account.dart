class AgentDevice {
  const AgentDevice({
    required this.id,
    required this.deviceName,
    required this.deviceType,
    required this.lastUsedAt,
    required this.status,
    required this.canRemove,
    this.platform,
  });

  final String id;
  final String deviceName;
  final String deviceType;
  final String? platform;
  final DateTime lastUsedAt;
  final String status;
  final bool canRemove;
}

class AgentAccessHistoryItem {
  const AgentAccessHistoryItem({
    required this.id,
    required this.type,
    required this.title,
    required this.detail,
    required this.occurredAt,
    required this.actorName,
  });

  final String id;
  final String type;
  final String title;
  final String detail;
  final DateTime occurredAt;
  final String actorName;
}

class AgentAccount {
  const AgentAccount({required this.devices, required this.accessHistory});

  final List<AgentDevice> devices;
  final List<AgentAccessHistoryItem> accessHistory;
}
