import 'package:flutter/material.dart';

import '../features/agent_day/data/agent_day_status_store.dart';
import '../models/agent_day_status.dart';
import '../models/field_records.dart';
import '../features/repayment/data/repayments_live_store.dart';
import '../services/network_status_store.dart';
import '../services/offline_cache_store.dart';
import '../services/session_cleanup.dart';
import '../services/session_activity.dart';
import '../services/session_store.dart';
import '../theme.dart';
import '../utils/money.dart';
import 'account_locked_screen.dart';
import 'home/home_tab.dart';
import 'login_screen.dart';
import 'profile/agent_profile_screen.dart';
import 'records/records_tab.dart';
import 'search/search_tab.dart';

class AgentShell extends StatefulWidget {
  const AgentShell({super.key, required this.session});

  final RembehSession session;

  @override
  State<AgentShell> createState() => _AgentShellState();
}

class _AgentShellState extends State<AgentShell> {
  int _index = 0;
  RecordsSection _recordsSection = RecordsSection.repayments;
  RecordsFilter _recordsFilter = RecordsFilter.all;
  bool _searchAutofocus = false;
  int _searchFocusToken = 0;
  final _dayStore = AgentDayStatusStore.instance;
  final _network = NetworkStatusStore.instance;
  final _offline = OfflineCacheStore.instance;
  DateTime? _cacheSyncedAt;
  late final SessionActivityController _activity;

  @override
  void initState() {
    super.initState();
    _activity = SessionActivityController(
      sessionStore: SessionStore(),
      onSessionCleared: _handleSessionCleared,
      onAccountBlocked: _handleAccountBlocked,
    );
    _dayStore.addListener(_onDayChanged);
    _network.addListener(_onNetworkChanged);
    // ignore: discarded_futures
    _dayStore.start(widget.session);
    // ignore: discarded_futures
    _network.start();
    _activity.start();
    // ignore: discarded_futures
    _loadCacheSyncedAt();
  }

  Future<void> _loadCacheSyncedAt() async {
    final tenantId = widget.session.tenantId;
    final branchId = widget.session.branchId;
    if (tenantId == null || branchId == null) return;
    final syncedAt = await _offline.savedAt(
      OfflineCacheKeys.customers(tenantId, branchId),
    );
    if (!mounted) return;
    setState(() => _cacheSyncedAt = syncedAt);
  }

  @override
  void dispose() {
    _dayStore.removeListener(_onDayChanged);
    _network.removeListener(_onNetworkChanged);
    _activity.dispose();
    super.dispose();
  }

  void _onNetworkChanged() {
    if (!mounted) return;
    setState(() {});
    if (_network.isOnline) {
      // ignore: discarded_futures
      _refreshCaches();
    }
  }

  Future<void> _refreshCaches() async {
    final session = widget.session;
    final tenantId = session.tenantId;
    final branchId = session.branchId;
    if (tenantId == null || branchId == null) return;
    try {
      final status = _dayStore.status;
      if (status != null) {
        await _offline.putJson(
          OfflineCacheKeys.agentDay(tenantId, branchId),
          {
            'date': status.date,
            'canUseApp': status.canUseApp,
            'canBrowseClients': status.canBrowseClients,
            'lockReason': status.lockReason,
            'lockTitle': status.lockTitle,
            'lockMessage': status.lockMessage,
            'branchStatus': status.branchStatus,
          },
        );
      }
      // Warm field client index used for offline search.
      await RepaymentsLiveStore.instance.refreshOfflineIndex(session);
      await RepaymentsLiveStore.instance.flushPendingWrites();
      final syncedAt = await _offline.savedAt(
        OfflineCacheKeys.customers(tenantId, branchId),
      );
      if (mounted) {
        setState(() => _cacheSyncedAt = syncedAt ?? DateTime.now().toUtc());
      }
    } catch (_) {
      // Keep previous cache if refresh fails — never drop on failure.
    }
  }

