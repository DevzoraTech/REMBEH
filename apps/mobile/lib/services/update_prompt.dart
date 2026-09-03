import 'package:flutter/material.dart';

import '../screens/force_update_screen.dart';
import 'update_service.dart';

bool _updatePromptOpen = false;

Future<void> promptAppUpdateIfNeeded(BuildContext context) async {
  if (_updatePromptOpen) return;
  final update = await UpdateService.checkForUpdate();
  if (update == null || !update.requiresFullInstall) return;
  if (!context.mounted) return;

  _updatePromptOpen = true;
  try {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ForceUpdateScreen(
          updateResult: update,
          onSkip: update.isBlocking ? null : () => Navigator.of(context).pop(),
        ),
      ),
    );
  } finally {
    _updatePromptOpen = false;
  }
}
