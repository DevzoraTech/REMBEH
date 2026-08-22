import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../application/list_cash_shortages.dart';
import '../../data/repositories/cash_shortages_repository_impl.dart';
import '../../domain/models/cash_shortage.dart';
import '../controllers/shortages_controller.dart';
import '../utils/shortage_formatters.dart';
import '../widgets/shortage_filter_tabs.dart';
import '../widgets/shortage_list_row.dart';
import '../widgets/shortage_messages.dart';
import '../widgets/shortage_summary_card.dart';
import 'shortage_details_screen.dart';

class ShortagesScreen extends StatefulWidget {
  const ShortagesScreen({
    super.key,
    required this.session,
    this.initialShortages = const [],
    this.branchId,
    this.userId,
    this.title = 'Shortages',
    this.subtitle = 'Track and settle shortages',
  });

  final RembehSession session;
  final List<CashShortage> initialShortages;
  final String? branchId;
  final String? userId;
  final String title;
  final String subtitle;

  @override
  State<ShortagesScreen> createState() => _ShortagesScreenState();
}

class _ShortagesScreenState extends State<ShortagesScreen> {
  late final ShortagesController _controller;

  @override
  void initState() {
    super.initState();

    final repository = CashShortagesRepositoryImpl(
      apiClient: ApiClient(SessionStore()),
    );

    _controller = ShortagesController(
      listCashShortages: ListCashShortages(repository),
    );

    if (widget.initialShortages.isNotEmpty) {
      _controller.seed(widget.initialShortages);
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(_load());
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) {
    return _controller.load(
      session: widget.session,
      branchId: widget.branchId,
      userId: widget.userId,
      quiet: quiet,
    );
  }

  Future<void> _openDetails(CashShortage shortage) async {
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ShortageDetailsScreen(
          session: widget.session,
          shortageId: shortage.id,
          initialShortage: shortage,
        ),
      ),
    );

    if (!mounted) {
      return;
    }

    await _load(quiet: true);
  }

  String _emptyMessage(ShortageListFilter filter) {
    return switch (filter) {
      ShortageListFilter.open => 'No open shortages.',
      ShortageListFilter.closed => 'No closed shortages.',
      ShortageListFilter.all => 'No shortages found.',
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const Icon(Icons.arrow_back_rounded, color: midnightNavy),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.title,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(
              widget.subtitle,
              style: const TextStyle(
                color: slateText,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => unawaited(_load()),
            icon: const Icon(Icons.refresh_rounded, color: midnightNavy),
          ),
          PopupMenuButton<ShortageListFilter>(
            icon: const Icon(Icons.filter_alt_outlined, color: midnightNavy),
            onSelected: _controller.setFilter,
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: ShortageListFilter.open,
                child: Text('Open'),
              ),
              PopupMenuItem(
                value: ShortageListFilter.closed,
                child: Text('Closed'),
              ),
              PopupMenuItem(value: ShortageListFilter.all, child: Text('All')),
            ],
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return RefreshIndicator(
            color: forestEmerald,
            onRefresh: _load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: ShortageSummaryCard(
                        icon: Icons.report_gmailerrorred_outlined,
                        label: 'Open shortages',
                        value: '${_controller.openCount}',
                        tone: const Color(0xFFD92D20),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ShortageSummaryCard(
                        icon: Icons.inventory_2_outlined,
                        label: 'Outstanding amount',
                        value: shortageMoney(_controller.openAmount),
                        tone: const Color(0xFFC05A00),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                ShortageFilterTabs(
                  selected: _controller.filter,
                  onChanged: _controller.setFilter,
                ),
                if (_controller.notice != null) ...[
                  const SizedBox(height: 12),
                  ShortageInlineMessage(message: _controller.notice!),
                ],
                if (_controller.error != null) ...[
                  const SizedBox(height: 12),
                  ShortageInlineMessage(
                    message: _controller.error!,
                    error: true,
                  ),
                ],
                const SizedBox(height: 12),
                if (_controller.isLoading && _controller.shortages.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 80),
                    child: Center(
                      child: CircularProgressIndicator(color: forestEmerald),
                    ),
                  )
                else if (_controller.visibleShortages.isEmpty)
                  ShortageEmptyState(message: _emptyMessage(_controller.filter))
                else
                  for (final shortage in _controller.visibleShortages) ...[
                    ShortageListRow(
                      shortage: shortage,
                      onTap: () => _openDetails(shortage),
                    ),
                    const SizedBox(height: 8),
                  ],
              ],
            ),
          );
        },
      ),
    );
  }
}