  void _onDayChanged() {
    if (!mounted) return;
    setState(() {});
    final blocked = _dayStore.accountBlockedMessage;
    if (blocked != null && blocked.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        // ignore: discarded_futures
        _handleAccountBlocked(blocked);
      });
      return;
    }
    final status = _dayStore.status;
    if (status != null && !status.canUseApp && !status.canBrowseClients) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        Navigator.of(context).popUntil((route) => route.isFirst);
      });
    }
    if (status != null && !status.canUseApp && status.canBrowseClients) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        Navigator.of(context).popUntil((route) => route.isFirst);
        if (_index == 0) {
          setState(() => _index = 1);
        }
      });
    }
  }

  Future<void> _handleSessionCleared() async {
    if (!mounted) return;
    final navigator = Navigator.of(context);
    navigator.pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => const LoginScreen(),
      ),
      (_) => false,
    );
  }

  Future<void> _handleAccountBlocked(String message) async {
    await clearTenantScopedClientState();
    await SessionStore().clear();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => AccountLockedScreen(message: message),
      ),
      (_) => false,
    );
  }

  void _openRecords({
    required RecordsSection section,
    required RecordsFilter filter,
  }) {
    unawaitedTouch();
    setState(() {
      _index = 1;
      _recordsSection = section;
      _recordsFilter = filter;
    });
  }

  void _openSearch({bool autofocus = true}) {
    unawaitedTouch();
    setState(() {
      _index = 2;
      _searchAutofocus = autofocus;
      _searchFocusToken += 1;
    });
  }

  void unawaitedTouch() {
    // ignore: discarded_futures
    _activity.touch();
  }

  Future<void> _refreshDayStatus() async {
    unawaitedTouch();
    await _dayStore.refresh();
  }

  Future<void> _signOut() async {
    unawaitedTouch();
    await clearTenantScopedClientState();
    await SessionStore().clear();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Future<void> _openProfile() async {
    unawaitedTouch();
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AgentProfileScreen(session: widget.session),
      ),
    );
    unawaitedTouch();
  }

  @override
  Widget build(BuildContext context) {
    final blocked = _dayStore.accountBlockedMessage;
    if (blocked != null && blocked.isNotEmpty) {
      return AccountLockedScreen(message: blocked);
    }

    final dayStatus = _dayStore.status;
    if (dayStatus == null) {
      return SessionActivityListener(
        controller: _activity,
        child: _AgentDayCheckingScreen(
          loading: _dayStore.loading,
          error: _dayStore.error,
          onRefresh: _refreshDayStatus,
          onSignOut: _signOut,
        ),
      );
    }

    if (!dayStatus.canUseApp) {
      if (dayStatus.canBrowseClients) {
        final browseIndex = _index == 0 ? 0 : _index - 1;
        return SessionActivityListener(
          controller: _activity,
          child: Scaffold(
            backgroundColor: softIvory,
            body: Column(
              children: [
                _BrowseOnlyBanner(
                  status: dayStatus,
                  loading: _dayStore.loading,
                  onRefresh: _refreshDayStatus,
                ),
                Expanded(
                  child: IndexedStack(
                    index: browseIndex.clamp(0, 1),
                    children: [
                      RecordsTab(
                        session: widget.session,
                        section: _recordsSection,
                        filter: _recordsFilter,
                        onSectionChanged: (section) {
                          unawaitedTouch();
                          setState(() => _recordsSection = section);
                        },
                        onFilterChanged: (filter) {
                          unawaitedTouch();
                          setState(() => _recordsFilter = filter);
                        },
                      ),
                      SearchTab(
                        autofocus: _searchAutofocus,
                        focusToken: _searchFocusToken,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            bottomNavigationBar: Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: line)),
              ),
              child: SafeArea(
                top: false,
                child: NavigationBar(
                  height: 64,
                  backgroundColor: Colors.white,
                  indicatorColor: forestEmerald.withValues(alpha: 0.12),
                  selectedIndex: browseIndex.clamp(0, 1),
                  labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                  onDestinationSelected: (value) {
                    unawaitedTouch();
                    if (value == 1) {
                      setState(() {
                        _index = 2;
                        _searchAutofocus = true;
                        _searchFocusToken += 1;
                      });
                      return;
                    }
                    setState(() {
                      _index = 1;
                      _searchAutofocus = false;
                    });
                  },
                  destinations: const [
                    NavigationDestination(
                      icon: Icon(Icons.description_outlined),
                      selectedIcon: Icon(Icons.description, color: forestEmerald),
                      label: 'Records',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.search),
                      selectedIcon: Icon(Icons.search, color: forestEmerald),
                      label: 'Search',
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }

      return SessionActivityListener(
        controller: _activity,
        child: _AgentDayLockedScreen(
          status: dayStatus,
          loading: _dayStore.loading,
          error: _dayStore.error,
          onRefresh: _refreshDayStatus,
          onSignOut: _signOut,
        ),
      );
    }

    return SessionActivityListener(
      controller: _activity,
      child: Scaffold(
        backgroundColor: softIvory,
        body: Column(
          children: [
            if (_network.isOffline)
              Material(
                color: const Color(0xFFFEF3C7),
                child: SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 8,
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.cloud_off_outlined,
                          size: 16,
                          color: Color(0xFF92400E),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _cacheSyncedAt == null
                                ? 'Offline — open the app online once to cache field data.'
                                : 'Offline — using cached data from ${_cacheSyncedAt!.toLocal().toString().substring(0, 16)}.',
                            style: const TextStyle(
                              color: Color(0xFF92400E),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            Expanded(
              child: IndexedStack(
                index: _index,
                children: [
                  HomeTab(
                    session: widget.session,
                    dayStatus: dayStatus,
                    onRefreshDayStatus: _refreshDayStatus,
                    onOpenProfile: _openProfile,
                    onOpenSearch: () => _openSearch(autofocus: true),
                    onOpenRecords: _openRecords,
                  ),
                  RecordsTab(
                    session: widget.session,
                    section: _recordsSection,
                    filter: _recordsFilter,
                    onSectionChanged: (section) {
                      unawaitedTouch();
                      setState(() => _recordsSection = section);
                    },
                    onFilterChanged: (filter) {
                      unawaitedTouch();
                      setState(() => _recordsFilter = filter);
                    },
                  ),
                  SearchTab(
                    autofocus: _searchAutofocus,
                    focusToken: _searchFocusToken,
                  ),
                ],
              ),
            ),
          ],
        ),
        bottomNavigationBar: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: line)),
          ),
          child: SafeArea(
            top: false,
            child: NavigationBar(
              height: 64,
              backgroundColor: Colors.white,
              indicatorColor: forestEmerald.withValues(alpha: 0.12),
              selectedIndex: _index,
              labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
              onDestinationSelected: (value) {
                unawaitedTouch();
                if (value == 2) {
                  _openSearch(autofocus: true);
                  return;
                }
                setState(() {
                  _index = value;
                  _searchAutofocus = false;
                });
              },
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home, color: forestEmerald),
                  label: 'Home',
                ),
                NavigationDestination(
                  icon: Icon(Icons.description_outlined),
                  selectedIcon: Icon(Icons.description, color: forestEmerald),
                  label: 'Records',
                ),
                NavigationDestination(
                  icon: Icon(Icons.search),
                  selectedIcon: Icon(Icons.search, color: forestEmerald),
                  label: 'Search',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BrowseOnlyBanner extends StatelessWidget {
  const _BrowseOnlyBanner({
    required this.status,
    required this.loading,
    required this.onRefresh,
  });

  final AgentDayStatus status;
  final bool loading;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final title = status.lockTitle ?? 'Field work paused';
    final message = status.lockMessage ??
        'You can browse client records. Full field work unlocks at 6:00 AM.';

    return Material(
      color: warmGold.withValues(alpha: 0.12),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Icon(Icons.lock_clock_outlined, color: warmGold, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      message,
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Check again',
                onPressed: loading ? null : onRefresh,
                icon: loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: forestEmerald,
                        ),
                      )
                    : const Icon(Icons.refresh, color: forestEmerald, size: 20),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AgentDayCheckingScreen extends StatelessWidget {
  const _AgentDayCheckingScreen({
    required this.loading,
    required this.error,
    required this.onRefresh,
    required this.onSignOut,
  });

  final bool loading;
  final String? error;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: softIvory,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 360),
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: line),
                borderRadius: rembehBorderRadius(rembehRadiusLg),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (loading && error == null)
                    const CircularProgressIndicator(color: forestEmerald)
                  else
                    const Icon(
                      Icons.lock_clock_outlined,
                      color: warmGold,
                      size: 34,
                    ),
                  const SizedBox(height: 14),
                  const Text(
                    'Checking branch day',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: midnightNavy,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    error ??
                        'Please wait while REMBEH confirms that your branch is open for today.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 13,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: loading ? null : onSignOut,
                          child: const Text('Signout'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _CheckAgainButton(
                          loading: loading,
                          onPressed: onRefresh,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AgentDayLockedScreen extends StatelessWidget {
  const _AgentDayLockedScreen({
    required this.status,
    required this.loading,
    required this.error,
    required this.onRefresh,
    required this.onSignOut,
  });

  final AgentDayStatus status;
  final bool loading;
  final String? error;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) {
    final branchName = status.branch?.name ?? 'Your branch';
    final title = status.lockTitle ?? 'Agent app closed';
    final message =
        error ?? status.lockMessage ?? 'You cannot use the app now.';

    return Scaffold(
      backgroundColor: softIvory,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 380),
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: line),
                borderRadius: rembehBorderRadius(rembehRadiusLg),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: warmGold.withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.lock_outline,
                      color: warmGold,
                      size: 24,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    branchName,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: forestEmerald,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                  if (status.float.amountReceived > 0 ||
                      status.float.expectedHandover > 0) ...[
                    const SizedBox(height: 16),
                    _LockedMoneyLine(
                      label: 'Float received',
                      value: status.float.amountReceived,
                    ),
                    _LockedMoneyLine(
                      label: 'Expected handover',
                      value: status.float.expectedHandover,
                      strong: true,
                    ),
                    if (status.float.amountReturned != null)
                      _LockedMoneyLine(
                        label: 'Handover recorded',
                        value: status.float.amountReturned!,
                      ),
                  ],
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: loading ? null : onSignOut,
                          child: const Text('Signout'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _CheckAgainButton(
                          loading: loading,
                          onPressed: onRefresh,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CheckAgainButton extends StatelessWidget {
  const _CheckAgainButton({required this.loading, required this.onPressed});

  final bool loading;
  final Future<void> Function() onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: loading ? null : onPressed,
      child: loading
          ? const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: forestEmerald,
                  ),
                ),
                SizedBox(width: 8),
                Text('Checking…'),
              ],
            )
          : const Text('Check again'),
    );
  }
}

class _LockedMoneyLine extends StatelessWidget {
  const _LockedMoneyLine({
    required this.label,
    required this.value,
    this.strong = false,
  });

  final String label;
  final int value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: strong ? sage : softIvory,
        border: Border.all(color: strong ? forestEmerald : line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: slateText,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Text(
            'UGX ${formatMoney(value)}',
            style: TextStyle(
              color: strong ? forestEmerald : midnightNavy,
              fontWeight: FontWeight.w900,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}
