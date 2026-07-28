/// Group items by local calendar day for chronological list UIs.

class DateGroup<T> {
  const DateGroup({
    required this.key,
    required this.label,
    required this.items,
  });

  final String key;
  final String label;
  final List<T> items;
}

DateTime _startOfDay(DateTime value) =>
    DateTime(value.year, value.month, value.day);

String _dayKey(DateTime value) {
  final m = value.month.toString().padLeft(2, '0');
  final d = value.day.toString().padLeft(2, '0');
  return '${value.year}-$m-$d';
}

String dayGroupLabel(DateTime value, [DateTime? now]) {
  final day = _startOfDay(value.toLocal());
  final today = _startOfDay(now ?? DateTime.now());
  final yesterday = today.subtract(const Duration(days: 1));
  if (day == today) return 'Today';
  if (day == yesterday) return 'Yesterday';
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
  return '${day.day} ${months[day.month - 1]} ${day.year}';
}

List<DateGroup<T>> groupByLocalDate<T>(
  List<T> items,
  DateTime Function(T item) getDate, {
  bool newestFirst = true,
}) {
  final sorted = [...items]..sort((a, b) {
      final cmp = getDate(a).compareTo(getDate(b));
      return newestFirst ? -cmp : cmp;
    });

  final groups = <DateGroup<T>>[];
  final indexByKey = <String, int>{};

  for (final item in sorted) {
    final local = getDate(item).toLocal();
    final key = _dayKey(local);
    final existing = indexByKey[key];
    if (existing == null) {
      indexByKey[key] = groups.length;
      groups.add(
        DateGroup(
          key: key,
          label: dayGroupLabel(local),
          items: [item],
        ),
      );
    } else {
      groups[existing].items.add(item);
    }
  }

  return groups;
}
