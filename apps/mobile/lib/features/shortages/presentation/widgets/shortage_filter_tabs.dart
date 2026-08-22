import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../controllers/shortages_controller.dart';

class ShortageFilterTabs extends StatelessWidget {
  const ShortageFilterTabs({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  final ShortageListFilter selected;
  final ValueChanged<ShortageListFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 42,
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(7),
      ),
      clipBehavior: Clip.antiAlias,
      child: Row(
        children: [
          _FilterTab(
            label: 'Open',
            value: ShortageListFilter.open,
            selected: selected,
            onChanged: onChanged,
          ),
          _FilterTab(
            label: 'Closed',
            value: ShortageListFilter.closed,
            selected: selected,
            onChanged: onChanged,
          ),
          _FilterTab(
            label: 'All',
            value: ShortageListFilter.all,
            selected: selected,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}

class _FilterTab extends StatelessWidget {
  const _FilterTab({
    required this.label,
    required this.value,
    required this.selected,
    required this.onChanged,
  });

  final String label;
  final ShortageListFilter value;
  final ShortageListFilter selected;
  final ValueChanged<ShortageListFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final active = selected == value;

    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => onChanged(value),
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.transparent,
            border: Border(
              right: value == ShortageListFilter.all
                  ? BorderSide.none
                  : const BorderSide(color: line),
              top: active
                  ? const BorderSide(color: forestEmerald)
                  : BorderSide.none,
              bottom: active
                  ? const BorderSide(color: forestEmerald)
                  : BorderSide.none,
              left: active
                  ? const BorderSide(color: forestEmerald)
                  : BorderSide.none,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? forestEmerald : midnightNavy,
              fontSize: 11,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ),
    );
  }
}
