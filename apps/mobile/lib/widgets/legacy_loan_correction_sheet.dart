import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../features/repayment/data/repayments_live_store.dart';
import '../features/repayment/domain/entities/client_loan_detail.dart'
    as repayment;
import '../models/client_detail.dart';
import '../services/api_client.dart';
import '../services/session_store.dart';
import '../shared/camera_capture/camera_capture.dart';
import '../theme.dart';
import '../utils/friendly_errors.dart';
import '../utils/money.dart';
import 'legacy_loan_media_section.dart';

Future<bool> showLegacyLoanCorrectionSheet(
  BuildContext context, {
  required ClientDetail detail,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
    builder: (context) => LegacyLoanCorrectionSheet(detail: detail),
  );
  return result ?? false;
}

Future<bool> showLegacyLoanDeleteSheet(
  BuildContext context, {
  required ClientDetail detail,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(borderRadius: rembehSheetRadius()),
    builder: (context) => LegacyLoanDeleteSheet(detail: detail),
  );
  return result ?? false;
}

class LegacyLoanCorrectionSheet extends StatefulWidget {
  const LegacyLoanCorrectionSheet({super.key, required this.detail});

  final ClientDetail detail;

  @override
  State<LegacyLoanCorrectionSheet> createState() =>
      _LegacyLoanCorrectionSheetState();
}

class _LegacyLoanCorrectionSheetState extends State<LegacyLoanCorrectionSheet> {
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _nin;
  late final TextEditingController _email;
  late final TextEditingController _principal;
  late final TextEditingController _outstanding;
  late final TextEditingController _reason;
  final _formKey = GlobalKey<FormState>();
  bool _saving = false;
  late String _status;
  late DateTime _loanStartDate;
  DateTime? _paymentStartDate;
  late List<ClientLoanMediaItem> _media;
  String? _uploadingMediaType;
  String? _targetCustomerId;
  String? _targetCustomerName;
  String? _targetCustomerPhone;
  final _clientQuery = TextEditingController();
  List<Map<String, dynamic>> _customers = const [];
  List<Map<String, dynamic>> _clientMatches = const [];
  bool _loadingCustomers = false;

  static const _statuses = <(String, String)>[
    ('CURRENT', 'Current'),
    ('IN_ARREARS', 'In arrears'),
    ('RESTRUCTURED', 'Restructured'),
    ('WRITTEN_OFF', 'Written off'),
    ('CLOSED', 'Closed'),
  ];

  static const _mediaSlots = <CorrectionMediaSlot>[
    CorrectionMediaSlot(
      type: 'PASSPORT',
      label: 'Client photo',
      description: 'Passport or clear client photo',
      icon: Icons.person_outline,
    ),
    CorrectionMediaSlot(
      type: 'NIN_FRONT',
      label: 'NIN front',
      description: 'Front side of national ID',
      icon: Icons.badge_outlined,
    ),
    CorrectionMediaSlot(
      type: 'NIN_BACK',
      label: 'NIN back',
      description: 'Back side of national ID',
      icon: Icons.badge,
    ),
    CorrectionMediaSlot(
      type: 'COLLATERAL_DOC',
      label: 'Collateral document',
      description: 'Collateral photo or document',
      icon: Icons.inventory_2_outlined,
    ),
    CorrectionMediaSlot(
      type: 'SUPPORTING_DOC',
      label: 'Supporting document',
      description: 'Any extra loan support file',
      icon: Icons.description_outlined,
    ),
    CorrectionMediaSlot(
      type: 'OTHER_DOC',
      label: 'Other document',
      description: 'Any other useful record file',
      icon: Icons.folder_open_outlined,
    ),
  ];

  @override
  void initState() {
    super.initState();
    final detail = widget.detail;
    _name = TextEditingController(text: detail.fullName);
    _phone = TextEditingController(text: detail.phone);
    _nin = TextEditingController(text: detail.nationalId ?? '');
    _email = TextEditingController(text: detail.customerEmail ?? '');
    _principal = TextEditingController(text: '${detail.principalAmount}');
    _outstanding = TextEditingController(text: '${detail.outstanding}');
    _reason = TextEditingController();
    _principal.addListener(_onAmountChanged);
    _outstanding.addListener(_onAmountChanged);
    _status = _statuses.any((item) => item.$1 == detail.status)
        ? detail.status
        : 'CURRENT';
    _loanStartDate = detail.loanStartDate;
    _paymentStartDate = detail.paymentStartDate;
    _media = List<ClientLoanMediaItem>.of(detail.media);
    if (detail.correctionAccess.source == 'OWNER') {
      _loadCustomers();
    }
  }

