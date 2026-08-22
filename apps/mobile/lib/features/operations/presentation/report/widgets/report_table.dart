import 'package:flutter/material.dart';

import '../../../../../theme.dart';

class ReportTableColumn {
  const ReportTableColumn({
    required this.label,
    this.flex = 1,
    this.alignment = Alignment.centerLeft,
    this.headerAlignment,
  });

  final String label;
  final int flex;
  final Alignment alignment;
  final Alignment? headerAlignment;
}

class ReportTable extends StatelessWidget {
  const ReportTable({
    super.key,
    required this.columns,
    required this.rows,
    this.emptyMessage = 'No records.',
    this.minimumWidth,
    this.footer,
  });

  final List<ReportTableColumn> columns;

  /// Every row must contain exactly the same
  /// number of cells as [columns].
  final List<List<Widget>> rows;

  final String emptyMessage;

  /// Leave null when the table should fit the
  /// available report width.
  ///
  /// A value may still be supplied for genuinely
  /// wide tables, but it will never create an
  /// infinite-width constraint.
  final double? minimumWidth;

  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final availableWidth = constraints.maxWidth;

        final requestedWidth = minimumWidth ?? availableWidth;

        final tableWidth = requestedWidth > availableWidth
            ? requestedWidth
            : availableWidth;

        final table = SizedBox(
          width: tableWidth,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _ReportTableHeader(
                columns: columns,
              ),

              if (rows.isEmpty)
                _EmptyTableRow(
                  message: emptyMessage,
                )
              else
                for (
                  var index = 0;
                  index < rows.length;
                  index++
                )
                  _ReportTableRow(
                    columns: columns,
                    cells: rows[index],
                    showBottomBorder:
                        index < rows.length - 1,
                  ),

              if (footer != null) ...[
                const Divider(
                  height: 1,
                  thickness: 1,
                  color: line,
                ),
                footer!,
              ],
            ],
          ),
        );

        if (tableWidth <= availableWidth) {
          return table;
        }

        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: table,
        );
      },
    );
  }
}

class _ReportTableHeader extends StatelessWidget {
  const _ReportTableHeader({
    required this.columns,
  });

