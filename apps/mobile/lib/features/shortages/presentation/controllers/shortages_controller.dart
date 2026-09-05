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
  bool _pendingReload = false;
  int _loadGeneration = 0;
  String? _error;
  String? _notice;
  String? _activeCacheKey;
  RembehSession? _lastSession;
  String? _lastBranchId;
  String? _lastUserId;

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
    final byPerson = <String, ShortageEmployeeOption>{};

    for (final shortage in _shortages.where((row) => row.isOpen)) {
      final key = shortage.personKey;
      if (key == null) continue;

      final existing = byPerson[key];
      byPerson[key] = ShortageEmployeeOption(
        key: key,
        userId: shortage.responsibleUserId ?? existing?.userId,
        employeeId: shortage.employeeId ?? existing?.employeeId,
        name: shortage.responsibleName ?? existing?.name ?? 'Employee',
        outstanding:
            (existing?.outstanding ?? 0) + shortage.amountOutstanding,
      );
    }

    final rows = byPerson.values.toList();
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
    _lastSession = session;
    _lastBranchId = branchId;
    _lastUserId = userId;

    if (_loading || _refreshing) {
      _pendingReload = true;
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

    // Only skip network when we already have rows and cache is very fresh.
    if (hasRows && cacheFresh && !forceNetwork) {
      return;
    }

    final generation = ++_loadGeneration;
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
      if (generation != _loadGeneration) {
        return;
      }
      _shortages = rows;
      _error = null;
      await _persistMapped(cacheKey, rows);
    } catch (error) {
      if (generation != _loadGeneration) {
        return;
      }
      if (_shortages.isEmpty) {
        _error = friendlyErrorMessage(error);
      } else if (forceNetwork) {
        _notice = friendlyErrorMessage(error);
      }
    } finally {
      if (generation == _loadGeneration) {
        _loading = false;
        _refreshing = false;
        notifyListeners();
      }
    }

    if (_pendingReload && generation == _loadGeneration) {
      _pendingReload = false;
      final activeSession = _lastSession;
      if (activeSession != null) {
        await load(
          session: activeSession,
          branchId: _lastBranchId,
          userId: _lastUserId,
          quiet: true,
          forceNetwork: true,
        );
      }
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
    final payload = rows
        .map(CashShortageMapper.toCacheJson)
        .toList(growable: false);
    await ShortagesListCache.instance.write(cacheKey, payload);
  }
}