  @override
  void dispose() {
    _principal.removeListener(_onAmountChanged);
    _outstanding.removeListener(_onAmountChanged);
    _name.dispose();
    _phone.dispose();
    _nin.dispose();
    _email.dispose();
    _principal.dispose();
    _outstanding.dispose();
    _reason.dispose();
    _clientQuery.dispose();
    super.dispose();
  }

  void _onAmountChanged() {
    if (mounted) setState(() {});
  }

  bool get _canReassign => widget.detail.correctionAccess.source == 'OWNER';

  Future<void> _loadCustomers() async {
    setState(() => _loadingCustomers = true);
    try {
      final session = await SessionStore().read();
      if (session == null) return;
      final customers = await ApiClient(SessionStore()).listCustomers(session);
      if (!mounted) return;
      setState(() {
        _customers = customers;
        _loadingCustomers = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingCustomers = false);
    }
  }

  void _onClientQueryChanged(String value) {
    final needle = value.trim().toLowerCase();
    if (needle.isEmpty) {
      setState(() => _clientMatches = const []);
      return;
    }
    final matches = _customers.where((item) {
      final id = item['id'] as String? ?? '';
      if (id == widget.detail.customerId) return false;
      if ((item['voidedAt'] as String?)?.isNotEmpty == true) return false;
      final name = (item['fullName'] as String? ?? '').toLowerCase();
      final phone = (item['phone'] as String? ?? '').toLowerCase();
      return name.contains(needle) || phone.contains(needle);
    }).take(8).toList();
    setState(() => _clientMatches = matches);
  }

  int _moneyValue(TextEditingController controller) =>
      int.tryParse(controller.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;

  int _moneyFromText(String? value) =>
      int.tryParse((value ?? '').replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;

  Future<void> _pickDate({
    required DateTime initial,
    required ValueChanged<DateTime> onPicked,
  }) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked == null) return;
    onPicked(DateTime(picked.year, picked.month, picked.day));
  }

  Future<void> _handleMediaAction(
    CorrectionMediaSlot slot,
    CorrectionMediaAction action,
  ) async {
    if (_uploadingMediaType != null) return;

    switch (action) {
      case CorrectionMediaAction.open:
        await _openMedia(slot.type);
        return;
      case CorrectionMediaAction.camera:
        final captured = await captureImageWithPermission(context);
        if (captured == null) return;
        await _uploadMedia(slot, captured);
        return;
      case CorrectionMediaAction.gallery:
        final captured = await captureImageWithPermission(
          context,
          source: ImageSource.gallery,
        );
        if (captured == null) return;
        await _uploadMedia(slot, captured);
        return;
      case CorrectionMediaAction.file:
        await _pickFile(slot);
        return;
    }
  }

  Future<void> _pickFile(CorrectionMediaSlot slot) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
      withData: true,
    );
    final file = result?.files.single;
    final bytes = file?.bytes;
    if (file == null || bytes == null) return;

