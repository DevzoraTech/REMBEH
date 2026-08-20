import 'package:flutter/material.dart';

import '../../../../theme.dart';

class BranchHeader extends StatelessWidget {
  const BranchHeader({
    super.key,
    required this.workspaceName,
    required this.branchName,
    required this.roleName,
    required this.loading,
    required this.onRefresh,
    required this.onSignOut,
  });

  final String workspaceName;
  final String branchName;
  final String roleName;

  final bool loading;

  final VoidCallback onRefresh;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          16,
          12,
          8,
          12,
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: sage,
                borderRadius: rembehBorderRadius(
                  rembehRadiusMd,
                ),
              ),
              child: const Icon(
                Icons.business_outlined,
                color: forestEmerald,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    workspaceName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    '$branchName - $roleName',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: slateText,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Refresh',
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
                  : const Icon(
                      Icons.refresh,
                      color: forestEmerald,
                    ),
            ),
            IconButton(
              tooltip: 'Sign out',
              onPressed: onSignOut,
              icon: const Icon(
                Icons.logout,
                color: slateText,
              ),
            ),
          ],
        ),
      ),
    );
  }
}