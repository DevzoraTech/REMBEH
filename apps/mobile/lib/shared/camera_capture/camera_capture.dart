import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../permissions/rembeh_permission_gate.dart';

class CapturedMedia {
  const CapturedMedia({
    required this.bytes,
    required this.mimeType,
    this.fileName,
  });

  final Uint8List bytes;
  final String mimeType;
  final String? fileName;
}

Future<CapturedMedia?> captureImageWithPermission(
  BuildContext context, {
  ImageSource source = ImageSource.camera,
}) async {
  final kind = source == ImageSource.camera
      ? RembehPermissionKind.camera
      : RembehPermissionKind.photos;
  final allowed = await ensureRembehPermission(context, kind);
  if (!allowed) return null;

  final picker = ImagePicker();
  final file = await picker.pickImage(
    source: source,
    imageQuality: 75,
    maxWidth: 1600,
  );
  if (file == null) return null;

  final bytes = await file.readAsBytes();
  final lower = file.name.toLowerCase();
  final mimeType = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg';

  return CapturedMedia(
    bytes: bytes,
    mimeType: mimeType,
    fileName: file.name,
  );
}
