import 'package:flutter/material.dart';

import '../../../../theme.dart';

class WorkspaceBottomNavigation extends StatelessWidget {
  const WorkspaceBottomNavigation({
    super.key,
    required this.selectedIndex,
    required this.onChanged,
    this.showOperations = true,
  });

  final int selectedIndex;
  final ValueChanged<int> onChanged;
  final bool showOperations;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(
            color: line,
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: NavigationBar(
          height: 64,
          selectedIndex: selectedIndex,
          onDestinationSelected: onChanged,
          destinations: [
            const NavigationDestination(
              icon: Icon(
                Icons.home_outlined,
              ),
              selectedIcon: Icon(
                Icons.home,
                color: forestEmerald,
              ),
              label: 'Home',
            ),
            if (showOperations)
              const NavigationDestination(
                icon: Icon(
                  Icons.today_outlined,
                ),
                selectedIcon: Icon(
                  Icons.today,
                  color: forestEmerald,
                ),
                label: 'Ops',
              ),
            const NavigationDestination(
              icon: Icon(
                Icons.receipt_long_outlined,
              ),
              selectedIcon: Icon(
                Icons.receipt_long,
                color: forestEmerald,
              ),
              label: 'Records',
            ),
            const NavigationDestination(
              icon: Icon(
                Icons.search,
              ),
              selectedIcon: Icon(
                Icons.search,
                color: forestEmerald,
              ),
              label: 'Clients',
            ),
            const NavigationDestination(
              icon: Icon(
                Icons.grid_view_outlined,
              ),
              selectedIcon: Icon(
                Icons.grid_view,
                color: forestEmerald,
              ),
              label: 'More',
            ),
          ],
        ),
      ),
    );
  }
}