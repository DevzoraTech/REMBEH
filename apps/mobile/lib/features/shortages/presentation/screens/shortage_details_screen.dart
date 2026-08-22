import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../application/get_cash_shortage.dart';
import '../../application/record_cash_shortage_payment.dart';
import '../../data/repositories/cash_shortages_repository_impl.dart';
import '../../domain/models/cash_shortage.dart';
import '../sheets/settle_shortage_sheet.dart';
import '../widgets/shortage_detail_cards.dart';
import '../widgets/shortage_messages.dart';

class ShortageDetailsScreen extends StatefulWidget {
  const ShortageDetailsScreen({
    super.key,
    required this.session,
    required this.shortageId,
    this.initialShortage,
  });

  final RembehSession session;
  final String shortageId;
  final CashShortage? initialShortage;

  @override
  State<ShortageDetailsScreen> createState() => _ShortageDetailsScreenState();
}

class _ShortageDetailsScreenState extends State<ShortageDetailsScreen> {
  late final GetCashShortage _getShortage;
  late final RecordCashShortagePayment _recordPayment;

  CashShortage? _shortage;
  bool _loading = false;
  bool _changed = false;
  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();

    final repository = CashShortagesRepositoryImpl(
      apiClient: ApiClient(SessionStore()),
    );

    _getShortage = GetCashShortage(repository);
    _recordPayment = RecordCashShortagePayment(repository);
    _shortage = widget.initialShortage;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(_load(quiet: _shortage != null));
      }
    });
  }

  Future<void> _load({bool quiet = false}) async {
    if (!mounted) {
      return;
    }

    setState(() {
      if (!quiet) {
        _loading = true;
      }
      _error = null;
    });

    try {
      final shortage = await _getShortage(
        session: widget.session,
        shortageId: widget.shortageId,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _shortage = shortage;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = friendlyErrorMessage(error);
        _loading = false;
      });
    }
  }

  Future<void> _settle() async {
    final shortage = _shortage;

    if (shortage == null || shortage.isClosed) {
      return;
    }

    final updated = await showModalBottomSheet<CashShortage>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return SettleShortageSheet(
          session: widget.session,
          shortage: shortage,
          recordPayment: _recordPayment,
        );
      },
    );

    if (updated == null || !mounted) {
      return;
    }

    setState(() {
      _shortage = updated;
      _changed = true;
      _notice = 'Settlement recorded.';
      _error = null;
    });
  }

  void _close() {
    Navigator.of(context).pop(_changed);
  }

  @override
  Widget build(BuildContext context) {
    final shortage = _shortage;

    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          onPressed: _close,
          icon: const Icon(Icons.arrow_back_rounded, color: midnightNavy),
        ),
        title: const Text(
          'Shortage details',
          style: TextStyle(
            color: midnightNavy,
            fontSize: 17,
            fontWeight: FontWeight.w900,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : () => unawaited(_load()),
            icon: const Icon(Icons.refresh_rounded, color: midnightNavy),
          ),
          const SizedBox(width: 4),
        ],
      ),
      bottomNavigationBar: shortage == null || shortage.isClosed
          ? null
          : SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                color: softIvory,
                child: FilledButton(
                  onPressed: _settle,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFE30613),
                    foregroundColor: Colors.white,
                    minimumSize: const Size(double.infinity, 52),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Text(
                    'Settle shortage',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ),
      body: RefreshIndicator(
        color: forestEmerald,
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
          children: [
            if (_loading && shortage == null)
              const Padding(
                padding: EdgeInsets.only(top: 90),
                child: Center(
                  child: CircularProgressIndicator(color: forestEmerald),
                ),
              )
            else if (shortage == null)
              ShortageEmptyState(
                message: _error ?? 'Shortage details could not be loaded.',
              )
            else ...[
              if (_notice != null) ...[
                ShortageInlineMessage(message: _notice!),
                const SizedBox(height: 10),
              ],
              if (_error != null) ...[
                ShortageInlineMessage(message: _error!, error: true),
                const SizedBox(height: 10),
              ],
              ShortageHeaderCard(shortage: shortage),
              const SizedBox(height: 10),
              ShortageDetailsCard(shortage: shortage),
              const SizedBox(height: 10),
              ShortageReconciliationCard(shortage: shortage),
              const SizedBox(height: 10),
              ShortageSettlementSummaryCard(shortage: shortage),
              const SizedBox(height: 10),
              ShortageHistoryCard(shortage: shortage),
            ],
          ],
        ),
      ),
    );
  }
}
