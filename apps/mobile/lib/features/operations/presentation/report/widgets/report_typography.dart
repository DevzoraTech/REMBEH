import 'package:flutter/material.dart';

/// Readable report type. Body stays at least 12pt and grows on wider screens.
class ReportType {
  const ReportType._();

  static double _scale(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    if (width >= 900) return 1.2;
    if (width >= 600) return 1.1;
    return 1.0;
  }

  static double _pt(BuildContext context, double size) {
    return size * _scale(context);
  }

  static double title(BuildContext context) => _pt(context, 16);

  static double heading(BuildContext context) => _pt(context, 14);

  static double section(BuildContext context) => _pt(context, 13);

  static double body(BuildContext context) => _pt(context, 12);

  static double money(BuildContext context) => _pt(context, 13);

  static double secondary(BuildContext context) => _pt(context, 11);

  static double caption(BuildContext context) => _pt(context, 11);
}
