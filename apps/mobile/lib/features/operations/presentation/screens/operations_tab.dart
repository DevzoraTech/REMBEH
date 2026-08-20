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
    required this.onRefresh,
    required this.onOpenDay,
    required this.onReceiveCapital,
    required this.onRecordExpense,
    required this.onAllocateFloat,
    required this.onCloseDay,
    required this.onViewActivity,
    this.pendingClosureMessage,
    this.awaitingReportMessage,
    this.onPendingClosure,
    this.onSendAwaitingReport,
    this.onOpenAgentPositions,
  });

  final RembehSession session;

  final OperationDashboardData? operation;
  final List<AgentFloatPosition> agents;
  final List<OperationActivity> activities;

  final bool dayOpen;

  final Future<void> Function() onRefresh;

  final VoidCallback onOpenDay;
  final VoidCallback onReceiveCapital;
  final VoidCallback onRecordExpense;
  final VoidCallback onAllocateFloat;
  final VoidCallback onCloseDay;
  final VoidCallback onViewActivity;

  final String? pendingClosureMessage;
  final String? awaitingReportMessage;

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
          padding: const EdgeInsets.fromLTRB(
            18,
            14,
            18,
            30,
          ),
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
                canOpen: session.hasPermission(
                  'operation.open',
                ),
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

    return RefreshIndicator(
      color: forestEmerald,
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          18,
          14,
          18,
          28,
        ),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          OperationsStatusCard(
            operation: data,
          ),
          const SizedBox(height: 10),
          CashPositionCard(
            operation: data,
          ),
          if (agents.isNotEmpty) ...[
            const SizedBox(height: 10),
            AgentFloatCard(
              agents: agents,
              totalFloat: totalFloat,
              canAllocate:
                  dayOpen &&
                  session.hasPermission(
                    'operation.float.manage',
                  ),
              onAllocateFloat: onAllocateFloat,
              onViewAll: onOpenAgentPositions,
            ),
          ],
          const SizedBox(height: 10),
          OperationsActionsCard(
            canReceiveCapital:
                dayOpen &&
                session.hasPermission(
                  'operation.cash.topup',
                ),
            canAllocateFloat:
                dayOpen &&
                session.hasPermission(
                  'operation.float.manage',
                ),
            canRecordExpense:
                dayOpen &&
                session.hasPermission(
                  'operation.expense.create',
                ),
            canOpenAgentPositions:
                onOpenAgentPositions != null,
            onReceiveCapital: onReceiveCapital,
            onAllocateFloat: onAllocateFloat,
            onRecordExpense: onRecordExpense,
            onAgentPositions: onOpenAgentPositions,
          ),
          if (activities.isNotEmpty) ...[
            const SizedBox(height: 10),
            OperationsActivityCard(
              activities: activities.take(3).toList(),
              onViewAll: onViewActivity,
            ),
          ],
          if (dayOpen &&
              session.hasPermission(
                'operation.close',
              )) ...[
            const SizedBox(height: 10),
            ReconcileCloseCard(
              onTap: onCloseDay,
            ),
          ],
        ],
      ),
    );
  }
}