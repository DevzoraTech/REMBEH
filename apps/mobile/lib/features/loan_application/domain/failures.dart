class LoanApplicationFailure implements Exception {
  LoanApplicationFailure(this.message);
  final String message;

  @override
  String toString() => message;
}
