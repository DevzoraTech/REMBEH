import '../../domain/models/agent_detail.dart';
import '../../domain/models/agent_summary.dart';
import '../../domain/models/agents_overview.dart';
import '../../domain/models/agent_account.dart';
import '../../domain/models/agent_activity.dart';

class AgentMapper {
  const AgentMapper._();

  static AgentsOverview overviewFromResponse(Map<String, dynamic> response) {
    final rawAgents = response['agents'];

    final agents = rawAgents is List
        ? rawAgents
              .map(_map)
              .where((row) => row.isNotEmpty)
              .map(summaryFromJson)
              .toList()
        : <AgentSummary>[];

    final counts = _map(response['counts']);

    return AgentsOverview(
      agents: agents,
      counts: AgentCounts(
        total: _int(counts['total']),
        active: _int(counts['active']),
        suspended: _int(counts['suspended']),
        inactive: _int(counts['inactive']),
      ),
    );
  }

  static AgentSummary summaryFromJson(Map<String, dynamic> json) {
    return AgentSummary(
      id: _string(json['id']) ?? '',
      publicId: _string(json['publicId']),
      name: _string(json['name']) ?? 'Agent',
      email: _string(json['email']) ?? '',
      phone: _string(json['phone']),
      status: _string(json['status']) ?? 'INACTIVE',
      roleName: _string(json['roleName']),
      branchId: _string(json['branchId']),
      branchName: _string(json['branchName']),
      photoUrl: _string(json['photoUrl']),
      createdAt:
          _date(json['createdAt']) ??
          DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      lastActiveAt: _date(json['lastActiveAt']),
      collectionsToday: _int(json['collectionsToday']),
      collectionsLifetime: _int(json['collectionsLifetime']),
      applicationsToday: _int(json['applicationsToday']),
      applicationsLifetime: _int(json['applicationsLifetime']),
      amountCollectedLifetime: _num(json['amountCollectedLifetime']),
      amountDisbursedLifetime: _num(json['amountDisbursedLifetime']),
      amountCollectedToday: _num(json['amountCollectedToday']),
      amountDisbursedToday: _num(json['amountDisbursedToday']),
      floatToday: _nullableNum(json['floatToday']),
    );
  }

  static AgentDetail detailFromResponse(Map<String, dynamic> response) {
    return detailFromJson(_map(response['agent']));
  }

  static AgentDetail detailFromJson(Map<String, dynamic> json) {
    final accountability = _map(json['accountability']);

    final floatJson = json['float'] == null ? null : _map(json['float']);

    return AgentDetail(
      id: _string(json['id']) ?? '',
      publicId: _string(json['publicId']),
      name: _string(json['name']) ?? 'Agent',
      email: _string(json['email']) ?? '',
      phone: _string(json['phone']),
      status: _string(json['status']) ?? 'INACTIVE',
      roleName: _string(json['roleName']),
      branchId: _string(json['branchId']),
      branchName: _string(json['branchName']),
      photoUrl: _string(json['photoUrl']),
      createdAt:
          _date(json['createdAt']) ??
          DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      lastSignInAt: _date(json['lastSignInAt']),
      lastActiveAt: _date(json['lastActiveAt']),
      accountability: AgentAccountability(
        date: _string(accountability['date']) ?? '',
        amountGiven: _num(accountability['amountGiven']),
        amountDisbursed: _num(accountability['amountDisbursed']),
        amountCollected: _num(accountability['amountCollected']),
        expectedCash: _num(accountability['expectedCash']),
        formula: _string(accountability['formula']) ?? '',
      ),
      float: floatJson == null || floatJson.isEmpty
          ? null
          : AgentDailyFloat(
              id: _string(floatJson['id']) ?? '',
              agentId: _string(floatJson['agentId']) ?? '',
              floatDate: _string(floatJson['floatDate']) ?? '',
              amountGiven: _num(floatJson['amountGiven']),
              notes: _string(floatJson['notes']),
              recordedByName: _string(floatJson['recordedByName']) ?? 'Unknown',
              recordedAt:
                  _date(floatJson['recordedAt']) ??
                  DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
            ),
      collectionsToday: _int(json['collectionsToday']),
      collectionsLifetime: _int(json['collectionsLifetime']),
      applicationsToday: _int(json['applicationsToday']),
      applicationsLifetime: _int(json['applicationsLifetime']),
      amountCollectedLifetime: _num(json['amountCollectedLifetime']),
      amountDisbursedLifetime: _num(json['amountDisbursedLifetime']),
    );
  }

