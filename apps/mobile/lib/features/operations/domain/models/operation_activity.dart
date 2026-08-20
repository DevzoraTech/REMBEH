class OperationActivity {
  const OperationActivity({
    required this.title,
    required this.description,
    required this.time,
    required this.amount,
    required this.isIncome,
  });

  final String title;
  final String description;
  final String time;
  final num amount;
  final bool isIncome;
}