    await _uploadMedia(
      slot,
      CapturedMedia(
        bytes: bytes,
        mimeType: _mimeFromFileName(file.name),
        fileName: file.name,
      ),
    );
  }

  Future<void> _uploadMedia(
    CorrectionMediaSlot slot,
    CapturedMedia media,
  ) async {
    setState(() => _uploadingMediaType = slot.type);
    try {
      final detail = await RepaymentsLiveStore.instance.uploadCorrectionMedia(
        loanId: widget.detail.loanId,
        mediaType: slot.type,
        bytes: media.bytes,
        mimeType: media.mimeType,
        fileName: media.fileName,
      );
      if (!mounted) return;
      setState(() {
        _media = _toUiMedia(detail.media);
      });
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('${slot.label} updated.')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    } finally {
      if (mounted) setState(() => _uploadingMediaType = null);
    }
  }

  Future<void> _openMedia(String mediaType) async {
    ClientLoanMediaItem? current;
    for (final item in _media) {
      if (item.mediaType == mediaType) {
        current = item;
        break;
      }
    }
    final url = current?.url;
    final uri = url == null ? null : Uri.tryParse(url);
    if (uri == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This attachment is not available.')),
      );
      return;
    }

    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open this attachment.')),
      );
    }
  }

  String _mimeFromFileName(String fileName) {
    final lower = fileName.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    return 'image/jpeg';
  }

  List<ClientLoanMediaItem> _toUiMedia(
    List<repayment.ClientLoanMediaItem> media,
  ) {
    return media
        .map(
          (item) => ClientLoanMediaItem(
            id: item.id,
            mediaType: item.mediaType,
            fileName: item.fileName,
            mimeType: item.mimeType,
            byteSize: item.byteSize,
            url: item.url,
            createdAt: item.createdAt,
          ),
        )
        .toList();
  }

  Future<void> _save() async {
    if (_saving || !_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await RepaymentsLiveStore.instance.correctLoan(
        loanId: widget.detail.loanId,
        values: {
          if (_targetCustomerId != null) 'customerId': _targetCustomerId,
          if (_targetCustomerId == null) ...{
            'customerFullName': _name.text.trim(),
            'phone': _phone.text.trim(),
            'nationalId': _emptyToNull(_nin.text),
            'email': _emptyToNull(_email.text),
          },
          'principalAmount': _moneyValue(_principal),
          'outstandingBalance': _moneyValue(_outstanding),
          'loanStartDate': _loanStartDate.toUtc().toIso8601String(),
          if (_paymentStartDate != null)
            'paymentStartDate': _paymentStartDate!.toUtc().toIso8601String(),
          'status': _status,
          'reason': _reason.text.trim(),
        },
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Record corrected and audit saved.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String? _emptyToNull(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(child: Container(width: 40, height: 4, color: line)),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Correct record',
                        style: TextStyle(
                          color: midnightNavy,
                          fontWeight: FontWeight.w800,
                          fontSize: 20,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: _saving ? null : () => Navigator.pop(context),
                      icon: const Icon(Icons.close, color: slateText),
                    ),
                  ],
                ),
                _AccessNotice(access: widget.detail.correctionAccess),
                if (_canReassign) ...[
                  const SizedBox(height: 12),
                  _MoveClientCard(
                    loading: _loadingCustomers,
                    queryController: _clientQuery,
                    matches: _clientMatches,
                    targetName: _targetCustomerName,
                    targetPhone: _targetCustomerPhone,
                    onQueryChanged: _onClientQueryChanged,
                    onSelect: (item) {
                      setState(() {
                        _targetCustomerId = item['id'] as String?;
                        _targetCustomerName = item['fullName'] as String?;
                        _targetCustomerPhone = item['phone'] as String?;
                        _clientQuery.clear();
                        _clientMatches = const [];
                      });
                    },
                    onClear: () {
                      setState(() {
                        _targetCustomerId = null;
                        _targetCustomerName = null;
                        _targetCustomerPhone = null;
                      });
                    },
                  ),
                ],
                if (_targetCustomerId == null) ...[
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _name,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Client name'),
                    validator: (value) =>
                        (value ?? '').trim().isEmpty ? 'Enter a name.' : null,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Phone'),
                    validator: (value) =>
                        (value ?? '').trim().isEmpty ? 'Enter a phone.' : null,
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _nin,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'NIN'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextFormField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'Email'),
                        ),
                      ),
                    ],
                  ),
                ] else
                  const SizedBox(height: 12),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _principal,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Principal amount',
                          prefixText: 'UGX ',
                        ),
                        validator: _positiveMoneyValidator,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextFormField(
                        controller: _outstanding,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Outstanding',
                          prefixText: 'UGX ',
                        ),
                        validator: _nonNegativeMoneyValidator,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: _status,
                  decoration: const InputDecoration(labelText: 'Loan status'),
                  items: [
                    for (final item in _statuses)
                      DropdownMenuItem(value: item.$1, child: Text(item.$2)),
                  ],
                  onChanged: _saving
                      ? null
                      : (value) {
                          if (value == null) return;
                          setState(() => _status = value);
                        },
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _DateField(
                        label: 'Loan start date',
                        value: _loanStartDate,
                        onTap: _saving
                            ? null
                            : () => _pickDate(
                                initial: _loanStartDate,
                                onPicked: (value) =>
                                    setState(() => _loanStartDate = value),
                              ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _DateField(
                        label: 'Repayments start',
                        value: _paymentStartDate,
                        placeholder: 'Not set',
                        onTap: _saving
                            ? null
                            : () => _pickDate(
                                initial: _paymentStartDate ?? _loanStartDate,
                                onPicked: (value) =>
                                    setState(() => _paymentStartDate = value),
                              ),
                        onClear: _paymentStartDate == null || _saving
                            ? null
                            : () => setState(() => _paymentStartDate = null),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _reason,
                  minLines: 3,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Reason for correction',
                    hintText: 'Example: corrected balance from legacy file',
                  ),
                  validator: (value) => (value ?? '').trim().length < 8
                      ? 'Add a clear audit reason.'
                      : null,
                ),
                const SizedBox(height: 12),
                _BalancePreview(
                  principal: _moneyValue(_principal),
                  outstanding: _moneyValue(_outstanding),
                ),
                const SizedBox(height: 12),
                LegacyLoanMediaSection(
                  slots: _mediaSlots,
                  media: _media,
                  uploadingMediaType: _uploadingMediaType,
                  onAction: _handleMediaAction,
                ),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.verified_outlined),
                  label: Text(_saving ? 'Saving...' : 'Save correction'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String? _positiveMoneyValidator(String? value) {
    if (_moneyFromText(value) <= 0) {
      return 'Enter an amount.';
    }
    return null;
  }

  String? _nonNegativeMoneyValidator(String? value) {
    if ((value ?? '').trim().isEmpty) return 'Enter an amount.';
    if (_moneyFromText(value) < 0) return 'Enter a valid amount.';
    return null;
  }
}

