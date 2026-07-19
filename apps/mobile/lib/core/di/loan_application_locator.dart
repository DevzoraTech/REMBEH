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
  late final GetLoanApplicationUseCase getById =
      GetLoanApplicationUseCase(repository);

  Future<({List<LoanRateOption> rates, List<LoanPeriodOption> periods})>
      loadLoanProducts() async {
    final payload = await apiDatasource.listLoanProducts();
    final rates = ((payload['rates'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .map(
          (item) => LoanRateOption(
            id: item['id'] as String,
            label: item['label'] as String? ?? '',
            interestRatePercent:
                (item['interestRatePercent'] as num?)?.toDouble() ?? 0,
          ),
        )
        .toList();
    final periods = ((payload['periods'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .map(
          (item) => LoanPeriodOption(
            id: item['id'] as String,
            label: item['label'] as String? ?? '',
            durationDays: (item['durationDays'] as num?)?.toInt() ?? 0,
          ),
        )
        .toList();
    return (rates: rates, periods: periods);
  }
}

class LoanRateOption {
  const LoanRateOption({
    required this.id,
    required this.label,
    required this.interestRatePercent,
  });

  final String id;
  final String label;
  final double interestRatePercent;
}

class LoanPeriodOption {
  const LoanPeriodOption({
    required this.id,
    required this.label,
    required this.durationDays,
  });

  final String id;
  final String label;
  final int durationDays;
}
