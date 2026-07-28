import 'package:flutter/material.dart';

import '../models/field_records.dart';
import '../services/session_activity.dart';
import '../services/session_store.dart';
import '../theme.dart';
import 'customers/customers_tab.dart';
import 'home/home_tab.dart';
import 'login_screen.dart';
import 'operations/operations_tab.dart';
import 'profile/agent_profile_screen.dart';
import 'tasks/tasks_tab.dart';

class AgentShell extends StatefulWidget {
  const AgentShell({super.key, required this.session});

  final RembehSession session;

  @override
  State<AgentShell> createState() => _AgentShellState();
}

class _AgentShellState extends State<AgentShell> {
  int _index = 0;
  OperationsMode _operationsMode = OperationsMode.overview;
  RecordsSection _recordsSection = RecordsSection.repayments;
  RecordsFilter _recordsFilter = RecordsFilter.all;
  bool _customersAutofocus = false;
  int _customersFocusToken = 0;
  late final SessionActivityController _activity;

  @override
  void initState() {
    super.initState();
    _activity = SessionActivityController(
      sessionStore: SessionStore(),
      onIdleLogout: _handleIdleLogout,
    );
    _activity.start();
  }

  @override
  void dispose() {
    _activity.dispose();
    super.dispose();
  }

  Future<void> _handleIdleLogout() async {
    if (!mounted) return;
    final navigator = Navigator.of(context);
    navigator.pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => const LoginScreen(
          idleSignedOutMessage: 'Signed out after 5 minutes of inactivity.',
        ),
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
      _index = 2;
      _operationsMode = section == RecordsSection.repayments
          ? OperationsMode.collections
          : OperationsMode.loans;
      _recordsSection = section;
      _recordsFilter = filter;
    });
  }

  void _openCustomers({bool autofocus = true}) {
    unawaitedTouch();
    setState(() {
      _index = 1;
      _customersAutofocus = autofocus;
      _customersFocusToken += 1;
    });
  }

  void unawaitedTouch() {
    // ignore: discarded_futures
    _activity.touch();
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
    return SessionActivityListener(
      controller: _activity,
      child: Scaffold(
        backgroundColor: softIvory,
        body: IndexedStack(
          index: _index,
          children: [
            HomeTab(
              session: widget.session,
              onOpenProfile: _openProfile,
              onOpenSearch: () => _openCustomers(autofocus: true),
              onOpenRecords: _openRecords,
            ),
            CustomersTab(
              session: widget.session,
              autofocus: _customersAutofocus,
              focusToken: _customersFocusToken,
            ),
            OperationsTab(
              session: widget.session,
              mode: _operationsMode,
              recordsSection: _recordsSection,
              recordsFilter: _recordsFilter,
              onModeChanged: (mode) {
                unawaitedTouch();
                setState(() => _operationsMode = mode);
              },
              onRecordsSectionChanged: (section) {
                unawaitedTouch();
                setState(() => _recordsSection = section);
              },
              onRecordsFilterChanged: (filter) {
                unawaitedTouch();
                setState(() => _recordsFilter = filter);
              },
            ),
            const TasksTab(),
            AgentProfileScreen(session: widget.session),
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
                setState(() {
                  _index = value;
                  if (value != 1) {
                    _customersAutofocus = false;
                  }
                  if (value == 2 &&
                      _operationsMode != OperationsMode.overview) {
                    _operationsMode = OperationsMode.overview;
                  }
                });
              },
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home, color: forestEmerald),
                  label: 'Home',
                ),
                NavigationDestination(
                  icon: Icon(Icons.groups_outlined),
                  selectedIcon: Icon(Icons.groups, color: forestEmerald),
                  label: 'Customers',
                ),
                NavigationDestination(
                  icon: Icon(Icons.account_balance_wallet_outlined),
                  selectedIcon: Icon(
                    Icons.account_balance_wallet,
                    color: forestEmerald,
                  ),
                  label: 'Operations',
                ),
                NavigationDestination(
                  icon: Icon(Icons.task_alt_outlined),
                  selectedIcon: Icon(Icons.task_alt, color: forestEmerald),
                  label: 'Tasks',
                ),
                NavigationDestination(
                  icon: Icon(Icons.person_outline),
                  selectedIcon: Icon(Icons.person, color: forestEmerald),
                  label: 'Profile',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
