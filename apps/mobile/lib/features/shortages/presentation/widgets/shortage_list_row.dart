import 'package:flutter/material.dart';

import '../../../../theme.dart';
import '../../domain/models/cash_shortage.dart';
import '../utils/shortage_formatters.dart';
import 'shortage_status_chip.dart';

class ShortageListRow extends StatelessWidget {
  const ShortageListRow({
    super.key,
    required this.shortage,
    required this.onTap,
  });

  final CashShortage shortage;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = shortageStatusColor(shortage.isOpen);
    final title = shortageTitle(shortage);
    final source = shortageSourceLabel(shortage.sourceType);
    final date = shortageDateLabel(
      shortage.operationDate ?? shortage.createdAt,
    );

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 11, 8, 11),
          decoration: BoxDecoration(
            border: Border.all(color: line),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              ShortageAvatar(shortage: shortage),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '$source - $date',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 8.8,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Reason: ${shortageReason(shortage)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 8.3,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    shortageMoney(
                      shortage.amountOutstanding > 0
                          ? shortage.amountOutstanding
                          : shortage.amountOriginal,
                    ),
                    style: TextStyle(
                      color: tone,
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 6),
                  ShortageStatusChip(open: shortage.isOpen),
                ],
              ),
              const SizedBox(width: 5),
              const Icon(
                Icons.chevron_right_rounded,
                color: midnightNavy,
                size: 21,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ShortageAvatar extends StatelessWidget {
  const ShortageAvatar({super.key, required this.shortage});

  final CashShortage shortage;

  @override
  Widget build(BuildContext context) {
    final name = shortageTitle(shortage);
    final photoUrl = shortage.responsiblePhotoUrl;

    return Container(
      width: 42,
      height: 42,
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        color: Color(0xFFF1F5F2),
        shape: BoxShape.circle,
      ),
      child: photoUrl == null
          ? Center(
              child: Text(
                shortageInitials(name),
                style: const TextStyle(
                  color: forestEmerald,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
            )
          : Image.network(
              photoUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) {
                return Center(
                  child: Text(
                    shortageInitials(name),
                    style: const TextStyle(
                      color: forestEmerald,
                      fontSize: 13,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                );
              },
            ),
    );
  }
}
