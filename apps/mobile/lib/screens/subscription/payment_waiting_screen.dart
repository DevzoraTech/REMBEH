import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/network/realtime_client.dart';
import '../../features/sms/data/sms_credits_store.dart';
import '../../services/api_client.dart';
import '../../services/session_store.dart';
import '../../theme.dart';
import '../../utils/friendly_errors.dart';
import '../../utils/money.dart';

String _formatUgx(num amount, [String currency = 'UGX']) {
  return '$currency ${formatCompactMoney(amount)}';
}

/// Screenshot 2 — shown after submit and whenever SMS tab has a pending payment.
class PaymentSubmittedScreen extends StatefulWidget {
  const PaymentSubmittedScreen({
    super.key,
    required this.session,
    required this.paymentId,
    required this.bundleName,
    required this.smsUnits,
    required this.amount,
    required this.currency,
    required this.paymentMethodTitle,
    required this.transactionId,
    this.submittedAt,
    this.embedded = false,
    this.onResolved,
  });

  final RembehSession session;
  final String paymentId;
  final String bundleName;
  final int smsUnits;
  final num amount;
  final String currency;
  final String paymentMethodTitle;
  final String transactionId;
  final DateTime? submittedAt;
  final bool embedded;
  final VoidCallback? onResolved;

  @override
  State<PaymentSubmittedScreen> createState() => _PaymentSubmittedScreenState();
}

class _PaymentSubmittedScreenState extends State<PaymentSubmittedScreen> {
  final _api = ApiClient(SessionStore());

  Timer? _pollTimer;
  late final RealtimeHandler _onPaymentUpdated;

  bool _checking = false;
  bool _failed = false;
  String _statusLabel = 'Pending verification';
  String? _error;

  @override
  void initState() {
    super.initState();
    _onPaymentUpdated = (payload) {
      final paymentId = '${payload['paymentId'] ?? ''}'.trim();
      final nested = payload['payment'];
      final nestedId = nested is Map ? '${nested['id'] ?? ''}'.trim() : '';
      if (paymentId != widget.paymentId && nestedId != widget.paymentId) {
        return;
      }

      final displayStatus = nested is Map
          ? '${nested['status'] ?? ''}'
          : '${payload['status'] ?? ''}';
      final failureReason = nested is Map
          ? (nested['failureReason'] as String?)?.trim()
          : null;
      // ignore: discarded_futures
      _applyStatus(displayStatus, failureReason: failureReason);
    };

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await RealtimeClient.instance.connect(widget.session);
      RealtimeClient.instance.on(
        'subscription_payment.updated',
        _onPaymentUpdated,
      );
      await _checkOnce(silent: true);
      _pollTimer = Timer.periodic(const Duration(seconds: 12), (_) {
        // ignore: discarded_futures
        _checkOnce(silent: true);
      });
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    RealtimeClient.instance.off(
      'subscription_payment.updated',
      _onPaymentUpdated,
    );
    super.dispose();
  }

  Future<void> _checkOnce({bool silent = false}) async {
    if (_failed) return;
    if (!silent && mounted) setState(() => _checking = true);

    try {
      final payload = await _api.getBillingPayments(session: widget.session);
      final raw = payload['payments'];
      if (raw is! List) return;

      Map<String, dynamic>? match;
      for (final row in raw.whereType<Map>()) {
        final map = Map<String, dynamic>.from(row);
        if ('${map['id']}' == widget.paymentId) {
          match = map;
          break;
        }
      }
      if (match == null) return;

      await _applyStatus(
        '${match['status'] ?? ''}',
        failureReason: (match['failureReason'] as String?)?.trim(),
      );
    } catch (error) {
      if (!mounted || silent) return;
      setState(() => _error = friendlyErrorMessage(error));
    } finally {
      if (mounted && !silent) setState(() => _checking = false);
    }
  }

  Future<void> _applyStatus(
    String status, {
    String? failureReason,
  }) async {
    if (!mounted || _failed) return;

    final normalized = status.trim().toLowerCase();
    if (normalized == 'paid' ||
        normalized == 'completed' ||
        normalized == 'credited') {
      await SmsCreditsStore.instance.refresh(silent: true);
      if (!mounted) return;
      // Global celebration modal owns success UX.
      if (widget.embedded) {
        widget.onResolved?.call();
      } else {
        Navigator.of(context).maybePop(true);
      }
      return;
    }

    if (normalized == 'failed' ||
        normalized == 'cancelled' ||
        normalized == 'payment_failed' ||
        normalized == 'payment_mismatch' ||
        normalized == 'expired' ||
        normalized == 'reversed') {
      setState(() {
        _failed = true;
        _statusLabel = status.isEmpty ? 'Failed' : status;
        _error = failureReason?.isNotEmpty == true
            ? failureReason
            : 'Payment verification failed. You can go back and try again.';
        _checking = false;
      });
      return;
    }

    setState(() {
      _statusLabel = 'Pending verification';
      _checking = false;
    });
  }

