import 'package:flutter/material.dart';

import '../features/repayment/data/repayments_live_store.dart';
import '../models/client_detail.dart';
import '../theme.dart';
import '../utils/money.dart';

Future<void> showRecordRepaymentSheet(
  BuildContext context, {
  required ClientDetail detail,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
    builder: (context) => RecordRepaymentSheet(detail: detail),
  );
}

class RecordRepaymentSheet extends StatefulWidget {
  const RecordRepaymentSheet({super.key, required this.detail});

  final ClientDetail detail;

  @override
  State<RecordRepaymentSheet> createState() => _RecordRepaymentSheetState();
}

class _RecordRepaymentSheetState extends State<RecordRepaymentSheet> {
  late final TextEditingController _amount;
  late final TextEditingController _note;
  static const _noteMax = 120;
  bool _saving = false;
  String _method = 'CASH';
  DateTime _paidAt = DateTime.now();

  static const _methods = <(String, String)>[
    ('CASH', 'Cash'),
    ('MOBILE_MONEY', 'Mobile money'),
    ('BANK_TRANSFER', 'Bank transfer'),
    ('OTHER', 'Other'),
  ];

  @override
  void initState() {
    super.initState();
    _amount = TextEditingController(
      text: formatCompactMoney(widget.detail.expectedToday),
    );
    _note = TextEditingController();
    _amount.addListener(() => setState(() {}));
    _note.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  int get _paidAmount {
    final raw = _amount.text.replaceAll(',', '').replaceAll(' ', '');
    return int.tryParse(raw) ?? 0;
  }

  int get _newOutstanding {
    final next = widget.detail.outstanding - _paidAmount;
    return next < 0 ? 0 : next;
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _paidAt,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked == null) return;
    setState(() {
      _paidAt = DateTime(
        picked.year,
        picked.month,
        picked.day,
        _paidAt.hour,
        _paidAt.minute,
      );
    });
  }

  Future<void> _save() async {
    if (_saving) return;
    if (_paidAmount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a repayment amount.')),
      );
      return;
    }
    if (_paidAmount > widget.detail.outstanding) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Amount exceeds outstanding balance.')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await RepaymentsLiveStore.instance.recordRepayment(
        loanId: widget.detail.loanId.isNotEmpty
            ? widget.detail.loanId
            : widget.detail.id,
        amount: _paidAmount,
        method: _method,
        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
        paidAt: _paidAt,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Repayment of ${formatCompactMoney(_paidAmount)} saved for ${widget.detail.fullName}.',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = widget.detail;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(width: 40, height: 4, color: line),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Record Repayment',
                      style: TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w800,
                        fontSize: 20,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, color: slateText),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      color: sage,
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      detail.initials,
                      style: const TextStyle(
                        color: forestEmerald,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          detail.fullName,
                          style: const TextStyle(
                            color: midnightNavy,
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                        ),
                        Text(
                          detail.phone,
                          style: const TextStyle(color: slateText, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      const Text(
                        'Loan Amount',
                        style: TextStyle(color: slateText, fontSize: 11),
                      ),
                      Text(
                        formatMoney(detail.loanAmount),
                        style: const TextStyle(
                          color: forestEmerald,
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                      Text(
                        'Taken on ${_shortDate(detail.loanStartDate)}',
                        style: const TextStyle(color: slateText, fontSize: 10),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: _MiniCard(
                      icon: Icons.account_balance_wallet_outlined,
                      iconColor: warmGold,
                      label: 'Expected Today',
                      value: formatMoney(detail.expectedToday),
                      valueColor: warmGold,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _MiniCard(
                      icon: Icons.calendar_today_outlined,
                      iconColor: forestEmerald,
                      label: 'Daily Instalment',
                      value: formatMoney(detail.dailyInstalment),
                      valueColor: forestEmerald,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                style: const TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w800,
                  fontSize: 22,
                ),
                decoration: InputDecoration(
                  labelText: 'Amount Paid',
                  labelStyle: const TextStyle(
                    color: forestEmerald,
                    fontWeight: FontWeight.w700,
                  ),
                  floatingLabelBehavior: FloatingLabelBehavior.always,
                  suffixIcon: _amount.text.isEmpty
                      ? null
                      : IconButton(
                          onPressed: () => _amount.clear(),
                          icon: const Icon(Icons.cancel, color: slateText),
                        ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: rembehBorderRadius(rembehRadiusMd),
                    borderSide: const BorderSide(color: forestEmerald, width: 1.4),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: rembehBorderRadius(rembehRadiusMd),
                    borderSide: const BorderSide(color: forestEmerald, width: 1.6),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: sage,
                  border: Border.all(color: line),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'New Outstanding Balance',
                        style: TextStyle(
                          color: slateText,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Text(
                      formatMoney(_newOutstanding),
                      style: const TextStyle(
                        color: forestEmerald,
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                // ignore: deprecated_member_use — controlled value updates with setState
                value: _method,
                decoration: const InputDecoration(
                  labelText: 'Payment method',
                  floatingLabelBehavior: FloatingLabelBehavior.always,
                ),
                items: [
                  for (final method in _methods)
                    DropdownMenuItem(
                      value: method.$1,
                      child: Text(method.$2),
                    ),
                ],
                onChanged: _saving
                    ? null
                    : (value) {
                        if (value == null) return;
                        setState(() => _method = value);
                      },
              ),
              const SizedBox(height: 10),
              InkWell(
                onTap: _saving ? null : _pickDate,
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: 'Payment date',
                    floatingLabelBehavior: FloatingLabelBehavior.always,
                    suffixIcon: Icon(Icons.calendar_today_outlined, size: 18),
                  ),
                  child: Text(
                    _shortDate(_paidAt),
                    style: const TextStyle(
                      color: midnightNavy,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Note (optional)',
                style: TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: _note,
                maxLength: _noteMax,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'Add a note (e.g. promised balance tomorrow)...',
                  counterText: '',
                ),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: Text(
                  '${_note.text.length}/$_noteMax',
                  style: const TextStyle(color: slateText, fontSize: 11),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(_saving ? 'Saving…' : 'Save Repayment'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _shortDate(DateTime value) {
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
}

class _MiniCard extends StatelessWidget {
  const _MiniCard({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.value,
    required this.valueColor,
  });

  final IconData icon;
  final Color iconColor;
  final String label;
  final String value;
  final Color valueColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: softIvory,
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: iconColor),
          const SizedBox(height: 6),
          Text(
            label,
            style: const TextStyle(color: slateText, fontSize: 11),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              color: valueColor,
              fontWeight: FontWeight.w800,
              fontSize: 15,
            ),
          ),
        ],
      ),
    );
  }
}
