import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../features/repayment/data/repayment_repository_impl.dart';
import '../features/repayment/data/repayments_live_store.dart';
import '../models/client_detail.dart';
import '../theme.dart';
import '../utils/date_groups.dart';
import '../utils/money.dart';
import 'record_repayment_sheet.dart';

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
    builder: (_) => const Center(
      child: CircularProgressIndicator(color: forestEmerald),
    ),
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
      shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
      builder: (context) => ClientDetailsSheet(detail: detail),
    );

    if (action == 'record_repayment' && context.mounted) {
      await showRecordRepaymentSheet(context, detail: detail);
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

class ClientDetailsSheet extends StatelessWidget {
  const ClientDetailsSheet({super.key, required this.detail});

  final ClientDetail detail;

  Future<void> _copyPhone(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: detail.phone));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Copied ${detail.phone}')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.sizeOf(context).height * 0.92;
    final now = DateTime.now();

    return SizedBox(
      height: height,
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
                          Text(
                            detail.fullName,
                            style: const TextStyle(
                              color: midnightNavy,
                              fontWeight: FontWeight.w800,
                              fontSize: 18,
                            ),
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'Client wallet',
                            style: TextStyle(
                              color: forestEmerald,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
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
                          if (detail.agentPhotoUrl != null &&
                              detail.agentPhotoUrl!.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                ClipOval(
                                  child: Image.network(
                                    detail.agentPhotoUrl!,
                                    width: 28,
                                    height: 28,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, _, _) => Container(
                                      width: 28,
                                      height: 28,
                                      color: sage,
                                      alignment: Alignment.center,
                                      child: const Icon(
                                        Icons.person_outline,
                                        size: 16,
                                        color: forestEmerald,
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                const Text(
                                  'Agent photo on file',
                                  style: TextStyle(
                                    color: slateText,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => _copyPhone(context),
                      style: IconButton.styleFrom(
                        side: const BorderSide(color: forestEmerald),
                        foregroundColor: forestEmerald,
                      ),
                      icon: const Icon(Icons.phone_outlined),
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
                        label: 'Last Payment',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              formatMoney(detail.lastPaymentAmount),
                              style: const TextStyle(
                                color: midnightNavy,
                                fontWeight: FontWeight.w800,
                                fontSize: 18,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              detail.lastPaymentAt == null
                                  ? 'No payments yet'
                                  : '${_shortDate(detail.lastPaymentAt!)} (${_relativeDays(detail.lastPaymentAt!, now)})',
                              style: const TextStyle(
                                color: slateText,
                                fontSize: 11,
                              ),
                            ),
                            if (detail.lastPaymentBy != null &&
                                detail.lastPaymentBy!.isNotEmpty)
                              Text.rich(
                                TextSpan(
                                  style: const TextStyle(
                                    color: slateText,
                                    fontSize: 11,
                                  ),
                                  children: [
                                    const TextSpan(text: 'By: '),
                                    TextSpan(
                                      text: detail.lastPaymentBy,
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
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _MetricCell(
                        icon: Icons.account_balance_wallet_outlined,
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
                        icon: Icons.calendar_today_outlined,
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
                        icon: Icons.event_outlined,
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
                              icon: Icons.payments_outlined,
                              label: 'Loan Amount',
                              value: formatMoney(detail.loanAmount),
                            ),
                          ),
                          Expanded(
                            child: _DetailItem(
                              icon: Icons.percent,
                              label: 'Interest Rate',
                              value: detail.interestRatePercent ==
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
                              icon: Icons.calendar_month_outlined,
                              label: 'Repayments start',
                              value: _shortDate(
                                detail.paymentStartDate ?? detail.loanStartDate,
                              ),
                            ),
                          ),
                          Expanded(
                            child: _DetailItem(
                              icon: Icons.event_available_outlined,
                              label: 'Maturity Date',
                              value: _shortDate(detail.maturityDate),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                if (detail.paymentHistory.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Payment history',
                      style: TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...groupByLocalDate(
                    detail.paymentHistory,
                    (item) => item.paidAt,
                  ).expand((group) sync* {
                    yield Padding(
                      padding: const EdgeInsets.only(top: 6, bottom: 4),
                      child: Text(
                        group.label,
                        style: const TextStyle(
                          color: slateText,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    );
                    for (final payment in group.items) {
                      yield Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          border: Border.all(color: line),
                          color: Colors.white,
                        ),
                        child: Row(
                          children: [
                            if (payment.agentPhotoUrl != null &&
                                payment.agentPhotoUrl!.isNotEmpty) ...[
                              ClipOval(
                                child: Image.network(
                                  payment.agentPhotoUrl!,
                                  width: 32,
                                  height: 32,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) => Container(
                                    width: 32,
                                    height: 32,
                                    color: sage,
                                    alignment: Alignment.center,
                                    child: const Icon(
                                      Icons.person_outline,
                                      size: 16,
                                      color: forestEmerald,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                            ],
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    payment.recordedByName.isEmpty
                                        ? 'Agent'
                                        : payment.recordedByName,
                                    style: const TextStyle(
                                      color: midnightNavy,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${payment.method.replaceAll('_', ' ')} · ${_shortDate(payment.paidAt)}',
                                    style: const TextStyle(
                                      color: slateText,
                                      fontSize: 11,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              formatMoney(payment.amount),
                              style: const TextStyle(
                                color: forestEmerald,
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                      );
                    }
                  }),
                ],
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: () =>
                      Navigator.of(context).pop('record_repayment'),
                  icon: const Icon(Icons.payments_outlined),
                  label: const Text('Record payment'),
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

  String _relativeDays(DateTime value, DateTime now) {
    final days = DateTime(now.year, now.month, now.day)
        .difference(DateTime(value.year, value.month, value.day))
        .inDays;
    if (days <= 0) return 'today';
    if (days == 1) return '1 day ago';
    return '$days days ago';
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
