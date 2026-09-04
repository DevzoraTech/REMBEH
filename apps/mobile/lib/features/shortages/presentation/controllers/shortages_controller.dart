import 'package:flutter/foundation.dart';

import '../../../../services/session_store.dart';
import '../../../../utils/friendly_errors.dart';
import '../../application/list_cash_shortages.dart';
import '../../data/mappers/cash_shortage_mapper.dart';
import '../../data/shortages_list_cache.dart';
import '../../domain/models/cash_shortage.dart';

enum ShortageListFilter { open, closed, all }

class ShortagesController extends ChangeNotifier {
  ShortagesController({required ListCashShortages listCashShortages})
    : _listCashShortages = listCashShortages;

  final ListCashShortages _listCashShortages;

  List<CashShortage> _shortages = const [];
  ShortageListFilter _filter = ShortageListFilter.open;
  bool _loading = false;
  bool _refreshing = false;
  String? _error;
  String? _notice;
  String? _activeCacheKey;

  List<CashShortage> get shortages => _shortages;

  ShortageListFilter get filter => _filter;

  bool get isLoading => _loading;

  /// Background refresh while cached rows are already on screen.
  bool get isRefreshing => _refreshing;

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
    bool forceNetwork = false,
  }) async {
    if (_loading || _refreshing) {
      return;
    }

    final cacheKey = ShortagesListCache.key(
      tenantId: (session.tenantId ?? 'tenant').trim(),
      branchId: (branchId ?? session.branchId ?? '').trim(),
      userId: userId,
    );
    _activeCacheKey = cacheKey;

    // Paint from memory/disk first so the screen never waits on the server.
    if (_shortages.isEmpty) {
      final cachedRows = await ShortagesListCache.instance.read(cacheKey);
      if (cachedRows != null && cachedRows.isNotEmpty) {
        _shortages = CashShortageMapper.listFromJson(cachedRows);
        _error = null;
        notifyListeners();
      }
    }

    final hasRows = _shortages.isNotEmpty;
    final cacheFresh =
        !forceNetwork && ShortagesListCache.instance.isFresh(cacheKey);

    if (hasRows && cacheFresh && !forceNetwork) {
      // Still soft-refresh in the background when the soft TTL is stale.
      final savedAt = await ShortagesListCache.instance.savedAt(cacheKey);
      final age = savedAt == null
          ? ShortagesListCache.softTtl
          : DateTime.now().toUtc().difference(savedAt);
      if (age <= ShortagesListCache.softTtl) {
        return;
      }
    }

    final showBlockingSpinner = !quiet && !hasRows;
    if (showBlockingSpinner) {
      _loading = true;
      _notice = null;
      _error = null;
      notifyListeners();
    } else {
      _refreshing = true;
      if (!quiet) {
        _error = null;
      }
      notifyListeners();
    }

    try {
      final rows = await _listCashShortages(
        session: session,
        branchId: branchId,
        userId: userId,
      );
      _shortages = rows;
      _error = null;

      // Persist raw JSON via a second lightweight fetch path is avoided —
      // re-map through the API client cache write in the use-case layer.
      await _persistMapped(cacheKey, rows);
    } catch (error) {
      if (_shortages.isEmpty) {
        _error = friendlyErrorMessage(error);
      } else {
        // Keep cached rows; surface a soft notice only on forced refresh.
        if (forceNetwork) {
          _notice = friendlyErrorMessage(error);
        }
      }
    } finally {
      _loading = false;
      _refreshing = false;
      notifyListeners();
    }
  }

  Future<void> invalidateActiveCache() async {
    final key = _activeCacheKey;
    if (key == null) return;
    await ShortagesListCache.instance.invalidate(key);
  }

  Future<void> _persistMapped(
    String cacheKey,
    List<CashShortage> rows,
  ) async {
    // Store a JSON-friendly snapshot for the next cold open.
    final payload = rows
        .map(
          (row) => <String, dynamic>{
            'id': row.id,
            'branchId': row.branchId,
            'branchName': row.branchName,
            'responsibleUserId': row.responsibleUserId,
            'responsibleName': row.responsibleName,
            'responsiblePublicId': row.responsiblePublicId,
            'responsiblePhotoUrl': row.responsiblePhotoUrl,
            'createdByName': row.createdByName,
            'sourceType': row.sourceType,
            'sourceId': row.sourceId,
            'reason': row.reason,
            'operationDate': row.operationDate?.toIso8601String(),
            'amountOriginal': row.amountOriginal,
            'amountOutstanding': row.amountOutstanding,
            'amountPaid': row.amountPaid,
            'status': row.status,
            'notes': row.notes,
            'createdAt': row.createdAt?.toIso8601String(),
            'clearedAt': row.clearedAt?.toIso8601String(),
            'payments': row.payments
                .map(
                  (payment) => <String, dynamic>{
                    'id': payment.id,
                    'amount': payment.amount,
                    'method': payment.method,
                    'notes': payment.notes,
                    'paidAt': payment.paidAt?.toIso8601String(),
                    'recordedByName': payment.recordedByName,
                  },
                )
                .toList(),
          },
        )
        .toList(growable: false);

    await ShortagesListCache.instance.write(cacheKey, payload);
  }
}
