import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../../../utils/friendly_errors.dart';
import '../../../../utils/money.dart';
import '../../../shortages/data/mappers/cash_shortage_mapper.dart';
import '../../../shortages/domain/models/cash_shortage.dart';
import '../../../shortages/presentation/screens/shortages_screen.dart';
import '../../data/repositories/agents_repository_impl.dart';
import '../../domain/models/agent_account.dart';
import '../../domain/models/agent_activity.dart';
import '../../domain/models/agent_detail.dart';
import '../sheets/edit_agent_profile_sheet.dart';
import '../sheets/reactivate_agent_sheet.dart';
import '../sheets/suspend_agent_sheet.dart';
import 'agent_activity_screen.dart';

const _dangerRed = Color(0xFFD92D20);
const _dangerSoft = Color(0xFFFFF5F5);
const _blue = Color(0xFF175CD3);
const _orange = Color(0xFFD65A1B);
const _purple = Color(0xFF6941C6);

class AgentDetailScreen extends StatefulWidget {
  const AgentDetailScreen({
    super.key,
    required this.session,
    required this.agentId,
    this.onViewActivity,
    this.onViewOperations,
    this.onViewShortages,
    this.onSuspend,
    this.onReactivate,
    this.onEditProfile,
  });

  final RembehSession session;

  /// Internal identifier.
  ///
  /// This is used only for API calls and must never be displayed in the UI.
  final String agentId;

  final VoidCallback? onViewActivity;
  final VoidCallback? onViewOperations;
  final VoidCallback? onViewShortages;
  final VoidCallback? onSuspend;
  final VoidCallback? onReactivate;
  final VoidCallback? onEditProfile;

  @override
  State<AgentDetailScreen> createState() => _AgentDetailScreenState();
}

class _AgentDetailScreenState extends State<AgentDetailScreen> {
  late final ApiClient _api;
  late final AgentsRepositoryImpl _repository;

  AgentDetail? _agent;
  AgentActivity? _activity;
  AgentAccount? _account;

  List<CashShortage> _shortages = const [];

  bool _loading = true;
  bool _savingStatus = false;
  bool _savingAccount = false;

  String? _error;
  String? _notice;

  @override
  void initState() {
    super.initState();

    final store = SessionStore();

    _api = ApiClient(store);
    _repository = AgentsRepositoryImpl(apiClient: _api);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }

