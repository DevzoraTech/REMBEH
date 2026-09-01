class AgentFloatPosition {
  const AgentFloatPosition({
    required this.id,
    required this.name,
    required this.remainingFloat,
    required this.floatAllocated,
    required this.loansIssued,
    required this.repaymentsCollected,
    required this.processingFees,
    required this.expectedHandover,
    this.phone,
    this.roleName,
    this.photoUrl,
    this.publicId,
  });

  final String id;
  final String name;
  final String? phone;
  final String? roleName;
  final String? photoUrl;
  final String? publicId;
  final num remainingFloat;
  final num floatAllocated;
  final num loansIssued;
  final num repaymentsCollected;
  final num processingFees;
  final num expectedHandover;

  bool get isActiveToday =>
      floatAllocated > 0 ||
      loansIssued > 0 ||
      repaymentsCollected > 0 ||
      processingFees > 0 ||
      expectedHandover > 0;

  bool get isManager => (roleName ?? '').toLowerCase().contains('manager');

  bool get isCashier => (roleName ?? '').toLowerCase().contains('cashier');

  String get staffLabel {
    if (isManager) return 'Manager';
    if (isCashier) return 'Cashier';
    return 'Field Officer';
  }

  String get displaySurname => fieldOfficerSurname(name);
}

String fieldOfficerSurname(String fullName) {
  final parts = fullName
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.trim().isNotEmpty)
      .where((part) {
        final normalized = part.toLowerCase();
        return normalized != 'field' &&
            normalized != 'officer' &&
            normalized != 'branch' &&
            normalized != 'manager' &&
            normalized != 'cashier';
      })
      .toList(growable: false);

  if (parts.isEmpty) {
    return 'Officer';
  }

  if (parts.length == 1) {
    return parts.first;
  }

  return parts.last;
}
