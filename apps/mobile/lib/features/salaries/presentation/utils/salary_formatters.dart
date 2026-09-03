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
  final local = date.toLocal();
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
  return '${local.day.toString().padLeft(2, '0')} ${months[local.month - 1]} ${local.year}';
}

String salaryDateShort(DateTime? date) {
  if (date == null) return '-';
  final local = date.toLocal();
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
  return '${local.day.toString().padLeft(2, '0')} ${months[local.month - 1]}';
}

String salaryTime(DateTime? date) {
  if (date == null) return '-';
  final local = date.toLocal();
  final hour = local.hour == 0
      ? 12
      : local.hour > 12
      ? local.hour - 12
      : local.hour;
  final minute = local.minute.toString().padLeft(2, '0');
  final suffix = local.hour >= 12 ? 'PM' : 'AM';
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

String salaryRoleLabel(String? roleName) {
  final clean = roleName?.trim();
  if (clean == null || clean.isEmpty) {
    return 'Employee';
  }

  final normalized = clean.toLowerCase();
  if (normalized == 'agent' ||
      normalized == 'field agent' ||
      normalized == 'loan officer' ||
      normalized == 'recovery officer') {
    return 'Field Officer';
  }

  return clean;
}