class LegacyLoanDeleteSheet extends StatefulWidget {
  const LegacyLoanDeleteSheet({super.key, required this.detail});

  final ClientDetail detail;

  @override
  State<LegacyLoanDeleteSheet> createState() => _LegacyLoanDeleteSheetState();
}

class _LegacyLoanDeleteSheetState extends State<LegacyLoanDeleteSheet> {
  final _reason = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    if (_saving) return;
    final reason = _reason.text.trim();
    if (reason.length < 8) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add a clear audit reason first.')),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      await RepaymentsLiveStore.instance.deleteLoan(
        loanId: widget.detail.loanId,
        reason: reason,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Seeded loan record deleted.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(child: Container(width: 40, height: 4, color: line)),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Delete seeded record',
                      style: TextStyle(
                        color: midnightNavy,
                        fontWeight: FontWeight.w800,
                        fontSize: 20,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _saving ? null : () => Navigator.pop(context),
                    icon: const Icon(Icons.close, color: slateText),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF1F2),
                  border: Border.all(color: const Color(0xFFF0B3BA)),
                  borderRadius: rembehBorderRadius(rembehRadiusMd),
                ),
                child: Text(
                  '${widget.detail.fullName}\n${formatMoney(widget.detail.outstanding)} outstanding',
                  style: const TextStyle(
                    color: Color(0xFF9F1239),
                    fontWeight: FontWeight.w800,
                    height: 1.35,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Only delete records that were imported incorrectly. Any loan with repayments will be refused by the server.',
                style: TextStyle(color: slateText, height: 1.4),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _reason,
                minLines: 3,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Reason for deletion',
                  hintText: 'Example: duplicate legacy import row',
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _saving ? null : _delete,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFE11D48),
                ),
                icon: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.delete_outline),
                label: Text(_saving ? 'Deleting...' : 'Delete record'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AccessNotice extends StatelessWidget {
  const _AccessNotice({required this.access});

  final ClientCorrectionAccess access;

  @override
  Widget build(BuildContext context) {
    final sourceLabel = access.source == 'BRANCH'
        ? 'branch'
        : access.source == 'ORGANIZATION'
        ? 'organization'
        : access.source == 'OWNER'
        ? 'organisation owner'
        : 'admin';
    final message = access.source == 'OWNER'
        ? 'You can edit this loan because you are the organisation owner. Every save is audited.'
        : 'Correction access is enabled by $sourceLabel control. Every save is audited.${access.reason == null || access.reason!.isEmpty ? '' : '\n${access.reason}'}';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        border: Border.all(color: const Color(0xFFF1D48B)),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.admin_panel_settings_outlined, color: warmGold),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: midnightNavy, height: 1.35),
            ),
          ),
        ],
      ),
    );
  }
}

