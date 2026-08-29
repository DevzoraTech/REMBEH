import 'package:flutter/material.dart';

import '../../../../services/api_client.dart';
import '../../../../services/session_store.dart';
import '../../../../theme.dart';
import '../../application/invite_agent.dart';
import '../../application/load_agents.dart';
import '../../data/repositories/agents_repository_impl.dart';
import '../controllers/agents_controller.dart';
import '../sheets/invite_agent_sheet.dart';
import 'agent_details_screen.dart';

class AgentsScreen extends StatefulWidget {
  const AgentsScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<AgentsScreen> createState() => _AgentsScreenState();
}

class _AgentsScreenState extends State<AgentsScreen> {
  late final AgentsRepositoryImpl _repository;
  late final AgentsController _controller;
  late final TextEditingController _searchController;

  String _filter = 'ALL';

  @override
  void initState() {
    super.initState();

    final store = SessionStore();
    final api = ApiClient(store);

    _repository = AgentsRepositoryImpl(apiClient: api);

    _controller = AgentsController(loadAgents: LoadAgents(_repository));

    _searchController = TextEditingController();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }

      _controller.load(session: widget.session);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _controller.dispose();

    super.dispose();
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

  Future<void> _openAgent(String agentId) async {
    final id = agentId.trim();

    if (id.isEmpty) {
      return;
    }

    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => AgentDetailScreen(session: widget.session, agentId: id),
      ),
    );

    if (!mounted) {
      return;
    }

    await _controller.refresh(session: widget.session);
  }

  Future<void> _showInviteAgent() async {
    final branchId = widget.session.branchId;

    if (branchId == null || branchId.trim().isEmpty) {
      return;
    }

    final invited = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return InviteAgentSheet(
          session: widget.session,
          branchId: branchId,
          inviteAgent: InviteAgent(_repository),
        );
      },
    );

    if (!mounted) {
      return;
    }

    if (invited == true) {
      await _controller.refresh(session: widget.session);
    }
  }

  Future<void> _refresh() {
    return _controller.refresh(session: widget.session);
  }

  // ===========================================================================
  // BUILD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    final canInvite = widget.session.hasPermission('branch.staff.invite');

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            _AgentsHeader(
              canInvite: canInvite,
              onBack: _closeScreen,
              onInvite: _showInviteAgent,
            ),
            Expanded(
              child: AnimatedBuilder(
                animation: _controller,
                builder: (context, child) {
                  return _buildContent();
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    if (_controller.isLoading && _controller.overview == null) {
      return const Center(
        child: CircularProgressIndicator(color: forestEmerald),
      );
    }

    if (_controller.error != null && _controller.overview == null) {
      return _ErrorView(message: _controller.error!, onRetry: _refresh);
    }

    final allAgents = _controller.agents;

    final agents = allAgents.where((agent) {
      final status = agent.status.trim().toUpperCase();

      switch (_filter) {
        case 'ACTIVE':
          return status == 'ACTIVE';

        case 'SUSPENDED':
          return status == 'SUSPENDED';

        case 'INACTIVE':
          return status == 'INACTIVE' ||
              status == 'INVITED' ||
              status == 'PENDING_VERIFICATION';

        default:
          return true;
      }
    }).toList();

    final activeCount = allAgents.where((agent) {
      return agent.status.toUpperCase() == 'ACTIVE';
    }).length;

    final suspendedCount = allAgents.where((agent) {
      return agent.status.toUpperCase() == 'SUSPENDED';
    }).length;

    final inactiveCount = allAgents.where((agent) {
      final status = agent.status.toUpperCase();

      return status == 'INACTIVE' ||
          status == 'INVITED' ||
          status == 'PENDING_VERIFICATION';
    }).length;

    final onDutyCount = allAgents.where((agent) {
      return agent.floatToday != null;
    }).length;

    final collectedToday = allAgents.fold<num>(
      0,
      (sum, agent) => sum + agent.amountCollectedToday,
    );

    final floatIssued = allAgents.fold<num>(
      0,
      (sum, agent) => sum + (agent.floatToday ?? 0),
    );

    return RefreshIndicator(
      color: forestEmerald,
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 32),
        children: [
          _SearchField(
            controller: _searchController,
            onChanged: (value) {
              _controller.setSearch(value);
            },
            onClear: () {
              _searchController.clear();

              _controller.clearSearch();
            },
          ),

          const SizedBox(height: 16),

          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _FilterChip(
                  label: 'All ${allAgents.length}',
                  selected: _filter == 'ALL',
                  onTap: () {
                    setState(() {
                      _filter = 'ALL';
                    });
                  },
                ),

                const SizedBox(width: 8),

                _FilterChip(
                  label: 'Active $activeCount',
                  selected: _filter == 'ACTIVE',
                  onTap: () {
                    setState(() {
                      _filter = 'ACTIVE';
                    });
                  },
                ),

                const SizedBox(width: 8),

                _FilterChip(
                  label: 'Suspended $suspendedCount',
                  selected: _filter == 'SUSPENDED',
                  onTap: () {
                    setState(() {
                      _filter = 'SUSPENDED';
                    });
                  },
                ),

                const SizedBox(width: 8),

                _FilterChip(
                  label: 'Inactive $inactiveCount',
                  selected: _filter == 'INACTIVE',
                  onTap: () {
                    setState(() {
                      _filter = 'INACTIVE';
                    });
                  },
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          Row(
            children: [
              Expanded(
                child: _SummaryMetric(value: '$onDutyCount', label: 'On duty'),
              ),

              const SizedBox(width: 8),

              Expanded(
                child: _SummaryMetric(
                  value: _shortMoney(collectedToday),
                  label: 'Collected',
                ),
              ),

              const SizedBox(width: 8),

              Expanded(
                child: _SummaryMetric(
                  value: _shortMoney(floatIssued),
                  label: 'Float issued',
                ),
              ),
            ],
          ),

          const SizedBox(height: 18),

          if (_controller.error != null) ...[
            _InlineError(message: _controller.error!),

            const SizedBox(height: 12),
          ],

          if (agents.isEmpty)
            const _EmptyAgents()
          else
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: line),
                borderRadius: BorderRadius.circular(14),
              ),
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  for (var index = 0; index < agents.length; index++) ...[
                    _AgentRow(
                      agent: agents[index],
                      onTap: () {
                        _openAgent(agents[index].id);
                      },
                    ),

                    if (index < agents.length - 1)
                      const Divider(height: 1, indent: 80, color: line),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _AgentsHeader extends StatelessWidget {
  const _AgentsHeader({
    required this.canInvite,
    required this.onBack,
    required this.onInvite,
  });

  final bool canInvite;
  final VoidCallback onBack;
  final VoidCallback onInvite;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: line)),
      ),
      child: SizedBox(
        height: 64,
        child: Row(
          children: [
            const SizedBox(width: 12),
            Semantics(
              button: true,
              label: 'Back',
              child: IconButton(
                tooltip: 'Back',
                onPressed: onBack,
                icon: const Icon(
                  Icons.arrow_back_rounded,
                  color: midnightNavy,
                  size: 27,
                ),
              ),
            ),
            const SizedBox(width: 2),
            const Expanded(
              child: Text(
                'Field Officers',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: midnightNavy,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            if (canInvite)
              Padding(
                padding: const EdgeInsets.only(right: 14),
                child: FilledButton.icon(
                  onPressed: onInvite,
                  style: FilledButton.styleFrom(
                    backgroundColor: forestEmerald,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(0, 40),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  icon: const Icon(Icons.add_rounded, size: 20),
                  label: const Text(
                    'Add',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                  ),
                ),
              )
            else
              const SizedBox(width: 14),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// SEARCH
// =============================================================================

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: controller,
      builder: (context, value, child) {
        return TextField(
          controller: controller,
          onChanged: onChanged,
          textInputAction: TextInputAction.search,
          style: const TextStyle(
            color: midnightNavy,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
          decoration: InputDecoration(
            hintText: 'Search field officers...',
            hintStyle: const TextStyle(
              color: slateText,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
            prefixIcon: const Icon(
              Icons.search_rounded,
              color: slateText,
              size: 24,
            ),
            suffixIcon: value.text.isEmpty
                ? null
                : IconButton(
                    onPressed: onClear,
                    icon: const Icon(Icons.close_rounded),
                  ),
            filled: true,
            fillColor: Colors.white,
            contentPadding: const EdgeInsets.symmetric(vertical: 16),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: line),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: forestEmerald, width: 1.2),
            ),
          ),
        );
      },
    );
  }
}

// =============================================================================
// FILTER
// =============================================================================

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? forestEmerald : Colors.white,
      shape: StadiumBorder(
        side: BorderSide(color: selected ? forestEmerald : line),
      ),
      child: InkWell(
        onTap: onTap,
        customBorder: const StadiumBorder(),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : midnightNavy,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// SUMMARY
// =============================================================================

class _SummaryMetric extends StatelessWidget {
  const _SummaryMetric({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 58,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F8F8),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Flexible(
            child: Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 15,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),

          const SizedBox(width: 7),

          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: slateText,
                fontSize: 9,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// AGENT ROW
// =============================================================================

class _AgentRow extends StatelessWidget {
  const _AgentRow({required this.agent, required this.onTap});

  final dynamic agent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
        child: Row(
          children: [
            _AgentAvatar(name: agent.name, photoUrl: agent.photoUrl),

            const SizedBox(width: 12),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    agent.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),

                  const SizedBox(height: 5),

                  Row(
                    children: [
                      const Icon(
                        Icons.phone_outlined,
                        size: 14,
                        color: midnightNavy,
                      ),

                      const SizedBox(width: 6),

                      Expanded(
                        child: Text(
                          agent.phone ?? 'No phone',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: slateText,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 5),

                  Row(
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          color: _activityColor(agent),
                          shape: BoxShape.circle,
                        ),
                      ),

                      const SizedBox(width: 6),

                      Expanded(
                        child: Text(
                          _activityLabel(agent),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: slateText,
                            fontSize: 9,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(width: 8),

            _StatusBadge(status: agent.status),

            const SizedBox(width: 6),

            const Icon(Icons.chevron_right_rounded, size: 22, color: slateText),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// AVATAR
// =============================================================================

class _AgentAvatar extends StatelessWidget {
  const _AgentAvatar({required this.name, this.photoUrl});

  final String name;
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final url = photoUrl?.trim();

    return ClipOval(
      child: Container(
        width: 56,
        height: 56,
        color: const Color(0xFFF0F5F2),
        child: url != null && url.isNotEmpty
            ? Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) {
                  return _Initials(name: name);
                },
              )
            : _Initials(name: name),
      ),
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
          fontSize: 17,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

// =============================================================================
// STATUS
// =============================================================================

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final normalized = status.trim().toUpperCase();

    late final Color foreground;
    late final Color background;
    late final String label;

    switch (normalized) {
      case 'ACTIVE':
        foreground = forestEmerald;
        background = const Color(0xFFEAF5ED);
        label = 'Active';
        break;

      case 'SUSPENDED':
        foreground = const Color(0xFFB42318);
        background = const Color(0xFFFDECEC);
        label = 'Suspended';
        break;

      case 'INVITED':
      case 'PENDING_VERIFICATION':
        foreground = const Color(0xFF175CD3);
        background = const Color(0xFFEFF4FF);
        label = 'Pending';
        break;

      default:
        foreground = const Color(0xFFB54708);
        background = const Color(0xFFFFF3DC);
        label = 'Inactive';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(7),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foreground,
          fontSize: 9,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

// =============================================================================
// STATES
// =============================================================================

class _EmptyAgents extends StatelessWidget {
  const _EmptyAgents();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 54),
      child: Center(
        child: Text(
          'No field officers found.',
          style: TextStyle(
            color: slateText,
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF3F2),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        message,
        style: const TextStyle(
          color: Color(0xFFB42318),
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

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
              color: Color(0xFFB42318),
              size: 30,
            ),

            const SizedBox(height: 10),

            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: slateText,
                fontSize: 11,
                height: 1.4,
              ),
            ),

            const SizedBox(height: 14),

            OutlinedButton(
              onPressed: () {
                onRetry();
              },
              child: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// HELPERS
// =============================================================================

String _initials(String name) {
  final words = name
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

String _activityLabel(dynamic agent) {
  if (agent.floatToday != null) {
    return 'On duty today';
  }

  final last = agent.lastActiveAt;

  if (last == null) {
    return 'Not on duty';
  }

  final date = last is DateTime ? last : DateTime.tryParse(last.toString());

  if (date == null) {
    return 'Not on duty';
  }

  final local = date.toLocal();

  return 'Last active '
      '${local.day} '
      '${_month(local.month)}';
}

Color _activityColor(dynamic agent) {
  if (agent.floatToday != null) {
    return forestEmerald;
  }

  if (agent.status.toString().toUpperCase() == 'SUSPENDED') {
    return const Color(0xFFB42318);
  }

  return const Color(0xFFD99A00);
}

String _month(int month) {
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

  return months[month - 1];
}

String _shortMoney(num value) {
  final amount = value.abs();

  if (amount >= 1000000) {
    final result = value / 1000000;

    return '${result.toStringAsFixed(result % 1 == 0 ? 0 : 1)}M';
  }

  if (amount >= 1000) {
    final result = value / 1000;

    return '${result.toStringAsFixed(result % 1 == 0 ? 0 : 1)}K';
  }

  return value.round().toString();
}
