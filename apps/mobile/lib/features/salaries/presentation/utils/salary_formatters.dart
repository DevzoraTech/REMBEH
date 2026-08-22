String salaryMoney(num value) {
  final rounded = value.round();
  final raw = rounded.toString();
  final buffer = StringBuffer();
  for (var index = 0; index < raw.length; index += 1) {
    final remaining = raw.length - index;
    buffer.write(raw[index]);
    if (remaining > 1 && remaining % 3 == 1) {
      buffer.write(',');
    }
  }
  return 'UGX ${buffer.toString()}';
}

String salaryDate(DateTime? date) {
  if (date == null) return '-';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${date.day.toString().padLeft(2, '0')} ${months[date.month - 1]} ${date.year}';
}

String salaryDateShort(DateTime? date) {
  if (date == null) return '-';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${date.day.toString().padLeft(2, '0')} ${months[date.month - 1]}';
}

String salaryTime(DateTime? date) {
  if (date == null) return '-';
  final hour = date.hour == 0
      ? 12
      : date.hour > 12
      ? date.hour - 12
      : date.hour;
  final minute = date.minute.toString().padLeft(2, '0');
  final suffix = date.hour >= 12 ? 'PM' : 'AM';
  return '$hour:$minute $suffix';
}

String paymentMethodLabel(String? method) {
  return switch ((method ?? '').toUpperCase()) {
    'MOBILE_MONEY' => 'Mobile Money',
    'BANK_TRANSFER' => 'Bank transfer',
    'OTHER' => 'Other',
    _ => 'Cash',
  };
}

String paymentStatusLabel(String status) {
  return switch (status.toUpperCase()) {
    'PAID' => 'Paid',
    'PARTIAL' => 'Partially paid',
    _ => 'Unpaid',
  };
}
