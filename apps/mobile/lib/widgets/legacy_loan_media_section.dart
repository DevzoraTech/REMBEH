import 'package:flutter/material.dart';

import '../models/client_detail.dart';
import '../theme.dart';

enum CorrectionMediaAction { camera, gallery, file, open }

class CorrectionMediaSlot {
  const CorrectionMediaSlot({
    required this.type,
    required this.label,
    required this.description,
    required this.icon,
  });

  final String type;
  final String label;
  final String description;
  final IconData icon;
}

class LegacyLoanMediaSection extends StatelessWidget {
  const LegacyLoanMediaSection({
    super.key,
    required this.slots,
    required this.media,
    required this.uploadingMediaType,
    required this.onAction,
  });

  final List<CorrectionMediaSlot> slots;
  final List<ClientLoanMediaItem> media;
  final String? uploadingMediaType;
  final Future<void> Function(
    CorrectionMediaSlot slot,
    CorrectionMediaAction action,
  )
  onAction;

  ClientLoanMediaItem? _mediaFor(String type) {
    for (final item in media) {
      if (item.mediaType == type) return item;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: Text(
              'Images and documents',
              style: TextStyle(
                color: midnightNavy,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          for (final slot in slots)
            _MediaRow(
              slot: slot,
              media: _mediaFor(slot.type),
              busy: uploadingMediaType == slot.type,
              onAction: (action) => onAction(slot, action),
            ),
        ],
      ),
    );
  }
}

class _MediaRow extends StatelessWidget {
  const _MediaRow({
    required this.slot,
    required this.media,
    required this.busy,
    required this.onAction,
  });

  final CorrectionMediaSlot slot;
  final ClientLoanMediaItem? media;
  final bool busy;
  final Future<void> Function(CorrectionMediaAction action) onAction;

  @override
  Widget build(BuildContext context) {
    final attached = media != null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: attached ? sage : const Color(0xFFFFFBEB),
          border: Border.all(
            color: attached ? const Color(0xFFD6EBDD) : const Color(0xFFF0DCA9),
          ),
          borderRadius: rembehBorderRadius(10),
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: attached ? Colors.white : const Color(0xFFFFF3DF),
                borderRadius: rembehBorderRadius(10),
              ),
              child: Icon(
                slot.icon,
                color: attached ? forestEmerald : warmGold,
                size: 20,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    slot.label,
                    style: const TextStyle(
                      color: midnightNavy,
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    attached
                        ? media!.fileName?.trim().isNotEmpty == true
                              ? media!.fileName!
                              : 'Attachment saved'
                        : slot.description,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: attached ? forestEmerald : slateText,
                      fontWeight: FontWeight.w700,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            if (busy)
              const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else
              IconButton(
                onPressed: () async {
                  final action = await showCorrectionMediaActionSheet(
                    context,
                    slot: slot,
                    hasExisting: attached,
                  );
                  if (action == null) return;
                  await onAction(action);
                },
                icon: const Icon(Icons.more_horiz, color: midnightNavy),
              ),
          ],
        ),
      ),
    );
  }
}

Future<CorrectionMediaAction?> showCorrectionMediaActionSheet(
  BuildContext context, {
  required CorrectionMediaSlot slot,
  required bool hasExisting,
}) {
  return showModalBottomSheet<CorrectionMediaAction>(
    context: context,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
    builder: (context) {
      return SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: line,
                    borderRadius: rembehBorderRadius(999),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                slot.label,
                style: const TextStyle(
                  color: midnightNavy,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 12),
              if (hasExisting)
                _ActionTile(
                  icon: Icons.open_in_new,
                  label: 'Open current attachment',
                  onTap: () =>
                      Navigator.pop(context, CorrectionMediaAction.open),
                ),
              _ActionTile(
                icon: Icons.photo_camera_outlined,
                label: hasExisting ? 'Replace with camera' : 'Take photo',
                onTap: () =>
                    Navigator.pop(context, CorrectionMediaAction.camera),
              ),
              _ActionTile(
                icon: Icons.photo_library_outlined,
                label: hasExisting ? 'Replace from gallery' : 'Choose photo',
                onTap: () =>
                    Navigator.pop(context, CorrectionMediaAction.gallery),
              ),
              _ActionTile(
                icon: Icons.attach_file,
                label: hasExisting ? 'Replace with file' : 'Upload file',
                onTap: () => Navigator.pop(context, CorrectionMediaAction.file),
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: forestEmerald),
      title: Text(
        label,
        style: const TextStyle(
          color: midnightNavy,
          fontWeight: FontWeight.w800,
        ),
      ),
      onTap: onTap,
    );
  }
}
