import 'dart:async';

import 'package:flutter/material.dart';

import '../features/repayment/data/repayments_live_store.dart';
import '../services/session_store.dart';
import '../theme.dart';
import 'search/search_tab.dart';

/// Owner-only search so a loan recorded on the wrong client can be corrected.
class EditRecordsScreen extends StatefulWidget {
  const EditRecordsScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<EditRecordsScreen> createState() => _EditRecordsScreenState();
}

class _EditRecordsScreenState extends State<EditRecordsScreen> {
  @override
  void initState() {
    super.initState();
    unawaited(RepaymentsLiveStore.instance.start(widget.session));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        title: const Text('Edit records'),
        backgroundColor: midnightNavy,
        surfaceTintColor: Colors.transparent,
        shape: const Border(),
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
            color: sage,
            child: const Text(
              'Search any client or loan. Open it, then choose Correct loan record. Use that when a loan was recorded on the wrong person.',
              style: TextStyle(
                color: midnightNavy,
                fontSize: 13,
                height: 1.35,
              ),
            ),
          ),
          const Expanded(
            child: SearchTab(autofocus: true, focusToken: 1),
          ),
        ],
      ),
    );
  }
}
