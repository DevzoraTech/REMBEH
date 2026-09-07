import 'package:flutter/material.dart';

import '../screens/force_update_screen.dart';
import 'update_service.dart';

bool _updatePromptOpen = false;

/// Optional updates skipped during this foreground session (same build).
/// Cleared on every app open/resume so the skippable modal returns.
int? _skippedOptionalBuild;
int? _skippedOptionalEpoch;

enum UpdatePromptTrigger {
  /// Cold start, login, or returning to the app — always show if an update exists.
  open,

  /// Background poll while the app stays open — do not nag after Skip.
  poll,

  /// Control Center pushed a new release while signed in — show even after Skip.
  rollout,
}

void clearOptionalUpdateSkip() {
  _skippedOptionalBuild = null;
  _skippedOptionalEpoch = null;
}

Future<void> promptAppUpdateIfNeeded(
  BuildContext context, {
  UpdatePromptTrigger trigger = UpdatePromptTrigger.open,
}) async {
  if (_updatePromptOpen) return;

  if (trigger == UpdatePromptTrigger.open ||
      trigger == UpdatePromptTrigger.rollout) {
    clearOptionalUpdateSkip();
  }

  final update = await UpdateService.checkForUpdate();
  if (update == null || !update.requiresFullInstall) return;
  if (!context.mounted) return;

  final optional = !update.isBlocking;
  if (optional &&
      trigger == UpdatePromptTrigger.poll &&
      _skippedOptionalBuild == update.latestBuild &&
      _skippedOptionalEpoch == update.latestReleaseEpoch) {
    return;
  }

  _updatePromptOpen = true;
  try {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ForceUpdateScreen(
          updateResult: update,
          onSkip: optional
              ? () {
                  _skippedOptionalBuild = update.latestBuild;
                  _skippedOptionalEpoch = update.latestReleaseEpoch;
                  Navigator.of(context).pop();
                }
              : null,
        ),
      ),
    );
  } finally {
    _updatePromptOpen = false;
  }
}
