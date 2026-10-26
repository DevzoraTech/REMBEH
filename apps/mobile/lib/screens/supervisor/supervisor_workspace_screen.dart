import 'package:flutter/material.dart';

import '../../services/api_client.dart';
import '../../services/session_store.dart';

const _green = Color(0xFF075B43);
const _ink = Color(0xFF10152E);
const _muted = Color(0xFF70758D);

/// Read-only supervisor workspace. Values are populated only from API records.
class SupervisorWorkspaceScreen extends StatefulWidget {
  const SupervisorWorkspaceScreen({super.key, required this.session});
  final RembehSession session;

  @override
  State<SupervisorWorkspaceScreen> createState() => _SupervisorWorkspaceScreenState();
}

class _SupervisorWorkspaceScreenState extends State<SupervisorWorkspaceScreen> {
  late final ApiClient _api = ApiClient(SessionStore());
  final _search = TextEditingController();
  final _historySearch = TextEditingController();
  final Map<String, List<Map<String, dynamic>>> _bankings = {};
  final Set<String> _bankingsLoaded = {};
  final Map<String, Map<String, dynamic>> _operations = {};
  final Map<String, String> _operationErrors = {};
  int _tab = 1; // Branches is the default tab in the reference design.
  String _filter = 'All';
  String? _branchId;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _branches = [];
  List<Map<String, dynamic>> _reports = [];

  @override
  void initState() {
    super.initState();
    _load();
    _search.addListener(_refresh);
  }

  void _refresh() { if (mounted) setState(() {}); }

