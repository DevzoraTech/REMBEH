import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../features/repayment/data/repayment_repository_impl.dart';
import '../features/repayment/data/repayments_live_store.dart';
import '../models/client_detail.dart';
import '../theme.dart';
import '../utils/friendly_errors.dart';
import '../utils/money.dart';
import 'legacy_loan_correction_sheet.dart';
import 'record_repayment_sheet.dart';
import 'repayment_correction_apply_sheet.dart';
import 'repayment_correction_request_sheet.dart';

Future<void> showClientDetailsSheet(
  BuildContext context, {
  String? id,
  String? phone,
  String? fullName,
}) async {
  if (id == null || id.isEmpty) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Client loan id is required.')),
    );
    return;
  }

  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) =>
        const Center(child: CircularProgressIndicator(color: forestEmerald)),
  );

  try {
    final domain = await RepaymentsLiveStore.instance.getLoanDetail(id);
    final detail = toUiClientDetail(domain);
    if (!context.mounted) return;
    Navigator.of(context).pop();

    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      useSafeArea: true,
      constraints: BoxConstraints.tightFor(
        height: MediaQuery.sizeOf(context).height,
      ),
      builder: (context) => ClientDetailsSheet(detail: detail),
    );

    if (action == 'record_repayment' && context.mounted) {
      await showRecordRepaymentSheet(context, detail: detail);
    } else if (action == 'refresh' && context.mounted) {
      await showClientDetailsSheet(
        context,
        id: detail.loanId,
        phone: detail.phone,
        fullName: detail.fullName,
      );
    } else if (action == 'correct_legacy' && context.mounted) {
      final corrected = await showLegacyLoanCorrectionSheet(
        context,
        detail: detail,
      );
      if (corrected && context.mounted) {
        await showClientDetailsSheet(
          context,
          id: detail.loanId,
          phone: detail.phone,
          fullName: detail.fullName,
        );
      }
    } else if (action == 'delete_legacy' && context.mounted) {
      await showLegacyLoanDeleteSheet(context, detail: detail);
    }
  } catch (_) {
    if (!context.mounted) return;
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Could not load client details'
          '${fullName != null && fullName.isNotEmpty ? ' for $fullName' : ''}'
          '${phone != null && phone.isNotEmpty ? ' ($phone)' : ''}.',
        ),
      ),
    );
  }
}

class ClientDetailsSheet extends StatefulWidget {
  const ClientDetailsSheet({super.key, required this.detail});

  final ClientDetail detail;

  @override
  State<ClientDetailsSheet> createState() => _ClientDetailsSheetState();
}

enum _PaymentFilter { all, cash, mobileMoney, other }

class _ClientDetailsSheetState extends State<ClientDetailsSheet> {
  final _searchController = TextEditingController();
  _PaymentFilter _paymentFilter = _PaymentFilter.all;

  ClientDetail get detail => widget.detail;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<ClientPaymentHistoryItem> get _visiblePayments {
    final query = _searchController.text.trim().toLowerCase();
    return detail.paymentHistory.where((payment) {
      final method = payment.method.toUpperCase();
      final matchesFilter = switch (_paymentFilter) {
        _PaymentFilter.all => true,
        _PaymentFilter.cash => method == 'CASH',
        _PaymentFilter.mobileMoney => method.contains('MOBILE'),
        _PaymentFilter.other => method != 'CASH' && !method.contains('MOBILE'),
      };
      if (!matchesFilter || query.isEmpty) return matchesFilter;
      return _shortDate(payment.paidAt).toLowerCase().contains(query) ||
          payment.amount.toString().contains(query.replaceAll(',', '')) ||
          payment.recordedByName.toLowerCase().contains(query) ||
          payment.method.toLowerCase().contains(query);
    }).toList();
  }