      unawaited(_load());
    });
  }

  // ===========================================================================
  // NAVIGATION
  // ===========================================================================

  void _closeScreen() {
    final navigator = Navigator.of(context);

    if (navigator.canPop()) {
      navigator.pop();
      return;
    }

    Navigator.of(context, rootNavigator: true).maybePop();
  }

  // ===========================================================================
  // DATA
  // ===========================================================================

  Future<void> _load() async {
    if (!mounted) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final results = await Future.wait<Object?>([
        _repository.loadAgentDetail(
          session: widget.session,
          agentId: widget.agentId,
        ),
        _optional(
          () => _repository.loadAgentActivity(
            session: widget.session,
            agentId: widget.agentId,
            range: 'all',
          ),
        ),
        _optional(
          () => _repository.loadAgentAccount(
            session: widget.session,
            agentId: widget.agentId,
          ),
        ),
        _optional(
          () => _api.listCashShortages(
            session: widget.session,
            branchId: widget.session.branchId,
            userId: widget.agentId,
          ),
        ),
      ]);

      if (!mounted) {
        return;
      }

      final detail = results[0];
      final activity = results[1];
      final account = results[2];
      final shortages = results[3];

      if (detail is! AgentDetail) {
        throw StateError('Field officer details response was invalid.');
      }

      setState(() {
        _agent = detail;

        _activity = activity is AgentActivity ? activity : null;

        _account = account is AgentAccount ? account : null;

        _shortages = shortages is List<Map<String, dynamic>>
            ? CashShortageMapper.listFromJson(shortages)
            : const <CashShortage>[];

        _loading = false;
      });
    } catch (error) {
      debugPrint('AGENT DETAIL ERROR: $error');

      if (!mounted) {
        return;
      }

      setState(() {
        _error = friendlyErrorMessage(error);

        _loading = false;
      });
    }
  }

  Future<T?> _optional<T>(Future<T> Function() loader) async {
    try {
      return await loader();
    } catch (error) {
      debugPrint('AGENT DETAIL OPTIONAL LOAD ERROR: $error');

      return null;
    }
  }

  // ===========================================================================
  // PERMISSIONS
  // ===========================================================================

  bool get _canManageAgents {
    return widget.session.hasPermission('branch.staff.invite') ||
        widget.session.hasPermission('user.activate') ||
        widget.session.hasPermission('branch.create');
  }

  // ===========================================================================
  // OPERATIONS
  // ===========================================================================

  void _showTodayPosition() {
    final agent = _agent;

    if (agent == null) {
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return _TodayPositionSheet(agent: agent);
      },
    );
  }

  // ===========================================================================
  // ACTIVITY
  // ===========================================================================

  void _openActivityHistory() {
    final activity = _activity;
    final agent = _agent;

    if (activity == null || activity.isEmpty || agent == null) {
      _setNotice('No activity has been recorded for this field officer yet.');

      return;
    }

    Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) {
          return AgentActivityScreen(agentName: agent.name, data: activity);
        },
      ),
    );
  }

  // ===========================================================================
  // SHORTAGES
  // ===========================================================================

  void _openShortageHistory() {
    final agent = _agent;

    if (agent == null) {
      return;
    }

    Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) {
          return ShortagesScreen(
            session: widget.session,
            userId: widget.agentId,
            initialShortages: _shortages,
            title: 'Shortage history',
            subtitle: agent.name,
          );
        },
      ),
    );
  }

  // ===========================================================================
  // STATUS MANAGEMENT
  // ===========================================================================

  Future<void> _confirmSuspend() async {
    final agent = _agent;

    if (agent == null) {
      return;
    }

    final reason = await showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return SuspendAgentSheet(
          agent: agent,
          hasOpenShortage: _shortages.any((shortage) => shortage.isOpen),
        );
      },
    );

    if (reason == null || !mounted) {
      return;
    }

    await _updateStatus('SUSPENDED', reason: reason);
  }

  Future<void> _confirmReactivate() async {
    final agent = _agent;

    if (agent == null) {
      return;
    }

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return ReactivateAgentSheet(
          agent: agent,
          latestShortage: _shortages.isEmpty ? null : _shortages.first,
        );
      },
    );

    if (confirmed != true || !mounted) {
      return;
    }

    await _updateStatus('ACTIVE');
  }

  Future<void> _editProfile() async {
    final agent = _agent;

    if (agent == null || _savingStatus) {
      return;
    }

    final edit = await showModalBottomSheet<AgentProfileEdit>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return EditAgentProfileSheet(agent: agent);
      },
    );

    if (edit == null || !mounted) {
      return;
    }

    setState(() {
      _savingStatus = true;
      _error = null;
      _notice = null;
    });

    try {
      final updated = await _repository.updateAgentProfile(
        session: widget.session,
        agentId: widget.agentId,
        displayName: edit.displayName,
        email: edit.email,
        phone: edit.phone,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _agent = updated;
        _notice = 'Field officer profile updated.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _savingStatus = false;
        });
      }
    }
  }

  Future<void> _updateStatus(String status, {String? reason}) async {
    if (_savingStatus) {
      return;
    }

    setState(() {
      _savingStatus = true;
      _error = null;
      _notice = null;
    });

    try {
      final updated = await _repository.updateAgentStatus(
        session: widget.session,
        agentId: widget.agentId,
        status: status,
        reason: reason,
      );

      final results = await Future.wait<Object?>([
        _optional(
          () => _repository.loadAgentAccount(
            session: widget.session,
            agentId: widget.agentId,
          ),
        ),
        _optional(
          () => _repository.loadAgentActivity(
            session: widget.session,
            agentId: widget.agentId,
            range: 'all',
          ),
        ),
        _optional(
          () => _api.listCashShortages(
            session: widget.session,
            branchId: widget.session.branchId,
            userId: widget.agentId,
          ),
        ),
      ]);

      if (!mounted) {
        return;
      }

      setState(() {
        _agent = updated;

        if (results[0] is AgentAccount) {
          _account = results[0] as AgentAccount;
        }

        if (results[1] is AgentActivity) {
          _activity = results[1] as AgentActivity;
        }

        if (results[2] is List<Map<String, dynamic>>) {
          _shortages = CashShortageMapper.listFromJson(
            results[2] as List<Map<String, dynamic>>,
          );
        }

        _notice = status == 'SUSPENDED'
            ? 'Field officer suspended and signed out.'
            : 'Field officer reactivated.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _savingStatus = false;
        });
      }
    }
  }

  // ===========================================================================
  // ACCOUNT ACCESS
  // ===========================================================================

  Future<void> _removeDevice(AgentDevice device) async {
    if (_savingAccount) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Remove device?'),
          content: Text(
            '${device.deviceName} will be signed out from this field officer account.',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop(false);
              },
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.of(dialogContext).pop(true);
              },
              child: const Text('Remove'),
            ),
          ],
        );
      },
    );

    if (confirmed != true || !mounted) {
      return;
    }

    await _runAccountAction(
      action: () {
        return _api.revokeAgentSession(
          session: widget.session,
          agentId: widget.agentId,
          sessionId: device.id,
        );
      },
      notice: 'Device removed.',
    );
  }

  Future<void> _signOutAllDevices() async {
    if (_savingAccount || _account?.devices.isEmpty != false) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Sign out all devices?'),
          content: const Text(
            'All active devices for this field officer will be signed out.',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop(false);
              },
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.of(dialogContext).pop(true);
              },
              child: const Text('Sign out'),
            ),
          ],
        );
      },
    );

    if (confirmed != true || !mounted) {
      return;
    }

    await _runAccountAction(
      action: () {
        return _api.revokeAllAgentSessions(
          session: widget.session,
          agentId: widget.agentId,
        );
      },
      notice: 'All field officer devices signed out.',
    );
  }

  Future<void> _runAccountAction({
    required Future<Object?> Function() action,
    required String notice,
  }) async {
    if (_savingAccount) {
      return;
    }

    setState(() {
      _savingAccount = true;
      _error = null;
      _notice = null;
    });

    try {
      await action();

      final account = await _repository.loadAgentAccount(
        session: widget.session,
        agentId: widget.agentId,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _account = account;
        _notice = notice;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _savingAccount = false;
        });
      }
    }
  }

  // ===========================================================================
  // FEEDBACK
  // ===========================================================================

  void _setNotice(String message) {
    if (!mounted) {
      return;
    }

    setState(() {
      _notice = message;
      _error = null;
    });
  }

  // ===========================================================================
  // BUILD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: true,
      child: Scaffold(
        backgroundColor: const Color(0xFFFDFDFD),

        appBar: AppBar(
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.white,
          elevation: 0,
          scrolledUnderElevation: 0,
          toolbarHeight: 78,
          leadingWidth: 62,

          leading: IconButton(
            onPressed: _closeScreen,
            icon: const Icon(
              Icons.arrow_back_rounded,
              color: midnightNavy,
              size: 25,
            ),
          ),

          titleSpacing: 0,

          title: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Field officer details',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 21,
                  height: 1.05,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.35,
                ),
              ),
              SizedBox(height: 4),
              Text(
                'View information and performance',
                style: TextStyle(
                  color: slateText,
                  fontSize: 10,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),

          actions: [
            IconButton(
              onPressed: _showMoreMenu,
              icon: const Icon(
                Icons.more_vert_rounded,
                color: midnightNavy,
                size: 24,
              ),
            ),
            const SizedBox(width: 6),
          ],

          bottom: const PreferredSize(
            preferredSize: Size.fromHeight(1),
            child: Divider(height: 1, color: line),
          ),
        ),

        body: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _agent == null) {
      return const Center(
        child: CircularProgressIndicator(color: forestEmerald),
      );
    }

    if (_error != null && _agent == null) {
      return _ErrorState(message: _error!, onRetry: _load);
    }

    final agent = _agent;

    if (agent == null) {
      return const Center(
        child: Text(
          'Field officer unavailable.',
          style: TextStyle(color: slateText),
        ),
      );
    }

    return RefreshIndicator(
      color: forestEmerald,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 30),
        children: [
          if (_notice != null) ...[
            _MessageBanner(message: _notice!),
            const SizedBox(height: 10),
          ],

          if (_error != null) ...[
            _MessageBanner(message: _error!, error: true),
            const SizedBox(height: 10),
          ],

          _ProfileCard(agent: agent, onViewOperations: _showTodayPosition),

          const SizedBox(height: 10),

          _PerformanceCard(agent: agent),

          const SizedBox(height: 10),

          _ShortagesCard(
            shortages: _shortages,
            onViewHistory: _openShortageHistory,
          ),

          const SizedBox(height: 10),

          _RecentActivityCard(
            activity: _activity,
            onViewAll: _openActivityHistory,
          ),

          const SizedBox(height: 10),

          _EmploymentCard(
            agent: agent,
            canManage: _canManageAgents,
            busy: _savingStatus,
            onSuspend: _confirmSuspend,
            onReactivate: _confirmReactivate,
            onEditProfile: _editProfile,
          ),

          const SizedBox(height: 10),

          _AccountAccessCard(
            account: _account,
            canManage: _canManageAgents,
            busy: _savingAccount,
            onRemoveDevice: _removeDevice,
            onSignOutAll: _signOutAllDevices,
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // MORE MENU
  // ===========================================================================

  void _showMoreMenu() {
    final agent = _agent;

    if (agent == null) {
      return;
    }

    final suspended = agent.status.toUpperCase() == 'SUSPENDED';

    final canManage = _canManageAgents;

    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return _BottomSheetShell(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _SheetAction(
                icon: Icons.account_tree_outlined,
                label: "View today's position",
                onTap: () {
                  Navigator.of(sheetContext).pop();

                  _showTodayPosition();
                },
              ),

              _SheetAction(
                icon: Icons.format_list_bulleted_rounded,
                label: 'View activity',
                onTap: () {
                  Navigator.of(sheetContext).pop();

                  _openActivityHistory();
                },
              ),

              _SheetAction(
                icon: Icons.report_gmailerrorred_outlined,
                iconColor: _dangerRed,
                label: 'View shortages',
                onTap: () {
                  Navigator.of(sheetContext).pop();

                  _openShortageHistory();
                },
              ),

              if (canManage && _account?.devices.isNotEmpty == true)
                _SheetAction(
                  icon: Icons.logout_rounded,
                  label: 'Sign out all devices',
                  onTap: () {
                    Navigator.of(sheetContext).pop();

                    unawaited(_signOutAllDevices());
                  },
                ),

              if (canManage)
                _SheetAction(
                  icon: Icons.edit_outlined,
                  label: 'Edit profile',
                  onTap: () {
                    Navigator.of(sheetContext).pop();

                    unawaited(_editProfile());
                  },
                ),

              if (canManage && !suspended)
                _SheetAction(
                  icon: Icons.person_off_outlined,
                  iconColor: _dangerRed,
                  label: 'Suspend field officer',
                  labelColor: _dangerRed,
                  onTap: () {
                    Navigator.of(sheetContext).pop();

                    unawaited(_confirmSuspend());
                  },
                ),

              if (canManage && suspended)
                _SheetAction(
                  icon: Icons.person_add_alt_1_outlined,
                  label: 'Reactivate field officer',
                  onTap: () {
                    Navigator.of(sheetContext).pop();

                    unawaited(_confirmReactivate());
                  },
                ),
            ],
          ),
        );
      },
    );
  }
}

