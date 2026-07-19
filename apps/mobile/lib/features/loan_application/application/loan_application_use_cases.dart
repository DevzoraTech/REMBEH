import 'dart:typed_data';

import '../domain/entities/loan_application.dart';
import '../domain/entities/signature_capture.dart';
import '../domain/repositories/loan_application_repository.dart';

class CreateLoanDraftUseCase {
  CreateLoanDraftUseCase(this._repository);
  final LoanApplicationRepository _repository;
  Future<LoanApplication> call() => _repository.createDraft();
}

class VerifyApplicantUseCase {
  VerifyApplicantUseCase(this._repository);
  final LoanApplicationRepository _repository;

  Future<LoanApplication> call({
    required String id,
    required String surname,
    required String givenNames,
    required String phone,
    required String nationalId,
  }) {
    return _repository.verifyApplicant(
      id: id,
      surname: surname,
      givenNames: givenNames,
      phone: phone,
      nationalId: nationalId,
    );
  }
}

class SaveLoanStepUseCase {
  SaveLoanStepUseCase(this._repository);
  final LoanApplicationRepository _repository;

  Future<LoanApplication> call({
    required String id,
    required Map<String, dynamic> payload,
  }) {
    return _repository.updateStep(id: id, payload: payload);
  }
}

class UploadLoanMediaUseCase {
  UploadLoanMediaUseCase(this._repository);
  final LoanApplicationRepository _repository;

  Future<LoanApplication> call({
    required String id,
    required String mediaType,
    required Uint8List bytes,
    required String mimeType,
    String? fileName,
  }) {
    return _repository.uploadMedia(
      id: id,
      mediaType: mediaType,
      bytes: bytes,
      mimeType: mimeType,
      fileName: fileName,
    );
  }
}

class UploadLoanSignatureUseCase {
  UploadLoanSignatureUseCase(this._repository);
  final LoanApplicationRepository _repository;

  Future<LoanApplication> call({
    required String id,
    required String signerRole,
    required SignatureCaptureResult capture,
    bool createNewVersion = false,
  }) {
    return _repository.uploadSignature(
      id: id,
      signerRole: signerRole,
      capture: capture,
      createNewVersion: createNewVersion,
    );
  }
}

class SubmitLoanApplicationUseCase {
  SubmitLoanApplicationUseCase(this._repository);
  final LoanApplicationRepository _repository;
  Future<LoanApplication> call(String id) => _repository.submit(id);
}

class ListLoanApplicationsUseCase {
  ListLoanApplicationsUseCase(this._repository);
  final LoanApplicationRepository _repository;
  Future<List<LoanApplicationListItem>> call() =>
      _repository.listApplications();
}

class GetLoanApplicationUseCase {
  GetLoanApplicationUseCase(this._repository);
  final LoanApplicationRepository _repository;
  Future<LoanApplication> call(String id) => _repository.getById(id);
}