  Future<void> _copyPhone(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: detail.phone));
    if (!context.mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('Copied ${detail.phone}')));
  }

  @override
  Widget build(BuildContext context) {
    final canRecordPayment =
        detail.outstanding > 0 &&
        !{
          'CLOSED',
          'WRITTEN_OFF',
          'PARTIALLY_DISBURSED',
          'REJECTED',
          'DRAFT',
        }.contains(detail.status.toUpperCase());

    return SizedBox.expand(
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(width: 40, height: 4, color: line),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 52,
                      height: 52,
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
                          fontSize: 16,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  detail.fullName,
                                  style: const TextStyle(
                                    color: midnightNavy,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 18,
                                  ),
                                ),
                              ),
                              if (detail.isFined)
                                Container(
                                  margin: const EdgeInsets.only(left: 8),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFFE8E0),
                                    border: Border.all(
                                      color: const Color(0xFFC45C26),
                                    ),
                                  ),
                                  child: const Text(
                                    'FINED',
                                    style: TextStyle(
                                      color: Color(0xFFC45C26),
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            detail.phone,
                            style: const TextStyle(
                              color: slateText,
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text.rich(
                            TextSpan(
                              style: const TextStyle(
                                color: slateText,
                                fontSize: 12,
                              ),
                              children: [
                                const TextSpan(text: 'Registered by: '),
                                TextSpan(
                                  text: detail.registeredBy,
                                  style: const TextStyle(
                                    color: forestEmerald,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => _copyPhone(context),
                      style: IconButton.styleFrom(
                        side: const BorderSide(color: forestEmerald),
                        foregroundColor: forestEmerald,
                      ),
                      icon: const Icon(Icons.phone),
                    ),
                    if (detail.correctionAccess.enabled)
                      PopupMenuButton<String>(
                        tooltip: 'Loan record actions',
                        icon: const Icon(
                          Icons.more_vert_rounded,
                          color: midnightNavy,
                        ),
                        onSelected: (value) {
                          Navigator.of(context).pop(value);
                        },
                        itemBuilder: (context) => [
                          const PopupMenuItem<String>(
                            value: 'correct_legacy',
                            child: Row(
                              children: [
                                Icon(
                                  Icons.edit_outlined,
                                  color: forestEmerald,
                                  size: 19,
                                ),
                                SizedBox(width: 10),
                                Text('Correct loan record'),
                              ],
                            ),
                          ),
                          if (detail.correctionAccess.canDelete)
                            const PopupMenuItem<String>(
                              value: 'delete_legacy',
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.delete_outline,
                                    color: Color(0xFFE11D48),
                                    size: 19,
                                  ),
                                  SizedBox(width: 10),
                                  Text('Delete loan record'),
                                ],
                              ),
                            ),
                        ],
                      ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close, color: slateText),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: _SummaryTile(
                        label: 'Outstanding',
                        child: Text(
                          formatMoney(detail.outstanding),
                          style: const TextStyle(
                            color: forestEmerald,
                            fontWeight: FontWeight.w800,
                            fontSize: 20,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _SummaryTile(
                        label: 'Fines total',
                        child: Text(
                          formatMoney(detail.finesTotal),
                          style: TextStyle(
                            color: detail.finesTotal > 0
                                ? const Color(0xFFC45C26)
                                : midnightNavy,
                            fontWeight: FontWeight.w800,
                            fontSize: 20,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                if (detail.advanceAmount > 0) ...[
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF1F8F3),
                      border: Border.all(color: const Color(0xFFD8EADF)),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.savings_outlined,
                          color: forestEmerald,
                          size: 20,
                        ),
                        const SizedBox(width: 9),
                        const Expanded(
                          child: Text(
                            'Advance available',
                            style: TextStyle(
                              color: midnightNavy,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        Text(
                          formatMoney(detail.advanceAmount),
                          style: const TextStyle(
                            color: forestEmerald,
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _MetricCell(
                        icon: Icons.account_balance_wallet,
                        iconColor: warmGold,
                        label: 'Expected Today',
                        value: formatMoney(detail.expectedToday),
                        valueColor: warmGold,
                        footnote: detail.carriedForward > 0
                            ? 'Includes ${formatMoney(detail.carriedForward)} carried forward'
                            : null,
                      ),
                    ),
                    Expanded(
                      child: _MetricCell(
                        icon: Icons.calendar_today,
                        iconColor: forestEmerald,
                        label: 'Daily Instalment',
                        value: formatMoney(detail.dailyInstalment),
                        valueColor: forestEmerald,
                      ),
                    ),
                    Expanded(
                      child: _MetricCell(
                        icon: Icons.schedule,
                        iconColor: forestEmerald,
                        label: 'Loan Period',
                        value: '${detail.loanPeriodDays} days',
                        valueColor: forestEmerald,
                        footnote: '${detail.daysLeft} days left',
                      ),
                    ),
                    Expanded(
                      child: _MetricCell(
                        icon: Icons.event,
                        iconColor: warmGold,
                        label: 'Next Due',
                        value: detail.nextDueLabel,
                        valueColor: warmGold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const Text(
                  'Loan Progress',
                  style: TextStyle(
                    color: slateText,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: rembehBorderRadius(rembehRadiusSm),
                  child: LinearProgressIndicator(
                    value: detail.progressRatio,
                    minHeight: 8,
                    backgroundColor: line,
                    color: forestEmerald,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${detail.progressPercent}% paid',
                  style: const TextStyle(
                    color: forestEmerald,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${formatMoney(detail.paidAmount)} of ${formatMoney(detail.loanAmount)}',
                  style: const TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: softIvory,
                    border: Border.all(color: line),
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: _DetailItem(
                              icon: Icons.payments,
                              label: 'Loan Amount',
                              value: formatMoney(detail.loanAmount),
                            ),
                          ),
                          Expanded(
                            child: _DetailItem(
                              icon: Icons.percent,
                              label: 'Interest Rate',
                              value:
                                  detail.interestRatePercent ==
                                      detail.interestRatePercent.roundToDouble()
                                  ? '${detail.interestRatePercent.round()}%'
                                  : '${detail.interestRatePercent}%',
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _DetailItem(
                              icon: Icons.calendar_month,
                              label: 'Repayments start',
                              value: _shortDate(
                                detail.paymentStartDate ?? detail.loanStartDate,
                              ),
                            ),
                          ),
                          Expanded(
                            child: _DetailItem(
                              icon: Icons.event_available,
                              label: 'Maturity Date',
                              value: _shortDate(detail.maturityDate),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                if (detail.fineHistory.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Fine history',
                      style: TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...detail.fineHistory.map(
                    (fine) => Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        border: Border.all(color: line),
                        color: const Color(0xFFFFF8F5),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Period ${fine.periodIndex}',
                                  style: const TextStyle(
                                    color: midnightNavy,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 13,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Applied ${_shortDate(fine.appliedAt)}',
                                  style: const TextStyle(
                                    color: slateText,
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            formatMoney(fine.amount),
                            style: const TextStyle(
                              color: Color(0xFFC45C26),
                              fontWeight: FontWeight.w800,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Repayment History',
                        style: TextStyle(
                          color: midnightNavy,
                          fontWeight: FontWeight.w900,
                          fontSize: 20,
                        ),
                      ),
                    ),
                    Text(
                      '${detail.paymentHistory.length} records',
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.search),
                          hintText: 'Search by date, amount or collector',
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    PopupMenuButton<_PaymentFilter>(
                      initialValue: _paymentFilter,
                      onSelected: (value) =>
                          setState(() => _paymentFilter = value),
                      itemBuilder: (_) => const [
                        PopupMenuItem(
                          value: _PaymentFilter.all,
                          child: Text('All methods'),
                        ),
                        PopupMenuItem(
                          value: _PaymentFilter.cash,
                          child: Text('Cash'),
                        ),
                        PopupMenuItem(
                          value: _PaymentFilter.mobileMoney,
                          child: Text('Mobile money'),
                        ),
                        PopupMenuItem(
                          value: _PaymentFilter.other,
                          child: Text('Other methods'),
                        ),
                      ],
                      child: Container(
                        height: 48,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                          border: Border.all(color: line),
                          borderRadius: rembehBorderRadius(rembehRadiusMd),
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.filter_alt_outlined, size: 19),
                            SizedBox(width: 5),
                            Text(
                              'Filter',
                              style: TextStyle(fontWeight: FontWeight.w800),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                _RepaymentHistoryTable(
                  detail: detail,
                  payments: _visiblePayments,
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: canRecordPayment
                  ? SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton.icon(
                        onPressed: () =>
                            Navigator.of(context).pop('record_repayment'),
                        icon: const Icon(Icons.payments),
                        label: const Text('Record payment'),
                      ),
                    )
                  : Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: sage,
                        border: Border.all(color: line),
                        borderRadius: rembehBorderRadius(rembehRadiusMd),
                      ),
                      child: const Text(
                        'This record is visible for review, but it is not open for repayment.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: slateText,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
            ),
          ),
        ],
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

class _RepaymentHistoryTable extends StatelessWidget {
  const _RepaymentHistoryTable({required this.detail, required this.payments});

  final ClientDetail detail;
  final List<ClientPaymentHistoryItem> payments;

  @override
  Widget build(BuildContext context) {
    if (payments.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(border: Border.all(color: line)),
        child: const Text(
          'No repayments match this search.',
          textAlign: TextAlign.center,
          style: TextStyle(color: slateText, fontWeight: FontWeight.w600),
        ),
      );
    }

    final allPayments = detail.paymentHistory;
    final balanceById = <String, int>{};
    var runningBalance = detail.outstanding;
    for (final payment in allPayments) {
      balanceById[payment.id] = runningBalance;
      runningBalance += payment.amount;
    }

    return Container(
      decoration: BoxDecoration(border: Border.all(color: line)),
      child: Column(
        children: [
          const _RepaymentTableRow.header(),
          for (final payment in payments)
            _RepaymentTableRow(
              detail: detail,
              payment: payment,
              balance: balanceById[payment.id] ?? detail.outstanding,
            ),
          const Padding(
            padding: EdgeInsets.fromLTRB(10, 10, 10, 12),
            child: Row(
              children: [
                Icon(Icons.sms_rounded, size: 17, color: forestEmerald),
                SizedBox(width: 5),
                Text('SMS sent', style: TextStyle(fontSize: 10.5)),
                SizedBox(width: 18),
                Icon(Icons.sms_failed_outlined, size: 17, color: Colors.red),
                SizedBox(width: 5),
                Text('SMS not sent', style: TextStyle(fontSize: 10.5)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RepaymentTableRow extends StatelessWidget {
  const _RepaymentTableRow({
    required this.detail,
    required this.payment,
    required this.balance,
  }) : isHeader = false;

  const _RepaymentTableRow.header()
    : detail = null,
      payment = null,
      balance = 0,
      isHeader = true;

  final ClientDetail? detail;
  final ClientPaymentHistoryItem? payment;
  final int balance;
  final bool isHeader;

  @override
  Widget build(BuildContext context) {
    final row = payment;
    return Container(
      color: isHeader ? const Color(0xFFF5F7F8) : Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: line)),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 21,
            child: Text(
              isHeader ? 'Date' : _date(row!.paidAt),
              style: _style(isHeader),
            ),
          ),
          Expanded(
            flex: 18,
            child: Text(
              isHeader ? 'Paid (UGX)' : formatMoney(row!.amount),
              textAlign: TextAlign.right,
              style: _style(isHeader, strong: !isHeader),
            ),
          ),
          Expanded(
            flex: 19,
            child: Text(
              isHeader ? 'Balance' : formatMoney(balance),
              textAlign: TextAlign.right,
              style: _style(isHeader),
            ),
          ),
          Expanded(
            flex: 23,
            child: Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Text(
                isHeader
                    ? 'Collected by'
                    : row!.recordedByName.trim().isEmpty
                    ? 'Unknown staff'
                    : row.recordedByName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: _style(isHeader),
              ),
            ),
          ),
          SizedBox(
            width: 28,
            child: isHeader
                ? const SizedBox.shrink()
                : Icon(
                    row!.smsStatus == 'sent'
                        ? Icons.sms_rounded
                        : Icons.sms_failed_outlined,
                    size: 17,
                    color: row.smsStatus == 'sent' ? forestEmerald : Colors.red,
                  ),
          ),
          SizedBox(
            width: 30,
            child: isHeader
                ? const SizedBox.shrink()
                : _PaymentHistoryTrailing(detail: detail!, payment: row!),
          ),
        ],
      ),
    );
  }

  TextStyle _style(bool header, {bool strong = false}) => TextStyle(
    color: header ? slateText : midnightNavy,
    fontSize: header ? 9.5 : 10.5,
    fontWeight: header || strong ? FontWeight.w800 : FontWeight.w500,
  );

  static String _date(DateTime value) {
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

class _PaymentHistoryTrailing extends StatefulWidget {
  const _PaymentHistoryTrailing({required this.detail, required this.payment});

  final ClientDetail detail;
  final ClientPaymentHistoryItem payment;

  @override
  State<_PaymentHistoryTrailing> createState() =>
      _PaymentHistoryTrailingState();
}

class _PaymentHistoryTrailingState extends State<_PaymentHistoryTrailing> {
  bool _pendingJustSent = false;
  bool _isVoiding = false;
  bool _isSendingSms = false;

  Future<void> _showDetails() async {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Repayment details'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _PaymentDetailLine(
              label: 'Amount',
              value: formatMoney(widget.payment.amount),
            ),
            _PaymentDetailLine(
              label: 'Date',
              value: _RepaymentTableRow._date(widget.payment.paidAt),
            ),
            _PaymentDetailLine(
              label: 'Collected by',
              value: widget.payment.recordedByName.trim().isEmpty
                  ? 'Unknown staff'
                  : widget.payment.recordedByName,
            ),
            _PaymentDetailLine(
              label: 'Method',
              value: widget.payment.method.replaceAll('_', ' '),
            ),
            if (widget.payment.note?.trim().isNotEmpty == true)
              _PaymentDetailLine(
                label: 'Note',
                value: widget.payment.note!.trim(),
              ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _resendSms() async {
    if (_isSendingSms) return;
    setState(() => _isSendingSms = true);
    try {
      final status = await RepaymentsLiveStore.instance.sendRepaymentSms(
        widget.payment.id,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            status == 'sent'
                ? 'Repayment SMS sent.'
                : 'The SMS was not sent. You can retry from this menu.',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    } finally {
      if (mounted) setState(() => _isSendingSms = false);
    }
  }

  Future<void> _requestCorrection() async {
    final sent = await showRepaymentCorrectionRequestSheet(
      context,
      detail: widget.detail,
      payment: widget.payment,
    );

    if (!mounted || !sent) return;
    setState(() => _pendingJustSent = true);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Correction request sent to manager.')),
    );
  }

  Future<void> _applyApprovedCorrection() async {
    final updated = await showRepaymentCorrectionApplySheet(
      context,
      detail: widget.detail,
      payment: widget.payment,
    );

    if (!mounted || updated == null) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Repayment correction saved.')),
    );
    Navigator.of(context).pop('refresh');
  }

  Future<void> _voidPayment() async {
    if (_isVoiding) return;

    final reason = await showDialog<String>(
      context: context,
      useRootNavigator: true,
      builder: (context) => const _VoidRepaymentDialog(),
    );
    if (reason == null || !mounted) return;

    setState(() => _isVoiding = true);
    try {
      await RepaymentsLiveStore.instance.voidRepayment(
        repaymentId: widget.payment.id,
        loanId: widget.detail.loanId,
        reason: reason,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Repayment voided and loan balance restored.'),
        ),
      );
      Navigator.of(context).pop('refresh');
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    } finally {
      if (mounted) setState(() => _isVoiding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending =
        _pendingJustSent || widget.payment.pendingCorrectionRequestId != null;
    final approvedForOfficer =
        widget.payment.approvedCorrectionRequestId != null &&
        widget.payment.officerCanEdit;
    final canManagerCorrect =
        RepaymentsLiveStore.instance.canReviewRepaymentCorrections;

    return PopupMenuButton<String>(
      padding: EdgeInsets.zero,
      tooltip: 'Repayment actions',
      icon: const Icon(Icons.more_vert, size: 20, color: midnightNavy),
      onSelected: (value) {
        switch (value) {
          case 'details':
            _showDetails();
            return;
          case 'correct':
            _applyApprovedCorrection();
            return;
          case 'request':
            _requestCorrection();
            return;
          case 'void':
            _voidPayment();
            return;
          case 'sms':
            _resendSms();
            return;
        }
      },
      itemBuilder: (_) => [
        const PopupMenuItem(
          value: 'details',
          child: _PaymentMenuItem(
            icon: Icons.visibility_outlined,
            label: 'View details',
          ),
        ),
        if (canManagerCorrect || approvedForOfficer)
          const PopupMenuItem(
            value: 'correct',
            child: _PaymentMenuItem(
              icon: Icons.edit_outlined,
              label: 'Correct payment',
            ),
          )
        else if (!pending && widget.payment.canRequestCorrection)
          const PopupMenuItem(
            value: 'request',
            child: _PaymentMenuItem(
              icon: Icons.outgoing_mail,
              label: 'Request correction',
            ),
          ),
        if (canManagerCorrect && !widget.payment.correctionLocked)
          PopupMenuItem(
            value: 'void',
            enabled: !_isVoiding,
            child: _PaymentMenuItem(
              icon: Icons.delete_outline,
              label: _isVoiding ? 'Voiding...' : 'Void payment',
              color: Colors.red,
            ),
          ),
        PopupMenuItem(
          value: 'sms',
          enabled: !_isSendingSms,
          child: _PaymentMenuItem(
            icon: Icons.send_outlined,
            label: _isSendingSms ? 'Sending SMS...' : 'Resend SMS',
          ),
        ),
      ],
    );
  }
}

class _PaymentMenuItem extends StatelessWidget {
  const _PaymentMenuItem({
    required this.icon,
    required this.label,
    this.color = midnightNavy,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, size: 18, color: color),
      const SizedBox(width: 10),
      Text(label, style: TextStyle(color: color)),
    ],
  );
}

class _PaymentDetailLine extends StatelessWidget {
  const _PaymentDetailLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 92,
          child: Text(label, style: const TextStyle(color: slateText)),
        ),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: const TextStyle(
              color: midnightNavy,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    ),
  );
}

class _VoidRepaymentDialog extends StatefulWidget {
  const _VoidRepaymentDialog();

  @override
  State<_VoidRepaymentDialog> createState() => _VoidRepaymentDialogState();
}

class _VoidRepaymentDialogState extends State<_VoidRepaymentDialog> {
  final _formKey = GlobalKey<FormState>();
  final _reasonController = TextEditingController();

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  void _confirm() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    Navigator.of(context).pop(_reasonController.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Void repayment?'),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'The original record will remain in the audit trail and the loan balance will be restored.',
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _reasonController,
              autofocus: true,
              minLines: 2,
              maxLines: 4,
              textInputAction: TextInputAction.done,
              onFieldSubmitted: (_) => _confirm(),
              validator: (value) {
                if ((value?.trim().length ?? 0) < 6) {
                  return 'Enter a clear reason (at least 6 characters).';
                }
                return null;
              },
              decoration: const InputDecoration(
                labelText: 'Reason for voiding',
                hintText: 'For example: repayment entered twice',
                helperText: 'Required for the audit trail.',
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: Colors.red),
          onPressed: _confirm,
          icon: const Icon(Icons.block_outlined),
          label: const Text('Void repayment'),
        ),
      ],
    );
  }
}

class _SummaryTile extends StatelessWidget {
  const _SummaryTile({required this.label, required this.child});

  final String label;
  final Widget child;

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
          Text(
            label,
            style: const TextStyle(
              color: slateText,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          child,
        ],
      ),
    );
  }
}

class _MetricCell extends StatelessWidget {
  const _MetricCell({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.value,
    required this.valueColor,
    this.footnote,
  });

  final IconData icon;
  final Color iconColor;
  final String label;
  final String value;
  final Color valueColor;
  final String? footnote;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Column(
        children: [
          Icon(icon, size: 18, color: iconColor),
          const SizedBox(height: 4),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: slateText,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: valueColor,
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
          if (footnote != null) ...[
            const SizedBox(height: 2),
            Text(
              footnote!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: slateText, fontSize: 9),
            ),
          ],
        ],
      ),
    );
  }
}

class _DetailItem extends StatelessWidget {
  const _DetailItem({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 16, color: forestEmerald),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(color: slateText, fontSize: 11),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  color: midnightNavy,
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
