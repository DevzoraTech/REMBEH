import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../features/repayment/data/repayment_repository_impl.dart';
import '../features/repayment/data/repayments_live_store.dart';
import '../models/client_detail.dart';
import '../theme.dart';
import '../utils/date_groups.dart';
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
      shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
      builder: (context) => ClientDetailsSheet(detail: detail),
    );

    if (action == 'record_repayment' && context.mounted) {
      await showRecordRepaymentSheet(context, detail: detail);
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

class ClientDetailsSheet extends StatelessWidget {
  const ClientDetailsSheet({super.key, required this.detail});

  final ClientDetail detail;

  Future<void> _copyPhone(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: detail.phone));
    if (!context.mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('Copied ${detail.phone}')));
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.sizeOf(context).height * 0.92;
    final now = DateTime.now();
    final canRecordPayment =
        detail.outstanding > 0 &&
        !{
          'CLOSED',
          'WRITTEN_OFF',
          'PARTIALLY_DISBURSED',
          'REJECTED',
          'DRAFT',
        }.contains(detail.status.toUpperCase());

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
                                  'Profile photo on file',
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
                      icon: const Icon(Icons.phone),
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
                const SizedBox(height: 10),
                Row(
                  children: [
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
                if (detail.correctionAccess.enabled) ...[
                  const SizedBox(height: 14),
                  _CorrectionAccessCard(detail: detail),
                ],
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
                                        ? 'Field Officer'
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
                            _PaymentHistoryTrailing(
                              detail: detail,
                              payment: payment,
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

  String _relativeDays(DateTime value, DateTime now) {
    final days = DateTime(
      now.year,
      now.month,
      now.day,
    ).difference(DateTime(value.year, value.month, value.day)).inDays;
    if (days <= 0) return 'today';
    if (days == 1) return '1 day ago';
    return '$days days ago';
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

    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 138, maxWidth: 154),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            formatMoney(widget.payment.amount),
            style: const TextStyle(
              color: forestEmerald,
              fontWeight: FontWeight.w800,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 4),
          if (widget.payment.correctionLocked)
            const Text(
              'Locked by report',
              textAlign: TextAlign.right,
              style: TextStyle(
                color: slateText,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            )
          else if (canManagerCorrect)
            _CorrectionActionButton(
              label: 'Correct payment',
              icon: Icons.edit_outlined,
              tone: forestEmerald,
              onPressed: _applyApprovedCorrection,
            )
          else if (pending)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF7E6),
                border: Border.all(color: const Color(0xFFE9C46A)),
                borderRadius: rembehBorderRadius(rembehRadiusSm),
              ),
              child: const Text(
                'Correction pending',
                textAlign: TextAlign.right,
                style: TextStyle(
                  color: Color(0xFFC45C26),
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            )
          else if (approvedForOfficer)
            _CorrectionActionButton(
              label: 'Edit approved',
              icon: Icons.check_circle_outline,
              tone: forestEmerald,
              onPressed: _applyApprovedCorrection,
            )
          else if (widget.payment.canRequestCorrection)
            _CorrectionActionButton(
              label: 'Request correction',
              icon: Icons.outgoing_mail,
              tone: const Color(0xFFC45C26),
              onPressed: _requestCorrection,
            ),
        ],
      ),
    );
  }
}

class _CorrectionActionButton extends StatelessWidget {
  const _CorrectionActionButton({
    required this.label,
    required this.icon,
    required this.tone,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final Color tone;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 31,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, size: 14),
        label: Text(label, overflow: TextOverflow.ellipsis),
        style: OutlinedButton.styleFrom(
          foregroundColor: tone,
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          visualDensity: VisualDensity.compact,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          side: BorderSide(color: tone.withValues(alpha: 0.45)),
          shape: RoundedRectangleBorder(
            borderRadius: rembehBorderRadius(rembehRadiusSm),
          ),
          textStyle: const TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}

class _CorrectionAccessCard extends StatelessWidget {
  const _CorrectionAccessCard({required this.detail});

  final ClientDetail detail;

  @override
  Widget build(BuildContext context) {
    final access = detail.correctionAccess;
    final source = access.source == 'BRANCH'
        ? 'Branch enabled'
        : access.source == 'ORGANIZATION'
        ? 'Organization enabled'
        : 'Admin enabled';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        border: Border.all(color: const Color(0xFFE8C46A)),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 34,
                height: 34,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: rembehBorderRadius(rembehRadiusSm),
                ),
                child: const Icon(
                  Icons.admin_panel_settings_outlined,
                  color: warmGold,
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Strict correction mode',
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '$source. Every correction is saved to audit logs.',
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                    if (access.reason != null && access.reason!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          access.reason!,
                          style: const TextStyle(
                            color: midnightNavy,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            height: 1.35,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).pop('correct_legacy'),
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Correct record'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: forestEmerald,
                    side: const BorderSide(color: forestEmerald),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).pop('delete_legacy'),
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Delete'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFE11D48),
                    side: const BorderSide(color: Color(0xFFE11D48)),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
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
