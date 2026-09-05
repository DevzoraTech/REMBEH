import '../../domain/models/cash_shortage.dart';

class CashShortageMapper {
  const CashShortageMapper._();

  static CashShortage fromJson(Map<String, dynamic> json) {
    return CashShortage(
      id: _string(json['id']) ?? '',
      branchId: _string(json['branchId']),
      branchName: _string(json['branchName']),
      responsibleUserId: _string(json['responsibleUserId']),
      employeeId: _string(json['employeeId']),
      responsibleName:
          _string(json['responsibleName']) ??
          _string(json['responsibleUserName']) ??
          _string(json['personName']),
      responsiblePublicId: _string(json['responsiblePublicId']),
      responsiblePhotoUrl: _string(json['responsiblePhotoUrl']),
      createdByName: _string(json['createdByName']),
      sourceType: _string(json['sourceType']),
      sourceId: _string(json['sourceId']),
      reason: _string(json['reason']),
      operationDate: _date(json['operationDate']),
      amountOriginal: _number(json['amountOriginal'] ?? json['amount']),
      amountOutstanding: _number(
        json['amountOutstanding'] ?? json['amountOriginal'] ?? json['amount'],
      ),
      amountPaid: _number(json['amountPaid']),
      status: _string(json['status']) ?? 'OPEN',
      notes: _string(json['notes']),
      createdAt: _date(json['createdAt']),
      clearedAt: _date(json['clearedAt']),
      payments: _maps(json['payments']).map(paymentFromJson).toList(),
    );
  }

  static CashShortagePayment paymentFromJson(Map<String, dynamic> json) {
    return CashShortagePayment(
      id: _string(json['id']) ?? '',
      amount: _number(json['amount']),
      method: _string(json['method']) ?? 'CASH',
      notes: _string(json['notes']),
      paidAt: _date(json['paidAt']),
      recordedByName: _string(json['recordedByName']),
    );
  }

  static List<CashShortage> listFromJson(List<Map<String, dynamic>> rows) {
    return rows.map(fromJson).where((row) => row.id.isNotEmpty).toList();
  }

  static Map<String, dynamic> toCacheJson(CashShortage row) {
    return <String, dynamic>{
      'id': row.id,
      'branchId': row.branchId,
      'branchName': row.branchName,
      'responsibleUserId': row.responsibleUserId,
      'employeeId': row.employeeId,
      'responsibleName': row.responsibleName,
      'responsiblePublicId': row.responsiblePublicId,
      'responsiblePhotoUrl': row.responsiblePhotoUrl,
      'createdByName': row.createdByName,
      'sourceType': row.sourceType,
      'sourceId': row.sourceId,
      'reason': row.reason,
      'operationDate': row.operationDate?.toIso8601String(),
      'amountOriginal': row.amountOriginal,
      'amountOutstanding': row.amountOutstanding,
      'amountPaid': row.amountPaid,
      'status': row.status,
      'notes': row.notes,
      'createdAt': row.createdAt?.toIso8601String(),
      'clearedAt': row.clearedAt?.toIso8601String(),
      'payments': row.payments
          .map(
            (payment) => <String, dynamic>{
              'id': payment.id,
              'amount': payment.amount,
              'method': payment.method,
              'notes': payment.notes,
              'paidAt': payment.paidAt?.toIso8601String(),
              'recordedByName': payment.recordedByName,
            },
          )
          .toList(),
    };
  }
}

String? _string(Object? value) {
  if (value is! String) {
    return null;
  }

  final cleaned = value.trim();
  return cleaned.isEmpty ? null : cleaned;
}

num _number(Object? value) {
  if (value is num) {
    return value;
  }

  if (value is String) {
    return num.tryParse(value.replaceAll(',', '')) ?? 0;
  }

  return 0;
}

DateTime? _date(Object? value) {
  if (value is DateTime) {
    return value;
  }

  if (value is String) {
    return DateTime.tryParse(value);
  }

  return null;
}

List<Map<String, dynamic>> _maps(Object? value) {
  if (value is! List) {
    return const [];
  }

  return value
      .whereType<Map>()
      .map((row) => Map<String, dynamic>.from(row))
      .toList();
}
