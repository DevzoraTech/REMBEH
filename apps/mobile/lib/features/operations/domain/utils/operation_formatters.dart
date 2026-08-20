String operationInitials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();

  if (parts.isEmpty) {
    return 'A';
  }

  if (parts.length == 1) {
    final value = parts.first;

    return value
        .substring(
          0,
          value.length.clamp(0, 2),
        )
        .toUpperCase();
  }

  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}

String operationTime(DateTime? value) {
  if (value == null) {
    return '';
  }

  final local = value.toLocal();

  var hour = local.hour;

  final minute = local.minute.toString().padLeft(2, '0');
  final period = hour >= 12 ? 'PM' : 'AM';

  hour %= 12;

  if (hour == 0) {
    hour = 12;
  }

  return '$hour:$minute $period';
}

String operationDate(DateTime value) {
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

  return '${value.day} ${months[value.month - 1]} ${value.year}';
}