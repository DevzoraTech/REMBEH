import '../../features/repayment/application/repayment_use_cases.dart';
import '../../features/repayment/data/repayment_api_datasource.dart';
import '../../features/repayment/data/repayment_repository_impl.dart';
import '../../features/repayment/domain/repositories/repayment_repository.dart';
import '../../services/session_store.dart';

class RepaymentLocator {
  RepaymentLocator._();

  static final RepaymentLocator instance = RepaymentLocator._();

  final SessionStore sessionStore = SessionStore();

  late final RepaymentApiDatasource apiDatasource =
      RepaymentApiDatasource(sessionStore);

  late final RepaymentRepository repository =
      RepaymentRepositoryImpl(apiDatasource);

  late final GetCollectionSummaryUseCase getSummary =
      GetCollectionSummaryUseCase(repository);
  late final ListRepaymentsUseCase listRepayments =
      ListRepaymentsUseCase(repository);
  late final SearchClientsUseCase searchClients =
      SearchClientsUseCase(repository);
  late final GetLoanDetailUseCase getLoanDetail =
      GetLoanDetailUseCase(repository);
  late final RecordRepaymentUseCase recordRepayment =
      RecordRepaymentUseCase(repository);
}
