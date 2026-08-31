import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/api_client.dart';
import '../services/session_store.dart';
import '../theme.dart';
import '../utils/friendly_errors.dart';
import '../utils/money.dart';

class RepaymentCorrectionsScreen extends StatefulWidget {
  const RepaymentCorrectionsScreen({super.key, required this.session});

  final RembehSession session;

  @override
  State<RepaymentCorrectionsScreen> createState() =>
      _RepaymentCorrectionsScreenState();
}

class _RepaymentCorrectionsScreenState
    extends State<RepaymentCorrectionsScreen> {
  final _api = ApiClient(SessionStore());
  final _statuses = const ['PENDING', 'APPROVED', 'REJECTED'];

  List<Map<String, dynamic>> _requests = const [];
  String _status = 'PENDING';
  bool _loading = true;
  String? _busyId;
  String? _error;
  String? _notice;

  bool get _canReviewRequests {
    final permissions = widget.session.permissions;

    return permissions.contains('collection.reconcile') ||
        permissions.contains('operation.close') ||
        permissions.contains('operation.report.review') ||
        (permissions.contains('operation.approve') &&
            permissions.contains('branch.create'));
  }

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final requests = await _api.listRepaymentCorrectionRequests(
        session: widget.session,
        status: _status,
      );

      if (!mounted) return;

      setState(() {
        _requests = requests;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _review(
    Map<String, dynamic> request, {
    required bool approve,
    required bool officerCanEdit,
  }) async {
    final id = _string(request['id']);

    if (id == null || _busyId != null) return;

    setState(() {
      _busyId = id;
      _notice = null;
      _error = null;
    });

    try {
      await _api.reviewRepaymentCorrectionRequest(
        session: widget.session,
        requestId: id,
        status: approve ? 'APPROVED' : 'REJECTED',
        officerCanEdit: approve && officerCanEdit,
        feedback: approve ? null : 'Correction request was not approved.',
      );

      if (!mounted) return;

      setState(() {
        _notice = approve && officerCanEdit
            ? 'Field officer can now edit that repayment.'
            : approve
            ? 'Correction approved.'
            : 'Correction request rejected.';
      });

      await _load();
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = friendlyErrorMessage(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _busyId = null;
        });
      }
    }
  }

  Future<void> _openApplySheet(Map<String, dynamic> request) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
      builder: (_) => _ManagerRepaymentCorrectionSheet(
        request: request,
        session: widget.session,
        api: _api,
      ),
    );

    if (!mounted || result != true) return;

    setState(() {
      _notice = 'Repayment correction saved.';
    });

    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final canReview = _canReviewRequests;

    return Scaffold(
      backgroundColor: softIvory,
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: midnightNavy,
        elevation: 0,
        titleSpacing: 0,
        title: Text(
          canReview ? 'Repayment corrections' : 'Correction history',
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: _loading
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
          children: [
            Text(
              canReview
                  ? 'Approve field officer correction requests or correct open repayment records yourself.'
                  : 'Track the repayment corrections you have requested and see their approval status.',
              style: const TextStyle(
                color: slateText,
                height: 1.35,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _statuses
                  .map(
                    (status) => ChoiceChip(
                      selected: _status == status,
                      label: Text(_statusLabel(status)),
                      onSelected: (_) {
                        if (_status == status) return;

                        setState(() {
                          _status = status;
                        });

                        unawaited(_load());
                      },
                    ),
                  )
                  .toList(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              _MessageBox(text: _error!, danger: true),
            ],
            if (_notice != null) ...[
              const SizedBox(height: 12),
              _MessageBox(text: _notice!, danger: false),
            ],
            const SizedBox(height: 14),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_requests.isEmpty)
              const _EmptyCorrections()
            else
              ..._requests.map(
                (request) => _CorrectionRequestCard(
                  request: request,
                  busy: _busyId == _string(request['id']),
                  canReview: canReview,
                  onEditNow: () => _openApplySheet(request),
                  onOfficerEdit: () =>
                      _review(request, approve: true, officerCanEdit: true),
                  onReject: () =>
                      _review(request, approve: false, officerCanEdit: false),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _CorrectionRequestCard extends StatelessWidget {
  const _CorrectionRequestCard({
    required this.request,
    required this.busy,
    required this.canReview,
    required this.onEditNow,
    required this.onOfficerEdit,
    required this.onReject,
  });

  final Map<String, dynamic> request;
  final bool busy;
  final bool canReview;
  final VoidCallback onEditNow;
  final VoidCallback onOfficerEdit;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final status = _string(request['status']) ?? 'PENDING';
    final applied = _string(request['correctionAppliedAt']) != null;
    final officerCanEdit = request['officerCanEdit'] == true;
    final amount = _num(request['amount']);
    final requestedAmount = _numOrNull(request['requestedAmount']);
    final requestedMethod = _string(request['requestedMethod']);
    final requestedNote = _string(request['requestedNote']);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A0F172A),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: Color(0xFFFFEEF2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.edit_note_rounded,
                  color: Color(0xFFE11D2E),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _string(request['borrowerName']) ?? 'Borrower',
                      style: const TextStyle(
                        color: midnightNavy,
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'Requested by ${_string(request['requestedByName']) ?? 'field officer'}',
                      style: const TextStyle(
                        color: slateText,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              _StatusPill(
                status: status,
                applied: applied,
                officerCanEdit: officerCanEdit,
              ),
            ],
          ),
          const SizedBox(height: 12),
          _PairRow(label: 'Current amount', value: formatMoney(amount)),
          if (requestedAmount != null)
            _PairRow(
              label: 'Requested amount',
              value: formatMoney(requestedAmount),
            ),
          if (requestedMethod != null)
            _PairRow(
              label: 'Requested method',
              value: _methodLabel(requestedMethod),
            ),
          if (requestedNote != null)
            _PairRow(label: 'Requested note', value: requestedNote),
          const SizedBox(height: 8),
          Text(
            _string(request['reason']) ?? 'No reason provided.',
            style: const TextStyle(
              color: midnightNavy,
              fontSize: 12,
              height: 1.35,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (status == 'PENDING' && canReview) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: busy ? null : onEditNow,
                    icon: const Icon(Icons.edit_outlined, size: 17),
                    label: const Text('Edit now'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: busy ? null : onOfficerEdit,
                    icon: const Icon(Icons.how_to_reg_outlined, size: 17),
                    label: const Text('Officer edit'),
                  ),
                ),
                IconButton(
                  onPressed: busy ? null : onReject,
                  tooltip: 'Reject',
                  icon: const Icon(
                    Icons.close_rounded,
                    color: Color(0xFFE11D2E),
                  ),
                ),
              ],
            ),
          ] else if (canReview &&
              status == 'APPROVED' &&
              !applied &&
              !officerCanEdit) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: busy ? null : onEditNow,
                icon: const Icon(Icons.edit_outlined, size: 17),
                label: const Text('Apply correction'),
              ),
            ),
          ] else if (!canReview && status == 'APPROVED' && officerCanEdit) ...[
            const SizedBox(height: 12),
            const _InlineNotice(
              icon: Icons.check_circle_outline,
              text:
                  'Approved. Open the repayment record to save the correction.',
              color: forestEmerald,
            ),
          ] else if (!canReview && status == 'PENDING') ...[
            const SizedBox(height: 12),
            const _InlineNotice(
              icon: Icons.hourglass_top_rounded,
              text: 'Waiting for manager review.',
              color: Color(0xFFC45C26),
            ),
          ],
        ],
      ),
    );
  }
}