  @override
  void dispose() {
    _search.removeListener(_refresh);
    _search.dispose();
    _historySearch.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() { _loading = true; _error = null; });
    try {
      List<Map<String, dynamic>> branches;
      try {
        final result = await _api.listBranches(widget.session);
        branches = (result['branches'] as List? ?? const [])
            .whereType<Map>().map((v) => Map<String, dynamic>.from(v)).toList();
      } catch (_) {
        if (widget.session.branchId == null) rethrow;
        branches = [{'id': widget.session.branchId, 'name': widget.session.branchName ?? 'My branch'}];
      }
      final reports = await _api.listOperationReports(
        session: widget.session, includeSnapshot: true,
      );
      if (!mounted) return;
      setState(() { _branches = branches; _reports = reports; _loading = false; });
      for (final branch in branches) {
        final id = _branchKey(branch);
        if (id.isNotEmpty) {
          _loadBankings(id);
          _loadOperation(id);
        }
      }
    } catch (e) {
      if (!mounted) return;
      setState(() { _loading = false; _error = e.toString(); });
    }
  }

  Future<void> _loadOperation(String branchId) async {
    try {
      final data = await _api.getBranchOperation(
        session: widget.session, branchId: branchId, date: _today,
      );
      if (!mounted) return;
      setState(() {
        _operations[branchId] = data;
        _operationErrors.remove(branchId);
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _operationErrors[branchId] = error.toString());
    }
  }

  Map<String, dynamic>? _operation(String branchId) {
    final value = _operations[branchId]?['operation'];
    return value is Map ? Map<String, dynamic>.from(value) : null;
  }

  String _liveValue(String branchId, List<String> keys,
      {bool currency = false, bool portfolio = false}) {
    final op = _operation(branchId);
    if (op == null) return '—';
    final source = portfolio && op['portfolioPerformance'] is Map
        ? op['portfolioPerformance'] as Map : op;
    for (final key in keys) {
      final value = source[key];
      if (value is num) return currency ? _money(value) : value.toString();
      if (value != null && num.tryParse(value.toString()) != null) {
        return currency ? _money(num.parse(value.toString())) : value.toString();
      }
    }
    return '—';
  }

  void _showOperationRecords(String branchId, String title, String field) {
    final op = _operation(branchId);
    final rows = op?[field];
    showModalBottomSheet<void>(
      context: context, isScrollControlled: true, showDragHandle: true,
      builder: (ctx) => SafeArea(child: SizedBox(
        height: MediaQuery.sizeOf(ctx).height * .75,
        child: Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(18, 8, 18, 12),
            child: Row(children: [
              Expanded(child: Text(title, style: const TextStyle(
                fontSize: 20, fontWeight: FontWeight.w800, color: _ink))),
              IconButton(onPressed: () async {
                await _loadOperation(branchId);
                if (ctx.mounted) Navigator.pop(ctx);
                if (mounted) _showOperationRecords(branchId, title, field);
              }, icon: const Icon(Icons.refresh)),
            ])),
          Expanded(child: rows is! List ? Center(child: Text(
            _operationErrors[branchId] ?? 'Live records are unavailable.',
            style: const TextStyle(color: _muted))) :
            ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
              itemCount: rows.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final row = rows[i];
                if (row is! Map) return _tile(Icons.receipt_long_outlined,
                    'Record ${i + 1}', row.toString());
                final item = Map<String, dynamic>.from(row);
                final name = _s(item['customerName'], _s(item['borrowerName'],
                    _s(item['description'], _s(item['type'], 'Record ${i + 1}'))));
                final amount = item['amount'] ?? item['paidAmount'] ??
                    item['principalAmount'];
                return _tile(Icons.receipt_long_outlined, name,
                  [if (amount != null) _money(num.tryParse('$amount') ?? 0),
                   if (item['recordedByName'] != null) '${item['recordedByName']}',
                   if (item['paidAt'] != null) '${item['paidAt']}']
                    .join(' · '), onTap: () => _showRecordDetail(item));
              },
            )),
        ]),
      )),
    );
  }

  void _showRecordDetail(Map<String, dynamic> item) {
    showModalBottomSheet<void>(context: context, showDragHandle: true,
      isScrollControlled: true, builder: (ctx) => SafeArea(child: SizedBox(
        height: MediaQuery.sizeOf(ctx).height * .65,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('Transaction details', style: TextStyle(fontSize: 20,
            fontWeight: FontWeight.w800, color: _ink)),
          const SizedBox(height: 12),
          for (final entry in item.entries)
            if (entry.value != null && entry.value is! Map && entry.value is! List)
              Padding(padding: const EdgeInsets.only(bottom: 7),
                child: _tile(Icons.info_outline, _readable(entry.key), '${entry.value}')),
        ]),
      )));
  }

  Future<void> _loadBankings(String branchId) async {
    try {
      final records = await _api.listBranchBankings(
        session: widget.session, branchId: branchId, from: _today, to: _today,
      );
      if (!mounted) return;
      setState(() { _bankings[branchId] = records; _bankingsLoaded.add(branchId); });
    } catch (_) {
      // An unavailable endpoint must not prevent the rest of the dashboard.
    }
  }

  String _money(num amount) {
    final digits = amount.toStringAsFixed(0);
    return 'UGX ${digits.replaceAllMapped(RegExp(r'(?<=\d)(?=(\d{3})+$)'), (m) => ',')}';
  }

  String _bankingValue(String branchId, bool mobile) {
    if (!_bankingsLoaded.contains(branchId)) return '—';
    final records = _bankings[branchId] ?? const <Map<String, dynamic>>[];
    num total = 0;
    for (final row in records) {
      final type = _s(row['type']).toUpperCase();
      final isMobile = type.contains('MOBILE');
      if (mobile != isMobile) continue;
      total += num.tryParse(_s(row['amount'])) ?? 0;
    }
    return _money(total);
  }

  void _showBankings(String branchId) {
    showModalBottomSheet<void>(
      context: context, isScrollControlled: true, showDragHandle: true,
      builder: (ctx) => SafeArea(child: SizedBox(
        height: MediaQuery.sizeOf(ctx).height * .72,
        child: Column(children: [
          const Padding(padding: EdgeInsets.all(16), child: Text('Banking & mobile money',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
          Expanded(child: !_bankingsLoaded.contains(branchId)
            ? const Center(child: Text('Banking records are unavailable. Pull down to retry.'))
            : RefreshIndicator(onRefresh: () => _loadBankings(branchId), child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  if ((_bankings[branchId] ?? []).isEmpty) _empty('No deposits recorded today.'),
                  for (final row in _bankings[branchId] ?? <Map<String, dynamic>>[])
                    Padding(padding: const EdgeInsets.only(bottom: 8), child: _tile(
                      _s(row['type']).toUpperCase().contains('MOBILE')
                        ? Icons.phone_android : Icons.account_balance,
                      _money(num.tryParse(_s(row['amount'])) ?? 0),
                      '${_s(row['type'])} · ${_s(row['reference'], 'No reference')}',
                    )),
                ],
              ))),
        ]),
      )),
    );
  }

  String _s(dynamic value, [String fallback = '']) => value == null ? fallback : value.toString();
  String _branchName(Map<String, dynamic> b) => _s(b['name'], 'Branch');
  String _branchKey(Map<String, dynamic> b) => _s(b['id']);
  Map<String, dynamic>? _manager(Map<String, dynamic> b) {
    final direct = b['manager'];
    if (direct is Map) return Map<String, dynamic>.from(direct);
    final staff = b['staff'];
    if (staff is List) {
      for (final item in staff) {
        if (item is Map && _s(item['roleName']).toLowerCase() == 'branch manager') {
          return Map<String, dynamic>.from(item);
        }
      }
    }
    return null;
  }
  String _managerName(Map<String, dynamic> b) =>
      _s(_manager(b)?['name'], _s(_manager(b)?['displayName'], _s(b['managerName'], 'Manager not assigned')));
  String _managerPhone(Map<String, dynamic> b) =>
      _s(_manager(b)?['phone'], _s(b['managerPhone']));
  String _status(Map<String, dynamic> r) => _s(r['status']).toUpperCase();
  bool _submitted(Map<String, dynamic> r) =>
      ['SUBMITTED', 'APPROVED', 'REVIEWED', 'FINALIZED', 'COMPLETED'].contains(_status(r));
  String _date(Map<String, dynamic> r) => _s(r['operationDate']).split('T').first;
  String get _today {
    final d = DateTime.now();
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }
  Map<String, dynamic>? _latestReport(String id) {
    final matches = _reports.where((r) => _s(r['branchId']) == id).toList()
      ..sort((a, b) => _date(b).compareTo(_date(a)));
    return matches.isEmpty ? null : matches.first;
  }
  Map<String, dynamic>? _todayReport(String id) {
    for (final r in _reports) {
      if (_s(r['branchId']) == id && _date(r) == _today) return r;
    }
    return null;
  }
  bool _isOpen(Map<String, dynamic> b) {
    final status = _s(b['operationStatus'], _s(b['status'])).toUpperCase();
    return status == 'OPEN' || status == 'ACTIVE';
  }
  bool? _knownOpen(Map<String, dynamic> b) {
    final status = _s(b['operationStatus'], _s(b['status'])).toUpperCase();
    if (status == 'OPEN' || status == 'ACTIVE') return true;
    if (status == 'CLOSED' || status == 'INACTIVE') return false;
    return null;
  }
  List<Map<String, dynamic>> get _visibleBranches {
    final q = _search.text.trim().toLowerCase();
    return _branches.where((b) {
      final id = _branchKey(b);
      final report = _todayReport(id);
      final latest = _latestReport(id);
      final text = '${_branchName(b)} ${_managerName(b)} ${_s(b['address'])}'.toLowerCase();
      if (q.isNotEmpty && !text.contains(q)) return false;
      switch (_filter) {
        case 'Open': return _knownOpen(b) == true;
        case 'Closed': return _knownOpen(b) == false;
        case 'Report not submitted': return report == null || !_submitted(report);
        case 'Requires attention':
          return latest != null && (_status(latest).contains('RETURN') || _status(latest).contains('PENDING'));
        default: return true;
      }
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFCFCFE),
      body: SafeArea(child: Column(children: [
        if (_branchId == null && _tab != 0) Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 8),
          child: Row(children: [
            const Icon(Icons.eco, color: Color(0xFF71BA18), size: 30),
            const SizedBox(width: 6),
            const Text('Rembeh', style: TextStyle(color: _green, fontSize: 28, fontWeight: FontWeight.w800, fontFamily: 'serif')),
            const Spacer(),
            IconButton(onPressed: _load, icon: const Icon(Icons.notifications_none_outlined, color: _green)),
            const SizedBox(width: 8),
            CircleAvatar(backgroundColor: const Color(0xFFE8F2EF), child: Text(
              widget.session.userName.trim().split(' ').where((v) => v.isNotEmpty).take(2).map((v) => v[0].toUpperCase()).join(),
              style: const TextStyle(color: _green, fontWeight: FontWeight.bold),
            )),
          ]),
        ),
        Expanded(child: RefreshIndicator(onRefresh: _load, child: _content())),
      ])),
      bottomNavigationBar: (_branchId != null || _tab == 0) ? null : SafeArea(top: false, child: Container(
        decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Color(0xFFE8E9EF)))),
        child: Row(children: [
          _nav(0, Icons.home_rounded, 'Home'),
          _nav(1, Icons.apartment_rounded, 'Branches'),
          _nav(2, Icons.account_balance_wallet_outlined, 'Operations'),
          _nav(3, Icons.bar_chart_rounded, 'Reports'),
          _nav(4, Icons.menu_rounded, 'More'),
        ]),
      )),
    );
  }

  Widget _nav(int index, IconData icon, String label) {
    final selected = _tab == index;
    return Expanded(child: InkWell(
      onTap: () => setState(() { _tab = index; _branchId = null; }),
      child: Padding(padding: const EdgeInsets.symmetric(vertical: 9), child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, color: selected ? _green : _muted, size: 25),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(color: selected ? _green : _muted, fontSize: 11, fontWeight: selected ? FontWeight.w700 : FontWeight.w500)),
        const SizedBox(height: 5),
        Container(height: 2, width: 38, color: selected ? _green : Colors.transparent),
      ])),
    ));
  }

  Widget _content() {
    if (_loading && _branches.isEmpty) return const Center(child: CircularProgressIndicator(color: _green));
    if (_error != null && _branches.isEmpty) return ListView(children: [
      const SizedBox(height: 100),
      const Icon(Icons.wifi_off_outlined, size: 42, color: _muted),
      const SizedBox(height: 14),
      const Center(child: Text('Unable to load branch information')),
      Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)),
      Center(child: TextButton(onPressed: _load, child: const Text('Try again'))),
    ]);
    if (_branchId != null) return _branchDetail(_branchId!);
    if (_tab == 0) return _home();
    if (_tab == 1) return _branchList();
    if (_tab == 3) return _reportList();
    if (_tab == 4) return ListView(padding: const EdgeInsets.all(24), children: [
      _heading('More'), const SizedBox(height: 16),
      _tile(Icons.person_outline, 'Signed in as', widget.session.userName),
      _tile(Icons.badge_outlined, 'Role', widget.session.roleName ?? 'Supervisor'),
      _tile(Icons.refresh, 'Refresh branch data', 'Load latest available information', onTap: _load),
    ]);
    if (_tab == 2) return _operationsPage();
    return _home();
  }

  Widget _heading(String title, [String? trailing]) => Row(children: [
    Expanded(child: Text(title, style: const TextStyle(fontSize: 29, fontWeight: FontWeight.w800, color: _ink))),
    if (trailing != null) Text(trailing, style: const TextStyle(color: _muted, fontSize: 13)),
  ]);

  Widget _branchList() => ListView(padding: const EdgeInsets.fromLTRB(16, 10, 16, 22), children: [
    _heading('Branches', '${_branches.length} branches'),
    const SizedBox(height: 18),
    TextField(controller: _search, decoration: InputDecoration(
      hintText: 'Search branches...', prefixIcon: const Icon(Icons.search, size: 26),
      filled: true, fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: const BorderSide(color: Color(0xFFE8E9EF))),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: const BorderSide(color: Color(0xFFE8E9EF))),
    )),
    const SizedBox(height: 14),
    SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: [
      for (final filter in ['All', 'Open', 'Closed', 'Report not submitted', 'Requires attention'])
        Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(
          label: Text(filter), selected: _filter == filter,
          selectedColor: _green, backgroundColor: Colors.white,
          labelStyle: TextStyle(color: _filter == filter ? Colors.white : _muted, fontSize: 12),
          onSelected: (_) => setState(() => _filter = filter),
          side: const BorderSide(color: Color(0xFFE8E9EF)),
        )),
    ])),
    const SizedBox(height: 14),
    if (_visibleBranches.isEmpty) _empty('No branches match this filter.'),
    for (final b in _visibleBranches) _branchCard(b),
  ]);

  Widget _branchCard(Map<String, dynamic> b) {
    final id = _branchKey(b);
    final report = _todayReport(id);
    final opStatus = _s(_operation(id)?['status']).toUpperCase();
    final status = opStatus == 'OPEN' ? true : (opStatus == 'CLOSED' ? false : _knownOpen(b));
    final manager = _managerName(b);
    return _card(child: InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: () => setState(() => _branchId = id),
      child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(_branchName(b), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: _ink))),
          if (status != null) _pill(status ? 'Open' : 'Closed', status ? Colors.green : Colors.red),
          const SizedBox(width: 8), const Icon(Icons.chevron_right, color: _muted),
        ]),
        const SizedBox(height: 4), Text(manager, style: const TextStyle(fontSize: 16, color: _muted)),
        const SizedBox(height: 13),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _pill(report != null && _submitted(report) ? '✓  Report submitted' : '⚠  Report not submitted',
            report != null && _submitted(report) ? Colors.green : Colors.red),
          if (report != null && _status(report).contains('RETURN')) _pill('Requires correction', Colors.orange),
          if (report != null && _status(report).contains('PENDING')) _pill('Pending review', Colors.orange),
        ]),
      ])),
    ));
  }

  // The branch detail is deliberately a full-screen page, matching the supplied
  // reference: no global header and no bottom navigation while it is open.
  Widget _branchDetail(String id) {
    final b = _branches.where((v) => _branchKey(v) == id).firstOrNull;
    if (b == null) return _empty('Branch unavailable');
    final report = _todayReport(id);
    final opStatus = _s(_operation(id)?['status']).toUpperCase();
    final status = opStatus == 'OPEN' ? true :
        (opStatus == 'CLOSED' ? false : _knownOpen(b));
    final manager = _managerName(b);
    final phone = _managerPhone(b);
    final date = DateTime.now();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
      'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final dateLabel = '${date.day} ${months[date.month - 1]} ${date.year}';
    final reportLabel = report == null ? 'Not submitted' :
      (_submitted(report) ? 'Submitted' : _status(report).replaceAll('_', ' ').toLowerCase());
    final reportColor = report != null && _submitted(report)
        ? const Color(0xFF00863D) : const Color(0xFFE28A12);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
      children: [
        Row(children: [
          InkWell(onTap: () => setState(() { _branchId = null; _tab = 1; }),
            child: const Padding(padding: EdgeInsets.symmetric(vertical: 8),
              child: Row(children: [
                Icon(Icons.arrow_back_ios_new, color: _green, size: 22),
                SizedBox(width: 12),
                Text('Branches', style: TextStyle(color: _green,
                  fontSize: 18, fontWeight: FontWeight.w700)),
              ]))),
          const Spacer(),
          PopupMenuButton<String>(icon: const Icon(Icons.more_vert, color: _muted),
            onSelected: (value) {
              if (value == 'refresh') _load();
              if (value == 'history') _openHistory(id);
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'refresh', child: Text('Refresh')),
              PopupMenuItem(value: 'history', child: Text('Past reports')),
            ]),
        ]),
        const SizedBox(height: 8),
        Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          Expanded(child: Text(_branchName(b),
            style: const TextStyle(fontSize: 24, height: 1.10,
              fontWeight: FontWeight.w800, color: _ink))),
          if (status != null) _pill(status ? '●  Open' : '●  Closed',
            status ? const Color(0xFF00893F) : const Color(0xFFCE2335)),
        ]),
        const SizedBox(height: 5),
        Text(phone.isEmpty ? manager : '$manager  •  $phone',
          style: const TextStyle(color: _muted, fontSize: 16)),
        const SizedBox(height: 10),
        LayoutBuilder(builder: (context, constraints) {
          final narrow = constraints.maxWidth < 325;
          final dateInfo = Row(children: [
            const Icon(Icons.calendar_today_outlined,
                color: Color(0xFF00883D), size: 25),
            const SizedBox(width: 10),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                _label('BUSINESS DAY'),
                const SizedBox(height: 3),
                Text('Today · $dateLabel', maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 15,
                    fontWeight: FontWeight.w800, color: _ink)),
              ],
            )),
          ]);
          final history = InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () => _openHistory(id),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 10),
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0xFFD4DED9)),
                borderRadius: BorderRadius.circular(10)),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.calendar_month_outlined, color: _green, size: 17),
                SizedBox(width: 5),
                Text('Past reports', style: TextStyle(color: _ink,
                    fontSize: 12, fontWeight: FontWeight.w700)),
                SizedBox(width: 2),
                Icon(Icons.chevron_right, color: _green, size: 15),
              ]),
            ),
          );
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFECF8F0),
              border: Border.all(color: const Color(0xFFDCEEE1)),
              borderRadius: BorderRadius.circular(14)),
            child: narrow
                ? Column(crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [dateInfo, const SizedBox(height: 9),
                      Align(alignment: Alignment.centerRight, child: history)])
                : Row(children: [
                    Expanded(child: dateInfo),
                    const SizedBox(width: 6),
                    history,
                  ]),
          );
        }),
        const SizedBox(height: 11),
        _label('TODAY’S OVERVIEW'),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: _metric('Active loans',
            _liveValue(id, ['activeBorrowers'], portfolio: true),
            Icons.people_alt_rounded, const Color(0xFFEBF8EF))),
          const SizedBox(width: 8),
          Expanded(child: _metric('New loans today',
            _liveValue(id, ['loansIssuedCount']),
            Icons.note_add_rounded, const Color(0xFFEAF3FF))),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: _metric('Paid today',
            _liveValue(id, ['borrowersPaid'], portfolio: true),
            Icons.volunteer_activism_rounded, const Color(0xFFEBF8EF))),
          const SizedBox(width: 8),
          Expanded(child: _metric('Missed payments',
            _liveValue(id, ['borrowersMissed'], portfolio: true),
            Icons.warning_rounded, const Color(0xFFFFEFF0))),
        ]),
        const SizedBox(height: 10),
        _card(child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () {
            if (report != null) { _openReport(report); return; }
            showModalBottomSheet<void>(
              context: context,
              showDragHandle: true,
              builder: (sheetContext) => SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 8, 24, 28),
                  child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Daily report', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: _ink)),
                    const SizedBox(height: 12),
                    Text('No daily report is available for $dateLabel. You can view previous reports below.', style: const TextStyle(fontSize: 15, color: _muted)),
                    const SizedBox(height: 18),
                    SizedBox(width: double.infinity, child: FilledButton(
                      onPressed: () { Navigator.pop(sheetContext); _openHistory(id); },
                      child: const Text('View past reports'),
                    )),
                  ]),
                ),
              ),
            );
          },
          child: Padding(padding: const EdgeInsets.fromLTRB(13, 12, 10, 12),
            child: Row(children: [
              const Icon(Icons.description_rounded, color: _muted, size: 28),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Daily report', style: TextStyle(fontSize: 17,
                    fontWeight: FontWeight.w800, color: _ink)),
                  const SizedBox(height: 4),
                  Text('$manager  •  Today', maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: _muted, fontSize: 13)),
                ])),
              Flexible(child: Container(padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 7),
                decoration: BoxDecoration(color: reportColor.withValues(alpha: .10),
                  borderRadius: BorderRadius.circular(28)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(report != null && _submitted(report)
                    ? Icons.check_circle_outline : Icons.schedule,
                    color: reportColor, size: 17),
                  const SizedBox(width: 5),
                  Flexible(child: Text(reportLabel, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: reportColor,
                    fontWeight: FontWeight.w700, fontSize: 10))),
                ]))),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_right, color: _muted),
            ]))),
        ),
        const SizedBox(height: 11),
        _label('COLLECTIONS TODAY'),
        const SizedBox(height: 8),
        _section([
          _entry(Icons.payments_rounded, 'Total repaid',
            _liveValue(id, ['collectionsReceived'], currency: true),
            const Color(0xFF00883D)),
          _entry(Icons.format_list_bulleted, 'Repayments received',
            _liveValue(id, ['collectionsCount']), _muted),
          _entry(Icons.note_add_outlined, 'New loans',
            _liveValue(id, ['loansIssuedCount']), _muted),
        ], 'View collections', () => _showOperationRecords(id, 'Repayments received', 'repayments')),
        const SizedBox(height: 11),
        _label('EXPENSES'),
        const SizedBox(height: 8),
        _section([
          _entry(Icons.account_balance_wallet_rounded, 'Total expenses',
            _liveValue(id, ['expensesTotal'], currency: true), Colors.red),
          _entry(Icons.format_list_bulleted, 'Expense entries',
            _liveValue(id, ['expensesCount']), _muted),
        ], 'View expenses', () => _showOperationRecords(id, 'Expenses', 'expenses')),
        const SizedBox(height: 11),
        _label('MOBILE MONEY & BANKING'),
        const SizedBox(height: 8),
        _section([
          _entry(Icons.account_balance_rounded, 'Banking',
            _bankingValue(id, false), Colors.blue),
          _entry(Icons.phone_android_rounded, 'Mobile money',
            _bankingValue(id, true), Colors.orange),
        ], 'View banking & mobile money', () => _showBankings(id)),
      ],
    );
  }

  String _metricValue(Map<String, dynamic>? report, List<String> keys) {
    if (report == null) return '—';
    for (final key in keys) {
      final value = report[key];
      if (value != null && value is! Map && value is! List) return '$value';
      final snapshot = report['snapshot'];
      if (snapshot is Map) {
        final summary = snapshot['summary'];
        if (summary is Map && summary[key] != null && summary[key] is! Map && summary[key] is! List) {
          return '${summary[key]}';
        }
        if (snapshot[key] != null && snapshot[key] is! Map && snapshot[key] is! List) return '${snapshot[key]}';
      }
    }
    return '—';
  }

  // Compact 2-column metrics, sized for narrow Android screens.
  Widget _metric(String title, String value, IconData icon, Color background) =>
    Container(
      height: 66,
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
      decoration: BoxDecoration(color: background,
        borderRadius: BorderRadius.circular(13)),
      child: Row(children: [
        Icon(icon, color: title == 'New loans today' ? const Color(0xFF2787E7)
          : title == 'Missed payments' ? const Color(0xFFE73843)
          : const Color(0xFF00883D), size: 23),
        const SizedBox(width: 9),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center, children: [
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11.5, color: _muted)),
            const SizedBox(height: 2),
            Text(value, maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 21, height: 1.05,
                color: _ink, fontWeight: FontWeight.w800)),
          ])),
      ]),
    );

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(left: 6),
    child: Text(text, style: const TextStyle(fontSize: 11,
      fontWeight: FontWeight.w800, color: _muted, letterSpacing: 1.1)));

  Widget _entry(IconData icon, String title, String value, Color color) =>
    SizedBox(height: 43, child: Row(children: [
      Icon(icon, color: color, size: 19),
      const SizedBox(width: 11),
      Expanded(child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 13.5, color: _ink))),
      const SizedBox(width: 8),
      Text(value, style: const TextStyle(fontSize: 13.5,
        fontWeight: FontWeight.w700, color: _ink)),
    ]));

  Widget _section(List<Widget> rows, String action, VoidCallback? onTap) =>
    _card(child: Column(mainAxisSize: MainAxisSize.min, children: [
      for (var i = 0; i < rows.length; i++) ...[
        Padding(padding: const EdgeInsets.symmetric(horizontal: 13), child: rows[i]),
        if (i < rows.length - 1)
          const Divider(height: 1, thickness: .6,
            color: Color(0xFFE9E9ED), indent: 13, endIndent: 13),
      ],
      const Divider(height: 1, thickness: .6, color: Color(0xFFE9E9ED)),
      InkWell(
        onTap: onTap,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(14)),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
          child: Row(children: [
            Expanded(child: Text(action, style: TextStyle(
              fontSize: 13.5, fontWeight: FontWeight.w700,
              color: onTap == null ? _muted : _ink))),
            const Icon(Icons.chevron_right, size: 19, color: _muted),
          ]),
        ),
      ),
    ]));

  Widget _card({required Widget child}) => Container(
    decoration: BoxDecoration(color: Colors.white,
      border: Border.all(color: const Color(0xFFE7E8ED), width: .8),
      borderRadius: BorderRadius.circular(14)),
    clipBehavior: Clip.antiAlias,
    child: child,
  );
  Widget _pill(String label, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(color: color.withValues(alpha: .09), borderRadius: BorderRadius.circular(30)),
    child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
  );
  Widget _empty(String text) => Padding(padding: const EdgeInsets.all(26), child: Center(child: Text(text, style: const TextStyle(color: _muted))));
  Widget _tile(IconData icon, String title, String subtitle, {VoidCallback? onTap}) => _card(child: ListTile(
    leading: Icon(icon, color: _green), title: Text(title), subtitle: Text(subtitle), trailing: const Icon(Icons.chevron_right), onTap: onTap,
  ));

  Widget _reportList({String? branchId, String dateQuery = ''}) {
    final list = _reports.where((r) => (branchId == null || _s(r['branchId']) == branchId) &&
      (dateQuery.trim().isEmpty || _date(r).contains(dateQuery.trim()))).toList()
      ..sort((a, b) => _date(b).compareTo(_date(a)));
    return ListView(padding: const EdgeInsets.fromLTRB(16, 10, 16, 22), children: [
      _heading('Reports', '${list.length} reports'), const SizedBox(height: 16),
      if (list.isEmpty) _empty('No historical reports available.'),
      for (final r in list) _tile(Icons.description_outlined,
        _date(r).isEmpty ? 'Daily report' : _date(r),
        '${_branchName(_branches.where((b) => _branchKey(b) == _s(r['branchId'])).firstOrNull ?? {})} · ${_status(r).replaceAll('_', ' ')}',
        onTap: () => _openReport(r)),
    ]);
  }

  Widget _home() {
    if (_branches.isEmpty) return _empty('No branch is available.');
    // Home displays the same full-screen branch detail design as the reference.
    // Branches remains the selection screen, reached with the back action.
    return _branchDetail(_branchKey(_branches.first));
  }
  Widget _operationsPage() => ListView(padding: const EdgeInsets.all(24), children: [
    _heading('Operations'), const SizedBox(height: 8),
    const Text('Select a branch to review its operations.', style: TextStyle(color: _muted)),
    const SizedBox(height: 18),
    for (final b in _branches) _tile(Icons.apartment_rounded, _branchName(b), 'View branch activity', onTap: () => setState(() => _branchId = _branchKey(b))),
  ]);

  String _displayDate(String raw) {
    final date = DateTime.tryParse(raw);
    if (date == null) return raw;
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return '${date.day} ${months[date.month - 1]} ${date.year}';
  }

  String _weekday(String raw) {
    final date = DateTime.tryParse(raw);
    if (date == null) return '';
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    return days[date.weekday - 1];
  }

  void _openHistory(String branchId) {
    _historySearch.clear();
    DateTime? selected;
    showModalBottomSheet<void>(
      context: context, isScrollControlled: true, backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(30))),
      builder: (sheetContext) => StatefulBuilder(builder: (ctx, update) {
        final q = _historySearch.text.trim().toLowerCase();
        final items = _reports.where((r) {
          if (_s(r['branchId']) != branchId) return false;
          final raw = _date(r);
          if (selected != null && raw != '${selected!.year}-${selected!.month.toString().padLeft(2,'0')}-${selected!.day.toString().padLeft(2,'0')}') return false;
          return q.isEmpty || raw.toLowerCase().contains(q) || _displayDate(raw).toLowerCase().contains(q);
        }).toList()..sort((a,b) => _date(b).compareTo(_date(a)));
        return SafeArea(top: false, child: FractionallySizedBox(
          heightFactor: .79,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const SizedBox(height: 14),
            Center(child: Container(width: 80,height: 6,decoration: BoxDecoration(color: const Color(0xFFC8CBD2),borderRadius: BorderRadius.circular(8)))),
            Padding(padding: const EdgeInsets.fromLTRB(24, 24, 20, 16), child: Row(children: [
              const Expanded(child: Text('Past reports',style: TextStyle(fontSize: 27,fontWeight: FontWeight.w800,color: _ink))),
              IconButton(onPressed: () => Navigator.pop(ctx),icon: const Icon(Icons.close),style: IconButton.styleFrom(backgroundColor: const Color(0xFFF4F4F6))),
            ])),
            Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Row(children: [
              Expanded(child: TextField(controller: _historySearch,onChanged: (_) => update(() {}),
                decoration: InputDecoration(hintText: 'Search report by date',prefixIcon: const Icon(Icons.search,size: 26),
                  contentPadding: const EdgeInsets.symmetric(vertical: 15),border: OutlineInputBorder(borderRadius: BorderRadius.circular(14),borderSide: const BorderSide(color: Color(0xFFE1E2E8))),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14),borderSide: const BorderSide(color: Color(0xFFE1E2E8)))))),
              const SizedBox(width: 10),
              SizedBox(width: 54, height: 52, child: OutlinedButton(onPressed: () async {
                final picked = await showDatePicker(context: ctx,initialDate: selected ?? DateTime.now(),firstDate: DateTime(2020),lastDate: DateTime.now());
                if (picked != null) update(() => selected = picked);
              },style: OutlinedButton.styleFrom(padding: EdgeInsets.zero,side: const BorderSide(color: Color(0xFFE1E2E8)),shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                child: const Icon(Icons.calendar_month_outlined,color: _ink))),
            ])),
            if (selected != null) Padding(padding: const EdgeInsets.fromLTRB(20, 6, 20, 0),child: TextButton.icon(
              onPressed: () => update(() => selected = null),icon: const Icon(Icons.close,size: 16),label: Text('Clear date: ${_displayDate(selected!.toIso8601String())}'))),
            Expanded(child: items.isEmpty ? _empty('No reports found for this date.') : ListView.builder(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),itemCount: items.length,itemBuilder: (ctx,i) {
                final r = items[i]; final status = _status(r);
                final returned = status.contains('RETURN');
                final good = _submitted(r);
                final color = returned ? const Color(0xFFDC8700) : good ? const Color(0xFF078341) : _muted;
                return Padding(padding: const EdgeInsets.only(bottom: 9),child: Material(color: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15),side: const BorderSide(color: Color(0xFFE8E9EE))),
                  child: InkWell(borderRadius: BorderRadius.circular(15),onTap: () { Navigator.pop(ctx); _openReport(r); },
                    child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16,vertical: 17),child: Row(children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,children: [
                        Text(_displayDate(_date(r)),style: const TextStyle(fontSize: 16,fontWeight: FontWeight.w800,color: _ink)),
                        const SizedBox(height: 3),Text(_weekday(_date(r)),style: const TextStyle(color: _muted,fontSize: 13)),
                      ])),
                      Container(padding: const EdgeInsets.symmetric(horizontal: 10,vertical: 7),decoration: BoxDecoration(
                        color: color.withValues(alpha: .10),borderRadius: BorderRadius.circular(20)),
                        child: Row(mainAxisSize: MainAxisSize.min,children: [Icon(returned ? Icons.access_time_rounded : good ? Icons.check_circle : Icons.info_outline,size: 17,color: color),
                          const SizedBox(width: 5),Text(status.isEmpty ? 'Unknown' : _readable(status).toLowerCase().replaceFirstMapped(RegExp(r'^.'),(m)=>m[0]!.toUpperCase()),style: TextStyle(color: color,fontWeight: FontWeight.w700,fontSize: 12))])),
                      const SizedBox(width: 8),const Icon(Icons.chevron_right,color: _muted),
                    ])))));
              })),
          ]),
        ));
      }),
    );
  }

  dynamic _field(Map<String,dynamic> map, List<String> keys) {
    for (final key in keys) { if (map.containsKey(key) && map[key] != null) return map[key]; }
    return null;
  }

  Map<String, dynamic> _reportMap(dynamic raw) => raw is Map
      ? Map<String, dynamic>.from(raw) : <String, dynamic>{};

  dynamic _reportPick(Map<String, dynamic> data, List<String> keys) => _field(data, keys);

  String _reportDisplay(dynamic value, {bool money = true}) {
    if (value == null) return 'Not recorded';
    if (money && value is num) return _money(value);
    if (money && num.tryParse('$value') != null) return _money(num.parse('$value'));
    return _s(value, 'Not recorded');
  }

  Widget _reportLine(String title, dynamic value, {bool money = true, bool strong = false}) =>
      Padding(padding: const EdgeInsets.symmetric(vertical: 11), child: Row(
        crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(title, style: TextStyle(fontSize: 13.5,
              color: strong ? _ink : _muted, fontWeight: strong ? FontWeight.w700 : FontWeight.w400))),
          const SizedBox(width: 12),
          Flexible(child: Text(_reportDisplay(value, money: money), textAlign: TextAlign.right,
              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700,
                  color: value == null ? _muted : _ink))),
        ]));

  Widget _reportExpansion(String title, String subtitle, IconData icon,
      List<Widget> content, {dynamic total, bool initiallyExpanded = false}) =>
      Container(margin: const EdgeInsets.only(bottom: 11),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE5E8ED))),
        clipBehavior: Clip.antiAlias,
        child: Theme(data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
          child: ExpansionTile(initiallyExpanded: initiallyExpanded,
            tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            childrenPadding: const EdgeInsets.fromLTRB(15, 0, 15, 12),
            leading: Container(width: 39, height: 39,
              decoration: BoxDecoration(color: const Color(0xFFEAF5EF), borderRadius: BorderRadius.circular(11)),
              child: Icon(icon, color: _green, size: 21)),
            title: Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _ink)),
            subtitle: Text(subtitle, style: const TextStyle(fontSize: 11.5, color: _muted)),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              if (total != null) ConstrainedBox(constraints: const BoxConstraints(maxWidth: 115),
                child: Text(_reportDisplay(total), maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: _ink))),
              const SizedBox(width: 6), const Icon(Icons.keyboard_arrow_down_rounded, size: 20, color: _muted),
            ]),
            children: content.isEmpty ? [_reportEmpty('No records were included in this report.')]
              : content)));

  Widget _reportEmpty(String message) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 17),
      child: Text(message, style: const TextStyle(color: _muted, fontSize: 13)));

  List<Widget> _reportRecords(dynamic raw, {String type = 'record'}) {
    if (raw is! List || raw.isEmpty) return [_reportEmpty('No ${type == 'record' ? 'records' : type} recorded for this day.')];
    final rows = raw.whereType<Map>().map((r) => Map<String, dynamic>.from(r)).toList();
    if (rows.isEmpty) return [_reportEmpty('No transaction details available.')];
    return [
      Padding(padding: const EdgeInsets.only(top: 6, bottom: 12),
        child: Text('${rows.length} ${rows.length == 1 ? 'entry' : 'entries'}',
          style: const TextStyle(color: _muted, fontSize: 12, fontWeight: FontWeight.w600))),
      ...rows.asMap().entries.map((entry) {
        final row = entry.value;
        final borrower = _reportMap(_reportPick(row, ['borrower', 'customer', 'client', 'loan']));
        final person = _reportPick(row, ['borrowerName', 'customerName', 'clientName', 'officerName', 'agentName', 'staffName', 'name'])
            ?? _reportPick(borrower, ['name', 'fullName', 'borrowerName']);
        final label = person ?? _reportPick(row, ['description', 'narration', 'reference', 'receiptNumber', 'productName', 'type'])
            ?? '${_readable(type)} ${entry.key + 1}';
        final amount = _reportPick(row, ['amount', 'amountReceived', 'amountPaid', 'principalAmount', 'principal', 'total', 'value']);
        const fields = <String, String>{
          'reference': 'Reference', 'receiptNumber': 'Receipt number', 'loanNumber': 'Loan number',
          'borrowerName': 'Borrower', 'customerName': 'Customer', 'officerName': 'Officer',
          'agentName': 'Field officer', 'staffName': 'Staff member', 'productName': 'Loan product',
          'amount': 'Amount', 'amountReceived': 'Amount received', 'amountPaid': 'Amount paid',
          'principalAmount': 'Principal', 'principal': 'Principal', 'balance': 'Balance',
          'interest': 'Interest', 'fee': 'Fee', 'paymentMethod': 'Payment method',
          'method': 'Method', 'channel': 'Channel', 'category': 'Category',
          'description': 'Description', 'narration': 'Narration', 'status': 'Status',
          'createdAt': 'Recorded at', 'collectedAt': 'Collected at', 'issuedAt': 'Issued at',
          'transactionDate': 'Transaction date', 'phoneNumber': 'Phone number',
        };
        final details = <Widget>[];
        for (final field in fields.entries) {
          if (row[field.key] == null) continue;
          details.add(_reportLine(field.value, row[field.key], money: const {
            'amount', 'amountReceived', 'amountPaid', 'principalAmount', 'principal', 'balance', 'interest', 'fee'
          }.contains(field.key)));
        }
        if (details.isEmpty) details.add(_reportEmpty('No further details provided.'));
        return Container(margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(color: const Color(0xFFF9FAFC),
            borderRadius: BorderRadius.circular(11), border: Border.all(color: const Color(0xFFECEEF2))),
          child: ExpansionTile(tilePadding: const EdgeInsets.symmetric(horizontal: 12),
            childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            shape: const Border(), collapsedShape: const Border(),
            title: Text('$label', maxLines: 2, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: _ink)),
            subtitle: Text(_s(_reportPick(row, ['reference', 'loanNumber', 'category', 'status']),
              'Tap to view details'), style: const TextStyle(fontSize: 11.5, color: _muted)),
            trailing: amount == null ? const Icon(Icons.expand_more, color: _muted)
              : Text(_reportDisplay(amount), style: const TextStyle(fontSize: 12.5,
                  fontWeight: FontWeight.w800, color: _ink)),
            children: details));
      }),
    ];
  }

  Future<void> _openReport(Map<String, dynamic> summary) async {
    final id = _s(summary['id']);
    if (id.isEmpty) return;
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (pageContext) => Scaffold(
      backgroundColor: const Color(0xFFF8F9FB),
      appBar: AppBar(backgroundColor: Colors.white, foregroundColor: _ink,
        title: const Text('Daily report', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [IconButton(tooltip: 'Reload report', icon: const Icon(Icons.refresh_rounded),
          onPressed: () { Navigator.pop(pageContext); _openReport(summary); })]),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _api.getOperationReport(session: widget.session, reportId: id),
        builder: (ctx, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) return Center(child: Padding(padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.cloud_off_outlined, size: 35, color: _muted),
              const SizedBox(height: 12), const Text('Unable to load daily report',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
              const SizedBox(height: 8), Text('${snap.error}', textAlign: TextAlign.center),
              const SizedBox(height: 16), OutlinedButton(onPressed: () {
                Navigator.pop(pageContext); _openReport(summary);
              }, child: const Text('Try again')),
            ])));
          final response = snap.data ?? <String, dynamic>{};
          final report = response['report'] is Map ? _reportMap(response['report']) : response;
          final snapshot = _reportMap(report['snapshot']);
          final sums = _reportMap(snapshot['summary']);
          final cash = _reportMap(snapshot['cashPosition']);
          final opening = _reportMap(snapshot['openingCash']);
          dynamic get(List<String> keys) => _reportPick(sums, keys) ?? _reportPick(cash, keys)
              ?? _reportPick(opening, keys) ?? _reportPick(snapshot, keys) ?? _reportPick(report, keys);
          dynamic section(String key) => snapshot[key] ?? report[key];
          final date = _date(report).isEmpty ? _date(summary) : _date(report);
          final status = _status(report).isEmpty ? _status(summary) : _status(report);
          final deposits = section('bankings');
          final bankingRows = deposits is List ? deposits.whereType<Map>().toList() : <Map>[];
          num? bankingTotal(bool mobile) {
            if (deposits is! List) return null;
            num total = 0;
            for (final r in bankingRows) {
              final channel = '${r['type'] ?? r['channel'] ?? r['method'] ?? ''}'.toLowerCase();
              final isMobile = channel.contains('mobile') || channel.contains('momo');
              if (isMobile != mobile) continue;
              final amount = num.tryParse('${r['amount'] ?? ''}');
              if (amount != null) total += amount;
            }
            return total;
          }
          return ListView(padding: const EdgeInsets.fromLTRB(16, 17, 16, 35), children: [
            Text(_displayDate(date), style: const TextStyle(fontSize: 24,
              fontWeight: FontWeight.w800, color: _ink)),
            const SizedBox(height: 8),
            Row(children: [Text(_weekday(date), style: const TextStyle(color: _muted)),
              const SizedBox(width: 9), _pill(_readable(status.isEmpty ? 'Unknown' : status),
                status.toLowerCase().contains('return') ? const Color(0xFFDC831D) : _green)]),
            const SizedBox(height: 16),
            Container(padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: const Color(0xFFEDF7F1),
                border: Border.all(color: const Color(0xFFD4E9DB)),
                borderRadius: BorderRadius.circular(16)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('CLOSING CASH SUMMARY', style: TextStyle(fontSize: 11,
                  letterSpacing: 1, fontWeight: FontWeight.w800, color: _green)),
                const SizedBox(height: 9),
                Text(_reportDisplay(get(['expectedClosingBalance', 'expectedClosing'])),
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: _ink)),
                const Text('Expected closing balance', style: TextStyle(fontSize: 12, color: _muted)),
                const Divider(height: 23, color: Color(0xFFD4E9DB)),
                _reportLine('Counted closing cash', get(['countedCash', 'countedClosing'])),
                _reportLine('Cash variance', get(['variance'])),
              ])),
            const SizedBox(height: 18),
            const Padding(padding: EdgeInsets.only(left: 4, bottom: 10),
              child: Text('FINANCIAL BREAKDOWN', style: TextStyle(fontSize: 11,
                fontWeight: FontWeight.w800, letterSpacing: 1, color: _muted))),
            _reportExpansion('Cash position', 'Opening, additions and cash-outs',
              Icons.account_balance_wallet_outlined, [
                _reportExpansion('Opening balance', 'Funds available at opening',
                  Icons.savings_outlined, [
                    _reportLine('Previous closing balance', get(['previousClosingBalance'])),
                    _reportLine('Cash added today', get(['cashAddedToday', 'topUpsAdded'])),
                    _reportLine('Total opening cash', get(['totalOpeningBalance', 'openingCash'])),
                    _reportLine('Float set aside', get(['floatSetAside'])),
                  ], total: get(['totalOpeningBalance', 'openingCash'])),
                _reportExpansion('Cash received', 'Collections, fees and returns',
                  Icons.add_circle_outline, [
                    _reportLine('Branch repayments', get(['branchRepayments', 'collectionsReceived'])),
                    _reportLine('Processing fees', get(['loanProcessingFees', 'processingFees'])),
                    _reportLine('Cash returned by officers', get(['cashReturnedByAgents'])),
                    _reportLine('Shortage recoveries', get(['shortageRecoveries'])),
                    _reportLine('Capital top-ups', get(['topUpsAdded'])),
                  ]),
                _reportExpansion('Cash outflows', 'Disbursements and expenditure',
                  Icons.remove_circle_outline, [
                    _reportLine('Loans issued', get(['loansIssued', 'loansIssuedPrincipal'])),
                    _reportLine('Expenses', get(['expenses', 'branchExpenses'])),
                    _reportLine('Staff salaries', get(['salaries'])),
                    _reportLine('Float distributed', get(['floatDistributed'])),
                    _reportLine('Daily deposits', get(['bankings'])),
                  ]),
              ], total: get(['expectedClosingBalance']), initiallyExpanded: true),
            _reportExpansion('Daily deposits', 'Banking and mobile money',
              Icons.account_balance_outlined, [
                _reportLine('Bank deposits', bankingTotal(false)),
                _reportLine('Mobile money deposits', bankingTotal(true)),
                const Divider(height: 20),
                ..._reportRecords(deposits, type: 'deposits'),
              ], total: get(['bankings', 'bankingsTotal'])),
            _reportExpansion('Staff accountability', 'Float, collections and cash returned',
              Icons.groups_outlined,
              _reportRecords(section('agentReturns'), type: 'staff returns')),
            _reportExpansion('Loans issued today', 'Disbursements and borrower details',
              Icons.receipt_long_outlined,
              _reportRecords(section('loansIssued'), type: 'loans'),
              total: get(['loansIssuedPrincipal'])),
            _reportExpansion('Repayments collected', 'Payments and borrower details',
              Icons.payments_outlined,
              _reportRecords(section('repayments'), type: 'repayments'),
              total: get(['collectionsReceived'])),
            _reportExpansion('Expenses', 'Branch and staff expenditure',
              Icons.receipt_outlined,
              _reportRecords(section('expenses'), type: 'expenses'),
              total: get(['expenses'])),
            _reportExpansion('Salary payments', 'Staff payments for this business day',
              Icons.badge_outlined,
              _reportRecords(section('salaries'), type: 'salary payments'),
              total: get(['salaries'])),
            _reportExpansion('Shortage recoveries', 'Recovered cash shortfalls',
              Icons.rule_folder_outlined,
              _reportRecords(section('shortageRecoveries'), type: 'recoveries'),
              total: get(['shortageRecoveries'])),
            if (section('closingNotes') != null)
              _reportExpansion('Closing notes', 'Manager remarks', Icons.notes_outlined, [
                _reportLine('Remarks', section('closingNotes'), money: false),
              ]),
          ]);
        },
      ),
    )));
  }

  String _readable(String value) => value.replaceAllMapped(RegExp(r'([a-z])([A-Z])'), (m) => '${m[1]} ${m[2]}').replaceAll('_', ' ');
}
