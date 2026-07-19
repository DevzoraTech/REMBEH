import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../theme.dart';

class LoanFieldLabel extends StatelessWidget {
  const LoanFieldLabel({
    super.key,
    required this.label,
    this.required = true,
    this.showInfo = false,
  });

  final String label;
  final bool required;
  final bool showInfo;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          label,
          style: const TextStyle(
            color: midnightNavy,
            fontWeight: FontWeight.w700,
            fontSize: 13,
          ),
        ),
        if (required)
          const Text(
            ' *',
            style: TextStyle(color: Color(0xFFC62828), fontWeight: FontWeight.w800),
          ),
        if (showInfo) ...[
          const SizedBox(width: 4),
          const Icon(Icons.info_outline, size: 14, color: slateText),
        ],
      ],
    );
  }
}

class LoanTextField extends StatelessWidget {
  const LoanTextField({
    super.key,
    required this.controller,
    required this.hint,
    required this.icon,
    this.keyboardType,
    this.onChanged,
    this.enabled = true,
  });

  final TextEditingController controller;
  final String hint;
  final IconData icon;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      enabled: enabled,
      keyboardType: keyboardType,
      onChanged: onChanged,
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: Icon(icon, color: forestEmerald, size: 20),
        filled: true,
        fillColor: Colors.white,
      ),
    );
  }
}

class LoanSelectField extends StatelessWidget {
  const LoanSelectField({
    super.key,
    required this.value,
    required this.hint,
    required this.icon,
    required this.options,
    required this.onChanged,
  });

  final String? value;
  final String hint;
  final IconData icon;
  final List<String> options;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      key: ValueKey(value ?? hint),
      initialValue: value,
      isExpanded: true,
      icon: const Icon(Icons.keyboard_arrow_down, color: slateText),
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: Icon(icon, color: forestEmerald, size: 20),
        filled: true,
        fillColor: Colors.white,
      ),
      items: options
          .map((option) => DropdownMenuItem(value: option, child: Text(option)))
          .toList(),
      onChanged: onChanged,
    );
  }
}

class LoanHint extends StatelessWidget {
  const LoanHint({
    super.key,
    required this.text,
    this.warning = false,
  });