  final List<ReportTableColumn> columns;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(
        minHeight: 38,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 8,
      ),
      color: const Color(0xFFF7F8FA),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          for (final column in columns)
            Expanded(
              flex: column.flex,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 3,
                ),
                child: Align(
                  alignment:
                      column.headerAlignment ??
                      column.alignment,
                  child: Text(
                    column.label,
                    maxLines: 2,
                    softWrap: true,
                    overflow: TextOverflow.ellipsis,
                    textAlign:
                        _textAlignForAlignment(
                      column.headerAlignment ??
                          column.alignment,
                    ),
                    style: const TextStyle(
                      color: midnightNavy,
                      fontSize: 7.8,
                      height: 1.15,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.05,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ReportTableRow extends StatelessWidget {
  const _ReportTableRow({
    required this.columns,
    required this.cells,
    required this.showBottomBorder,
  });

  final List<ReportTableColumn> columns;
  final List<Widget> cells;
  final bool showBottomBorder;

  @override
  Widget build(BuildContext context) {
    assert(
      columns.length == cells.length,
      'Report table row must match column count.',
    );

    return Container(
      constraints: const BoxConstraints(
        minHeight: 42,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 8,
      ),
      decoration: BoxDecoration(
        border: showBottomBorder
            ? const Border(
                bottom: BorderSide(
                  color: line,
                ),
              )
            : null,
      ),
      child: Row(
        crossAxisAlignment:
            CrossAxisAlignment.center,
        children: [
          for (
            var index = 0;
            index < columns.length;
            index++
          )
            Expanded(
              flex: columns[index].flex,
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(
                  horizontal: 3,
                ),
                child: Align(
                  alignment:
                      columns[index].alignment,
                  child: cells[index],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _EmptyTableRow extends StatelessWidget {
  const _EmptyTableRow({
    required this.message,
  });

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(
        minHeight: 76,
      ),
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(
        horizontal: 20,
        vertical: 20,
      ),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: slateText,
          fontSize: 9,
          height: 1.35,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

/// Normal textual value in a report table.
class ReportTableText extends StatelessWidget {
  const ReportTableText(
    this.value, {
    super.key,
    this.strong = false,
    this.color,
    this.textAlign = TextAlign.left,
    this.maxLines = 2,
  });

  final String value;
  final bool strong;
  final Color? color;
  final TextAlign textAlign;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return Text(
      value,
      maxLines: maxLines,
      softWrap: true,
      overflow: TextOverflow.ellipsis,
      textAlign: textAlign,
      style: TextStyle(
        color: color ?? midnightNavy,
        fontSize: 8,
        height: 1.22,
        fontWeight: strong
            ? FontWeight.w800
            : FontWeight.w600,
      ),
    );
  }
}

/// Monetary/numeric table value.
///
/// Unlike normal text this scales down when necessary
/// instead of wrapping a large value such as 38,980,000
/// onto multiple lines.
class ReportTableMoney extends StatelessWidget {
  const ReportTableMoney(
    this.value, {
    super.key,
    this.strong = false,
    this.color,
    this.prefix,
  });

  final String value;
  final bool strong;
  final Color? color;

  /// Example: 'UGX'
  ///
  /// For dense report tables we normally leave this
  /// null and put "(UGX)" in the column heading.
  final String? prefix;

  @override
  Widget build(BuildContext context) {
    final formatted =
        prefix == null || prefix!.trim().isEmpty
        ? value
        : '${prefix!.trim()} $value';

    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerRight,
      child: Text(
        formatted,
        maxLines: 1,
        softWrap: false,
        textAlign: TextAlign.right,
        style: TextStyle(
          color: color ?? midnightNavy,
          fontSize: 8,
          height: 1.15,
          fontWeight: strong
              ? FontWeight.w800
              : FontWeight.w600,
        ),
      ),
    );
  }
}

/// Cell containing a primary value with optional
/// secondary information below it.
class ReportTableStackedText extends StatelessWidget {
  const ReportTableStackedText({
    super.key,
    required this.primary,
    this.secondary,
    this.primaryColor,
    this.alignment =
        CrossAxisAlignment.start,
    this.primaryTextAlign,
  });

  final String primary;
  final String? secondary;
  final Color? primaryColor;
  final CrossAxisAlignment alignment;
  final TextAlign? primaryTextAlign;

  @override
  Widget build(BuildContext context) {
    final textAlign =
        primaryTextAlign ??
        switch (alignment) {
          CrossAxisAlignment.end =>
            TextAlign.right,
          CrossAxisAlignment.center =>
            TextAlign.center,
          _ => TextAlign.left,
        };

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: alignment,
      children: [
        Text(
          primary,
          maxLines: 2,
          softWrap: true,
          overflow: TextOverflow.ellipsis,
          textAlign: textAlign,
          style: TextStyle(
            color:
                primaryColor ??
                midnightNavy,
            fontSize: 8,
            height: 1.2,
            fontWeight:
                FontWeight.w800,
          ),
        ),

        if (secondary != null &&
            secondary!.trim().isNotEmpty) ...[
          const SizedBox(height: 2),

          Text(
            secondary!,
            maxLines: 1,
            softWrap: false,
            overflow:
                TextOverflow.ellipsis,
            textAlign: textAlign,
            style: const TextStyle(
              color: slateText,
              fontSize: 6.8,
              height: 1.15,
              fontWeight:
                  FontWeight.w500,
            ),
          ),
        ],
      ],
    );
  }
}

TextAlign _textAlignForAlignment(
  Alignment alignment,
) {
  if (alignment.x > 0) {
    return TextAlign.right;
  }

  if (alignment.x == 0) {
    return TextAlign.center;
  }

  return TextAlign.left;
}