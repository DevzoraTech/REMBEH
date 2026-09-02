import 'package:flutter/material.dart';

import '../services/session_store.dart';
import 'agent_shell.dart';
import 'branch_workspace_screen.dart';
import 'owner/owner_workspace_screen.dart';
import 'profile/agent_selfie_capture_screen.dart';

Widget rembehWorkspaceFor(RembehSession session) {
  if (session.isOrganisationOwner) {
    return OwnerWorkspaceScreen(session: session);
  }
  if (session.canUseBranchWorkspace) {
    return BranchWorkspaceScreen(session: session);
  }
  if (session.requiresProfilePhoto && !session.hasProfilePhoto) {
    return AgentSelfieCaptureScreen(session: session);
  }
  return AgentShell(session: session);
}
