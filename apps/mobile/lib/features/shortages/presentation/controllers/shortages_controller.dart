import 'package:flutter/foundation.dart';

import '../../../../services/session_store.dart';
import '../../../../utils/friendly_errors.dart';
import '../../application/list_cash_shortages.dart';
import '../../domain/models/cash_shortage.dart';

enum ShortageListFilter { open, closed, all }

class ShortagesController extends ChangeNotifier {
  ShortagesController({required ListCashShortages listCashShortages})
    : _listCashShortages = listCashShortages;

  final ListCashShortages _listCashShortages;

  List<CashShortage> _shortages = const [];
  ShortageListFilter _filter = ShortageListFilter.open;
  bool _loading = false;
  String? _error;
  String? _notice;

  List<CashShortage> get shortages => _shortages;

  ShortageListFilter get filter => _filter;

  bool get isLoading => _loading;

  String? get error => _error;

  String? get notice => _notice;

  int get openCount => _shortages.where((shortage) => shortage.isOpen).length;

  num get openAmount => _shortages
      .where((shortage) => shortage.isOpen)
      .fold<num>(0, (sum, shortage) => sum + shortage.amountOutstanding);

  List<ShortageEmployeeOption> get employeesWithOpenShortages {
    final byUser = <String, ShortageEmployeeOption>{};

    for (final shortage in _shortages.where((row) => row.isOpen)) {
      final userId = shortage.responsibleUserId;
      if (userId == null || userId.isEmpty) {
        continue;
      }

      final existing = byUser[userId];
      byUser[userId] = ShortageEmployeeOption(
        userId: userId,
        name: shortage.responsibleName ?? existing?.name ?? 'Employee',
        outstanding:
            (existing?.outstanding ?? 0) + shortage.amountOutstanding,
      );
    }

    final rows = byUser.values.toList();
    rows.sort(
      (left, right) =>
          left.name.toLowerCase().compareTo(right.name.toLowerCase()),
    );
    return rows;
  }

  List<CashShortage> get visibleShortages {
    final rows = switch (_filter) {
      ShortageListFilter.open => _shortages.where((row) => row.isOpen),
      ShortageListFilter.closed => _shortages.where((row) => row.isClosed),
      ShortageListFilter.all => _shortages,
    };

    final sorted = rows.toList();
    sorted.sort((left, right) {
      final a =
          left.operationDate ??
          left.createdAt ??
          DateTime.fromMillisecondsSinceEpoch(0);
      final b =
          right.operationDate ??
          right.createdAt ??
          DateTime.fromMillisecondsSinceEpoch(0);

      return b.compareTo(a);
    });

    return sorted;
  }

  void seed(List<CashShortage> rows) {
    _shortages = rows;
    notifyListeners();
  }

  void setFilter(ShortageListFilter filter) {
    if (_filter == filter) {
      return;
    }

    _filter = filter;
    notifyListeners();
  }

  void setNotice(String? message) {
    _notice = message;
    if (message != null) {
      _error = null;
    }
    notifyListeners();
  }

  Future<void> load({
    required RembehSession session,
    String? branchId,
    String? userId,
    bool quiet = false,
  }) async {
    if (_loading) {
      return;
    }

    _loading = true;
    if (!quiet) {
      _notice = null;
    }
    _error = null;
    notifyListeners();

    try {
      _shortages = await _listCashShortages(
        session: session,
        branchId: branchId,
        userId: userId,
      );
    } catch (error) {
      _error = friendlyErrorMessage(error);
    } finally {
      _loading = false;
      notifyListeners();
    }
  }
}
