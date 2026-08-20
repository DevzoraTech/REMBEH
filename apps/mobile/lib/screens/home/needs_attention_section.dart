import 'package:flutter/material.dart';

import '../../theme.dart';

class NeedsAttentionSection extends StatelessWidget {
  const NeedsAttentionSection({
    super.key,
    required this.items,
    this.onViewAll,
  });

  final List<AttentionItem> items;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 26),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionHeader(
            title: 'Needs attention',
            count: items.length,
            onViewAll: onViewAll,
          ),

          const SizedBox(height: 10),

          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: const Color(0xFFEEF1EF),
              ),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x08000000),
                  blurRadius: 10,
                  offset: Offset(0, 3),
                ),
              ],
            ),
            child: Column(
              children: List.generate(
                items.length,
                (index) {
                  final item = items[index];
                  final isLast = index == items.length - 1;

                  return Column(
                    children: [
                      _AttentionItemTile(
                        item: item,
                        onTap: item.onTap,
                      ),

                      if (!isLast)
                        const Padding(
                          padding: EdgeInsets.only(
                            left: 16,
                            right: 16,
                          ),
                          child: Divider(
                            height: 1,
                            thickness: 1,
                            color: Color(0xFFECEFED),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class AttentionItem {
  const AttentionItem({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    this.count,
    this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final String? count;
  final VoidCallback? onTap;
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.count,
    this.onViewAll,
  });

  final String title;
  final int count;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: const TextStyle(
            color: midnightNavy,
            fontSize: 15,
            fontWeight: FontWeight.w800,
            height: 1,
          ),
        ),

        const SizedBox(width: 8),

        Container(
          constraints: const BoxConstraints(
            minWidth: 20,
            minHeight: 20,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 5),
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: Color(0xFFE53935),
            shape: BoxShape.circle,
          ),
          child: Text(
            '$count',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              height: 1,
            ),
          ),
        ),

        const Spacer(),

        if (onViewAll != null)
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onViewAll,
              borderRadius: BorderRadius.circular(8),
              child: const Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: 4,
                  vertical: 3,
                ),
                child: Text(
                  'View all',
                  style: TextStyle(
                    color: forestEmerald,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    height: 1,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _AttentionItemTile extends StatelessWidget {
  const _AttentionItemTile({
    required this.item,
    this.onTap,
  });

  final AttentionItem item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final row = Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 12,
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: item.iconColor.withValues(alpha: 0.10),
              shape: BoxShape.circle,
            ),
            child: Icon(
              item.icon,
              color: item.iconColor,
              size: 19,
            ),
          ),

          const SizedBox(width: 12),

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
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    height: 1.05,
                  ),
                ),

                const SizedBox(height: 3),

                Text(
                  item.subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: slateText,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                    height: 1.05,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(width: 12),

          const Icon(
            Icons.chevron_right_rounded,
            color: midnightNavy,
            size: 22,
          ),
        ],
      ),
    );

    if (onTap == null) {
      return row;
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: row,
      ),
    );
  }
}