  static AgentActivity activityFromResponse(Map<String, dynamic> response) {
    return AgentActivity(
      date: _string(response['date']) ?? '',
      range: _string(response['range']) ?? 'today',
      applications: _list(response['applications'])
          .map(
            (row) => AgentActivityApplication(
              id: _string(row['id']) ?? '',
              customerId: _string(row['customerId']),
              clientName: _string(row['clientName']) ?? 'Client',
              phone: _string(row['phone']),
              principalAmount: _num(row['principalAmount']),
              status: _string(row['status']) ?? '',
              submittedAt:
                  _date(row['submittedAt']) ??
                  DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
              loanId: _string(row['loanId']),
            ),
          )
          .toList(),
      collections: _list(response['collections'])
          .map(
            (row) => AgentActivityCollection(
              id: _string(row['id']) ?? '',
              loanId: _string(row['loanId']) ?? '',
              customerId: _string(row['customerId']) ?? '',
              clientName: _string(row['clientName']) ?? 'Client',
              phone: _string(row['phone']),
              amount: _num(row['amount']),
              method: _string(row['method']) ?? '',
              note: _string(row['note']),
              paidAt:
                  _date(row['paidAt']) ??
                  DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
            ),
          )
          .toList(),
      otherActivity: _list(response['otherActivity'])
          .map(
            (row) => AgentOtherActivity(
              id: _string(row['id']) ?? '',
              type: _string(row['type']) ?? '',
              title: _string(row['title']) ?? '',
              detail: _string(row['detail']) ?? '',
              occurredAt:
                  _date(row['occurredAt']) ??
                  DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
            ),
          )
          .toList(),
    );
  }

  static AgentAccount accountFromResponse(Map<String, dynamic> response) {
    return AgentAccount(
      devices: _list(response['devices'])
          .map(
            (row) => AgentDevice(
              id: _string(row['id']) ?? '',
              deviceName: _string(row['deviceName']) ?? 'Device',
              deviceType: _string(row['deviceType']) ?? '',
              platform: _string(row['platform']),
              lastUsedAt:
                  _date(row['lastUsedAt']) ??
                  DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
              status: _string(row['status']) ?? 'ACTIVE',
              canRemove: row['canRemove'] == true,
            ),
          )
          .toList(),
      accessHistory: _list(response['accessHistory'])
          .map(
            (row) => AgentAccessHistoryItem(
              id: _string(row['id']) ?? '',
              type: _string(row['type']) ?? '',
              title: _string(row['title']) ?? '',
              detail: _string(row['detail']) ?? '',
              occurredAt:
                  _date(row['occurredAt']) ??
                  DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
              actorName: _string(row['actorName']) ?? 'System',
            ),
          )
          .toList(),
    );
  }

  static List<Map<String, dynamic>> _list(Object? value) {
    if (value is! List) {
      return const [];
    }

    return value.map(_map).where((row) => row.isNotEmpty).toList();
  }

  static Map<String, dynamic> _map(Object? value) {
    if (value is Map<String, dynamic>) {
      return value;
    }

    if (value is Map) {
      return value.map((key, value) => MapEntry(key.toString(), value));
    }

    return const {};
  }

  static String? _string(Object? value) {
    if (value == null) {
      return null;
    }

    final text = value.toString().trim();

    return text.isEmpty ? null : text;
  }

  static num _num(Object? value) {
    return _nullableNum(value) ?? 0;
  }

  static num? _nullableNum(Object? value) {
    if (value is num) {
      return value;
    }

    if (value is String) {
      return num.tryParse(value);
    }

    return null;
  }

  static int _int(Object? value) {
    if (value is int) {
      return value;
    }

    if (value is num) {
      return value.toInt();
    }

    if (value is String) {
      return int.tryParse(value) ?? 0;
    }

    return 0;
  }

  static DateTime? _date(Object? value) {
    final raw = _string(value);

    if (raw == null) {
      return null;
    }

    return DateTime.tryParse(raw);
  }
}