// =============================================================================
// PROFILE
// =============================================================================

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.agent, this.onViewOperations});

  final AgentDetail agent;
  final VoidCallback? onViewOperations;

  @override
  Widget build(BuildContext context) {
    final status = agent.status.toUpperCase();

    final active = status == 'ACTIVE';

    final onDuty = agent.float != null;

    final activityLabel = onDuty
        ? 'On duty today'
        : _lastActiveLabel(agent.lastActiveAt);

    return _SurfaceCard(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 13),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _AgentAvatar(name: agent.name, photoUrl: agent.photoUrl),

              const SizedBox(width: 13),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            agent.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: midnightNavy,
                              fontSize: 18,
                              height: 1.1,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.25,
                            ),
                          ),
                        ),

                        const SizedBox(width: 8),

                        _StatusChip(status: agent.status),
                      ],
                    ),

                    const SizedBox(height: 9),

                    Wrap(
                      spacing: 13,
                      runSpacing: 8,
                      children: [
                        if (_hasValue(agent.phone))
                          _ProfileDetail(
                            icon: Icons.phone_outlined,
                            value: agent.phone!,
                          ),

                        if (_hasValue(agent.email))
                          _ProfileDetail(
                            icon: Icons.mail_outline_rounded,
                            value: agent.email,
                          ),

                        _ProfileDetail(
                          icon: Icons.circle_rounded,
                          iconSize: 8,
                          iconColor: onDuty && active
                              ? forestEmerald
                              : _activityDotColor(agent),
                          value: activityLabel,
                          valueColor: onDuty && active
                              ? forestEmerald
                              : slateText,
                        ),

                        _ProfileDetail(
                          icon: Icons.calendar_today_outlined,
                          value: 'Joined ${_date(agent.createdAt)}',
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          Material(
            color: const Color(0xFFFBFDFB),
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              onTap: onViewOperations,
              borderRadius: BorderRadius.circular(10),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(11, 10, 9, 10),
                decoration: BoxDecoration(
                  border: Border.all(color: line),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: forestEmerald.withValues(alpha: 0.08),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.account_tree_outlined,
                        color: forestEmerald,
                        size: 18,
                      ),
                    ),

                    const SizedBox(width: 10),

                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            "View today's operations",
                            style: TextStyle(
                              color: forestEmerald,
                              fontSize: 10.5,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'See today’s position and balancing details',
                            style: TextStyle(
                              color: slateText,
                              fontSize: 8.3,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const Icon(
                      Icons.chevron_right_rounded,
                      color: forestEmerald,
                      size: 20,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// PERFORMANCE
// =============================================================================

class _PerformanceCard extends StatelessWidget {
  const _PerformanceCard({required this.agent});

  final AgentDetail agent;

  @override
  Widget build(BuildContext context) {
    final amountIssued = agent.amountDisbursedLifetime;

    final amountCollected = agent.amountCollectedLifetime;

    final collectionRate = amountIssued <= 0
        ? 0
        : ((amountCollected / amountIssued) * 100).clamp(0, 999).round();

    return _SurfaceCard(
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.bar_chart_rounded,
                color: midnightNavy,
                size: 18,
              ),

              const SizedBox(width: 8),

              const Expanded(
                child: Text(
                  'Performance',
                  style: TextStyle(
                    color: midnightNavy,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),

              Container(
                height: 32,
                padding: const EdgeInsets.symmetric(horizontal: 9),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: line),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.calendar_today_outlined,
                      size: 12,
                      color: midnightNavy,
                    ),
                    SizedBox(width: 5),
                    Text(
                      'This month',
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 8.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    SizedBox(width: 2),
                    Icon(
                      Icons.keyboard_arrow_down_rounded,
                      size: 16,
                      color: midnightNavy,
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 13),

          LayoutBuilder(
            builder: (context, constraints) {
              const gap = 7.0;

              final width = (constraints.maxWidth - gap * 3) / 4;

              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: width,
                    child: _MetricCard(
                      icon: Icons.work_outline_rounded,
                      label: 'Loans issued',
                      value: '${agent.applicationsLifetime}',
                      secondary: 'UGX ${formatMoney(amountIssued)}',
                      background: const Color(0xFFF8FBF8),
                      iconColor: forestEmerald,
                    ),
                  ),

                  const SizedBox(width: gap),

                  SizedBox(
                    width: width,
                    child: _MetricCard(
                      icon: Icons.payments_outlined,
                      label: 'Repayments collected',
                      value: '${agent.collectionsLifetime}',
                      secondary: 'UGX ${formatMoney(amountCollected)}',
                      background: const Color(0xFFF8FAFD),
                      iconColor: _blue,
                    ),
                  ),

                  const SizedBox(width: gap),

                  SizedBox(
                    width: width,
                    child: _MetricCard(
                      icon: Icons.percent_rounded,
                      label: 'Collection rate',
                      value: '$collectionRate%',
                      secondary: 'Overall',
                      background: const Color(0xFFFFFAF6),
                      iconColor: _orange,
                    ),
                  ),

                  const SizedBox(width: gap),

                  SizedBox(
                    width: width,
                    child: _MetricCard(
                      icon: Icons.people_outline_rounded,
                      label: 'Activity today',
                      value:
                          '${agent.collectionsToday + agent.applicationsToday}',
                      secondary: '${agent.collectionsToday} repayments',
                      background: const Color(0xFFFAF8FD),
                      iconColor: _purple,
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.secondary,
    required this.background,
    required this.iconColor,
  });

  final IconData icon;
  final String label;
  final String value;
  final String secondary;
  final Color background;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 125,
      padding: const EdgeInsets.fromLTRB(9, 10, 8, 9),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: iconColor, size: 17),

          const SizedBox(height: 7),

          Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: midnightNavy,
              fontSize: 7.8,
              height: 1.22,
              fontWeight: FontWeight.w700,
            ),
          ),

          const Spacer(),

          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: midnightNavy,
              fontSize: 17,
              height: 1,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: 5),

          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              secondary,
              style: const TextStyle(
                color: slateText,
                fontSize: 7.3,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// SHORTAGES
// =============================================================================

class _ShortagesCard extends StatelessWidget {
  const _ShortagesCard({required this.shortages, this.onViewHistory});

  final List<CashShortage> shortages;

  final VoidCallback? onViewHistory;

  @override
  Widget build(BuildContext context) {
    final open = shortages.where((shortage) => shortage.isOpen).toList();

    final openAmount = open.fold<num>(
      0,
      (sum, shortage) => sum + shortage.amountOutstanding,
    );

    DateTime? oldest;

    for (final shortage in open) {
      final date = shortage.operationDate;

      if (date == null) {
        continue;
      }

      if (oldest == null || date.isBefore(oldest)) {
        oldest = date;
      }
    }

    return _SurfaceCard(
      padding: const EdgeInsets.fromLTRB(13, 12, 13, 13),
      child: Column(
        children: [
          Row(
            children: [
              const Icon(
                Icons.report_gmailerrorred_outlined,
                size: 18,
                color: _dangerRed,
              ),

              const SizedBox(width: 8),

              const Expanded(
                child: Text(
                  'Shortages',
                  style: TextStyle(
                    color: midnightNavy,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),

              Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: onViewHistory,
                  borderRadius: BorderRadius.circular(8),
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 5, vertical: 4),
                    child: Row(
                      children: [
                        Text(
                          'View history',
                          style: TextStyle(
                            color: slateText,
                            fontSize: 8.8,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        SizedBox(width: 1),
                        Icon(
                          Icons.chevron_right_rounded,
                          color: slateText,
                          size: 18,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 10),

          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: _dangerSoft,
              border: Border.all(color: const Color(0xFFF5D8D8)),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Row(
              children: [
                Expanded(
                  child: _ShortageMetric(
                    label: 'Open shortages',
                    value: '${open.length}',
                  ),
                ),

                const _ShortageDivider(),

                Expanded(
                  child: _ShortageMetric(
                    label: 'Open amount',
                    value: 'UGX ${formatMoney(openAmount)}',
                  ),
                ),

                const _ShortageDivider(),

                Expanded(
                  child: _ShortageMetric(
                    label: 'Oldest open since',
                    value: oldest == null ? '—' : _date(oldest),
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

class _ShortageMetric extends StatelessWidget {
  const _ShortageMetric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: slateText,
            fontSize: 7.3,
            fontWeight: FontWeight.w600,
          ),
        ),

        const SizedBox(height: 5),

        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            value,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: _dangerRed,
              fontSize: 13,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    );
  }
}

class _ShortageDivider extends StatelessWidget {
  const _ShortageDivider();

  @override
  Widget build(BuildContext context) {
    return Container(width: 1, height: 38, color: const Color(0xFFF0D6D6));
  }
}

// =============================================================================
// RECENT ACTIVITY
// =============================================================================

class _RecentActivityCard extends StatelessWidget {
  const _RecentActivityCard({required this.activity, this.onViewAll});

  final AgentActivity? activity;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    final items = _activityItems(activity).take(3).toList();

    return _SurfaceCard(
      padding: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(13, 11, 8, 10),
            child: Row(
              children: [
                const Icon(
                  Icons.format_list_bulleted_rounded,
                  size: 17,
                  color: midnightNavy,
                ),

                const SizedBox(width: 8),

                const Expanded(
                  child: Text(
                    'Recent activity',
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 13,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),

                if (onViewAll != null)
                  TextButton(
                    onPressed: onViewAll,
                    style: TextButton.styleFrom(
                      foregroundColor: slateText,
                      minimumSize: Size.zero,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 4,
                      ),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Row(
                      children: [
                        Text(
                          'View all',
                          style: TextStyle(
                            fontSize: 8.8,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        SizedBox(width: 1),
                        Icon(Icons.chevron_right_rounded, size: 17),
                      ],
                    ),
                  ),
              ],
            ),
          ),

          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Text(
                'No recent activity.',
                style: TextStyle(
                  color: slateText,
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                ),
              ),
            )
          else
            for (var index = 0; index < items.length; index++) ...[
              if (index > 0) const Divider(height: 1, indent: 52, color: line),

              _ActivityRow(item: items[index]),
            ],

          if (onViewAll != null) ...[
            const Divider(height: 1, color: line),

            InkWell(
              onTap: onViewAll,
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 13, vertical: 10),
                child: Row(
                  children: [
                    Text(
                      'View all activity',
                      style: TextStyle(
                        color: forestEmerald,
                        fontSize: 8.8,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Spacer(),
                    Icon(
                      Icons.chevron_right_rounded,
                      color: forestEmerald,
                      size: 18,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({required this.item});

  final _AgentActivityItem item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
      child: Row(
        children: [
          Container(
            width: 31,
            height: 31,
            decoration: BoxDecoration(
              color: item.iconColor.withValues(alpha: 0.08),
              shape: BoxShape.circle,
            ),
            child: Icon(item.icon, size: 15, color: item.iconColor),
          ),

          const SizedBox(width: 9),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 9.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),

                if (item.subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),

                  Text(
                    item.subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 7.5,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(width: 8),

          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (item.amount != null)
                Text(
                  'UGX ${formatMoney(item.amount!)}',
                  style: const TextStyle(
                    color: forestEmerald,
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                  ),
                ),

              const SizedBox(height: 2),

              Text(
                _shortDateTime(item.occurredAt),
                style: const TextStyle(color: slateText, fontSize: 7),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// EMPLOYMENT
// =============================================================================

class _EmploymentCard extends StatelessWidget {
  const _EmploymentCard({
    required this.agent,
    required this.canManage,
    required this.busy,
    this.onSuspend,
    this.onReactivate,
    this.onEditProfile,
  });

  final AgentDetail agent;
  final bool canManage;
  final bool busy;

  final VoidCallback? onSuspend;
  final VoidCallback? onReactivate;
  final VoidCallback? onEditProfile;

  @override
  Widget build(BuildContext context) {
    final suspended = agent.status.toUpperCase() == 'SUSPENDED';

    final onDuty = agent.float != null;

    return _SurfaceCard(
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.person_outline_rounded, size: 17, color: midnightNavy),
              SizedBox(width: 8),
              Text(
                'Employment & account',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),

          const SizedBox(height: 13),

          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _AccountMetric(
                        label: 'Role',
                        value: agent.roleName ?? 'Field Officer',
                      ),
                    ),

                    const _VerticalLine(),

                    Expanded(
                      child: _AccountMetric(
                        label: 'Employee ID',
                        value: _displayEmployeeId(agent.publicId),
                      ),
                    ),

                    const _VerticalLine(),

                    Expanded(
                      child: _AccountMetric(
                        label: 'Status',
                        value: _statusLabel(agent.status),
                        secondary: onDuty && !suspended
                            ? 'On duty today'
                            : _lastActiveLabel(agent.lastActiveAt),
                        color: suspended ? _dangerRed : forestEmerald,
                      ),
                    ),
                  ],
                ),
              ),

              if (canManage &&
                  ((!suspended && onSuspend != null) ||
                      (suspended && onReactivate != null))) ...[
                const SizedBox(width: 12),

                SizedBox(
                  width: 132,
                  child: OutlinedButton.icon(
                    onPressed: busy
                        ? null
                        : suspended
                        ? onReactivate
                        : onSuspend,
                    icon: busy
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(
                            suspended
                                ? Icons.person_add_alt_1_outlined
                                : Icons.person_off_outlined,
                            size: 15,
                          ),
                    label: Text(
                      suspended ? 'Reactivate' : 'Suspend',
                      style: const TextStyle(
                        fontSize: 8.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: suspended ? forestEmerald : _dangerRed,
                      side: BorderSide(
                        color: suspended ? forestEmerald : _dangerRed,
                      ),
                      minimumSize: const Size(0, 38),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),

          if (canManage && onEditProfile != null) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: SizedBox(
                width: 132,
                child: OutlinedButton.icon(
                  onPressed: busy ? null : onEditProfile,
                  icon: const Icon(Icons.edit_outlined, size: 15),
                  label: const Text(
                    'Edit profile',
                    style: TextStyle(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: forestEmerald,
                    side: const BorderSide(color: forestEmerald),
                    minimumSize: const Size(0, 38),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// =============================================================================
// ACCOUNT ACCESS
// ===========================================================================

class _AccountAccessCard extends StatelessWidget {
  const _AccountAccessCard({
    required this.account,
    required this.canManage,
    required this.busy,
    required this.onRemoveDevice,
    required this.onSignOutAll,
  });

  final AgentAccount? account;
  final bool canManage;
  final bool busy;

  final ValueChanged<AgentDevice> onRemoveDevice;

  final VoidCallback onSignOutAll;

  @override
  Widget build(BuildContext context) {
    final devices = account?.devices ?? const <AgentDevice>[];

    final history = account?.accessHistory ?? const <AgentAccessHistoryItem>[];

    final visibleDevices = devices.take(3).toList();

    final visibleHistory = history.take(3).toList();

    return _SurfaceCard(
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.devices_outlined, size: 17, color: midnightNavy),

              const SizedBox(width: 8),

              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Account access',
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Devices and account security',
                      style: TextStyle(
                        color: slateText,
                        fontSize: 7.8,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),

              if (canManage && devices.isNotEmpty)
                TextButton.icon(
                  onPressed: busy ? null : onSignOutAll,
                  style: TextButton.styleFrom(
                    foregroundColor: midnightNavy,
                    minimumSize: Size.zero,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 5,
                    ),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  icon: busy
                      ? const SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.logout_rounded, size: 13),
                  label: const Text(
                    'Sign out all',
                    style: TextStyle(
                      fontSize: 8.3,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
            ],
          ),

          const SizedBox(height: 11),

          if (account == null)
            const _EmptyInline(message: 'Account access details unavailable.')
          else ...[
            Row(
              children: [
                Expanded(
                  child: _MiniMetric(
                    icon: Icons.devices_outlined,
                    label: 'Active devices',
                    value: '${devices.length}',
                  ),
                ),

                const SizedBox(width: 8),

                Expanded(
                  child: _MiniMetric(
                    icon: Icons.history_rounded,
                    label: 'Access events',
                    value: '${history.length}',
                  ),
                ),
              ],
            ),

            const SizedBox(height: 11),

            const Text(
              'Devices',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 10.5,
                fontWeight: FontWeight.w900,
              ),
            ),

            const SizedBox(height: 4),

            if (visibleDevices.isEmpty)
              const _EmptyInline(message: 'No devices have signed in yet.')
            else
              for (var index = 0; index < visibleDevices.length; index++) ...[
                _DeviceRow(
                  device: visibleDevices[index],
                  busy: busy,
                  canManage: canManage,
                  onRemove: () {
                    onRemoveDevice(visibleDevices[index]);
                  },
                ),

                if (index < visibleDevices.length - 1)
                  const Divider(height: 1, indent: 42, color: line),
              ],

            if (visibleHistory.isNotEmpty) ...[
              const SizedBox(height: 10),

              const Divider(height: 1, color: line),

              const SizedBox(height: 10),

              const Text(
                'Recent access history',
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w900,
                ),
              ),

              const SizedBox(height: 7),

              for (var index = 0; index < visibleHistory.length; index++) ...[
                _AccessHistoryRow(item: visibleHistory[index]),

                if (index < visibleHistory.length - 1)
                  const SizedBox(height: 2),
              ],
            ],
          ],
        ],
      ),
    );
  }
}

class _MiniMetric extends StatelessWidget {
  const _MiniMetric({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAF9),
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: forestEmerald.withValues(alpha: 0.08),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: forestEmerald, size: 14),
          ),

          const SizedBox(width: 8),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 7.4,
                    fontWeight: FontWeight.w600,
                  ),
                ),

                const SizedBox(height: 2),

                Text(
                  value,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
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

class _DeviceRow extends StatelessWidget {
  const _DeviceRow({
    required this.device,
    required this.busy,
    required this.canManage,
    required this.onRemove,
  });

  final AgentDevice device;
  final bool busy;
  final bool canManage;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final current = device.status.toUpperCase() == 'CURRENT';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: forestEmerald.withValues(alpha: 0.08),
              shape: BoxShape.circle,
            ),
            child: Icon(_deviceIcon(device), color: forestEmerald, size: 16),
          ),

          const SizedBox(width: 10),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _safeDeviceName(device),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 9.8,
                    fontWeight: FontWeight.w800,
                  ),
                ),

                const SizedBox(height: 2),

                Text(
                  '${_devicePlatformLabel(device)} • ${_shortDateTime(device.lastUsedAt)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 7.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(width: 7),

          _CompactStatusChip(
            label: current ? 'Current' : 'Active',
            positive: true,
          ),

          if (canManage && device.canRemove) ...[
            const SizedBox(width: 4),

            IconButton(
              onPressed: busy ? null : onRemove,
              tooltip: 'Remove device',
              visualDensity: VisualDensity.compact,
              icon: const Icon(
                Icons.logout_rounded,
                size: 17,
                color: _dangerRed,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AccessHistoryRow extends StatelessWidget {
  const _AccessHistoryRow({required this.item});

  final AgentAccessHistoryItem item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: const Color(0xFFF6F7F8),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.history_rounded,
              color: slateText,
              size: 14,
            ),
          ),

          const SizedBox(width: 8),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  style: const TextStyle(
                    color: midnightNavy,
                    fontSize: 9.2,
                    fontWeight: FontWeight.w800,
                  ),
                ),

                const SizedBox(height: 2),

                Text(
                  _accessHistoryDescription(item),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 7.3,
                    height: 1.3,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(width: 8),

          Text(
            _compactDateTime(item.occurredAt),
            style: const TextStyle(color: slateText, fontSize: 6.8),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// TODAY POSITION SHEET
// =============================================================================

class _TodayPositionSheet extends StatelessWidget {
  const _TodayPositionSheet({required this.agent});

  final AgentDetail agent;

  @override
  Widget build(BuildContext context) {
    final accountability = agent.accountability;

    return _BottomSheetShell(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "${agent.name}'s position",
            style: const TextStyle(
              color: midnightNavy,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: 4),

          Text(
            accountability.date.isEmpty ? 'Today' : accountability.date,
            style: const TextStyle(
              color: slateText,
              fontSize: 9.5,
              fontWeight: FontWeight.w600,
            ),
          ),

          const SizedBox(height: 14),

          _PositionRow(
            label: 'Float given',
            value: 'UGX ${formatMoney(accountability.amountGiven)}',
          ),

          _PositionRow(
            label: 'Loans disbursed',
            value: '- UGX ${formatMoney(accountability.amountDisbursed)}',
          ),

          _PositionRow(
            label: 'Repayments collected',
            value: '+ UGX ${formatMoney(accountability.amountCollected)}',
          ),

          const Divider(height: 24, color: line),

          _PositionRow(
            label: 'Expected cash',
            value: 'UGX ${formatMoney(accountability.expectedCash)}',
            important: true,
          ),

          const SizedBox(height: 12),

          if (agent.float != null)
            _EmptyInline(
              message:
                  'Float recorded by ${agent.float!.recordedByName} at ${_shortDateTime(agent.float!.recordedAt)}.',
            )
          else
            const _EmptyInline(message: 'No float has been issued today.'),
        ],
      ),
    );
  }
}

class _PositionRow extends StatelessWidget {
  const _PositionRow({
    required this.label,
    required this.value,
    this.important = false,
  });

  final String label;
  final String value;
  final bool important;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: important ? midnightNavy : slateText,
                fontSize: important ? 11.5 : 9.5,
                fontWeight: important ? FontWeight.w900 : FontWeight.w600,
              ),
            ),
          ),

          Text(
            value,
            style: TextStyle(
              color: important ? forestEmerald : midnightNavy,
              fontSize: important ? 13 : 10.5,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// GENERAL COMPONENTS
// =============================================================================

class _SurfaceCard extends StatelessWidget {
  const _SurfaceCard({
    required this.child,
    this.padding = const EdgeInsets.all(12),
    this.clipBehavior = Clip.none,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Clip clipBehavior;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: clipBehavior,
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(13),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.018),
            blurRadius: 12,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _AgentAvatar extends StatelessWidget {
  const _AgentAvatar({required this.name, this.photoUrl});

  final String name;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 70,
      height: 70,
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        color: Color(0xFFF0F5F2),
      ),
      child: _hasValue(photoUrl)
          ? Image.network(
              photoUrl!,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) {
                return _Initials(name: name);
              },
            )
          : _Initials(name: name),
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        _initials(name),
        style: const TextStyle(
          color: forestEmerald,
          fontSize: 20,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _ProfileDetail extends StatelessWidget {
  const _ProfileDetail({
    required this.icon,
    required this.value,
    this.iconColor = forestEmerald,
    this.iconSize = 13,
    this.valueColor,
  });

  final IconData icon;
  final String value;
  final Color iconColor;
  final double iconSize;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: iconSize, color: iconColor),

        const SizedBox(width: 5),

        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 200),
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: valueColor ?? slateText,
              fontSize: 8.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final normalized = status.trim().toUpperCase();

    Color foreground;
    Color background;
    String label;

    switch (normalized) {
      case 'ACTIVE':
        foreground = forestEmerald;
        background = const Color(0xFFEAF5ED);
        label = 'Active';

      case 'SUSPENDED':
        foreground = _dangerRed;
        background = const Color(0xFFFDECEC);
        label = 'Suspended';

      case 'INVITED':
      case 'PENDING_VERIFICATION':
        foreground = _blue;
        background = const Color(0xFFEFF4FF);
        label = 'Invited';

      default:
        foreground = const Color(0xFFB26A00);
        background = const Color(0xFFFFF3DC);
        label = _statusLabel(status);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foreground,
          fontSize: 8,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _CompactStatusChip extends StatelessWidget {
  const _CompactStatusChip({required this.label, required this.positive});

  final String label;
  final bool positive;

  @override
  Widget build(BuildContext context) {
    final foreground = positive ? forestEmerald : _dangerRed;

    final background = positive
        ? const Color(0xFFEAF5ED)
        : const Color(0xFFFDECEC);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foreground,
          fontSize: 7.5,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _AccountMetric extends StatelessWidget {
  const _AccountMetric({
    required this.label,
    required this.value,
    this.secondary,
    this.color,
  });

  final String label;
  final String value;
  final String? secondary;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: slateText,
              fontSize: 7.5,
              fontWeight: FontWeight.w600,
            ),
          ),

          const SizedBox(height: 4),

          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: color ?? midnightNavy,
              fontSize: 9.5,
              fontWeight: FontWeight.w800,
            ),
          ),

          if (_hasValue(secondary)) ...[
            const SizedBox(height: 3),

            Text(
              secondary!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: slateText,
                fontSize: 7,
                height: 1.2,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _VerticalLine extends StatelessWidget {
  const _VerticalLine();

  @override
  Widget build(BuildContext context) {
    return Container(width: 1, height: 48, color: line);
  }
}

class _MessageBanner extends StatelessWidget {
  const _MessageBanner({required this.message, this.error = false});

  final String message;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final color = error ? _dangerRed : forestEmerald;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        border: Border.all(color: color.withValues(alpha: 0.2)),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: color,
          fontSize: 9,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _EmptyInline extends StatelessWidget {
  const _EmptyInline({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAF9),
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: slateText,
          fontSize: 8.5,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline_rounded,
              color: _dangerRed,
              size: 28,
            ),

            const SizedBox(height: 10),

            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: slateText, fontSize: 10),
            ),

            const SizedBox(height: 12),

            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}

class _BottomSheetShell extends StatelessWidget {
  const _BottomSheetShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(10),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: line,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),

              const SizedBox(height: 15),

              child,
            ],
          ),
        ),
      ),
    );
  }
}

class _SheetAction extends StatelessWidget {
  const _SheetAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.iconColor = forestEmerald,
    this.labelColor = midnightNavy,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  final Color iconColor;
  final Color labelColor;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      leading: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: iconColor.withValues(alpha: 0.08),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: iconColor, size: 17),
      ),
      title: Text(
        label,
        style: TextStyle(
          color: labelColor,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
      trailing: const Icon(
        Icons.chevron_right_rounded,
        size: 20,
        color: slateText,
      ),
      onTap: onTap,
    );
  }
}

// =============================================================================
// ACTIVITY MAPPING
// ===========================================================================

class _AgentActivityItem {
  const _AgentActivityItem({
    required this.title,
    required this.subtitle,
    required this.occurredAt,
    required this.icon,
    required this.iconColor,
    this.amount,
  });

  final String title;
  final String subtitle;

  final DateTime? occurredAt;

  final IconData icon;
  final Color iconColor;

  final num? amount;
}

List<_AgentActivityItem> _activityItems(AgentActivity? data) {
  if (data == null) {
    return const [];
  }

  final items = <_AgentActivityItem>[];

  for (final application in data.applications) {
    final status = _friendlyActivityStatus(application.status);

    final contact = _hasValue(application.phone) ? application.phone! : '';

    final subtitle = [
      if (status.isNotEmpty) status,
      if (contact.isNotEmpty) contact,
    ].join(' • ');

    items.add(
      _AgentActivityItem(
        title: 'Loan issued to ${application.clientName}',
        subtitle: subtitle,
        occurredAt: application.submittedAt,
        amount: application.principalAmount,
        icon: Icons.work_outline,
        iconColor: forestEmerald,
      ),
    );
  }

  for (final collection in data.collections) {
    final method = _friendlyPaymentMethod(collection.method);

    final subtitle = [
      if (method.isNotEmpty) method,
      if (_hasValue(collection.phone)) collection.phone!,
    ].join(' • ');

    items.add(
      _AgentActivityItem(
        title: 'Repayment collected from ${collection.clientName}',
        subtitle: subtitle,
        occurredAt: collection.paidAt,
        amount: collection.amount,
        icon: Icons.payments_outlined,
        iconColor: _blue,
      ),
    );
  }

  for (final activity in data.otherActivity) {
    items.add(
      _AgentActivityItem(
        title: _safeActivityTitle(activity.title),
        subtitle: _safeActivityDetail(activity.detail),
        occurredAt: activity.occurredAt,
        icon: _otherActivityIcon(activity.type),
        iconColor: _otherActivityColor(activity.type),
      ),
    );
  }

  items.sort((left, right) {
    final a = left.occurredAt ?? DateTime.fromMillisecondsSinceEpoch(0);

    final b = right.occurredAt ?? DateTime.fromMillisecondsSinceEpoch(0);

    return b.compareTo(a);
  });

  return items;
}

// =============================================================================
// HELPERS
// ===========================================================================

bool _hasValue(String? value) {
  return value != null && value.trim().isNotEmpty;
}

Color _activityDotColor(AgentDetail agent) {
  final status = agent.status.toUpperCase();

  if (status == 'SUSPENDED') {
    return _dangerRed;
  }

  if (agent.float != null) {
    return forestEmerald;
  }

  return const Color(0xFFD99A00);
}

String _displayEmployeeId(String? publicId) {
  if (!_hasValue(publicId)) {
    return '—';
  }

  /*
   * publicId is explicitly the public-facing staff identifier.
   * Database UUIDs are never rendered by this screen.
   */
  return publicId!.trim();
}

IconData _deviceIcon(AgentDevice device) {
  final value =
      '${device.platform ?? ''} '
              '${device.deviceType}'
          .trim()
          .toUpperCase();

  if (value.contains('WEB') ||
      value.contains('MAC') ||
      value.contains('WINDOWS') ||
      value.contains('LAPTOP') ||
      value.contains('DESKTOP')) {
    return Icons.laptop_mac_rounded;
  }

  return Icons.smartphone_rounded;
}

String _safeDeviceName(AgentDevice device) {
  final name = device.deviceName.trim();

  if (name.isNotEmpty) {
    return name;
  }

  return _devicePlatformLabel(device);
}

String _devicePlatformLabel(AgentDevice device) {
  final platform = device.platform?.trim();

  if (platform != null && platform.isNotEmpty) {
    return _statusLabel(platform);
  }

  final type = device.deviceType.trim();

  if (type.isNotEmpty) {
    return _statusLabel(type);
  }

  return 'Device';
}

String _accessHistoryDescription(AgentAccessHistoryItem item) {
  final detail = item.detail.trim();

  final actor = item.actorName.trim();

  if (detail.isEmpty && actor.isEmpty) {
    return '';
  }

  if (actor.isEmpty || actor.toLowerCase() == 'system') {
    return detail;
  }

  if (detail.isEmpty) {
    return 'By $actor';
  }

  return '$detail • By $actor';
}

String _friendlyPaymentMethod(String value) {
  final normalized = value.trim().toUpperCase();

  switch (normalized) {
    case 'CASH':
      return 'Cash';

    case 'MOBILE_MONEY':
    case 'MOBILEMONEY':
      return 'Mobile money';

    case 'BANK':
    case 'BANK_TRANSFER':
      return 'Bank transfer';

    default:
      return _statusLabel(value);
  }
}

String _friendlyActivityStatus(String value) {
  final normalized = value.trim().toUpperCase();

  switch (normalized) {
    case 'DISBURSED':
      return 'Loan issued';

    case 'ACTIVE':
      return 'Active loan';

    case 'CLOSED':
      return 'Loan closed';

    case 'SUBMITTED':
      return 'Application submitted';

    case 'APPROVED':
      return 'Approved';

    default:
      return _statusLabel(value);
  }
}

String _safeActivityTitle(String value) {
  final clean = value.trim();

  if (clean.isEmpty) {
    return 'Account activity';
  }

  return clean;
}

String _safeActivityDetail(String value) {
  final clean = value.trim();

  if (clean.isEmpty) {
    return '';
  }

  /*
   * Activity details come from server-generated human-readable
   * audit descriptions. They are shown as prose only; entity IDs
   * are never rendered here.
   */
  return clean;
}

IconData _otherActivityIcon(String type) {
  switch (type.trim().toUpperCase()) {
    case 'FLOAT_RECEIVED':
      return Icons.account_balance_wallet_outlined;

    case 'RECONCILIATION_COMPLETED':
      return Icons.task_alt_rounded;

    case 'ACCOUNT_SUSPENDED':
      return Icons.person_off_outlined;

    case 'ACCOUNT_ACTIVATED':
      return Icons.person_add_alt_1_outlined;

    default:
      return Icons.history_rounded;
  }
}

Color _otherActivityColor(String type) {
  switch (type.trim().toUpperCase()) {
    case 'ACCOUNT_SUSPENDED':
      return _dangerRed;

    case 'FLOAT_RECEIVED':
    case 'RECONCILIATION_COMPLETED':
    case 'ACCOUNT_ACTIVATED':
      return forestEmerald;

    default:
      return slateText;
  }
}

String _initials(String value) {
  final words = value
      .trim()
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .toList();

  if (words.isEmpty) {
    return 'A';
  }

  if (words.length == 1) {
    final word = words.first;

    return word.substring(0, word.length > 2 ? 2 : word.length).toUpperCase();
  }

  return '${words.first[0]}'
          '${words.last[0]}'
      .toUpperCase();
}

String _statusLabel(String value) {
  final clean = value.trim().toLowerCase();

  if (clean.isEmpty) {
    return 'Unknown';
  }

  return clean
      .split('_')
      .where((word) => word.isNotEmpty)
      .map(
        (word) =>
            '${word[0].toUpperCase()}'
            '${word.substring(1)}',
      )
      .join(' ');
}

String _lastActiveLabel(DateTime? value) {
  if (value == null) {
    return 'No recent activity';
  }

  return 'Last active ${_date(value)}';
}

String _date(DateTime value) {
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

  final local = value.toLocal();

  return '${local.day} '
      '${months[local.month - 1]} '
      '${local.year}';
}

String _shortDateTime(DateTime? value) {
  if (value == null) {
    return '';
  }

  final local = value.toLocal();

  final hour = local.hour == 0
      ? 12
      : local.hour > 12
      ? local.hour - 12
      : local.hour;

  final minute = local.minute.toString().padLeft(2, '0');

  final period = local.hour >= 12 ? 'PM' : 'AM';

  return '${_date(local)}, '
      '$hour:$minute $period';
}

String _compactDateTime(DateTime value) {
  final local = value.toLocal();

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

  return '${local.day} '
      '${months[local.month - 1]}';
}
