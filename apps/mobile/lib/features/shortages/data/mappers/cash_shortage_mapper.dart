import '../../domain/models/cash_shortage.dart';

class CashShortageMapper {
  const CashShortageMapper._();

  static CashShortage fromJson(Map<String, dynamic> json) {
    return CashShortage(
      id: _string(json['id']) ?? '',
      branchId: _string(json['branchId']),
      branchName: _string(json['branchName']),
      responsibleUserId: _string(json['responsibleUserId']),
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
