class LoanApplicationDraft {
  // Step 1 — basic
  String surname = '';
  String givenNames = '';
  String phone = '';
  String nationalId = '';
  bool verified = false;
  String? verificationCode;
  DateTime? verifiedAt;
  String? verifyError;

  String? district;
  String? subCounty;
  String? parish;
  String? village;

  // Step 2 — identity photos
  bool passportCaptured = false;
  bool ninFrontCaptured = false;
  bool ninBackCaptured = false;

  // Step 3 — loan details
  String principalAmount = '';
  String? interestRate;
  String? loanDurationDays;
  String processingFee = '';
  String? collateralType;

  // Step 4 — guarantor
  String guarantorName = '';
  String guarantorPhone = '';
  bool guarantorNinFrontCaptured = false;
  bool guarantorNinBackCaptured = false;

  // Step 5 — security docs
  bool collateralDocUploaded = false;
  bool supportingDocUploaded = false;
  bool otherDocUploaded = false;
  String collateralDocName = '';
  String supportingDocName = '';
  String otherDocName = '';

  // Step 6 — signatures
  bool applicantSigned = false;
  bool guarantorSigned = false;
  bool officerSigned = false;
  bool termsConfirmed = false;

  String get fullName {
    final parts = [givenNames.trim(), surname.trim()]
        .where((part) => part.isNotEmpty)
        .toList();
    return parts.join(' ');
  }

  bool get hasProgress =>
      surname.isNotEmpty ||
      givenNames.isNotEmpty ||
      phone.isNotEmpty ||
      nationalId.isNotEmpty ||
      verified;
}