class _BalancePreview extends StatelessWidget {
  const _BalancePreview({required this.principal, required this.outstanding});

  final int principal;
  final int outstanding;

  @override
  Widget build(BuildContext context) {
    final paid = principal - outstanding;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: sage,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Row(
        children: [
          Expanded(
            child: _MiniValue(
              label: 'Principal',
              value: formatMoney(principal),
              color: midnightNavy,
            ),
          ),
          Expanded(
            child: _MiniValue(
              label: 'Paid so far',
              value: formatMoney(paid < 0 ? 0 : paid),
              color: forestEmerald,
            ),
          ),
          Expanded(
            child: _MiniValue(
              label: 'Outstanding',
              value: formatMoney(outstanding),
              color: warmGold,
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniValue extends StatelessWidget {
  const _MiniValue({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: slateText,
            fontSize: 10,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w800,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.value,
    required this.onTap,
    this.placeholder = '',
    this.onClear,
  });

  final String label;
  final DateTime? value;
  final String placeholder;
  final VoidCallback? onTap;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: onClear == null
              ? const Icon(Icons.calendar_today_outlined, size: 18)
              : IconButton(
                  onPressed: onClear,
                  icon: const Icon(Icons.close, size: 18),
                ),
        ),
        child: Text(
          value == null ? placeholder : _shortDate(value!),
          style: const TextStyle(
            color: midnightNavy,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  String _shortDate(DateTime value) {
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
    return '${value.day} ${months[value.month - 1]} ${value.year}';
  }
}

class _MoveClientCard extends StatelessWidget {
  const _MoveClientCard({
    required this.loading,
    required this.queryController,
    required this.matches,
    required this.targetName,
    required this.targetPhone,
    required this.onQueryChanged,
    required this.onSelect,
    required this.onClear,
  });

  final bool loading;
  final TextEditingController queryController;
  final List<Map<String, dynamic>> matches;
  final String? targetName;
  final String? targetPhone;
  final ValueChanged<String> onQueryChanged;
  final ValueChanged<Map<String, dynamic>> onSelect;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: sage,
        border: Border.all(color: line),
        borderRadius: rembehBorderRadius(rembehRadiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'This loan belongs to a different client',
            style: TextStyle(
              color: midnightNavy,
              fontWeight: FontWeight.w800,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Search the correct person at the same branch. Their name and phone will replace the ones on this loan.',
            style: TextStyle(
              color: slateText.withValues(alpha: 0.8),
              fontSize: 12,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 10),
          if (targetName != null)
            Row(
              children: [
                Expanded(
                  child: Text(
                    '$targetName${targetPhone == null || targetPhone!.isEmpty ? '' : ' · $targetPhone'}',
                    style: const TextStyle(
                      color: midnightNavy,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                TextButton(onPressed: onClear, child: const Text('Clear')),
              ],
            )
          else
            TextField(
              controller: queryController,
              onChanged: onQueryChanged,
              decoration: InputDecoration(
                hintText: loading
                    ? 'Loading clients…'
                    : 'Search by name or phone',
                prefixIcon: const Icon(Icons.search, size: 18),
                isDense: true,
              ),
            ),
          if (targetName == null && matches.isNotEmpty)
            ...matches.map((item) {
              final name = item['fullName'] as String? ?? 'Client';
              final phone = item['phone'] as String? ?? '';
              final branch = item['branchName'] as String? ?? '';
              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(
                  name,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  [phone, if (branch.isNotEmpty) branch].join(' · '),
                ),
                onTap: () => onSelect(item),
              );
            }),
        ],
      ),
    );
  }
}

