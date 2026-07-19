import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../theme.dart';

enum RembehPermissionKind { camera, photos, files }

Future<bool> ensureRembehPermission(
  BuildContext context,
  RembehPermissionKind kind,
) async {
  final meta = switch (kind) {
    RembehPermissionKind.camera => (
        title: 'Camera access',
        body:
            'REMBEH needs camera access to capture applicant photos, National ID images, and signatures for loan verification.',
        permission: Permission.camera,
      ),
    RembehPermissionKind.photos => (
        title: 'Photo library access',
        body:
            'REMBEH needs photo access so you can attach identity or supporting documents already saved on this device.',
        permission: Permission.photos,
      ),
    RembehPermissionKind.files => (
        title: 'Files access',
        body:
            'REMBEH needs file access to upload collateral and supporting documents for this loan application.',
        permission: Permission.storage,
      ),
  };

  final status = await meta.permission.status;
  if (status.isGranted || status.isLimited) return true;

  if (!context.mounted) return false;
  final proceed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) {
      return AlertDialog(
        backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        title: Text(
          meta.title,
          style: const TextStyle(
            color: midnightNavy,
            fontWeight: FontWeight.w800,
          ),
        ),
        content: Text(
          meta.body,
          style: const TextStyle(color: slateText, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Not now'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Continue'),
          ),
        ],
      );
    },
  );

  if (proceed != true) return false;

  // File picks are handled by the system picker; disclosure is enough.
  if (kind == RembehPermissionKind.files) return true;

  final result = await meta.permission.request();
  if (result.isGranted || result.isLimited) return true;

  if (result.isPermanentlyDenied && context.mounted) {
    await showDialog<void>(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: Colors.white,
          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
          title: const Text(
            'Permission required',
            style: TextStyle(
              color: midnightNavy,
              fontWeight: FontWeight.w800,
            ),
          ),
          content: Text(
            '${meta.title} is turned off. Open Settings to enable it for REMBEH.',
            style: const TextStyle(color: slateText, fontSize: 13),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                openAppSettings();
                Navigator.of(context).pop();
              },
              child: const Text('Open Settings'),
            ),
          ],
        );
      },
    );
  }

  return false;
}