  String get _submittedLabel {
    final at = widget.submittedAt?.toLocal();
    if (at == null) return '—';
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
    final hour = at.hour % 12 == 0 ? 12 : at.hour % 12;
    final minute = at.minute.toString().padLeft(2, '0');
    final ampm = at.hour >= 12 ? 'PM' : 'AM';
    return '${at.day} ${months[at.month - 1]} ${at.year}, $hour:$minute $ampm';
  }

  @override
  Widget build(BuildContext context) {
    final amountLabel = _formatUgx(widget.amount, widget.currency);
    final body = _buildBody(amountLabel);

    if (widget.embedded) {
      return body;
    }

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: midnightNavy,
        elevation: 0,
        title: const Text(
          'Payment submitted',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: forestEmerald),
          onPressed: () => Navigator.of(context).maybePop(false),
        ),
      ),
      body: body,
    );
  }

  Widget _buildBody(String amountLabel) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
        child: Column(
          children: [
            Expanded(
              child: ListView(
                children: [
                  const SizedBox(height: 12),
                  Center(
                    child: Container(
                      width: 88,
                      height: 88,
                      decoration: const BoxDecoration(
                        color: Color(0xFFFFF4E5),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        _failed
                            ? Icons.error_outline_rounded
                            : Icons.schedule_rounded,
                        size: 44,
                        color: _failed
                            ? const Color(0xFFB42318)
                            : const Color(0xFFE67E22),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    _failed
                        ? 'Verification failed'
                        : 'Payment verification in progress.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: _failed
                          ? const Color(0xFFB42318)
                          : const Color(0xFFE67E22),
                      fontWeight: FontWeight.w900,
                      fontSize: 20,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _failed
                        ? (_error ?? 'Payment could not be verified.')
                        : 'Your payment has been received and is being verified.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: slateText,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 22),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(14, 6, 14, 6),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: rembehBorderRadius(rembehRadiusLg),
                      border: Border.all(color: line),
                    ),
                    child: Column(
                      children: [
                        _DetailRow(
                          icon: Icons.list_alt_rounded,
                          label: 'Bundle',
                          value: widget.bundleName,
                        ),
                        _DetailRow(
                          icon: Icons.chat_bubble_outline_rounded,
                          label: 'SMS credits',
                          value:
                              '${formatCompactMoney(widget.smsUnits)} SMS',
                        ),
                        _DetailRow(
                          icon: Icons.payments_outlined,
                          label: 'Amount',
                          value: amountLabel,
                          emphasize: true,
                        ),
                        _DetailRow(
                          icon: Icons.smartphone_rounded,
                          label: 'Payment method',
                          value: widget.paymentMethodTitle,
                        ),
                        _DetailRow(
                          icon: Icons.tag_rounded,
                          label: 'Transaction ID',
                          value: widget.transactionId,
                        ),
                        _DetailRow(
                          icon: Icons.calendar_today_outlined,
                          label: 'Submitted on',
                          value: _submittedLabel,
                        ),
                        _DetailRow(
                          icon: Icons.schedule_rounded,
                          label: 'Status',
                          value: _failed ? _statusLabel : 'Pending verification',
                          statusChip: !_failed,
                        ),
                      ],
                    ),
                  ),
                  if (!_failed) ...[
                    const SizedBox(height: 16),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE8F7EE),
                        borderRadius: rembehBorderRadius(rembehRadiusMd),
                      ),
                      child: const Row(
                        children: [
                          Icon(
                            Icons.info_outline_rounded,
                            size: 18,
                            color: forestEmerald,
                          ),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              "You'll receive a confirmation message once your payment is verified.",
                              style: TextStyle(
                                color: midnightNavy,
                                fontWeight: FontWeight.w600,
                                fontSize: 12,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (_checking) ...[
                    const SizedBox(height: 14),
                    const Center(
                      child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: forestEmerald,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () {
                  if (widget.embedded) {
                    Navigator.of(context).maybePop();
                  } else {
                    Navigator.of(context).maybePop(_failed ? false : null);
                  }
                },
                child: const Text('Ok'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
    this.emphasize = false,
    this.statusChip = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool emphasize;
  final bool statusChip;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: forestEmerald),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: slateText,
                    fontWeight: FontWeight.w600,
                    fontSize: 11,
                  ),
                ),
                const SizedBox(height: 4),
                if (statusChip)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF4E5),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      value,
                      style: const TextStyle(
                        color: Color(0xFFB45309),
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                    ),
                  )
                else
                  Text(
                    value,
                    style: TextStyle(
                      color: emphasize ? forestEmerald : midnightNavy,
                      fontWeight: FontWeight.w900,
                      fontSize: emphasize ? 16 : 14,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Screenshot 2 content for pending SMS verification.
/// Prefer [PaymentSubmittedScreen]; kept for older imports.
@Deprecated('Use PaymentSubmittedScreen')
typedef PaymentWaitingScreen = PaymentSubmittedScreen;
