import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/network/phone_normalize.dart';
import '../../features/repayment/data/repayment_repository_impl.dart';
import '../../features/repayment/data/repayments_live_store.dart';
import '../../models/client_detail.dart';
import '../../theme.dart';
import '../../utils/friendly_errors.dart';
import '../../utils/money.dart';
import '../../widgets/client_details_sheet.dart';

class SearchTab extends StatefulWidget {
  const SearchTab({
    super.key,
    required this.autofocus,
    required this.focusToken,
    this.branchId,
  });

  final bool autofocus;
  final int focusToken;
  final String? branchId;

  @override
  State<SearchTab> createState() => _SearchTabState();
}

class _SearchTabState extends State<SearchTab> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  final _store = RepaymentsLiveStore.instance;
  int _lastFocusToken = -1;
  bool _focused = false;
  bool _searching = false;
  String? _searchError;
  List<ClientDetail> _results = const [];
  _ClientBrowseFilter _filter = _ClientBrowseFilter.active;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() {
      setState(() => _focused = _focusNode.hasFocus);
    });
    if (widget.autofocus) {
      _lastFocusToken = widget.focusToken;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _focusNode.requestFocus();
      });
    }
    _store.addListener(_onStoreChanged);
  }

  @override
  void didUpdateWidget(covariant SearchTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.focusToken != _lastFocusToken && widget.autofocus) {
      _lastFocusToken = widget.focusToken;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _focusNode.requestFocus();
      });
    }
    if (oldWidget.branchId != widget.branchId && mounted) {
      setState(() {});
    }
  }

  List<ClientDetail> _inSelectedBranch(List<ClientDetail> clients) {
    final branchId = widget.branchId;
    if (branchId == null || branchId.isEmpty) return clients;
    return clients.where((client) => client.branchId == branchId).toList();
  }

  List<ClientDetail> get _visibleResults => _inSelectedBranch(_results);

  List<ClientDetail> get _branchLoans =>
      _inSelectedBranch(_store.cachedClients.map(toUiClientDetail).toList());

  /// The reports describe active *borrowers*, not raw loan rows. The offline
  /// snapshot may contain more than one historic loan for a borrower, so the
  /// browse page must use the same meaning or its totals become misleading.
  List<ClientDetail> get _cachedClients {
    return _dedupeBorrowers(_branchLoans.where(_isReportActiveClient));
  }

  List<ClientDetail> get _completedClients =>
      _dedupeBorrowers(_branchLoans.where(_isCompletedLoan));

  List<ClientDetail> get _defaulterClients => _dedupeBorrowers(
    _branchLoans.where(
      (client) => client.outstanding > 0 && client.overdueDays >= 60,
    ),
  );

  List<ClientDetail> _dedupeBorrowers(Iterable<ClientDetail> loans) {
    final borrowers = <ClientDetail>[];
    for (final loan in loans) {
      final existingIndex = borrowers.indexWhere(
        (existing) => _sameBorrower(existing, loan),
      );
      if (existingIndex == -1) {
        borrowers.add(loan);
      } else if (_shouldPreferClientLoan(loan, borrowers[existingIndex])) {
        borrowers[existingIndex] = loan;
      }
    }

    return borrowers
      ..sort((left, right) => left.fullName.compareTo(right.fullName));
  }

  bool _isCompletedLoan(ClientDetail client) {
    final status = client.status.trim().toUpperCase();
    if (status == 'REJECTED' || status == 'WRITTEN_OFF') return false;
    return status == 'CLOSED' || client.outstanding <= 0;
  }

  bool _isReportActiveClient(ClientDetail client) {
    // A settled row can temporarily retain an ACTIVE database status while
    // reconciliation catches up. It must not show as an active client.
    if (client.outstanding <= 0) return false;

    // Reports deliberately exclude 60+ day defaulters from active borrowers.
    return client.overdueDays < 60;
  }

  bool _shouldPreferClientLoan(ClientDetail candidate, ClientDetail current) {
    final candidateOpen = !_isCompletedLoan(candidate);
    final currentOpen = !_isCompletedLoan(current);
    if (candidateOpen != currentOpen) return candidateOpen;
    if (candidate.outstanding != current.outstanding) {
      return candidate.outstanding > current.outstanding;
    }
    final candidatePayment = candidate.lastPaymentAt;
    final currentPayment = current.lastPaymentAt;
    if (candidatePayment == null) return false;
    if (currentPayment == null) return true;
    return candidatePayment.isAfter(currentPayment);
  }

  bool _sameBorrower(ClientDetail left, ClientDetail right) {
    if (left.customerId == right.customerId) return true;

    final leftNin = _identityToken(left.nationalId);
    final rightNin = _identityToken(right.nationalId);
    if (leftNin.isNotEmpty && rightNin.isNotEmpty && leftNin == rightNin) {
      return true;
    }

    final leftPhone = _identityToken(left.phone);
    final rightPhone = _identityToken(right.phone);
    if (leftPhone.isNotEmpty &&
        rightPhone.isNotEmpty &&
        leftPhone == rightPhone) {
      return true;
    }

    final hasStableIdentity =
        leftNin.isNotEmpty ||
        rightNin.isNotEmpty ||
        leftPhone.isNotEmpty ||
        rightPhone.isNotEmpty;
    return !hasStableIdentity &&
        _identityName(left.fullName) == _identityName(right.fullName);
  }

  String _identityToken(String? value) =>
      (value ?? '').trim().toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');

  String _identityName(String value) =>
      value.trim().toUpperCase().replaceAll(RegExp(r'\s+'), ' ');

  List<ClientDetail> get _browseClients {
    final clients = _cachedClients;
    return switch (_filter) {
      _ClientBrowseFilter.active => clients,
      _ClientBrowseFilter.today =>
        clients.where((client) => client.nextDueIsToday).toList(),
      _ClientBrowseFilter.dueTwoToFour =>
        clients.where((client) => _matchesDueRange(client, 2, 4)).toList(),
      _ClientBrowseFilter.dueFiveToSeven =>
        clients.where((client) => _matchesDueRange(client, 5, 7)).toList(),
      _ClientBrowseFilter.overdueEightPlus =>
        clients.where((client) => _matchesDueRange(client, 8, null)).toList(),
      _ClientBrowseFilter.defaulter => _defaulterClients,
      _ClientBrowseFilter.completed => _completedClients,
    };
  }

  bool _matchesDueRange(ClientDetail client, int minimum, int? maximum) {
    final days = client.overdueDays;
    return days >= minimum && (maximum == null || days <= maximum);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _store.removeListener(_onStoreChanged);
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  bool get _hasQuery => _controller.text.trim().isNotEmpty;

  void _onStoreChanged() {
    if (mounted && !_hasQuery) setState(() {});
  }

  void _onQueryChanged(String value) {
    setState(() {});
    _debounce?.cancel();
    if (value.trim().isEmpty) {
      setState(() {
        _results = const [];
        _searchError = null;
        _searching = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _runSearch(value.trim());
    });
  }

  Future<void> _runSearch(String query) async {
    setState(() {
      _searching = true;
      _searchError = null;
    });
    try {
      // Strip separators only — API expands 07… / 7… / 256… / +256… variants
      // and returns phone-first ranking; do not E.164-normalize or re-sort.
      final normalized = normalizeClientSearchQuery(query);
      final clients = await _store.searchClients(normalized);
      if (!mounted || _controller.text.trim() != query) return;
      setState(() {
        _results = clients.map(toUiClientDetail).toList();
        _searching = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _searchError = friendlyErrorMessage(error);
        _results = const [];
      });
    }
  }

  Future<void> _openFilters() async {
    final selected = await showModalBottomSheet<_ClientBrowseFilter>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      builder: (sheetContext) => _ClientFilterSheet(initial: _filter),
    );
    if (selected != null && mounted) {
      setState(() => _filter = selected);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Clients',
                        style: TextStyle(
                          color: midnightNavy,
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.4,
                        ),
                      ),
                    ),
                    Text(
                      _store.offlineIndexReady
                          ? '${_cachedClients.length} clients'
                          : 'Loading clients...',
                      style: const TextStyle(color: slateText, fontSize: 13),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                if (_hasQuery) ...[
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Search results',
                          style: TextStyle(
                            color: midnightNavy,
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                          ),
                        ),
                      ),
                      Text(
                        _searching
                            ? 'Searching…'
                            : '${_visibleResults.length} result${_visibleResults.length == 1 ? '' : 's'}',
                        style: const TextStyle(color: slateText, fontSize: 12),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  if (_searchError != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      child: Text(
                        _searchError!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Color(0xFFC62828),
                          fontSize: 13,
                        ),
                      ),
                    )
                  else if (_searching && _visibleResults.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 40),
                      child: Center(
                        child: CircularProgressIndicator(color: forestEmerald),
                      ),
                    )
                  else if (_visibleResults.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 40),
                      child: Center(
                        child: Text(
                          'No clients match that search.',
                          style: TextStyle(color: slateText),
                        ),
                      ),
                    )
                  else
                    _ClientList(
                      clients: _visibleResults,
                      onTap: (client) async {
                        await showClientDetailsSheet(
                          context,
                          id: client.id,
                          phone: client.phone,
                          fullName: client.fullName,
                        );
                      },
                    ),
                ] else ...[
                  _ClientBrowseChips(
                    active: _filter,
                    clients: _cachedClients,
                    completedCount: _completedClients.length,
                    onFilterChanged: (filter) {
                      setState(() => _filter = filter);
                    },
                    onMoreFilters: _openFilters,
                  ),
                  const SizedBox(height: 12),
                  if (!_store.offlineIndexReady)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 48),
                      child: Center(
                        child: CircularProgressIndicator(color: forestEmerald),
                      ),
                    )
                  else if (_branchLoans.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 48),
                      child: Center(
                        child: Text(
                          'Clients will appear after the branch data is synced.',
                          style: TextStyle(color: slateText),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    )
                  else if (_browseClients.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 48),
                      child: Center(
                        child: Text(
                          'No clients match this filter.',
                          style: TextStyle(color: slateText),
                        ),
                      ),
                    )
                  else
                    _ClientList(
                      clients: _browseClients,
                      onTap: (client) async {
                        await showClientDetailsSheet(
                          context,
                          id: client.id,
                          phone: client.phone,
                          fullName: client.fullName,
                        );
                      },
                    ),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _controller,
              focusNode: _focusNode,
              onChanged: _onQueryChanged,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search by name or phone number...',
                prefixIcon: const Icon(Icons.search, color: forestEmerald),
                suffixIcon: _focused || _hasQuery
                    ? IconButton(
                        onPressed: () {
                          _controller.clear();
                          _onQueryChanged('');
                        },
                        icon: const Icon(Icons.cancel, color: slateText),
                      )
                    : null,
                filled: true,
                fillColor: Colors.white,
                enabledBorder: OutlineInputBorder(
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                  borderSide: BorderSide(
                    color: _focused ? forestEmerald : line,
                    width: _focused ? 1.5 : 1,
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                  borderSide: const BorderSide(
                    color: forestEmerald,
                    width: 1.6,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ClientList extends StatelessWidget {
  const _ClientList({required this.clients, required this.onTap});

  final List<ClientDetail> clients;
  final ValueChanged<ClientDetail> onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < clients.length; i++) ...[
          Material(
            color: Colors.white,
            child: InkWell(
              onTap: () => onTap(clients[i]),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 13),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            clients[i].fullName,
                            style: const TextStyle(
                              color: midnightNavy,
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            clients[i].phone,
                            style: const TextStyle(
                              color: slateText,
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            _activityLabel(clients[i]),
                            style: const TextStyle(
                              color: forestEmerald,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'UGX ${formatMoney(clients[i].outstanding)}',
                          style: TextStyle(
                            color: clients[i].outstanding > 0
                                ? const Color(0xFFD37A00)
                                : slateText,
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                        ),
                        const SizedBox(height: 5),
                        const Icon(
                          Icons.chevron_right,
                          color: slateText,
                          size: 20,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (i < clients.length - 1) const Divider(height: 1, color: line),
        ],
      ],
    );
  }

  String _activityLabel(ClientDetail client) {
    if (client.lastPaymentAmount > 0) {
      final paidAt = client.lastPaymentAt;
      final paymentDate = paidAt == null ? null : _lastPaymentDate(paidAt);
      return 'Last paid: UGX ${formatMoney(client.lastPaymentAmount)}'
          '${paymentDate == null ? '' : ' · $paymentDate'}';
    }
    if (client.nextDueLabel.trim().isNotEmpty) return client.nextDueLabel;
    return 'No payment recorded yet';
  }

  String _lastPaymentDate(DateTime value) {
    final date = value.toLocal();
    final today = DateTime.now();
    final dateOnly = DateTime(date.year, date.month, date.day);
    final todayOnly = DateTime(today.year, today.month, today.day);
    final difference = todayOnly.difference(dateOnly).inDays;

    if (difference == 0) return 'Today';
    if (difference == 1) return 'Yesterday';
    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/'
        '${date.year.toString().substring(2)}';
  }
}

enum _ClientBrowseFilter {
  active,
  today,
  dueTwoToFour,
  dueFiveToSeven,
  overdueEightPlus,
  defaulter,
  completed,
}

class _ClientBrowseChips extends StatelessWidget {
  const _ClientBrowseChips({
    required this.active,
    required this.clients,
    required this.completedCount,
    required this.onFilterChanged,
    required this.onMoreFilters,
  });

  final _ClientBrowseFilter active;
  final List<ClientDetail> clients;
  final int completedCount;
  final ValueChanged<_ClientBrowseFilter> onFilterChanged;
  final VoidCallback onMoreFilters;

  @override
  Widget build(BuildContext context) {
    final today = clients.where((client) => client.nextDueIsToday).length;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _chip(
            label: 'Active clients (${clients.length})',
            filter: _ClientBrowseFilter.active,
          ),
          const SizedBox(width: 8),
          _chip(label: 'Today ($today)', filter: _ClientBrowseFilter.today),
          const SizedBox(width: 8),
          _chip(
            label: '2–4 days due',
            filter: _ClientBrowseFilter.dueTwoToFour,
          ),
          const SizedBox(width: 8),
          _chip(
            label: 'Completed ($completedCount)',
            filter: _ClientBrowseFilter.completed,
          ),
          const SizedBox(width: 8),
          Tooltip(
            message: 'Filter clients',
            child: OutlinedButton(
              onPressed: onMoreFilters,
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(46, 44),
                padding: EdgeInsets.zero,
                side: const BorderSide(color: line),
                shape: RoundedRectangleBorder(
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
              ),
              child: const Icon(Icons.tune, color: midnightNavy),
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip({required String label, required _ClientBrowseFilter filter}) {
    final selected = active == filter;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onFilterChanged(filter),
      showCheckmark: false,
      selectedColor: forestEmerald,
      backgroundColor: Colors.white,
      side: BorderSide(color: selected ? forestEmerald : line),
      labelStyle: TextStyle(
        color: selected ? Colors.white : midnightNavy,
        fontWeight: FontWeight.w700,
        fontSize: 13,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
    );
  }
}

class _ClientFilterSheet extends StatelessWidget {
  const _ClientFilterSheet({required this.initial});

  final _ClientBrowseFilter initial;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Filter clients',
                    style: TextStyle(
                      color: midnightNavy,
                      fontWeight: FontWeight.w800,
                      fontSize: 23,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  tooltip: 'Close',
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'Repayment status',
              style: TextStyle(
                color: midnightNavy,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            for (final filter in const [
              _ClientBrowseFilter.dueTwoToFour,
              _ClientBrowseFilter.dueFiveToSeven,
              _ClientBrowseFilter.overdueEightPlus,
              _ClientBrowseFilter.defaulter,
            ]) ...[
              _FilterOption(
                selected: initial == filter,
                label: _filterLabel(filter),
                onTap: () => Navigator.of(context).pop(filter),
              ),
              const SizedBox(height: 10),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () =>
                        Navigator.of(context).pop(_ClientBrowseFilter.active),
                    child: const Text('Reset'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(initial),
                    style: FilledButton.styleFrom(
                      backgroundColor: forestEmerald,
                    ),
                    child: const Text('Apply filters'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterOption extends StatelessWidget {
  const _FilterOption({
    required this.selected,
    required this.label,
    required this.onTap,
  });

  final bool selected;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: rembehBorderRadius(rembehRadiusMd),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: selected ? sage : Colors.white,
          borderRadius: rembehBorderRadius(rembehRadiusMd),
          border: Border.all(color: selected ? forestEmerald : line),
        ),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected ? forestEmerald : slateText,
            ),
            const SizedBox(width: 12),
            Text(
              label,
              style: const TextStyle(
                color: midnightNavy,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _filterLabel(_ClientBrowseFilter filter) => switch (filter) {
  _ClientBrowseFilter.active => 'Active loans',
  _ClientBrowseFilter.today => 'Today',
  _ClientBrowseFilter.dueTwoToFour => '2–4 days due',
  _ClientBrowseFilter.dueFiveToSeven => '5–7 days due',
  _ClientBrowseFilter.overdueEightPlus => '8+ days overdue',
  _ClientBrowseFilter.defaulter => 'Defaulter (60+ days due)',
  _ClientBrowseFilter.completed => 'Completed loans',
};
