import 'package:flutter/material.dart';

import '../../theme.dart';

/// Compact stat card used by the manager/owner dashboard.
///
/// This keeps the original StatCard API so existing callers
/// do not need to be rewritten.
class StatCard extends StatelessWidget {
  const StatCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.iconBackgroundColor,
    required this.primaryMetricLabel,
    required this.primaryMetricValue,
    required this.primaryMetricColor,
    required this.supportingMetrics,
    required this.overallLabel,
    required this.overallValue,
    this.buttonLabel,
    this.onButtonTap,
  });

  final String title;
  final String subtitle;

  final IconData icon;
  final Color iconBackgroundColor;

  final String primaryMetricLabel;
  final String primaryMetricValue;
  final Color primaryMetricColor;

  final List<SupportingMetric> supportingMetrics;

  final String overallLabel;
  final String overallValue;

  final String? buttonLabel;
  final VoidCallback? onButtonTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin:
          const EdgeInsets.symmetric(horizontal: 7),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius:
            rembehBorderRadius(rembehRadiusLg),
        border: Border.all(
          color: iconBackgroundColor.withValues(
            alpha: 0.10,
          ),
        ),
        boxShadow: [
          BoxShadow(
            color: midnightNavy.withValues(
              alpha: 0.045,
            ),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          14,
          13,
          14,
          11,
        ),
        child: Column(
          crossAxisAlignment:
              CrossAxisAlignment.start,
          children: [
            _buildHeader(),

            const SizedBox(height: 7),

            Expanded(
              child: Center(
                child: _buildPrimaryMetric(),
              ),
            ),

            const Divider(
              height: 1,
              thickness: 1,
              color: Color(0xFFE9ECEA),
            ),

            const SizedBox(height: 9),

            _buildBottomSection(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      crossAxisAlignment:
          CrossAxisAlignment.center,
      children: [
        Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color:
                iconBackgroundColor.withValues(
              alpha: 0.10,
            ),
            shape: BoxShape.circle,
          ),
          child: Icon(
            icon,
            color: iconBackgroundColor,
            size: 20,
          ),
        ),

        const SizedBox(width: 10),

        Expanded(
          child: Column(
            crossAxisAlignment:
                CrossAxisAlignment.start,
            children: [
              Text(
                title,
                maxLines: 1,
                overflow:
                    TextOverflow.ellipsis,
                style: TextStyle(
                  color:
                      iconBackgroundColor,
                  fontSize: 15.5,
                  fontWeight:
                      FontWeight.w800,
                  height: 1.05,
                ),
              ),

              const SizedBox(height: 4),

              Text(
                subtitle,
                maxLines: 1,
                overflow:
                    TextOverflow.ellipsis,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 11,
                  fontWeight:
                      FontWeight.w500,
                  height: 1.05,
                ),
              ),
            ],
          ),
        ),

        if (buttonLabel != null)
          _StatusChip(
            label: buttonLabel!,
            color: primaryMetricColor,
            onTap: onButtonTap,
          ),
      ],
    );
  }

  Widget _buildPrimaryMetric() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          primaryMetricLabel,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: Color(0xFF4B5057),
            fontSize: 10.5,
            fontWeight: FontWeight.w600,
            height: 1.1,
          ),
        ),

        const SizedBox(height: 5),

        SizedBox(
          width: double.infinity,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.center,
            child: Text(
              primaryMetricValue,
              maxLines: 1,
              style: TextStyle(
                color: primaryMetricColor,
                fontSize: 26,
                fontWeight: FontWeight.w900,
                height: 0.95,
                letterSpacing: -0.3,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBottomSection() {
    return SizedBox(
      height: 46,
      child: Row(
        crossAxisAlignment:
            CrossAxisAlignment.center,
        children: [
          Expanded(
            flex: 2,
            child: Row(
              children: List.generate(
                supportingMetrics.length,
                (index) {
                  return Expanded(
                    child: Padding(
                      padding:
                          EdgeInsets.only(
                        right: index ==
                                supportingMetrics
                                        .length -
                                    1
                            ? 0
                            : 8,
                      ),
                      child:
                          _SupportingMetricTile(
                        metric:
                            supportingMetrics[index],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),

          Container(
            width: 1,
            height: 38,
            margin:
                const EdgeInsets.symmetric(
              horizontal: 10,
            ),
            color:
                const Color(0xFFE7EAE8),
          ),

          Expanded(
            child: _OverallMetric(
              label: overallLabel,
              value: overallValue,
            ),
          ),
        ],
      ),
    );
  }
}

class SupportingMetric {
  const SupportingMetric({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.value,
    this.valueColor,
  });

  final IconData icon;
  final Color iconColor;

  final String label;
  final String value;

  final Color? valueColor;
}

class _SupportingMetricTile
    extends StatelessWidget {
  const _SupportingMetricTile({
    required this.metric,
  });

  final SupportingMetric metric;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: metric.iconColor.withValues(
              alpha: 0.10,
            ),
            shape: BoxShape.circle,
          ),
          child: Icon(
            metric.icon,
            color: metric.iconColor,
            size: 15,
          ),
        ),

        const SizedBox(width: 6),

        Expanded(
          child: Column(
            mainAxisAlignment:
                MainAxisAlignment.center,
            crossAxisAlignment:
                CrossAxisAlignment.start,
            children: [
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment:
                    Alignment.centerLeft,
                child: Text(
                  metric.value,
                  maxLines: 1,
                  style: TextStyle(
                    color:
                        metric.valueColor ??
                            midnightNavy,
                    fontSize: 11,
                    fontWeight:
                        FontWeight.w800,
                    height: 1,
                  ),
                ),
              ),

              const SizedBox(height: 3),

              Text(
                metric.label,
                maxLines: 1,
                overflow:
                    TextOverflow.ellipsis,
                style: const TextStyle(
                  color: slateText,
                  fontSize: 9,
                  fontWeight:
                      FontWeight.w500,
                  height: 1,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _OverallMetric extends StatelessWidget {
  const _OverallMetric({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final parts = label.split('|');

    final heading = parts.length > 1
        ? parts.first.trim()
        : 'Overall';

    final description = parts.length > 1
        ? parts
            .sublist(1)
            .join('|')
            .trim()
        : label.trim();

    return Column(
      mainAxisAlignment:
          MainAxisAlignment.center,
      crossAxisAlignment:
          CrossAxisAlignment.start,
      children: [
        Text(
          heading,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: slateText,
            fontSize: 9,
            fontWeight: FontWeight.w500,
            height: 1,
          ),
        ),

        const SizedBox(height: 4),

        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            maxLines: 1,
            style: const TextStyle(
              color: midnightNavy,
              fontSize: 11.5,
              fontWeight: FontWeight.w900,
              height: 1,
            ),
          ),
        ),

        const SizedBox(height: 3),

        Text(
          description,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: slateText,
            fontSize: 8.5,
            fontWeight: FontWeight.w500,
            height: 1,
          ),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.label,
    required this.color,
    this.onTap,
  });

  final String label;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final cleanLabel = label
        .replaceFirst(
          RegExp(r'^[•\s]+'),
          '',
        )
        .trim();

    final content = Container(
      height: 26,
      padding:
          const EdgeInsets.symmetric(
        horizontal: 10,
      ),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withValues(
          alpha: 0.07,
        ),
        borderRadius:
            BorderRadius.circular(20),
        border: Border.all(
          color: color.withValues(
            alpha: 0.12,
          ),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 4,
            height: 4,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),

          const SizedBox(width: 5),

          Text(
            cleanLabel,
            style: TextStyle(
              color: color,
              fontSize: 10,
              fontWeight:
                  FontWeight.w700,
              height: 1,
            ),
          ),
        ],
      ),
    );

    if (onTap == null) {
      return content;
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius:
            BorderRadius.circular(20),
        child: content,
      ),
    );
  }
}