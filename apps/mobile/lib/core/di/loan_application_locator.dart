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

  Future<
      ({
        List<LoanProductTemplateOption> templates,
        List<LoanRateOption> rates,
        List<LoanPeriodOption> periods,
      })> loadLoanProducts() async {
    final payload = await apiDatasource.listLoanProducts();
    final templates = ((payload['templates'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .where((item) => item['isActive'] != false)
        .map(LoanProductTemplateOption.fromJson)
        .toList();
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
    return (templates: templates, rates: rates, periods: periods);
  }
}

class LoanProductTemplateOption {
  const LoanProductTemplateOption({
    required this.id,
    required this.name,
    required this.interestRatePercent,
    required this.interestType,
    required this.termValue,
    required this.termUnit,
    required this.durationDays,
    required this.repaymentFrequency,
    required this.processingFeePercent,
    required this.penaltyRatePercent,
    required this.finePeriodDays,
    required this.paymentStartPolicy,
    this.paymentStartDelayDays,
    this.allowAgentDatePick = false,
    this.minLoanAmount,
    this.maxLoanAmount,
    this.description,
  });

  final String id;
  final String name;
  final double interestRatePercent;
  final String interestType;
  final int termValue;
  final String termUnit;
  final int durationDays;
  final String repaymentFrequency;
  final double processingFeePercent;
  final double penaltyRatePercent;
  final int finePeriodDays;
  final String paymentStartPolicy;
  final int? paymentStartDelayDays;
  final bool allowAgentDatePick;
  final double? minLoanAmount;
  final double? maxLoanAmount;
  final String? description;

  String get termLabel {
    switch (termUnit) {
      case 'WEEKS':
        return '$termValue ${termValue == 1 ? 'week' : 'weeks'} ($durationDays days)';
      case 'MONTHS':
        return '$termValue ${termValue == 1 ? 'month' : 'months'} ($durationDays days)';
      case 'YEARS':
        return '$termValue ${termValue == 1 ? 'year' : 'years'} ($durationDays days)';
      default:
        return '$termValue ${termValue == 1 ? 'day' : 'days'}';
    }
  }

  String get repaymentLabel {
    switch (repaymentFrequency) {
      case 'WEEKLY':
        return 'Weekly';
      case 'BIWEEKLY':
        return 'Bi-weekly';
      case 'MONTHLY':
        return 'Monthly';
      case 'LUMP_SUM':
        return 'Lump sum';
      default:
        return 'Daily';
    }
  }

  String get interestTypeLabel {
    switch (interestType) {
      case 'REDUCING_BALANCE':
        return 'Reducing balance';
      case 'COMPOUND':
        return 'Compound';
      default:
        return 'Flat';
    }
  }

  String get paymentStartLabel {
    switch (paymentStartPolicy) {
      case 'SAME_DAY':
        return 'Same day as go-live';
      case 'AFTER_N_DAYS':
        final days = paymentStartDelayDays ?? 1;
        return 'After $days ${days == 1 ? 'day' : 'days'}';
      default:
        return 'Next day after go-live';
    }
  }

  /// Provisional payment start date from today (agent preview before submit).
  DateTime computePaymentStartDate([DateTime? anchor]) {
    final start = DateTime(
      (anchor ?? DateTime.now()).year,
      (anchor ?? DateTime.now()).month,
      (anchor ?? DateTime.now()).day,
    );
    switch (paymentStartPolicy) {
      case 'SAME_DAY':
        return start;
      case 'AFTER_N_DAYS':
        return start.add(Duration(days: paymentStartDelayDays ?? 1));
      default:
        return start.add(const Duration(days: 1));
    }
  }

  factory LoanProductTemplateOption.fromJson(Map<String, dynamic> json) {
    return LoanProductTemplateOption(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      interestRatePercent:
          (json['interestRatePercent'] as num?)?.toDouble() ?? 0,
      interestType: json['interestType'] as String? ?? 'FLAT',
      termValue: (json['termValue'] as num?)?.toInt() ?? 0,
      termUnit: json['termUnit'] as String? ?? 'DAYS',
      durationDays: (json['durationDays'] as num?)?.toInt() ?? 0,
      repaymentFrequency: json['repaymentFrequency'] as String? ?? 'DAILY',
      processingFeePercent:
          (json['processingFeePercent'] as num?)?.toDouble() ?? 0,
      penaltyRatePercent:
          (json['penaltyRatePercent'] as num?)?.toDouble() ?? 0,
      finePeriodDays: (json['finePeriodDays'] as num?)?.toInt() ?? 10,
      paymentStartPolicy: json['paymentStartPolicy'] as String? ?? 'NEXT_DAY',
      paymentStartDelayDays: (json['paymentStartDelayDays'] as num?)?.toInt(),
      allowAgentDatePick: json['allowAgentDatePick'] as bool? ?? false,
      minLoanAmount: (json['minLoanAmount'] as num?)?.toDouble(),
      maxLoanAmount: (json['maxLoanAmount'] as num?)?.toDouble(),
      description: json['description'] as String?,
    );
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
