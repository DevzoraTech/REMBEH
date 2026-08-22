import '../../../../utils/money.dart';
import '../../domain/models/cash_shortage.dart';

String shortageMoney(Object? value) {
  final amount = value is num ? value : 0;
  return 'UGX ${formatMoney(amount)}';
}

num parseShortageMoney(String value) {
  final cleaned = value.replaceAll(RegExp(r'[^0-9.]'), '');
  return num.tryParse(cleaned) ?? 0;
}

String shortageSourceLabel(String? value) {
  final source = (value ?? 'SHORTAGE').trim().toUpperCase();

  return switch (source) {
    'AGENT_BALANCING' => 'Agent balancing',
    'CASH_VARIANCE' => 'Cash variance',
    'BRANCH_CASH' => 'Cash variance',
    _ =>
      source
          .toLowerCase()
          .split('_')
          .map(
            (word) => word.isEmpty
                ? word
                : '${word[0].toUpperCase()}${word.substring(1)}',
          )
          .join(' '),
  };
}

String shortageReason(CashShortage shortage) {
  return shortage.reason ??
      shortage.notes ??
      'Cash handed over was less than expected.';
}

String shortageTitle(CashShortage shortage) {
  return shortage.responsibleName ?? shortage.branchName ?? 'Branch cash';
}

String shortageDateLabel(DateTime? value) {
  if (value == null) {
    return 'Unknown date';
  }

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

  final local = value.toLocal();
  return '${local.day.toString().padLeft(2, '0')} '
      '${months[local.month - 1]} '
      '${local.year}';
}

String shortageShortDateTime(DateTime? value) {
  if (value == null) {
    return 'Unknown time';
  }

  final local = value.toLocal();
  final hour = local.hour == 0
      ? 12
      : local.hour > 12
      ? local.hour - 12
      : local.hour;
  final minute = local.minute.toString().padLeft(2, '0');
  final period = local.hour >= 12 ? 'PM' : 'AM';

  return '${shortageDateLabel(local)} '
      '$hour:$minute $period';
}

String shortageInitials(String value) {
  final words = value
      .trim()
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .toList();

  if (words.isEmpty) {
    return 'BC';
  }

  if (words.length == 1) {
    final word = words.first;
    return word.substring(0, word.length > 2 ? 2 : word.length).toUpperCase();
  }

  return '${words.first[0]}${words.last[0]}'.toUpperCase();
}
