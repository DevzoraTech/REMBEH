import 'dart:typed_data';

import '../entities/loan_application.dart';
import '../entities/signature_capture.dart';

abstract class LoanApplicationRepository {
  Future<LoanApplication> createDraft();

  Future<LoanApplication> getById(String id);

  Future<LoanApplication> updateStep({
    required String id,
    required Map<String, dynamic> payload,
  });

  Future<LoanApplication> verifyApplicant({
    required String id,
    required String surname,
    required String givenNames,
    required String phone,
    required String nationalId,
    required String gender,
    required String dateOfBirth,
  });

  Future<LoanApplication> uploadMedia({
    required String id,
    required String mediaType,
    required Uint8List bytes,
    required String mimeType,
    String? fileName,
  });

  Future<LoanApplication> uploadSignature({
    required String id,
    required String signerRole,
    required SignatureCaptureResult capture,
    bool createNewVersion = false,
  });

  Future<LoanApplication> submit(String id);

  Future<List<LoanApplicationListItem>> listApplications();
}
