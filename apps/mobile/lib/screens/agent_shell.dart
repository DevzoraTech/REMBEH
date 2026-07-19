import 'package:flutter/material.dart';

import '../models/field_records.dart';
import '../services/session_store.dart';
import '../theme.dart';
import 'home/home_tab.dart';
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

  void _openRecords({
    required RecordsSection section,
    required RecordsFilter filter,
  }) {
    setState(() {
      _index = 1;
      _recordsSection = section;
      _recordsFilter = filter;
    });
  }

  void _openSearch({bool autofocus = true}) {
    setState(() {
      _index = 2;
      _searchAutofocus = autofocus;
      _searchFocusToken += 1;
    });
  }

  Future<void> _openProfile() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AgentProfileScreen(session: widget.session),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: softIvory,
      body: IndexedStack(
        index: _index,
        children: [
          HomeTab(
            session: widget.session,
            onOpenProfile: _openProfile,
            onOpenSearch: () => _openSearch(autofocus: true),
            onOpenRecords: _openRecords,
          ),
          RecordsTab(
            session: widget.session,
            section: _recordsSection,
            filter: _recordsFilter,
            onSectionChanged: (section) {
              setState(() => _recordsSection = section);
            },
            onFilterChanged: (filter) {
              setState(() => _recordsFilter = filter);
            },
          ),
          SearchTab(
            autofocus: _searchAutofocus,
            focusToken: _searchFocusToken,
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
    );
  }
}
