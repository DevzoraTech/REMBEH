import 'package:flutter/material.dart';

import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../domain/models/agent_float_position.dart';
import '../../domain/models/operation_activity.dart';
import '../../domain/models/operation_dashboard_data.dart';
import '../widgets/agent_float_card.dart';
import '../widgets/carryover_day_card.dart';
import '../widgets/cash_position_card.dart';
import '../widgets/empty_day_card.dart';
import '../widgets/operations_actions_card.dart';
import '../widgets/operations_activity_card.dart';
import '../widgets/operations_status_card.dart';
import '../widgets/reconcile_close_card.dart';

class OperationsTab extends StatelessWidget {
  const OperationsTab({
    super.key,
    required this.session,
    required this.operation,
    required this.agents,
    required this.activities,
    required this.dayOpen,
    required this.dayActive,
    required this.canOpenDay,
    required this.canRecordCashMovements,
    required this.onRefresh,
    required this.onOpenDay,
    required this.onReceiveCapital,
    required this.onRecordExpense,
    required this.onAllocateFloat,
    required this.onCloseDay,
    required this.onViewActivity,
    this.pendingClosureMessage,
    this.awaitingReportMessage,
    this.openDayBlockedMessage,
    this.operationReadOnlyMessage,
    this.onPendingClosure,
    this.onSendAwaitingReport,
    this.onOpenAgentPositions,
  });

  final RembehSession session;

  final OperationDashboardData? operation;
  final List<AgentFloatPosition> agents;
  final List<OperationActivity> activities;

  /// True only when the operation is OPEN.
  final bool dayOpen;

  /// True when the operation is either OPEN or CLOSING.
  ///
  /// We deliberately keep this separate from [dayOpen]:
  /// - OPEN: normal cash movement is allowed.
  /// - CLOSING: reconciliation remains accessible.
  final bool dayActive;
  final bool canOpenDay;
  final bool canRecordCashMovements;

  final Future<void> Function() onRefresh;

  final VoidCallback onOpenDay;
  final VoidCallback onReceiveCapital;
  final VoidCallback onRecordExpense;
  final VoidCallback onAllocateFloat;
  final VoidCallback onCloseDay;
  final VoidCallback onViewActivity;

  final String? pendingClosureMessage;
  final String? awaitingReportMessage;
  final String? openDayBlockedMessage;
  final String? operationReadOnlyMessage;

  final VoidCallback? onPendingClosure;
  final VoidCallback? onSendAwaitingReport;
  final VoidCallback? onOpenAgentPositions;

  @override
  Widget build(BuildContext context) {
    if (operation == null) {
      return RefreshIndicator(
        color: forestEmerald,
        onRefresh: onRefresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 30),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            if (pendingClosureMessage != null)
              CarryoverDayCard(
                icon: Icons.lock_clock_outlined,
                title: 'Previous day needs closing',
                message: pendingClosureMessage!,
                actionLabel: 'Close this day',
                onAction: onPendingClosure,
              )
            else if (awaitingReportMessage != null)
              CarryoverDayCard(
                icon: Icons.receipt_long_outlined,
                title: 'Report needs sending',
                message: awaitingReportMessage!,
                actionLabel: 'Send report',
                onAction: onSendAwaitingReport,
              )
            else
              EmptyDayCard(
                canOpen: canOpenDay,
                blockedMessage: openDayBlockedMessage,
                onOpenDay: onOpenDay,
              ),
          ],
        ),
      );
    }

    final data = operation!;

    final totalFloat = agents.fold<num>(
      0,
      (sum, agent) => sum + agent.remainingFloat,
    );

    final canReceiveCapital =
        dayOpen &&
        canRecordCashMovements &&
        session.hasPermission('operation.cash.topup');

    final canAllocateFloat =
        dayOpen &&
        canRecordCashMovements &&
        session.hasPermission('operation.float.manage');

    final canRecordExpense =
        dayOpen &&
        canRecordCashMovements &&
        session.hasPermission('operation.expense.create');

    final canReconcile = dayActive && session.hasPermission('operation.close');

    /*
     * Agent positions must remain accessible even when the branch
     * has moved into CLOSING.
     *
     * The manager may need to inspect agent positions while
     * reconciling the day.
     *
     * This is intentionally NOT tied to canUseFieldWorkspace.
     */
    final canOpenAgentPositions =
        onOpenAgentPositions != null &&
        session.hasPermission('operation.float.manage');

    return RefreshIndicator(
      color: forestEmerald,
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 28),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          if (operationReadOnlyMessage != null) ...[
            _OperationReadOnlyBanner(message: operationReadOnlyMessage!),
            const SizedBox(height: 10),
          ],

          OperationsStatusCard(operation: data),

          const SizedBox(height: 10),

          CashPositionCard(operation: data),

          /*
           * Do not hide this section merely because no float has
           * been issued yet.
           *
           * Managers still need an entry point for allocating float
           * and opening agent positions.
           */
          if (agents.isNotEmpty) ...[
            const SizedBox(height: 10),
            AgentFloatCard(
              agents: agents,
              totalFloat: totalFloat,
              canAllocate: canAllocateFloat,
              onAllocateFloat: onAllocateFloat,
              onViewAll: canOpenAgentPositions ? onOpenAgentPositions : null,
            ),
          ],

          const SizedBox(height: 10),

          /*
           * Operational cash actions are available only while OPEN.
           *
           * Once the branch enters CLOSING:
           * - receive capital is locked
           * - allocate float is locked
           * - record expense is locked
           * - agent positions remain viewable
           */
          OperationsActionsCard(
            canReceiveCapital: canReceiveCapital,
            canAllocateFloat: canAllocateFloat,
            canRecordExpense: canRecordExpense,
            canOpenAgentPositions: canOpenAgentPositions,
            onReceiveCapital: onReceiveCapital,
            onAllocateFloat: onAllocateFloat,
            onRecordExpense: onRecordExpense,
            onAgentPositions: canOpenAgentPositions
                ? onOpenAgentPositions
                : null,
          ),

          if (activities.isNotEmpty) ...[
            const SizedBox(height: 10),
            OperationsActivityCard(
              activities: activities.take(3).toList(),
              onViewAll: onViewActivity,
            ),
          ],

          /*
           * Reconciliation must remain visible for both:
           *
           * OPEN    -> manager can begin reconciliation
           * CLOSING -> manager can resume reconciliation
           *
           * Previously this was hidden once the backend changed
           * status to CLOSING, which trapped the manager outside
           * the reconciliation flow.
           */
          if (canReconcile) ...[
            const SizedBox(height: 10),
            ReconcileCloseCard(onTap: onCloseDay),
          ],
        ],
      ),
    );
  }
}

class _OperationReadOnlyBanner extends StatelessWidget {
  const _OperationReadOnlyBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: warmGold.withValues(alpha: 0.10),
        border: Border.all(color: warmGold.withValues(alpha: 0.24)),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline_rounded, color: warmGold, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
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
    );
  }
}
