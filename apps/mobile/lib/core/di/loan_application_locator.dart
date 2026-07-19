import '../../features/loan_application/application/loan_application_use_cases.dart';
import '../../features/loan_application/data/loan_application_api_datasource.dart';
import '../../features/loan_application/data/loan_application_repository_impl.dart';
import '../../features/loan_application/domain/repositories/loan_application_repository.dart';
import '../../services/session_store.dart';

class LoanApplicationLocator {
  LoanApplicationLocator._();

  static final LoanApplicationLocator instance = LoanApplicationLocator._();

  final SessionStore sessionStore = SessionStore();

  late final LoanApplicationApiDatasource apiDatasource =
      LoanApplicationApiDatasource(sessionStore);

  late final LoanApplicationRepository repository =
      LoanApplicationRepositoryImpl(apiDatasource);

  late final CreateLoanDraftUseCase createDraft =
      CreateLoanDraftUseCase(repository);
  late final VerifyApplicantUseCase verifyApplicant =
      VerifyApplicantUseCase(repository);
  late final SaveLoanStepUseCase saveStep = SaveLoanStepUseCase(repository);
  late final UploadLoanMediaUseCase uploadMedia =
      UploadLoanMediaUseCase(repository);
  late final UploadLoanSignatureUseCase uploadSignature =
      UploadLoanSignatureUseCase(repository);
  late final SubmitLoanApplicationUseCase submit =
      SubmitLoanApplicationUseCase(repository);
  late final ListLoanApplicationsUseCase listApplications =
      ListLoanApplicationsUseCase(repository);
}
