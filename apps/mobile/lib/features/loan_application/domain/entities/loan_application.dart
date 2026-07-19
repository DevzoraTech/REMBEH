class LoanApplicationMedia {
  const LoanApplicationMedia({
    required this.id,
    required this.type,
    required this.storageKey,
    required this.mimeType,
    required this.byteSize,
    this.fileName,
  });

  final String id;
  final String type;
  final String storageKey;
  final String mimeType;
  final int byteSize;
  final String? fileName;
}

class LoanApplicationSignatureSummary {
  const LoanApplicationSignatureSummary({
    required this.signerRole,
    required this.version,
    required this.locked,
    required this.signerName,
  });

  final String signerRole;
  final int version;
  final bool locked;
  final String signerName;
}

class LoanApplication {
  const LoanApplication({
    required this.id,
    required this.status,
    required this.synced,
    required this.mediaTypes,
    this.signatures = const [],
    this.surname,
    this.givenNames,
    this.phone,
    this.nationalId,
    this.district,
    this.subCounty,
    this.parish,
    this.village,
    this.principalAmount,
    this.interestRatePercent,
    this.durationDays,
    this.processingFee,
    this.collateralType,
    this.verificationCode,
    this.verifiedAt,
    this.termsConfirmedAt,
    this.guarantorName,
    this.guarantorPhone,
  });

  final String id;
  final String status;
  final bool synced;
  final Set<String> mediaTypes;
  final List<LoanApplicationSignatureSummary> signatures;
  final String? surname;
  final String? givenNames;
  final String? phone;
  final String? nationalId;
  final String? district;
  final String? subCounty;
  final String? parish;
  final String? village;
  final double? principalAmount;
  final double? interestRatePercent;
  final int? durationDays;
  final double? processingFee;
  final String? collateralType;
  final String? verificationCode;
  final DateTime? verifiedAt;
  final DateTime? termsConfirmedAt;
  final String? guarantorName;
  final String? guarantorPhone;

  bool get isVerified =>
      status == 'VERIFIED' || status == 'SUBMITTED' || verifiedAt != null;

  bool hasMedia(String type) => mediaTypes.contains(type);

  bool hasLockedSignature(String signerRole) {
    return signatures.any(
      (item) => item.signerRole == signerRole && item.locked,
    );
  }

  String get fullName {
    final parts = [givenNames, surname]
        .whereType<String>()
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty);
    return parts.join(' ');
  }
}

class LoanApplicationListItem {
  const LoanApplicationListItem({
    required this.id,
    required this.clientName,
    required this.phone,
    required this.amountRequested,
    required this.interestRatePercent,
    required this.registeredAt,
    required this.synced,
    required this.status,
  });

  final String id;
  final String clientName;
  final String phone;
  final int amountRequested;
  final int interestRatePercent;
  final DateTime registeredAt;
  final bool synced;
  final String status;
}
