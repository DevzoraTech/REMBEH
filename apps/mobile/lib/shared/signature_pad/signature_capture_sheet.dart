import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:signature/signature.dart';

import '../../theme.dart';

Future<Uint8List?> showSignatureCaptureSheet(
  BuildContext context, {
  required String title,
  required String signerName,
}) {
  return showModalBottomSheet<Uint8List>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
    builder: (context) {
      return _SignatureCaptureSheet(title: title, signerName: signerName);
    },
  );
}

class _SignatureCaptureSheet extends StatefulWidget {
  const _SignatureCaptureSheet({
    required this.title,
    required this.signerName,
  });

  final String title;
  final String signerName;

  @override
  State<_SignatureCaptureSheet> createState() => _SignatureCaptureSheetState();
}

class _SignatureCaptureSheetState extends State<_SignatureCaptureSheet> {
  final _controller = SignatureController(
    penStrokeWidth: 2.4,
    penColor: midnightNavy,
    exportBackgroundColor: Colors.white,
  );
  final _boundaryKey = GlobalKey();
  bool _saving = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_controller.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please sign before saving.')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final bytes = await _controller.toPngBytes();
      if (bytes == null) {
        final boundary = _boundaryKey.currentContext?.findRenderObject()
            as RenderRepaintBoundary?;
        if (boundary == null) return;
        final image = await boundary.toImage(pixelRatio: 2);
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        if (data == null || !mounted) return;
        Navigator.of(context).pop(data.buffer.asUint8List());
        return;
      }
      if (!mounted) return;
      Navigator.of(context).pop(bytes);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.title,
            style: const TextStyle(
              color: midnightNavy,
              fontWeight: FontWeight.w800,
              fontSize: 18,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            widget.signerName,
            style: const TextStyle(color: slateText, fontSize: 13),
          ),
          const SizedBox(height: 12),
          Container(
            height: 220,
            decoration: BoxDecoration(border: Border.all(color: line)),
            child: RepaintBoundary(
              key: _boundaryKey,
              child: Signature(
                controller: _controller,
                backgroundColor: softIvory,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _saving ? null : () => _controller.clear(),
                  child: const Text('Clear'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Save signature'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
