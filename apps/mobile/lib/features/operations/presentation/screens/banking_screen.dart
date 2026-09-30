import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';

enum _BankingPeriod { today, week, month, all }

class BankingScreen extends StatefulWidget {
  const BankingScreen({
    super.key,
    required this.session,
    required this.api,
    this.initialDate,
  });

  final RembehSession session;
  final ApiClient api;
  final String? initialDate;

  @override
  State<BankingScreen> createState() => _BankingScreenState();
}

class _BankingScreenState extends State<BankingScreen> {
  _BankingPeriod _period = _BankingPeriod.today;
  List<_BankingRecord> _records = const [];
  bool _loading = true;
  String? _error;
  DateTime? _customDate;
  int _loadGeneration = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final generation = ++_loadGeneration;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final range = _rangeFor(_period);
      final rows = await widget.api.listBranchBankings(
        session: widget.session,
        branchId: widget.session.branchId,
        from: range.$1,
        to: range.$2,
      );
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _records = rows.map(_BankingRecord.fromJson).toList();
        _loading = false;
      });
    } catch (error) {
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _loading = false;
        _error = error.toString().replaceFirst('ApiException: ', '');
      });
    }
  }

  (String?, String?) _rangeFor(_BankingPeriod period) {
    final now = DateTime.now();
    String date(DateTime value) =>
        '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
    switch (period) {
      case _BankingPeriod.today:
        final today = _customDate == null
            ? (widget.initialDate ?? date(now))
            : date(_customDate!);
        return (today, today);
      case _BankingPeriod.week:
        return (date(now.subtract(Duration(days: now.weekday - 1))), date(now));
      case _BankingPeriod.month:
        return (date(DateTime(now.year, now.month)), date(now));
      case _BankingPeriod.all:
        return (null, null);
    }
  }

  Future<void> _record() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _RecordBankingSheet(
        api: widget.api,
        session: widget.session,
        date: widget.initialDate,
      ),
    );
    if (saved == true) await _load();
  }

  Future<void> _showDay(_BankingRecord selected) async {
    final entries = _records
        .where((record) => record.operationDate == selected.operationDate)
        .toList();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _BankingDaySheet(entries: entries),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: true,
      child: Scaffold(
        backgroundColor: const Color(0xFFF9FAF9),
        body: SafeArea(
          child: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 28),
              children: [
                _BankingHeader(
                  branchName: widget.session.branchName ?? 'Branch',
                  roleName: widget.session.roleName ?? '',
                  onBack: () {
                    ++_loadGeneration;
                    Navigator.of(context).maybePop();
                  },
                  onRecord: _record,
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: _PeriodSelector(
                        value: _period,
                        onChanged: (value) {
                          setState(() {
                            _period = value;
                            _customDate = null;
                          });
                          unawaited(_load());
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.outlined(
                      tooltip: 'Choose date',
                      onPressed: () async {
                        final picked = await showDatePicker(
                          context: context,
                          firstDate: DateTime(2020),
                          lastDate: DateTime.now(),
                          initialDate: _customDate ?? DateTime.now(),
                        );
                        if (picked == null || !mounted) return;
                        setState(() {
                          _period = _BankingPeriod.today;
                          _customDate = picked;
                        });
                        unawaited(_load());
                      },
                      icon: const Icon(Icons.calendar_month_outlined),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                if (_loading)
                  const Padding(
                    padding: EdgeInsets.all(48),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_error != null)
                  _Message(text: _error!, onRetry: _load)
                else if (_records.isEmpty)
                  const _Message(
                    text: 'No banking or mobile money records for this period.',
                  )
                else
                  _BankingTable(records: _records, onTap: _showDay),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BankingHeader extends StatelessWidget {
  const _BankingHeader({
    required this.branchName,
    required this.roleName,
    required this.onBack,
    required this.onRecord,
  });

  final String branchName;
  final String roleName;
  final VoidCallback onBack;
  final VoidCallback onRecord;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 64,
      child: Row(
        children: [
          Material(
            color: const Color(0xFFEAF7F0),
            shape: const CircleBorder(),
            child: IconButton(
              tooltip: 'Back',
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back, color: forestEmerald),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Banking & Mobile Money',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: midnightNavy,
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  '${branchName.toUpperCase()} · $roleName',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: slateText, fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: const Color(0xFFE8F6EE),
            borderRadius: BorderRadius.circular(22),
            child: InkWell(
              onTap: onRecord,
              borderRadius: BorderRadius.circular(22),
              child: const Padding(
                padding: EdgeInsets.fromLTRB(10, 7, 16, 7),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 15,
                      backgroundColor: Color(0xFF079447),
                      child: Icon(Icons.add, size: 19, color: Colors.white),
                    ),
                    SizedBox(width: 8),
                    Text(
                      'Record',
                      style: TextStyle(
                        color: forestEmerald,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PeriodSelector extends StatelessWidget {
  const _PeriodSelector({required this.value, required this.onChanged});
  final _BankingPeriod value;
  final ValueChanged<_BankingPeriod> onChanged;

  @override
  Widget build(BuildContext context) {
    const labels = {
      _BankingPeriod.today: 'Today',
      _BankingPeriod.week: 'This week',
      _BankingPeriod.month: 'This month',
      _BankingPeriod.all: 'All',
    };
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE2E7E4)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: labels.entries.map((entry) {
          final selected = entry.key == value;
          return Expanded(
            child: InkWell(
              onTap: () => onChanged(entry.key),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                color: selected ? const Color(0xFFE8F6EE) : Colors.transparent,
                child: Text(
                  entry.value,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: selected ? forestEmerald : slateText,
                    fontSize: 12,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _BankingTable extends StatelessWidget {
  const _BankingTable({required this.records, required this.onTap});
  final List<_BankingRecord> records;
  final ValueChanged<_BankingRecord> onTap;

  @override
  Widget build(BuildContext context) {
    final sorted = [...records]
      ..sort((a, b) => b.bankedAt.compareTo(a.bankedAt));

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE2E7E4)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          const _BankingHistoryRow(header: true),
          for (final record in sorted)
            InkWell(
              onTap: () => onTap(record),
              child: _BankingHistoryRow(
                type: record.typeLabel,
                date: _dateLabel(record.operationDate),
                recordedBy: _shortName(record.recordedBy),
                amount: _number(record.amount),
                attachmentCount: record.receiptUrl == null ? 0 : 1,
              ),
            ),
        ],
      ),
    );
  }
}

class _BankingHistoryRow extends StatelessWidget {
  const _BankingHistoryRow({
    this.header = false,
    this.type = '',
    this.date = '',
    this.recordedBy = '',
    this.amount = '',
    this.attachmentCount = 0,
  });
  final bool header;
  final String type;
  final String date;
  final String recordedBy;
  final String amount;
  final int attachmentCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 15),
      decoration: BoxDecoration(
        color: header ? const Color(0xFFF4F6F7) : null,
        border: const Border(bottom: BorderSide(color: Color(0xFFEDF0EE))),
      ),
      child: Row(
        children: [
          _historyCell(header ? 'Type' : type, 20, header: header),
          _historyCell(header ? 'Recorded by' : recordedBy, 23, header: header),
          _historyCell(
            header ? 'Amount' : amount,
            18,
            header: header,
            amount: !header,
          ),
          _historyCell(header ? 'Business day' : date, 20, header: header),
          Expanded(
            flex: 19,
            child: header
                ? const Text(
                    'Attachment',
                    style: TextStyle(
                      color: slateText,
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                    ),
                  )
                : Align(
                    alignment: Alignment.centerLeft,
                    child: attachmentCount > 0
                        ? Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFFE8F8EF),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.attachment_rounded,
                                  size: 12,
                                  color: forestEmerald,
                                ),
                                const SizedBox(width: 2),
                                Flexible(
                                  child: Text(
                                    '$attachmentCount file',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: forestEmerald,
                                      fontSize: 9,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          )
                        : Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF1F3F6),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: const Text(
                              'None',
                              style: TextStyle(color: slateText, fontSize: 9),
                            ),
                          ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _historyCell(
    String text,
    int flex, {
    required bool header,
    bool amount = false,
  }) => Expanded(
    flex: flex,
    child: Text(
      text,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: amount ? forestEmerald : (header ? slateText : midnightNavy),
        fontSize: header ? 9 : 10.5,
        fontWeight: header || amount ? FontWeight.w800 : FontWeight.w600,
      ),
    ),
  );
}

class _RecordBankingSheet extends StatefulWidget {
  const _RecordBankingSheet({
    required this.api,
    required this.session,
    this.date,
  });
  final ApiClient api;
  final RembehSession session;
  final String? date;

  @override
  State<_RecordBankingSheet> createState() => _RecordBankingSheetState();
}

class _RecordBankingSheetState extends State<_RecordBankingSheet> {
  final _amount = TextEditingController();
  String? _type;
  PlatformFile? _file;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
      withData: true,
    );
    if (result != null && mounted) setState(() => _file = result.files.single);
  }

  Future<void> _save() async {
    final amount = num.tryParse(_amount.text.replaceAll(',', '').trim());
    if (amount == null || amount <= 0) {
      setState(() => _error = 'Enter the amount.');
      return;
    }
    if (_type == null) {
      setState(() => _error = 'Select Banking or Mobile Money.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      Map<String, String>? receipt;
      final file = _file;
      if (file?.bytes != null) {
        receipt = await widget.api.uploadBankingReceipt(
          session: widget.session,
          branchId: widget.session.branchId,
          bytes: file!.bytes!,
          mimeType: _mime(file.name),
          fileName: file.name,
        );
      }
      await widget.api.recordBranchBanking(
        session: widget.session,
        branchId: widget.session.branchId,
        date: widget.date ?? _isoDate(DateTime.now()),
        amount: amount,
        type: _type!,
        receiptStorageKey: receipt?['storageKey'],
        receiptMimeType: receipt?['mimeType'],
        receiptFileName: receipt?['fileName'],
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error.toString().replaceFirst('ApiException: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          24,
          18,
          24,
          24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Record Banking & Mobile Money',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: midnightNavy,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              const Text(
                'Type *',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _type,
                decoration: const InputDecoration(
                  hintText: 'Select type',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'BANKING', child: Text('Banking')),
                  DropdownMenuItem(
                    value: 'MOBILE_MONEY',
                    child: Text('Mobile Money'),
                  ),
                ],
                onChanged: _saving
                    ? null
                    : (value) => setState(() => _type = value),
              ),
              const SizedBox(height: 18),
              const Text(
                'Amount *',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  prefixText: 'UGX  ',
                  hintText: 'Enter amount',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'Attachment (optional)',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _pick,
                icon: const Icon(Icons.upload_file_outlined),
                label: Text(_file?.name ?? 'Add receipt or proof'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(88),
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _saving ? null : () => Navigator.pop(context),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: _saving ? null : _save,
                      child: Text(_saving ? 'Saving...' : 'Save'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BankingDaySheet extends StatelessWidget {
  const _BankingDaySheet({required this.entries});
  final List<_BankingRecord> entries;

  @override
  Widget build(BuildContext context) {
    final total = entries.fold<num>(0, (sum, row) => sum + row.amount);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _dateLabel(entries.first.operationDate),
                        style: const TextStyle(
                          fontSize: 23,
                          fontWeight: FontWeight.w900,
                          color: midnightNavy,
                        ),
                      ),
                      const Text(
                        'Banking & mobile money record details',
                        style: TextStyle(color: slateText),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 18),
            _DetailLine(
              label: 'Total amount',
              value: _number(total),
              emphasis: true,
            ),
            _DetailLine(
              label: 'Recorded by',
              value: _shortName(entries.first.recordedBy),
            ),
            const SizedBox(height: 20),
            const Text(
              'Entries',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w900,
                color: midnightNavy,
              ),
            ),
            const SizedBox(height: 10),
            Container(
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0xFFE2E7E4)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  const _BankingEntryRow(header: true),
                  for (final entry in entries)
                    _BankingEntryRow(
                      entry: entry,
                      onView: entry.receiptUrl == null
                          ? null
                          : () => _showReceipt(context, entry),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => Navigator.pop(context),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                backgroundColor: midnightNavy,
              ),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    );
  }
}

class _BankingEntryRow extends StatelessWidget {
  const _BankingEntryRow({this.header = false, this.entry, this.onView});

  final bool header;
  final _BankingRecord? entry;
  final VoidCallback? onView;

  @override
  Widget build(BuildContext context) {
    final item = entry;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 13),
      decoration: BoxDecoration(
        color: header ? const Color(0xFFF3F6FA) : Colors.white,
        border: const Border(bottom: BorderSide(color: Color(0xFFE7EAEE))),
      ),
      child: Row(
        children: [
          _cell(header ? 'Type' : item!.typeLabel, 22),
          _cell(header ? 'Amount' : _number(item!.amount), 22, amount: !header),
          _cell(header ? 'Recorded by' : _shortName(item!.recordedBy), 30),
          Expanded(
            flex: 26,
            child: header
                ? const Text(
                    'Attachment',
                    style: TextStyle(
                      color: slateText,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  )
                : onView == null
                ? const Text(
                    'None',
                    style: TextStyle(color: slateText, fontSize: 11),
                  )
                : TextButton.icon(
                    onPressed: onView,
                    icon: const Icon(Icons.visibility_outlined, size: 15),
                    label: const Text('View'),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      backgroundColor: const Color(0xFFE8F8EF),
                      foregroundColor: forestEmerald,
                      textStyle: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _cell(String text, int flex, {bool amount = false}) => Expanded(
    flex: flex,
    child: Text(
      text,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: amount ? forestEmerald : (header ? slateText : midnightNavy),
        fontSize: header ? 10 : 11,
        fontWeight: header || amount ? FontWeight.w800 : FontWeight.w600,
      ),
    ),
  );
}

Future<void> _showReceipt(BuildContext context, _BankingRecord record) async {
  final url = record.receiptUrl!;
  final image = (record.receiptMimeType ?? '').startsWith('image/');
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${record.typeLabel} receipt',
                        style: const TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.w900,
                          color: midnightNavy,
                        ),
                      ),
                      Text(
                        '${_dateLabel(record.operationDate)} · ${_number(record.amount)}',
                        style: const TextStyle(color: slateText),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 14),
            if (image)
              Flexible(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: InteractiveViewer(
                    child: Image.network(url, fit: BoxFit.contain),
                  ),
                ),
              )
            else
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(
                  child: Icon(
                    Icons.picture_as_pdf_outlined,
                    size: 72,
                    color: forestEmerald,
                  ),
                ),
              ),
            const SizedBox(height: 14),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                TextButton.icon(
                  onPressed: () => launchUrl(
                    Uri.parse(url),
                    mode: LaunchMode.externalApplication,
                  ),
                  icon: const Icon(Icons.download_outlined),
                  label: const Text('Download'),
                ),
                TextButton.icon(
                  onPressed: () => SharePlus.instance.share(
                    ShareParams(
                      text: url,
                      subject: '${record.typeLabel} receipt',
                    ),
                  ),
                  icon: const Icon(Icons.ios_share_outlined),
                  label: const Text('Share'),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

class _DetailLine extends StatelessWidget {
  const _DetailLine({
    required this.label,
    required this.value,
    this.emphasis = false,
  });
  final String label;
  final String value;
  final bool emphasis;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 14),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Color(0xFFE2E7E4))),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(label, style: const TextStyle(color: slateText)),
        ),
        Text(
          value,
          style: TextStyle(
            color: emphasis ? forestEmerald : midnightNavy,
            fontWeight: FontWeight.w900,
            fontSize: emphasis ? 18 : 14,
          ),
        ),
      ],
    ),
  );
}

class _Message extends StatelessWidget {
  const _Message({required this.text, this.onRetry});
  final String text;
  final Future<void> Function()? onRetry;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(48),
    child: Column(
      children: [
        const Icon(Icons.account_balance_outlined, size: 42, color: slateText),
        const SizedBox(height: 12),
        Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(color: slateText),
        ),
        if (onRetry != null)
          TextButton(onPressed: onRetry, child: const Text('Retry')),
      ],
    ),
  );
}

class _BankingRecord {
  const _BankingRecord({
    required this.id,
    required this.operationDate,
    required this.amount,
    required this.type,
    required this.bankedAt,
    required this.recordedBy,
    this.receiptUrl,
    this.receiptMimeType,
  });
  final String id;
  final String operationDate;
  final num amount;
  final String type;
  String get typeLabel => type == 'MOBILE_MONEY' ? 'Mobile Money' : 'Banking';
  final DateTime bankedAt;
  final String recordedBy;
  final String? receiptUrl;
  final String? receiptMimeType;
  factory _BankingRecord.fromJson(Map<String, dynamic> json) => _BankingRecord(
    id: json['id']?.toString() ?? '',
    operationDate: json['operationDate']?.toString() ?? '',
    amount: json['amount'] is num
        ? json['amount'] as num
        : num.tryParse('${json['amount']}') ?? 0,
    type: json['type']?.toString() ?? 'BANKING',
    bankedAt:
        DateTime.tryParse(json['bankedAt']?.toString() ?? '') ?? DateTime.now(),
    recordedBy: json['recordedByName']?.toString() ?? 'Unknown',
    receiptUrl: json['receiptUrl']?.toString(),
    receiptMimeType: json['receiptMimeType']?.toString(),
  );
}

String _number(num value) => value.round().toString().replaceAllMapped(
  RegExp(r'\B(?=(\d{3})+(?!\d))'),
  (_) => ',',
);
String _isoDate(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
String _dateLabel(String value) {
  final date = DateTime.tryParse(value);
  if (date == null) return value;
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
  return '${date.day} ${months[date.month - 1]} ${date.year}';
}

String _shortName(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.length < 2) return name.trim();
  return '${parts.first} ${parts.last.substring(0, 1).toUpperCase()}.';
}

String _mime(String name) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}
