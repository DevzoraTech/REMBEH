import 'package:flutter/material.dart';

import '../../../../../services/api_client.dart';
import '../../../../../services/session_store.dart';
import '../../../../../theme.dart';
import '../../../application/report/load_daily_report.dart';
import '../../../data/repositories/daily_report_repository_impl.dart';
import '../../controllers/daily_report_controller.dart';
import '../widgets/agent_accountability_report_table.dart';
import '../widgets/cash_movement_report_table.dart';
import '../widgets/discrepancies_report_table.dart';
import '../widgets/expenses_report_table.dart';
import '../widgets/loans_issued_report_table.dart';
import '../widgets/processing_fees_report_table.dart';
import '../widgets/repayments_report_table.dart';
import '../widgets/report_header.dart';
import '../widgets/report_notes_section.dart';
import '../widgets/report_typography.dart';

class DailyReportScreen extends StatefulWidget {
  const DailyReportScreen({
    super.key,
    required this.session,
    this.reportId,
    this.date,
    this.branchId,
  }) : assert(
          reportId != null ||
              date != null,
          'Either reportId or date must be provided.',
        );

  final RembehSession session;
  final String? reportId;
  final String? date;
  final String? branchId;

  @override
  State<DailyReportScreen>
      createState() =>
          _DailyReportScreenState();
}