  final String text;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (warning) ...[
            const Icon(Icons.info_outline, size: 14, color: warmGold),
            const SizedBox(width: 4),
          ],
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: warning ? warmGold : slateText,
                fontSize: 11,
                fontWeight: warning ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class LoanInfoBanner extends StatelessWidget {
  const LoanInfoBanner({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF6E8),
        border: Border.all(color: warmGold.withValues(alpha: 0.45)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 16, color: warmGold),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                color: Color(0xFF8A5A1E),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class LoanCaptureRow extends StatelessWidget {
  const LoanCaptureRow({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.captured,
    required this.onCapture,
    this.previewBytes,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final bool captured;
  final VoidCallback onCapture;
  final Uint8List? previewBytes;

  void _openPreview(BuildContext context) {
    if (previewBytes == null) return;
    showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.white,
        insetPadding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, color: slateText),
                  ),
                ],
              ),
            ),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * 0.55,
              ),
              child: InteractiveViewer(
                child: Image.memory(
                  previewBytes!,
                  fit: BoxFit.contain,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('Close'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () {
                        Navigator.of(context).pop();
                        onCapture();
                      },
                      icon: const Icon(Icons.refresh, size: 16),
                      label: const Text('Retake'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: previewBytes != null ? () => _openPreview(context) : null,
            child: Container(
              width: 56,
              height: 56,
              clipBehavior: Clip.hardEdge,
              decoration: BoxDecoration(
                color: sage,
                border: Border.all(color: line),
              ),
              child: previewBytes != null
                  ? Image.memory(
                      previewBytes!,
                      fit: BoxFit.cover,
                      width: 56,
                      height: 56,
                    )
                  : Icon(
                      captured ? Icons.check_circle : icon,
                      color: forestEmerald,
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: title,
                        style: const TextStyle(
                          color: midnightNavy,
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                        ),
                      ),
                      const TextSpan(
                        text: ' *',
                        style: TextStyle(
                          color: Color(0xFFC62828),
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  captured
                      ? (previewBytes != null
                          ? 'Preview ready · tap thumbnail to enlarge.'
                          : 'Captured successfully.')
                      : subtitle,
                  style: TextStyle(
                    color: captured ? forestEmerald : slateText,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: onCapture,
            style: TextButton.styleFrom(
              foregroundColor: forestEmerald,
              backgroundColor: sage,
              shape: const RoundedRectangleBorder(
                borderRadius: BorderRadius.zero,
              ),
            ),
            icon: Icon(captured ? Icons.refresh : Icons.photo_camera_outlined, size: 16),
            label: Text(captured ? 'Retake' : 'Capture'),
          ),
        ],
      ),
    );
  }
}

class LoanUploadBox extends StatelessWidget {
  const LoanUploadBox({
    super.key,
    required this.label,
    required this.uploaded,
    required this.fileName,
    required this.onUpload,
    this.previewBytes,
  });

  final String label;
  final bool uploaded;
  final String fileName;
  final VoidCallback onUpload;
  final Uint8List? previewBytes;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: midnightNavy,
            fontWeight: FontWeight.w800,
            fontSize: 13,
          ),
        ),
        const SizedBox(height: 8),
        Material(
          color: softIvory,
          child: InkWell(
            onTap: onUpload,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 12),
              decoration: BoxDecoration(
                border: Border.all(color: line, style: BorderStyle.solid),
              ),
              child: Column(
                children: [
                  if (previewBytes != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Image.memory(
                        previewBytes!,
                        height: 96,
                        fit: BoxFit.contain,
                      ),
                    )
                  else
                    Icon(
                      uploaded ? Icons.check_circle : Icons.cloud_upload_outlined,
                      color: forestEmerald,
                      size: 28,
                    ),
                  if (previewBytes == null) const SizedBox(height: 8),
                  Text(
                    uploaded ? fileName : 'Upload document',
                    style: const TextStyle(
                      color: midnightNavy,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    uploaded
                        ? (previewBytes != null
                            ? 'Preview shown · tap to replace'
                            : 'Tap to replace')
                        : 'PDF, JPG or PNG (Max. 10MB)',
                    style: const TextStyle(color: slateText, fontSize: 11),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class LoanSignaturePad extends StatelessWidget {
  const LoanSignaturePad({
    super.key,
    required this.title,
    required this.name,
    required this.icon,
    required this.signed,
    required this.onSign,
    this.locked = false,
    this.version,
  });

  final String title;
  final String name;
  final IconData icon;
  final bool signed;
  final VoidCallback onSign;
  final bool locked;
  final int? version;

  @override
  Widget build(BuildContext context) {
    final readOnly = signed && locked;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: sage,
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 14, color: forestEmerald),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                    Text(
                      name,
                      style: const TextStyle(color: slateText, fontSize: 12),
                    ),
                  ],
                ),
              ),
              if (readOnly)
                const Icon(Icons.lock_outline, size: 16, color: forestEmerald),
            ],
          ),
          const SizedBox(height: 10),
          Material(
            color: softIvory,
            child: InkWell(
              onTap: readOnly ? null : onSign,
              child: Container(
                width: double.infinity,
                height: 96,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  border: Border.all(color: line),
                ),
                child: signed
                    ? Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            name,
                            style: const TextStyle(
                              color: forestEmerald,
                              fontWeight: FontWeight.w800,
                              fontStyle: FontStyle.italic,
                              fontSize: 20,
                            ),
                          ),
                          if (version != null)
                            Text(
                              'Signed · v$version · locked',
                              style: const TextStyle(
                                color: slateText,
                                fontSize: 11,
                              ),
                            ),
                        ],
                      )
                    : const Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.draw_outlined, color: slateText),
                          SizedBox(height: 4),
                          Text('Sign here.', style: TextStyle(color: slateText)),
                        ],
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class LoanSecureFooter extends StatelessWidget {
  const LoanSecureFooter({super.key});

  @override
  Widget build(BuildContext context) {
    return const Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.lock_outline, size: 13, color: slateText),
        SizedBox(width: 6),
        Flexible(
          child: Text(
            'Your information is secure and used only for loan assessment.',
            textAlign: TextAlign.center,
            style: TextStyle(color: slateText, fontSize: 11),
          ),
        ),
      ],
    );
  }
}
