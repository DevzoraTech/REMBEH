import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../../../utils/money.dart';

class UpdateCashCountSheet extends StatefulWidget {
  const UpdateCashCountSheet({
    super.key,
    required this.session,
    required this.date,
    required this.expectedClosingBalance,
    this.branchId,
    this.currentCountedCash,
    this.cashCounts = const [],
  });

  final RembehSession session;
  final String date;
  final String? branchId;

  final num expectedClosingBalance;
  final num? currentCountedCash;

  final List<Map<String, dynamic>> cashCounts;

  @override
  State<UpdateCashCountSheet> createState() =>
      _UpdateCashCountSheetState();
}

class _UpdateCashCountSheetState
    extends State<UpdateCashCountSheet> {
  final SessionStore _store = SessionStore();

  late final ApiClient _api = ApiClient(_store);

  late final TextEditingController _countController;

  bool _saving = false;
  bool _historyExpanded = true;

  String? _error;

  @override
  void initState() {
    super.initState();

    _countController = TextEditingController(
      text: widget.currentCountedCash == null
          ? ''
          : widget.currentCountedCash!
              .round()
              .toString(),
    );
  }

  @override
  void dispose() {
    _countController.dispose();
    super.dispose();
  }

  num? get _counted {
    final clean = _countController.text
        .replaceAll(',', '')
        .trim();

    return num.tryParse(clean);
  }

  num get _variance =>
      (_counted ?? 0) -
      widget.expectedClosingBalance;

  Future<void> _save() async {
    final amount = _counted;

    if (amount == null || amount < 0) {
      setState(() {
        _error =
            'Enter the physical cash counted.';
      });
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await _api
          .updateOperationReconciliationCashCount(
        session: widget.session,
        branchId: widget.branchId,
        date: widget.date,
        countedCash: amount,
      );

      if (!mounted) return;

      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error =
            friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final variance = _variance;
    final counted = _counted;

    return Container(
      constraints: BoxConstraints(
        maxHeight:
            MediaQuery.of(context).size.height *
                0.88,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(28),
        ),
      ),
      padding: EdgeInsets.fromLTRB(
        20,
        10,
        20,
        MediaQuery.of(context)
                .viewInsets
                .bottom +
            18,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment:
              CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(
                    0xFFD7D9DE,
                  ),
                  borderRadius:
                      BorderRadius.circular(99),
                ),
              ),
            ),

            const SizedBox(height: 20),

            const Text(
              'Update counted closing balance',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 19,
                fontWeight: FontWeight.w900,
              ),
            ),

            const SizedBox(height: 4),

            const Text(
              'Enter the total physical cash.',
              style: TextStyle(
                color: slateText,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),

            const SizedBox(height: 20),

            TextField(
              controller: _countController,
              autofocus: true,
              keyboardType:
                  const TextInputType
                      .numberWithOptions(
                decimal: true,
              ),
              onChanged: (_) {
                setState(() {});
              },
              decoration: const InputDecoration(
                labelText: 'Counted closing balance (UGX)',
                hintText: '0',
              ),
            ),

            const SizedBox(height: 18),

            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: line),
                borderRadius:
                    rembehBorderRadius(
                  rembehRadiusMd,
                ),
              ),
              child: Column(
                children: [
                  _ValueRow(
                    label: 'Expected closing balance',
                    value:
                        widget.expectedClosingBalance,
                    color: forestEmerald,
                  ),
                  const SizedBox(height: 12),
                  _ValueRow(
                    label: 'Counted closing balance',
                    value: counted ?? 0,
                  ),
                  const Padding(
                    padding:
                        EdgeInsets.symmetric(
                      vertical: 12,
                    ),
                    child: Divider(
                      height: 1,
                      color: line,
                    ),
                  ),
                  _ValueRow(
                    label: variance < 0
                        ? 'Variance (Shortage)'
                        : variance > 0
                            ? 'Variance (Excess)'
                            : 'Variance',
                    value: variance.abs(),
                    prefix: variance < 0
                        ? '- '
                        : variance > 0
                            ? '+ '
                            : '',
                    color: variance < 0
                        ? const Color(
                            0xFFB42318,
                          )
                        : forestEmerald,
                  ),
                ],
              ),
            ),

            if (widget.cashCounts.isNotEmpty) ...[
              const SizedBox(height: 18),

              Container(
                decoration: BoxDecoration(
                  border: Border.all(color: line),
                  borderRadius:
                      rembehBorderRadius(
                    rembehRadiusMd,
                  ),
                ),
                child: Column(
                  children: [
                    InkWell(
                      onTap: () {
                        setState(() {
                          _historyExpanded =
                              !_historyExpanded;
                        });
                      },
                      child: Padding(
                        padding:
                            const EdgeInsets.all(
                          13,
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.history_rounded,
                              size: 19,
                              color: midnightNavy,
                            ),
                            const SizedBox(width: 9),
                            Expanded(
                              child: Text(
                                'Change history (${widget.cashCounts.length})',
                                style:
                                    const TextStyle(
                                  color:
                                      midnightNavy,
                                  fontSize: 12,
                                  fontWeight:
                                      FontWeight.w800,
                                ),
                              ),
                            ),
                            Icon(
                              _historyExpanded
                                  ? Icons
                                      .keyboard_arrow_up_rounded
                                  : Icons
                                      .keyboard_arrow_down_rounded,
                              color: midnightNavy,
                            ),
                          ],
                        ),
                      ),
                    ),

                    if (_historyExpanded)
                      for (final count
                          in widget.cashCounts)
                        _HistoryRow(
                          count: count,
                        ),
                  ],
                ),
              ),
            ],

            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(
                  color: Color(0xFFB42318),
                  fontSize: 11,
                  fontWeight:
                      FontWeight.w700,
                ),
              ),
            ],

            const SizedBox(height: 22),

            FilledButton.icon(
              onPressed:
                  _saving ? null : _save,
              style: FilledButton.styleFrom(
                minimumSize:
                    const Size.fromHeight(54),
                backgroundColor:
                    forestEmerald,
              ),
              icon: _saving
                  ? const SizedBox.shrink()
                  : const Icon(
                      Icons
                          .check_circle_outline_rounded,
                    ),
              label: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child:
                          CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Update Value',
                    ),
            ),

            const SizedBox(height: 10),

            OutlinedButton(
              onPressed: _saving
                  ? null
                  : () {
                      Navigator.of(context)
                          .pop(false);
                    },
              style: OutlinedButton.styleFrom(
                minimumSize:
                    const Size.fromHeight(54),
              ),
              child: const Text('Cancel'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ValueRow extends StatelessWidget {
  const _ValueRow({
    required this.label,
    required this.value,
    this.prefix = '',
    this.color = midnightNavy,
  });

  final String label;
  final num value;
  final String prefix;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              color: midnightNavy,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        Text(
          '${prefix}UGX ${formatMoney(value)}',
          style: TextStyle(
            color: color,
            fontSize: 13,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({
    required this.count,
  });

  final Map<String, dynamic> count;

  @override
  Widget build(BuildContext context) {
    final previous =
        _nullableNum(count['previousAmount']);

    final current =
        _num(count['countedAmount']);

    final name =
        _string(count['recordedByName']) ??
        'Manager';

    final date =
        _string(count['recordedAt']);

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 13,
        vertical: 11,
      ),
      decoration: const BoxDecoration(
        border: Border(
          top: BorderSide(color: line),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: [
                Text(
                  previous == null
                      ? '—'
                      : 'UGX ${formatMoney(previous)}',
                  style: TextStyle(
                    color: previous == null
                        ? slateText
                        : slateText,
                    fontSize: 10,
                    decoration: previous == null
                        ? null
                        : TextDecoration
                            .lineThrough,
                  ),
                ),
                const Padding(
                  padding:
                      EdgeInsets.symmetric(
                    horizontal: 10,
                  ),
                  child: Icon(
                    Icons.arrow_forward_rounded,
                    size: 15,
                    color: slateText,
                  ),
                ),
                Text(
                  'UGX ${formatMoney(current)}',
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 10,
                    fontWeight:
                        FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment:
                CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.person_outline,
                    size: 13,
                    color: midnightNavy,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    name,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 9,
                      fontWeight:
                          FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  const Icon(
                    Icons.calendar_today_outlined,
                    size: 11,
                    color: slateText,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    _historyDate(date),
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 8,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

num _num(Object? value) {
  if (value is num) return value;

  if (value is String) {
    return num.tryParse(value) ?? 0;
  }

  return 0;
}

num? _nullableNum(Object? value) {
  if (value == null) return null;
  if (value is num) return value;

  if (value is String) {
    return num.tryParse(value);
  }

  return null;
}

String? _string(Object? value) {
  if (value is String &&
      value.trim().isNotEmpty) {
    return value.trim();
  }

  return null;
}

String _historyDate(String? raw) {
  final value =
      DateTime.tryParse(raw ?? '');

  if (value == null) return '';

  final day =
      value.day.toString().padLeft(2, '0');

  final month =
      value.month.toString().padLeft(2, '0');

  final hour =
      value.hour.toString().padLeft(2, '0');

  final minute =
      value.minute.toString().padLeft(2, '0');

  final second =
      value.second.toString().padLeft(2, '0');

  return '$day/$month/${value.year}, $hour:$minute:$second';
}