class _DailyReportScreenState
    extends State<DailyReportScreen> {
  late final DailyReportController
      _controller;

  @override
  void initState() {
    super.initState();

    final store =
        SessionStore();

    final api =
        ApiClient(store);

    final repository =
        DailyReportRepositoryImpl(
      apiClient: api,
    );

    _controller =
        DailyReportController(
      loadDailyReport:
          LoadDailyReport(
        repository,
      ),
    );

    _load();
  }

  Future<void> _load() async {
    final reportId =
        widget.reportId;

    if (reportId != null &&
        reportId.isNotEmpty) {
      await _controller
          .loadPersisted(
        session:
            widget.session,
        reportId:
            reportId,
      );

      return;
    }

    final date =
        widget.date;

    if (date == null ||
        date.isEmpty) {
      return;
    }

    await _controller.loadLive(
      session:
          widget.session,
      date: date,
      branchId:
          widget.branchId,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(
    BuildContext context,
  ) {
    return Scaffold(
      backgroundColor:
          Colors.white,
      appBar: AppBar(
        backgroundColor:
            Colors.white,
        elevation: 0,
        scrolledUnderElevation:
            0,
        leading: IconButton(
          onPressed: () {
            Navigator.of(context)
                .pop();
          },
          icon: const Icon(
            Icons
                .arrow_back_rounded,
            color:
                midnightNavy,
            size: 21,
          ),
        ),
        titleSpacing: 0,
        title: const Text(
          'Daily Reconciliation Report',
          style: TextStyle(
            color:
                midnightNavy,
            fontSize: 16,
            fontWeight:
                FontWeight.w800,
          ),
        ),
        bottom: const PreferredSize(
          preferredSize:
              Size.fromHeight(1),
          child: Divider(
            height: 1,
            color: line,
          ),
        ),
      ),
      body: AnimatedBuilder(
        animation:
            _controller,
        builder:
            (context, _) {
          if (_controller
                  .isLoading &&
              _controller
                      .report ==
                  null) {
            return const Center(
              child:
                  CircularProgressIndicator(
                color:
                    forestEmerald,
              ),
            );
          }

          if (_controller
                      .error !=
                  null &&
              _controller
                      .report ==
                  null) {
            return _ReportErrorState(
              message:
                  _controller
                      .error!,
              onRetry:
                  _load,
            );
          }

          final report =
              _controller
                  .report;

          if (report == null) {
            return const Center(
              child: Text(
                'Report unavailable.',
                style: TextStyle(
                  color:
                      slateText,
                ),
              ),
            );
          }

          final cash =
              report
                  .cashPosition;

          return RefreshIndicator(
            color:
                forestEmerald,
            onRefresh:
                _load,
            child: ListView(
              physics:
                  const AlwaysScrollableScrollPhysics(),
              padding:
                  const EdgeInsets.fromLTRB(
                20,
                16,
                20,
                36,
              ),
              children: [
                ReportHeader(
                  report:
                      report,
                ),

                const SizedBox(
                  height: 14,
                ),
                 CashMovementReportTable(
                           cash: cash,
                ),

                const SizedBox(
                  height: 14,
                ),

                AgentAccountabilityReportTable(
                  agentReturns:
                      report.agentReturns,
                ),

                const SizedBox(
                  height: 14,
                ),

                LoansIssuedReportTable(
                  loans:
                      report.loans,
                ),

                const SizedBox(
                  height: 14,
                ),

                RepaymentsReportTable(
                  repayments:
                      report.repayments,
                ),

                const SizedBox(
                  height: 14,
                ),

                ProcessingFeesReportTable(
                  fees:
                      report.processingFees,
                ),

                const SizedBox(
                  height: 14,
                ),

                ExpensesReportTable(
                  expenses:
                      report.expenses,
                ),

                if (report
                    .variances
                    .isNotEmpty) ...[
                  const SizedBox(
                    height: 14,
                  ),
                  DiscrepanciesReportTable(
                    variances:
                        report.variances,
                  ),
                ],

                if (report.managerNotes
                        ?.trim()
                        .isNotEmpty ==
                    true) ...[
                  const SizedBox(
                    height: 14,
                  ),
                  ReportNotesSection(
                    report:
                        report,
                  ),
                ],

                const SizedBox(
                  height: 22,
                ),

                const _ReadOnlyNotice(),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _ReadOnlyNotice
    extends StatelessWidget {
  const _ReadOnlyNotice();

  @override
  Widget build(
    BuildContext context,
  ) {
    return Container(
      padding:
          const EdgeInsets.symmetric(
        horizontal: 14,
        vertical: 12,
      ),
      decoration: BoxDecoration(
        color:
            const Color(
          0xFFF7F8FA,
        ),
        borderRadius:
            rembehBorderRadius(
          rembehRadiusMd,
        ),
      ),
      child: Row(
        crossAxisAlignment:
            CrossAxisAlignment.start,
        children: [
          Icon(
            Icons
                .lock_outline_rounded,
            color:
                slateText,
            size: 20,
          ),
          SizedBox(
            width: 10,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Text(
                  'This is a read-only report.',
                  style:
                      TextStyle(
                    color:
                        midnightNavy,
                    fontSize: ReportType.body(context),
                    fontWeight:
                        FontWeight.w800,
                  ),
                ),
                SizedBox(
                  height: 2,
                ),
                Text(
                  'No actions can be performed from this view.',
                  style:
                      TextStyle(
                    color:
                        slateText,
                    fontSize: ReportType.secondary(context),
                    height: 1.3,
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

class _ReportErrorState
    extends StatelessWidget {
  const _ReportErrorState({
    required this.message,
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(
    BuildContext context,
  ) {
    return Center(
      child: Padding(
        padding:
            const EdgeInsets.all(
          24,
        ),
        child: Column(
          mainAxisSize:
              MainAxisSize.min,
          children: [
            const Icon(
              Icons
                  .error_outline_rounded,
              color:
                  Color(
                0xFFB42318,
              ),
              size: 32,
            ),
            const SizedBox(
              height: 10,
            ),
            Text(
              message,
              textAlign:
                  TextAlign.center,
              style:
                  const TextStyle(
                color:
                    slateText,
                fontSize: 11,
                height: 1.4,
              ),
            ),
            const SizedBox(
              height: 14,
            ),
            OutlinedButton(
              onPressed:
                  onRetry,
              child:
                  const Text(
                'Try again',
              ),
            ),
          ],
        ),
      ),
    );
  }
}