class _InlineNotice extends StatelessWidget {
  const _InlineNotice({
    required this.icon,
    required this.text,
    required this.color,
  });

  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        border: Border.all(color: color.withValues(alpha: 0.22)),
        borderRadius: rembehBorderRadius(rembehRadiusSm),
      ),
      child: Row(
        children: [
          Icon(icon, size: 17, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ManagerRepaymentCorrectionSheet extends StatefulWidget {
  const _ManagerRepaymentCorrectionSheet({
    required this.request,
    required this.session,
    required this.api,
  });

  final Map<String, dynamic> request;
  final RembehSession session;
  final ApiClient api;

  @override
  State<_ManagerRepaymentCorrectionSheet> createState() =>
      _ManagerRepaymentCorrectionSheetState();
}

class _ManagerRepaymentCorrectionSheetState
    extends State<_ManagerRepaymentCorrectionSheet> {
  late final _amount = TextEditingController(
    text:
        '${(_numOrNull(widget.request['requestedAmount']) ?? _num(widget.request['amount'])).round()}',
  );

  late final _note = TextEditingController(
    text: _string(widget.request['requestedNote']) ?? '',
  );

  late final _reason = TextEditingController(
    text: _string(widget.request['reason']) ?? '',
  );

  late String _method =
      _string(widget.request['requestedMethod']) ??
      _string(widget.request['method']) ??
      'CASH';

  late DateTime _paidAt =
      DateTime.tryParse(_string(widget.request['requestedPaidAt']) ?? '') ??
      DateTime.tryParse(_string(widget.request['paidAt']) ?? '') ??
      DateTime.now();

  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pickPaidAt() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _paidAt,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );

    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_paidAt),
    );

    if (time == null || !mounted) return;

    setState(() {
      _paidAt = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }

  Future<void> _save() async {
    final repaymentId = _string(widget.request['repaymentId']);
    final requestId = _string(widget.request['id']);
    final amount = int.tryParse(_amount.text.replaceAll(',', '').trim());
    final reason = _reason.text.trim();

    if (repaymentId == null || requestId == null) {
      setState(() {
        _error = 'Correction request is missing repayment details.';
      });
      return;
    }

    if (amount == null || amount <= 0) {
      setState(() {
        _error = 'Enter a valid corrected amount.';
      });
      return;
    }

    if (reason.length < 6) {
      setState(() {
        _error = 'Add a clear reason for this correction.';
      });
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await widget.api.applyRepaymentCorrection(
        session: widget.session,
        repaymentId: repaymentId,
        correctionRequestId: requestId,
        amount: amount,
        method: _method,
        paidAt: _paidAt,
        note: _note.text,
        reason: reason,
      );

      if (!mounted) return;

      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _saving = false;
        _error = friendlyErrorMessage(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 5,
                  decoration: BoxDecoration(
                    color: line,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Correct repayment',
                      style: TextStyle(
                        color: midnightNavy,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _saving
                        ? null
                        : () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF1F2),
                  border: Border.all(color: const Color(0xFFFFCCD5)),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: Text(
                  '${_string(widget.request['borrowerName']) ?? 'Borrower'} · current ${formatMoney(_num(widget.request['amount']))}',
                  style: const TextStyle(
                    color: midnightNavy,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(
                  labelText: 'Correct amount',
                  prefixText: 'UGX ',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _method,
                decoration: const InputDecoration(labelText: 'Payment method'),
                items: const [
                  DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                  DropdownMenuItem(
                    value: 'MOBILE_MONEY',
                    child: Text('Mobile money'),
                  ),
                  DropdownMenuItem(
                    value: 'BANK_TRANSFER',
                    child: Text('Bank transfer'),
                  ),
                  DropdownMenuItem(value: 'OTHER', child: Text('Other')),
                ],
                onChanged: _saving
                    ? null
                    : (value) {
                        if (value == null) return;

                        setState(() {
                          _method = value;
                        });
                      },
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _saving ? null : _pickPaidAt,
                icon: const Icon(Icons.event_outlined),
                label: Text(_formatDateTime(_paidAt)),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _note,
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Payment note'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _reason,
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Reason for correction',
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: const TextStyle(
                    color: Color(0xFFE11D2E),
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check_circle_outline),
                  label: Text(_saving ? 'Saving...' : 'Save correction'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PairRow extends StatelessWidget {
  const _PairRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: slateText,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: midnightNavy,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({
    required this.status,
    required this.applied,
    required this.officerCanEdit,
  });

  final String status;
  final bool applied;
  final bool officerCanEdit;

  @override
  Widget build(BuildContext context) {
    final color = applied
        ? forestEmerald
        : status == 'PENDING'
        ? const Color(0xFFC45C26)
        : status == 'APPROVED'
        ? const Color(0xFF2563EB)
        : const Color(0xFFE11D2E);

    final label = applied
        ? 'Applied'
        : status == 'APPROVED' && officerCanEdit
        ? 'Officer edit'
        : _statusLabel(status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _MessageBox extends StatelessWidget {
  const _MessageBox({required this.text, required this.danger});

  final String text;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: danger ? const Color(0xFFFFF1F2) : sage,
        border: Border.all(
          color: danger
              ? const Color(0xFFFFCCD5)
              : forestEmerald.withValues(alpha: 0.2),
        ),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: danger ? const Color(0xFFE11D2E) : forestEmerald,
          fontWeight: FontWeight.w800,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _EmptyCorrections extends StatelessWidget {
  const _EmptyCorrections();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 34),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusLg),
      ),
      child: const Column(
        children: [
          Icon(Icons.fact_check_outlined, color: forestEmerald, size: 30),
          SizedBox(height: 10),
          Text(
            'No correction requests here',
            style: TextStyle(
              color: midnightNavy,
              fontWeight: FontWeight.w900,
              fontSize: 15,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'Requests from field officers will appear here.',
            textAlign: TextAlign.center,
            style: TextStyle(color: slateText, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

String? _string(Object? value) {
  final text = value?.toString().trim();

  if (text == null || text.isEmpty) {
    return null;
  }

  return text;
}

num _num(Object? value) {
  if (value is num) {
    return value;
  }

  return num.tryParse(value?.toString() ?? '') ?? 0;
}

num? _numOrNull(Object? value) {
  if (value == null) {
    return null;
  }

  if (value is num) {
    return value;
  }

  return num.tryParse(value.toString());
}

String _methodLabel(String value) {
  switch (value) {
    case 'MOBILE_MONEY':
      return 'Mobile money';
    case 'BANK_TRANSFER':
      return 'Bank transfer';
    case 'CASH':
      return 'Cash';
    default:
      return value;
  }
}

String _statusLabel(String value) {
  switch (value) {
    case 'PENDING':
      return 'Pending';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    default:
      return value;
  }
}

String _formatDateTime(DateTime value) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  final hour = value.hour % 12 == 0 ? 12 : value.hour % 12;

  final minute = value.minute.toString().padLeft(2, '0');

  final suffix = value.hour >= 12 ? 'PM' : 'AM';

  return '${value.day} ${months[value.month - 1]} ${value.year}, '
      '$hour:$minute $suffix';
}
