import 'dart:convert';
import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import '../../services/api_client.dart';
import '../../services/session_store.dart';
import 'onboarding_attachment_store.dart';

const _blue = Color(0xff186df2);
const _ink = Color(0xff111d35);
const _muted = Color(0xff69768b);
bool _connectionFailure(Object error) =>
    error is SocketException ||
    error is TimeoutException ||
    error is http.ClientException;
const _baseFields = <String>{
  'full_name',
  'phone',
  'repayable',
  'outstanding',
  'date_issued',
};
const _optionalFields = <String, String>{
  'nin': 'nationalId',
  'email': 'email',
  'dob': 'dateOfBirth',
  'district': 'district',
  'subcounty': 'subCounty',
  'parish': 'parish',
  'village': 'village',
  'loan_purpose': 'loanPurpose',
  'collateral_type': 'collateralType',
  'guar_name': 'guarantorName',
  'guar_phone': 'guarantorPhone',
};
const _attachmentTypes = <String, (String, String)>{
  'borrower_photo': ('PASSPORT', 'Borrower photo'),
  'borrower_id_front': ('NIN_FRONT', 'Borrower ID front'),
  'borrower_id_back': ('NIN_BACK', 'Borrower ID back'),
  'guar_id_front': ('GUARANTOR_NIN_FRONT', 'Guarantor ID front'),
  'guar_id_back': ('GUARANTOR_NIN_BACK', 'Guarantor ID back'),
  'collateral_doc': ('COLLATERAL_DOC', 'Collateral document'),
  'supporting_doc': ('SUPPORTING_DOC', 'Supporting document'),
  'other_doc': ('OTHER_DOC', 'Other document'),
};
const _selectionGroups = <(String, List<(String, String)>)>[
  (
    'Borrower information',
    [
      ('full_name', 'Full name'),
      ('surname', 'Surname'),
      ('given_names', 'Given names'),
      ('phone', 'Phone number'),
      ('nin', 'National identification number (NIN)'),
      ('email', 'Email address'),
      ('gender', 'Gender'),
      ('dob', 'Date of birth'),
      ('district', 'District'),
      ('subcounty', 'Sub-county'),
      ('parish', 'Parish'),
      ('village', 'Village'),
    ],
  ),
  (
    'Existing loan',
    [
      ('principal', 'Loan amount or principal issued'),
      ('repayable', 'Repayable amount'),
      ('outstanding', 'Current outstanding balance'),
      ('currency', 'Currency'),
      ('loan_status', 'Loan status'),
      ('date_approved', 'Date approved'),
      ('date_issued', 'Date issued or disbursed'),
      ('repayment_start', 'Repayment start date'),
      ('loan_officer', 'Assigned loan officer'),
      ('loan_product', 'Loan product'),
      ('loan_purpose', 'Loan purpose'),
      ('collateral_type', 'Collateral type'),
      ('has_fines', 'Whether the loan has fines'),
      ('total_fines', 'Total fines'),
    ],
  ),
  (
    'Loan terms',
    [
      ('interest_rate', 'Interest rate percentage'),
      ('interest_type', 'Interest type'),
      ('duration_days', 'Loan duration in days'),
      ('term_value', 'Loan term value'),
      ('term_unit', 'Loan term unit'),
      ('frequency', 'Repayment frequency'),
      ('processing_fee', 'Processing fee amount'),
      ('processing_fee_type', 'Processing fee type'),
      ('processing_percent', 'Processing fee percentage'),
      ('processing_fixed', 'Fixed processing fee amount'),
      ('penalty_rate', 'Penalty rate percentage'),
      ('fine_period', 'Fine period in days'),
      ('repayment_policy', 'Repayment start policy'),
      ('repayment_delay', 'Repayment start delay in days'),
      ('officer_may_choose', 'Officer may choose repayment start date'),
    ],
  ),
  (
    'Repayment history',
    [
      ('history_amount', 'Amount paid'),
      ('history_date', 'Payment date'),
      ('history_method', 'Payment method'),
      ('history_receipt', 'Receipt number'),
      ('history_officer', 'Officer who recorded the payment'),
      ('history_principal', 'Principal portion'),
      ('history_interest', 'Interest portion'),
      ('history_fees', 'Fees portion'),
      ('history_note', 'Note'),
    ],
  ),
  (
    'Guarantor information',
    [
      ('guar_name', 'Full name'),
      ('guar_phone', 'Phone number'),
      ('guar_id_front', 'National ID image: front'),
      ('guar_id_back', 'National ID image: back'),
      ('guar_signature', 'Signature'),
    ],
  ),
  (
    'Images, documents & signatures',
    [
      ('borrower_photo', 'Borrower photo'),
      ('borrower_id_front', 'Borrower national ID: front'),
      ('borrower_id_back', 'Borrower national ID: back'),
      ('guar_id_front', 'Guarantor national ID: front'),
      ('guar_id_back', 'Guarantor national ID: back'),
      ('collateral_doc', 'Collateral document'),
      ('supporting_doc', 'Supporting document'),
      ('other_doc', 'Other document'),
      ('borrower_signature', 'Borrower signature'),
      ('guar_signature', 'Guarantor signature'),
      ('officer_signature', 'Officer signature'),
      ('signed_agreement', 'Signed loan agreement'),
    ],
  ),
  (
    'Historical disbursement',
    [
      ('disbursed_amount', 'Amount disbursed'),
      ('disbursed_date', 'Date disbursed'),
      ('disbursed_source', 'Disbursement source'),
      ('disbursed_float', 'Amount from assigned float'),
      ('disbursed_collections', 'Amount from collected repayments'),
      ('disbursed_officer', 'Officer who recorded the disbursement'),
      ('disbursed_note', 'Note'),
    ],
  ),
];

class BorrowerOnboardingScreen extends StatefulWidget {
  const BorrowerOnboardingScreen({super.key, required this.session, this.api});
  final RembehSession session;
  final ApiClient? api;

  @override
  State<BorrowerOnboardingScreen> createState() =>
      _BorrowerOnboardingScreenState();
}

class _BorrowerOnboardingScreenState extends State<BorrowerOnboardingScreen> {
  late final _api = widget.api ?? ApiClient(SessionStore());
  final _secureStorage = const FlutterSecureStorage();
  final _form = GlobalKey<FormState>();
  final _fields = <String, TextEditingController>{
    for (final key in [
      'fullName',
      'phone',
      'nationalId',
      'email',
      'dateOfBirth',
      'district',
      'subCounty',
      'parish',
      'village',
      'loanPurpose',
      'collateralType',
      'guarantorName',
      'guarantorPhone',
      'issueDate',
      'paymentStartDate',
      'principal',
      'repayable',
      'outstanding',
      'flatInterestPercent',
      'durationDays',
    ])
      key: TextEditingController(),
  };
  Set<String> _selected = {..._baseFields};
  int _step = 1;
  int _revision = 0;
  int? _savedCount;
  List<Map<String, dynamic>> _savedRecords = [];
  bool _loading = true;
  bool _saving = false;
  bool _offline = false;
  String? _error;
  String _requestId = const Uuid().v4();
  String? _frequency;
  String? _gender;
  String? _confirmedName;
  String _fieldQuery = '';
  bool _selectedOnly = false;
  String? _serverLoanId;
  final Map<String, Map<String, dynamic>> _attachments = {};
  final List<Map<String, dynamic>> _pendingRecords = [];
  bool _restoring = true;
  Future<void> _draftWrites = Future<void>.value();

  String? get _draftKey {
    final tenant = widget.session.tenantId;
    final branch = widget.session.branchId;
    final user = widget.session.userId;
    if (tenant == null ||
        branch == null ||
        user == null ||
        tenant.isEmpty ||
        branch.isEmpty ||
        user.isEmpty) {
      return null;
    }
    return 'borrower_onboarding_draft_v1:$tenant:$branch:$user';
  }

  Map<String, dynamic> _draft() => {
    'requestId': _requestId,
    'frequency': _frequency,
    'gender': _gender,
    'confirmedName': _confirmedName,
    'serverLoanId': _serverLoanId,
    'attachments': _attachments,
    'pendingRecords': _pendingRecords,
    'selectedFields': _selected.toList(),
    'revision': _revision,
    'fields': _fields.map((key, controller) => MapEntry(key, controller.text)),
  };

  Future<void> _writeDraft() {
    return _writeSnapshot(_draft());
  }

  Future<void> _writeSnapshot(Map<String, dynamic> snapshot) {
    final key = _draftKey;
    if (key == null) {
      return Future.error(
        StateError('A signed-in branch user is required to save a draft.'),
      );
    }
    final payload = jsonEncode(snapshot);
    _draftWrites = _draftWrites
        .catchError((_) {})
        .then((_) => _secureStorage.write(key: key, value: payload));
    return _draftWrites;
  }

  void _queueDraft() {
    if (_restoring) return;
    _writeDraft().catchError((_) {
      if (mounted) {
        setState(
          () => _error = 'Could not save this draft securely on the phone.',
        );
      }
    });
  }

  Future<void> _restoreDraft() async {
    final key = _draftKey;
    if (key == null) throw StateError('A signed-in branch user is required.');
    final raw = await _secureStorage.read(key: key);
    if (raw == null) return;
    final decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Invalid saved draft.');
    }
    final requestId = decoded['requestId'];
    if (requestId is! String || !Uuid.isValidUUID(fromString: requestId)) {
      throw const FormatException('Invalid saved request ID.');
    }
    _requestId = requestId;
    final savedLoanId = decoded['serverLoanId'];
    if (savedLoanId != null &&
        (savedLoanId is! String ||
            !Uuid.isValidUUID(fromString: savedLoanId))) {
      throw const FormatException('Invalid saved loan ID.');
    }
    _serverLoanId = savedLoanId as String?;
    final savedAttachments = decoded['attachments'];
    if (savedAttachments != null) {
      if (savedAttachments is! Map) {
        throw const FormatException('Invalid saved attachments.');
      }
      for (final entry in savedAttachments.entries) {
        if (entry.key is! String ||
            !_attachmentTypes.containsKey(entry.key) ||
            entry.value is! Map) {
          throw const FormatException('Invalid saved attachment.');
        }
        final field = entry.key as String;
        final attachment = Map<String, dynamic>.from(entry.value as Map);
        final id = attachment['id'];
        final size = attachment['byteSize'];
        if (id is! String ||
            !Uuid.isValidUUID(fromString: id) ||
            attachment['mediaType'] != _attachmentTypes[field]!.$1 ||
            ![
              'image/jpeg',
              'image/png',
              'application/pdf',
            ].contains(attachment['mimeType']) ||
            size is! int ||
            size < 1 ||
            size > OnboardingAttachmentStore.maxBytes ||
            attachment['fileName'] is! String) {
          throw const FormatException('Invalid saved attachment.');
        }
        _attachments[field] = attachment;
      }
    }
    final savedPending = decoded['pendingRecords'];
    if (savedPending != null) {
      if (savedPending is! List || savedPending.length > 100)
        throw const FormatException('Invalid pending records.');
      for (final item in savedPending) {
        if (item is! Map ||
            item['record'] is! Map ||
            item['attachments'] is! Map)
          throw const FormatException('Invalid pending record.');
        final record = Map<String, dynamic>.from(item['record'] as Map);
        final id = record['requestId'];
        if (id is! String || !Uuid.isValidUUID(fromString: id))
          throw const FormatException('Invalid pending request ID.');
        _pendingRecords.add(Map<String, dynamic>.from(item));
      }
    }
    final savedRevision = decoded['revision'];
    final savedSelection = decoded['selectedFields'];
    if (savedRevision is int && savedRevision > 0 && savedSelection is List) {
      _revision = savedRevision;
      _selected = savedSelection.whereType<String>().toSet();
    }
    final values = decoded['fields'];
    if (values is Map) {
      for (final entry in _fields.entries) {
        final value = values[entry.key];
        if (value is String) entry.value.text = value;
      }
    }
    final frequency = decoded['frequency'];
    if (frequency is String &&
        [
          'DAILY',
          'WEEKLY',
          'BIWEEKLY',
          'MONTHLY',
          'LUMP_SUM',
        ].contains(frequency)) {
      _frequency = frequency;
    }
    final gender = decoded['gender'];
    if (gender is String && ['MALE', 'FEMALE', 'OTHER'].contains(gender))
      _gender = gender;
    _confirmedName = decoded['confirmedName'] as String?;
  }

  Future<void> _editSelection() async {
    if (_saving) return;
    if (_serverLoanId != null) {
      setState(
        () => _error =
            'Finish uploading the saved borrower’s attachments before changing fields.',
      );
      return;
    }
    if (_attachments.isNotEmpty ||
        _fields.values.any((controller) => controller.text.trim().isNotEmpty)) {
      final proceed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Change selected fields?'),
          content: const Text(
            'The borrower currently being entered has not been saved. Changing fields will discard this entry.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep entry'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Discard entry'),
            ),
          ],
        ),
      );
      if (!mounted || proceed != true) return;
      final discarded = Map<String, Map<String, dynamic>>.from(_attachments);
      _restoring = true;
      for (final controller in _fields.values) {
        controller.clear();
      }
      _requestId = const Uuid().v4();
      _confirmedName = null;
      _frequency = null;
      _gender = null;
      _attachments.clear();
      _restoring = false;
      try {
        await _writeDraft();
      } catch (_) {
        _attachments.addAll(discarded);
        if (mounted) {
          setState(() => _error = 'Could not update the draft securely.');
        }
        return;
      }
      for (final attachment in discarded.values) {
        try {
          await OnboardingAttachmentStore(_draftKey!).remove(attachment);
        } catch (_) {
          /* Retain encrypted files if cleanup fails. */
        }
      }
    }
    if (mounted) setState(() => _step = 2);
  }

  @override
  void initState() {
    super.initState();
    for (final controller in _fields.values) {
      controller.addListener(_queueDraft);
    }
    _initialize();
  }

  Future<void> _initialize() async {
    _restoring = true;
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      await _restoreDraft();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not open the saved draft securely.';
      });
      return;
    } finally {
      _restoring = false;
    }
    await _load();
  }

  @override
  void dispose() {
    for (final controller in _fields.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final setup = await _api.getBorrowerOnboardingSetup(
        session: widget.session,
      );
      if (!mounted) return;
      final fields = setup['selectedFields'];
      setState(() {
        if (fields is List && setup['revision'] is int) {
          _selected = fields.whereType<String>().toSet();
          _revision = setup['revision'] as int;
          _step = 3;
        } else {
          _revision = 0;
          _step = 1;
        }
        _offline = false;
        _loading = false;
      });
      try {
        await _writeDraft();
      } catch (_) {
        if (mounted) {
          setState(
            () => _error =
                'Could not save onboarding setup securely on the phone.',
          );
        }
        return;
      }
      if (_step == 3) await _loadRecords();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (_revision > 0) {
          _offline = true;
          _step = 3;
          _error = null;
        } else {
          _error =
              'Could not load branch onboarding. Check your connection and try again.';
        }
      });
    }
  }

  Future<bool> _loadRecords() async {
    try {
      final payload = await _api.listOpeningBorrowers(session: widget.session);
      if (!mounted) return false;
      final total = payload['total'];
      final records = payload['records'];
      if (total is! int || records is! List) {
        throw const FormatException('Invalid saved records response.');
      }
      setState(() {
        _savedCount = total;
        _savedRecords = records.whereType<Map<String, dynamic>>().toList();
      });
      return true;
    } catch (_) {
      if (mounted) setState(() => _savedCount = null);
      return false;
    }
  }

  Future<void> _showRecords() async {
    if (!await _loadRecords() || !mounted) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not load saved records.')),
        );
      }
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * .75,
          child: Column(
            children: [
              ListTile(
                title: const Text('Saved borrower records'),
                trailing: IconButton(
                  icon: const Icon(Icons.close),
                  tooltip: 'Close',
                  onPressed: () => Navigator.pop(context),
                ),
              ),
              if ((_savedCount ?? 0) > _savedRecords.length)
                const Padding(
                  padding: EdgeInsets.all(8),
                  child: Text('Showing the 100 most recent records.'),
                ),
              Expanded(
                child: _savedRecords.isEmpty
                    ? const Center(child: Text('No borrowers saved yet.'))
                    : ListView.builder(
                        itemCount: _savedRecords.length,
                        itemBuilder: (context, index) {
                          final customer = _savedRecords[index]['customer'];
                          final data = customer is Map ? customer : const {};
                          return ListTile(
                            title: Text(
                              data['fullName']?.toString() ??
                                  'Borrower unavailable',
                            ),
                            subtitle: Text(data['phone']?.toString() ?? ''),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _continue() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final setup = await _api.saveBorrowerOnboardingSetup(
        session: widget.session,
        selectedFields: _selected.toList()..sort(),
        revision: _revision,
      );
      if (!mounted) return;
      setState(() {
        _revision = setup['revision'] as int;
        _step = 3;
      });
      await _writeDraft();
      await _loadRecords();
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = error.toString();
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  Map<String, dynamic> _record() {
    String value(String key) => _fields[key]!.text.trim();
    return {
      'requestId': _requestId,
      'fullName': value('fullName'),
      'phone': value('phone'),
      if (_selected.contains('nin') && value('nationalId').isNotEmpty)
        'nationalId': value('nationalId'),
      for (final entry in _optionalFields.entries)
        if (entry.key != 'nin' &&
            _selected.contains(entry.key) &&
            value(entry.value).isNotEmpty)
          entry.value: value(entry.value),
      'issueDate': value('issueDate'),
      'paymentStartDate': value('paymentStartDate'),
      'principal': value('principal'),
      'repayable': value('repayable'),
      'outstanding': value('outstanding'),
      'flatInterestPercent': value('flatInterestPercent'),
      'durationDays': int.parse(value('durationDays')),
      'repaymentFrequency': _frequency,
      if (_selected.contains('gender') && _gender != null) 'gender': _gender,
      if (_confirmedName == value('fullName').toUpperCase())
        'allowNameMatch': true,
    };
  }

  Future<void> _queueOffline() async {
    if (_saving) return;
    if (_serverLoanId == null && !(_form.currentState?.validate() ?? false))
      return;
    if (_pendingRecords.length >= 100) {
      setState(() => _error = 'Sync pending records before adding more.');
      return;
    }
    if (_selected.difference({
      ..._baseFields,
      'gender',
      ..._optionalFields.keys,
      ..._attachmentTypes.keys,
    }).isNotEmpty) {
      setState(
        () => _error =
            'This setup contains fields that this version cannot save.',
      );
      return;
    }
    final record = _record();
    String normalizedPhone(Object? value) {
      final digits = value.toString().replaceAll(RegExp(r'\D'), '');
      return digits.startsWith('0') ? '256${digits.substring(1)}' : digits;
    }

    final phone = normalizedPhone(record['phone']);
    final nin = (record['nationalId'] as String? ?? '')
        .replaceAll(RegExp(r'\s'), '')
        .toUpperCase();
    final name = (record['fullName'] as String)
        .trim()
        .replaceAll(RegExp(r'\s+'), ' ')
        .toUpperCase();
    var matchingName = false;
    for (final pending in _pendingRecords) {
      final previous = Map<String, dynamic>.from(pending['record'] as Map);
      final previousNin = (previous['nationalId'] as String? ?? '')
          .replaceAll(RegExp(r'\s'), '')
          .toUpperCase();
      if (normalizedPhone(previous['phone']) == phone ||
          (nin.isNotEmpty && nin == previousNin)) {
        setState(
          () => _error =
              'A pending record already has this phone number or national ID. Review pending records.',
        );
        return;
      }
      if ((previous['fullName'] as String? ?? '')
              .trim()
              .replaceAll(RegExp(r'\s+'), ' ')
              .toUpperCase() ==
          name)
        matchingName = true;
    }
    if (matchingName) {
      final different = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Possible duplicate'),
          content: const Text(
            'A pending record has the same name. Is this a different person?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Review first'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Different person'),
            ),
          ],
        ),
      );
      if (!mounted || different != true) return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final nextId = const Uuid().v4();
      final pending = [
        ..._pendingRecords,
        {
          'record': record,
          'serverLoanId': _serverLoanId,
          'attachments': Map<String, dynamic>.from(_attachments),
          'error': null,
        },
      ];
      final snapshot = _draft()
        ..['requestId'] = nextId
        ..['frequency'] = null
        ..['gender'] = null
        ..['confirmedName'] = null
        ..['serverLoanId'] = null
        ..['attachments'] = <String, dynamic>{}
        ..['fields'] = {for (final key in _fields.keys) key: ''}
        ..['pendingRecords'] = pending;
      await _writeSnapshot(snapshot);
      if (!mounted) return;
      _restoring = true;
      for (final controller in _fields.values) {
        controller.clear();
      }
      setState(() {
        _pendingRecords.add(pending.last);
        _attachments.clear();
        _requestId = nextId;
        _frequency = null;
        _confirmedName = null;
        _serverLoanId = null;
      });
      _restoring = false;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Queued on this phone. It will be checked when you sync.',
          ),
        ),
      );
    } catch (_) {
      if (mounted)
        setState(
          () => _error = 'Could not securely queue this record on the phone.',
        );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _syncPending() async {
    if (_saving || _pendingRecords.isEmpty) return;
    if (_offline) {
      await _load();
      if (!mounted || _offline) return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      while (_pendingRecords.isNotEmpty) {
        final pending = _pendingRecords.first;
        final record = Map<String, dynamic>.from(pending['record'] as Map);
        try {
          var loanId = pending['serverLoanId'] as String?;
          if (loanId == null) {
            final duplicates = await _api.checkOpeningBorrowerDuplicates(
              session: widget.session,
              record: record,
            );
            if (duplicates['phoneExists'] == true ||
                duplicates['nationalIdExists'] == true) {
              throw StateError(
                'A borrower with this phone number or national ID already exists.',
              );
            }
            if (duplicates['alreadySaved'] != true &&
                (duplicates['matchingNames'] as int? ?? 0) > 0 &&
                record['allowNameMatch'] != true) {
              if (!mounted) return;
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Possible duplicate'),
                  content: Text(
                    'A borrower named ${record['fullName']} already exists in this branch. Is this a different person?',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Review first'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Different person'),
                    ),
                  ],
                ),
              );
              if (!mounted) return;
              if (confirmed != true)
                throw StateError(
                  'Review the matching borrower before syncing this record.',
                );
              record['allowNameMatch'] = true;
              pending['record'] = record;
              await _writeDraft();
            }
            pending['attempted'] = true;
            await _writeDraft();
            final created = await _api.createOpeningBorrower(
              session: widget.session,
              record: record,
            );
            loanId = created['loanId'] as String?;
            if (loanId == null || !Uuid.isValidUUID(fromString: loanId))
              throw StateError('The server did not return a valid loan ID.');
            pending['serverLoanId'] = loanId;
            await _writeDraft();
          }
          final attachments = Map<String, dynamic>.from(
            pending['attachments'] as Map,
          );
          final store = OnboardingAttachmentStore(_draftKey!);
          for (final field in attachments.keys.toList()) {
            final attachment = Map<String, dynamic>.from(
              attachments[field] as Map,
            );
            final bytes = await store.read(attachment);
            await _api.uploadOpeningBorrowerAttachment(
              session: widget.session,
              loanId: loanId,
              mediaType: attachment['mediaType'] as String,
              mimeType: attachment['mimeType'] as String,
              fileName: attachment['fileName'] as String,
              bytes: bytes,
            );
            attachments.remove(field);
            pending['attachments'] = attachments;
            try {
              await _writeDraft();
            } catch (_) {
              attachments[field] = attachment;
              pending['attachments'] = attachments;
              rethrow;
            }
            try {
              await store.remove(attachment);
            } catch (_) {
              /* Retain encrypted files if cleanup fails. */
            }
          }
          final completed = _pendingRecords.removeAt(0);
          try {
            await _writeDraft();
          } catch (_) {
            _pendingRecords.insert(0, completed);
            rethrow;
          }
          if (mounted) setState(() {});
        } catch (error) {
          pending['error'] = error.toString();
          try {
            await _writeDraft();
          } catch (_) {
            if (mounted) setState(() => _error = 'Could not update pending records securely. Keep this screen open and try again.');
            break;
          }
          if (mounted) {
            setState(() {
              if (_connectionFailure(error)) {
                _offline = true;
                _error =
                    'Connection lost. Pending records remain on this phone.';
              } else {
                _error =
                    'A pending record needs attention. Open pending records to review it.';
              }
            });
          }
          break;
        }
      }
      if (mounted) await _loadRecords();
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _showPending() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, refresh) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * .7,
            child: Column(
              children: [
                ListTile(
                  title: const Text('Pending records'),
                  trailing: IconButton(
                    tooltip: 'Close',
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ),
                Expanded(
                  child: _pendingRecords.isEmpty
                      ? const Center(child: Text('No pending records.'))
                      : ListView.builder(
                          itemCount: _pendingRecords.length,
                          itemBuilder: (context, index) {
                            final item = _pendingRecords[index];
                            final record = Map<String, dynamic>.from(
                              item['record'] as Map,
                            );
                            final canRemove =
                                item['serverLoanId'] == null &&
                                item['attempted'] != true;
                            return ListTile(
                              title: Text(
                                record['fullName']?.toString() ?? 'Borrower',
                              ),
                              subtitle: Text(
                                item['error']?.toString() ?? 'Waiting to sync',
                              ),
                              trailing: canRemove
                                  ? IconButton(
                                      tooltip: 'Remove pending record',
                                      icon: const Icon(Icons.delete_outline),
                                      onPressed: () async {
                                        final confirm = await showDialog<bool>(
                                          context: context,
                                          builder: (dialog) => AlertDialog(
                                            title: const Text(
                                              'Remove pending record?',
                                            ),
                                            content: const Text(
                                              'This record has not been submitted and will be removed from this phone.',
                                            ),
                                            actions: [
                                              TextButton(
                                                onPressed: () => Navigator.pop(
                                                  dialog,
                                                  false,
                                                ),
                                                child: const Text('Cancel'),
                                              ),
                                              FilledButton(
                                                onPressed: () =>
                                                    Navigator.pop(dialog, true),
                                                child: const Text('Remove'),
                                              ),
                                            ],
                                          ),
                                        );
                                        if (confirm != true || !mounted) return;
                                        final removed = _pendingRecords
                                            .removeAt(index);
                                        try {
                                          await _writeDraft();
                                        } catch (_) {
                                          _pendingRecords.insert(
                                            index,
                                            removed,
                                          );
                                          if (mounted)
                                            setState(
                                              () => _error =
                                                  'Could not update pending records securely.',
                                            );
                                          return;
                                        }
                                        final attachments =
                                            Map<String, dynamic>.from(
                                              removed['attachments'] as Map,
                                            );
                                        for (final attachment
                                            in attachments.values) {
                                          try {
                                            await OnboardingAttachmentStore(
                                              _draftKey!,
                                            ).remove(
                                              Map<String, dynamic>.from(
                                                attachment as Map,
                                              ),
                                            );
                                          } catch (_) {
                                            /* Retain encrypted files if cleanup fails. */
                                          }
                                        }
                                        if (mounted) {
                                          setState(() {});
                                          refresh(() {});
                                        }
                                      },
                                    )
                                  : null,
                            );
                          },
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _save() async {
    if (_offline) {
      await _queueOffline();
      return;
    }
    if (_serverLoanId == null && !(_form.currentState?.validate() ?? false)) {
      return;
    }
    if (_selected.difference({
      ..._baseFields,
      'gender',
      ..._optionalFields.keys,
      ..._attachmentTypes.keys,
    }).isNotEmpty) {
      setState(
        () => _error =
            'This setup contains fields that this version cannot save. Update the app before continuing.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    String value(String key) => _fields[key]!.text.trim();
    try {
      await _writeDraft();
      if (_serverLoanId == null) {
        final record = _record();
        final duplicates = await _api.checkOpeningBorrowerDuplicates(
          session: widget.session,
          record: record,
        );
        if (!mounted) return;
        if (duplicates['phoneExists'] == true ||
            duplicates['nationalIdExists'] == true) {
          setState(
            () => _error =
                'A borrower with this phone number or national ID already exists. Review that record before continuing.',
          );
          return;
        }
        if (duplicates['alreadySaved'] != true &&
            (duplicates['matchingNames'] as int? ?? 0) > 0 &&
            record['allowNameMatch'] != true) {
          final confirmed = await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Possible duplicate'),
              content: const Text(
                'A borrower with this name already exists in the branch. Check their record before continuing. Is this a different person?',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Review first'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: const Text('Different person'),
                ),
              ],
            ),
          );
          if (!mounted || confirmed != true) return;
          _confirmedName = value('fullName').toUpperCase();
          record['allowNameMatch'] = true;
          await _writeDraft();
        }
        final created = await _api.createOpeningBorrower(
          session: widget.session,
          record: record,
        );
        final loanId = created['loanId'];
        if (loanId is! String || !Uuid.isValidUUID(fromString: loanId)) {
          throw StateError('The server did not return a valid loan ID.');
        }
        _serverLoanId = loanId;
        await _writeDraft();
      }
      final store = OnboardingAttachmentStore(_draftKey!);
      for (final field in _attachments.keys.toList()) {
        final attachment = _attachments[field]!;
        final bytes = await store.read(attachment);
        await _api.uploadOpeningBorrowerAttachment(
          session: widget.session,
          loanId: _serverLoanId!,
          mediaType: attachment['mediaType'] as String,
          mimeType: attachment['mimeType'] as String,
          fileName: attachment['fileName'] as String,
          bytes: bytes,
        );
        _attachments.remove(field);
        try {
          await _writeDraft();
        } catch (_) {
          _attachments[field] = attachment;
          rethrow;
        }
        try {
          await store.remove(attachment);
        } catch (_) {
          /* Retain encrypted files if cleanup fails. */
        }
      }
      if (!mounted) return;
      _restoring = true;
      for (final controller in _fields.values) {
        controller.clear();
      }
      setState(() {
        _requestId = const Uuid().v4();
        _frequency = null;
        _gender = null;
        _confirmedName = null;
        _serverLoanId = null;
      });
      _restoring = false;
      await _writeDraft();
      if (!mounted) return;
      await _loadRecords();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Borrower saved to your branch.')),
      );
    } catch (error) {
      if (mounted) {
        setState(() {
          if (_connectionFailure(error)) {
            _offline = true;
            _error =
                'Connection lost. The entry is kept on this phone and can be queued.';
          } else {
            _error = error.toString();
          }
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  Future<void> _pickDate(String key) async {
    final now = DateTime.now();
    final selected = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: DateTime(1900),
      lastDate: key == 'issueDate' || key == 'dateOfBirth'
          ? now
          : DateTime(now.year + 10),
    );
    if (selected != null) {
      _fields[key]!.text =
          '${selected.year.toString().padLeft(4, '0')}-${selected.month.toString().padLeft(2, '0')}-${selected.day.toString().padLeft(2, '0')}';
    }
  }

  Future<void> _pickAttachment(String field) async {
    final scope = _draftKey;
    if (scope == null || _saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    Map<String, dynamic>? saved;
    final store = OnboardingAttachmentStore(scope);
    try {
      final picked = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
      );
      if (picked == null) return;
      final file = picked.files.single;
      if (file.path == null) {
        throw StateError('The selected file is not available on this phone.');
      }
      saved = await store.store(
        sourcePath: file.path!,
        name: file.name,
        mediaType: _attachmentTypes[field]!.$1,
      );
      if (!mounted) {
        await store.remove(saved);
        return;
      }
      final previous = _attachments[field];
      _attachments[field] = saved;
      try {
        await _writeDraft();
      } catch (_) {
        if (previous == null) {
          _attachments.remove(field);
        } else {
          _attachments[field] = previous;
        }
        await store.remove(saved);
        rethrow;
      }
      if (previous != null) {
        try {
          await store.remove(previous);
        } catch (_) {
          /* Retain encrypted files if cleanup fails. */
        }
      }
      if (mounted) setState(() {});
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Could not save the file. Choose a JPEG, PNG or PDF up to 10 MB.',
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _removeAttachment(String field) async {
    if (_saving) return;
    final attachment = _attachments.remove(field);
    if (attachment == null) return;
    setState(() => _saving = true);
    try {
      await _writeDraft();
      try {
        await OnboardingAttachmentStore(_draftKey!).remove(attachment);
      } catch (_) {
        /* Retain encrypted files if cleanup fails. */
      }
    } catch (_) {
      _attachments[field] = attachment;
      if (mounted) {
        setState(() => _error = 'Could not update the saved attachment.');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _input(
    String key,
    String label, {
    bool optional = false,
    bool number = false,
    bool date = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: TextFormField(
      controller: _fields[key],
      enabled: !_saving && _serverLoanId == null,
      keyboardType: number
          ? const TextInputType.numberWithOptions(decimal: true)
          : TextInputType.text,
      readOnly: date,
      onTap: date ? () => _pickDate(key) : null,
      decoration: InputDecoration(
        labelText: optional ? label : '$label *',
        border: const OutlineInputBorder(),
        isDense: true,
        suffixIcon: date
            ? const Icon(Icons.calendar_today_outlined, size: 18)
            : null,
      ),
      validator: (value) {
        final text = value?.trim() ?? '';
        if (!optional && text.isEmpty) return 'This field is required.';
        if (text.isNotEmpty &&
            ['phone', 'guarantorPhone'].contains(key) &&
            !RegExp(r'^(?:0\d{9}|\+256\d{9})$').hasMatch(text))
          return 'Enter a valid phone number.';
        if (text.isNotEmpty &&
            ['principal', 'repayable', 'outstanding'].contains(key) &&
            !RegExp(r'^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$').hasMatch(text))
          return 'Enter a valid amount.';
        if (key == 'flatInterestPercent' &&
            text.isNotEmpty &&
            !RegExp(r'^(?:0|[1-9]\d{0,3})(?:\.\d{1,4})?$').hasMatch(text))
          return 'Enter a valid interest rate.';
        if (key == 'durationDays' &&
            (int.tryParse(text) == null || int.parse(text) < 1)) {
          return 'Enter a valid number of days.';
        }
        return null;
      },
    ),
  );

  Widget _group(String title, List<Widget> children) => Padding(
    padding: const EdgeInsets.only(top: 18),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: _ink,
          ),
        ),
        const SizedBox(height: 12),
        ...children,
      ],
    ),
  );

  bool _fieldSupported(String id) =>
      _baseFields.contains(id) ||
      id == 'gender' ||
      _optionalFields.containsKey(id) ||
      _attachmentTypes.containsKey(id);

  Widget _checkItem(String id, String label) => CheckboxListTile(
    title: Text(label),
    subtitle: !_fieldSupported(id) ? const Text('Not available yet') : null,
    value: _selected.contains(id),
    onChanged:
        _baseFields.contains(id) ||
            (!_fieldSupported(id) && !_selected.contains(id))
        ? null
        : (checked) => setState(() {
            if (checked == true) {
              _selected.add(id);
            } else {
              _selected.remove(id);
            }
          }),
  );

  Future<void> _resetSelection() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reset selected fields?'),
        content: const Text(
          'Optional selections will be removed. Required fields stay selected.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Reset'),
          ),
        ],
      ),
    );
    if (mounted && confirm == true)
      setState(() => _selected = {..._baseFields});
  }

  Widget _intro() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: const Color(0xfff1f7ff), borderRadius: BorderRadius.circular(8)),
        child: Column(
          children: [
            Image.asset(
              'assets/borrower-onboarding.png',
              height: 145,
              fit: BoxFit.contain,
            ),
            const SizedBox(height: 12),
            const Text(
              'Set up your existing borrowers',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: _ink,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              "Bring your branch's existing borrower and loan information into REMBEH.",
              textAlign: TextAlign.center,
              style: TextStyle(color: _muted, height: 1.4),
            ),
          ],
        ),
      ),
      const SizedBox(height: 24),
      const Text(
        'How it works',
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
      ),
      for (final (index, text) in [
        'Choose the information you have available about your borrowers and their loans.',
        'Enter the information for one borrower at a time using your selected fields.',
        'Save each record and continue until you have entered all your borrowers.',
      ].indexed)
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: CircleAvatar(
            backgroundColor: const Color(0xffeef5ff),
            child: Text('${index + 1}', style: const TextStyle(color: _blue)),
          ),
          title: Text(text, style: const TextStyle(fontSize: 14)),
        ),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: const Color(0xfff3f5f8), borderRadius: BorderRadius.circular(8)),
        child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.info_outline, color: _muted, size: 20), SizedBox(width: 12),
          Expanded(child: Text('You can leave and continue onboarding later. Saved records will be retained.', style: TextStyle(color: _muted))),
        ]),
      ),
    ],
  );

  Widget _selection() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text(
        'What information do you have?',
        style: TextStyle(
          fontSize: 23,
          fontWeight: FontWeight.w700,
          color: _ink,
        ),
      ),
      const SizedBox(height: 8),
      const Text(
        'Select the information available in your branch records.',
        style: TextStyle(color: _muted),
      ),
      const SizedBox(height: 18),
      Text(
        '${_selected.length} fields selected',
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: 10),
      TextField(
        decoration: const InputDecoration(
          prefixIcon: Icon(Icons.search),
          hintText: 'Search available fields',
          border: OutlineInputBorder(),
          isDense: true,
        ),
        onChanged: (value) =>
            setState(() => _fieldQuery = value.trim().toLowerCase()),
      ),
      Wrap(
        spacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          ActionChip(
            label: const Text('Recommended 5'),
            onPressed: _resetSelection,
          ),
          FilterChip(
            label: const Text('Selected only'),
            selected: _selectedOnly,
            onSelected: (value) => setState(() => _selectedOnly = value),
          ),
          TextButton(
            onPressed: _resetSelection,
            child: const Text('Clear optional'),
          ),
        ],
      ),
      const SizedBox(height: 8),
      const Text(
        'Available information',
        style: TextStyle(fontWeight: FontWeight.w700),
      ),
      for (final (title, fields) in _selectionGroups)
        if (fields.any(
          (field) =>
              (!_selectedOnly || _selected.contains(field.$1)) &&
              (_fieldQuery.isEmpty ||
                  field.$2.toLowerCase().contains(_fieldQuery) ||
                  title.toLowerCase().contains(_fieldQuery)),
        ))
          ExpansionTile(
            title: Text(title),
            subtitle: Text(
              '${fields.where((field) => _selected.contains(field.$1)).length} of ${fields.length} selected',
            ),
            initiallyExpanded:
                title == 'Borrower information' || _fieldQuery.isNotEmpty,
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => setState(() {
                    final optional = fields
                        .map((field) => field.$1)
                        .where(
                          (id) =>
                              _fieldSupported(id) && !_baseFields.contains(id),
                        )
                        .toSet();
                    if (optional.every(_selected.contains)) {
                      _selected.removeAll(optional);
                    } else {
                      _selected.addAll(optional);
                    }
                  }),
                  child: const Text('Select / deselect available'),
                ),
              ),
              for (final (id, label) in fields)
                if ((!_selectedOnly || _selected.contains(id)) &&
                    (_fieldQuery.isEmpty ||
                        label.toLowerCase().contains(_fieldQuery) ||
                        title.toLowerCase().contains(_fieldQuery)))
                  _checkItem(id, label),
            ],
          ),
      const Padding(
        padding: EdgeInsets.symmetric(vertical: 14),
        child: Text(
          'Loan amount, interest, duration, repayment frequency and start date are required to create a loan. Some additional fields and signatures are not available yet.',
          style: TextStyle(color: _muted, height: 1.4),
        ),
      ),
    ],
  );

  Widget _entry() => Form(
    key: _form,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Add existing borrowers',
          style: TextStyle(
            fontSize: 23,
            fontWeight: FontWeight.w700,
            color: _ink,
          ),
        ),
        const SizedBox(height: 8),
        if (_offline)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.cloud_off_outlined),
            title: const Text('Offline'),
            subtitle: const Text(
              'Queued records will be checked when you reconnect.',
            ),
            trailing: TextButton(
              onPressed: _load,
              child: const Text('Reconnect'),
            ),
          ),
        if (_pendingRecords.isNotEmpty)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.cloud_upload_outlined),
            title: Text(
              '${_pendingRecords.length} pending ${_pendingRecords.length == 1 ? 'record' : 'records'}',
            ),
            subtitle: TextButton(
              onPressed: _saving ? null : _showPending,
              child: const Text('Review pending records'),
            ),
            trailing: TextButton(
              onPressed: _saving ? null : _syncPending,
              child: const Text('Sync'),
            ),
          ),
        if (_serverLoanId != null)
          const ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.cloud_upload_outlined),
            title: Text('Borrower saved'),
            subtitle: Text('Attachments are waiting to finish uploading.'),
          ),
        Row(
          children: [
            Expanded(
              child: Text(
                _savedCount == null
                    ? 'Saved records unavailable'
                    : '$_savedCount records saved',
                style: const TextStyle(color: _muted),
              ),
            ),
            TextButton(
              onPressed: _showRecords,
              child: const Text('View saved records'),
            ),
          ],
        ),
        _group('Borrower information', [
          _input('fullName', 'Full name'),
          _input('phone', 'Phone number'),
          if (_selected.contains('nin'))
            _input('nationalId', 'National ID number', optional: true),
          if (_selected.contains('email'))
            _input('email', 'Email address', optional: true),
          if (_selected.contains('gender'))
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: DropdownButtonFormField<String>(
                key: ValueKey('gender-$_requestId'),
                initialValue: _gender,
                decoration: const InputDecoration(
                  labelText: 'Gender',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                items: const [
                  DropdownMenuItem(value: 'MALE', child: Text('Male')),
                  DropdownMenuItem(value: 'FEMALE', child: Text('Female')),
                  DropdownMenuItem(value: 'OTHER', child: Text('Other')),
                ],
                onChanged: _saving || _serverLoanId != null
                    ? null
                    : (value) {
                        setState(() => _gender = value);
                        _queueDraft();
                      },
              ),
            ),
          if (_selected.contains('dob'))
            _input('dateOfBirth', 'Date of birth', optional: true, date: true),
          if (_selected.contains('district'))
            _input('district', 'District', optional: true),
          if (_selected.contains('subcounty'))
            _input('subCounty', 'Sub-county', optional: true),
          if (_selected.contains('parish'))
            _input('parish', 'Parish', optional: true),
          if (_selected.contains('village'))
            _input('village', 'Village', optional: true),
        ]),
        _group('Existing loan', [
          _input('issueDate', 'Date issued', date: true),
          _input('paymentStartDate', 'Repayment start date', date: true),
          _input('principal', 'Loan amount issued', number: true),
          _input('repayable', 'Repayable amount', number: true),
          _input('outstanding', 'Outstanding balance', number: true),
          _input('flatInterestPercent', 'Flat interest rate (%)', number: true),
          _input('durationDays', 'Duration in days', number: true),
          if (_selected.contains('loan_purpose'))
            _input('loanPurpose', 'Loan purpose', optional: true),
          if (_selected.contains('collateral_type'))
            _input('collateralType', 'Collateral type', optional: true),
          DropdownButtonFormField<String>(
            key: ValueKey(_requestId),
            initialValue: _frequency,
            decoration: const InputDecoration(
              labelText: 'Repayment frequency',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            items: const [
              DropdownMenuItem(value: 'DAILY', child: Text('Daily')),
              DropdownMenuItem(value: 'WEEKLY', child: Text('Weekly')),
              DropdownMenuItem(value: 'BIWEEKLY', child: Text('Fortnightly')),
              DropdownMenuItem(value: 'MONTHLY', child: Text('Monthly')),
              DropdownMenuItem(value: 'LUMP_SUM', child: Text('Lump sum')),
            ],
            validator: (value) =>
                value == null ? 'Select a repayment frequency.' : null,
            onChanged: _saving || _serverLoanId != null
                ? null
                : (value) {
                    setState(() => _frequency = value);
                    _queueDraft();
                  },
          ),
        ]),
        if (_selected.contains('guar_name') || _selected.contains('guar_phone'))
          _group('Guarantor information', [
            if (_selected.contains('guar_name'))
              _input('guarantorName', 'Guarantor name', optional: true),
            if (_selected.contains('guar_phone'))
              _input(
                'guarantorPhone',
                'Guarantor phone number',
                optional: true,
              ),
          ]),
        if (_selected.any(_attachmentTypes.containsKey))
          _group('Images and documents', [
            for (final entry in _attachmentTypes.entries)
              if (_selected.contains(entry.key))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.attach_file),
                  title: Text(entry.value.$2),
                  subtitle: Text(
                    _attachments[entry.key]?['fileName']?.toString() ??
                        'No file selected',
                  ),
                  trailing: _attachments.containsKey(entry.key)
                      ? IconButton(
                          tooltip: 'Remove file',
                          onPressed: _saving
                              ? null
                              : () => _removeAttachment(entry.key),
                          icon: const Icon(Icons.close),
                        )
                      : IconButton(
                          tooltip: 'Choose file',
                          onPressed: _saving
                              ? null
                              : () => _pickAttachment(entry.key),
                          icon: const Icon(Icons.add),
                        ),
                ),
          ]),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.white,
    appBar: AppBar(
      backgroundColor: Colors.white,
      foregroundColor: _ink,
      centerTitle: false,
      titleTextStyle: const TextStyle(color: _ink, fontSize: 20, fontWeight: FontWeight.w700),
      title: Text(_step == 3 ? 'Enter borrowers' : 'Onboarding'),
      actions: [
        if (_step == 3)
          IconButton(
            onPressed: _saving ? null : _editSelection,
            tooltip: 'Edit selected fields',
            icon: const Icon(Icons.tune),
          ),
        Padding(
          padding: const EdgeInsets.only(right: 18),
          child: Center(
            child: Text(
              'Step $_step of 3',
              style: const TextStyle(color: _muted, fontSize: 13),
            ),
          ),
        ),
      ],
    ),
    body: _loading
        ? const Center(child: CircularProgressIndicator())
        : _error != null && _revision == 0 && _step == 1
        ? Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_error!, textAlign: TextAlign.center),
                TextButton(onPressed: _initialize, child: const Text('Retry')),
              ],
            ),
          )
        : Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: [
                    for (var i = 1; i <= 3; i++)
                      Expanded(
                        child: Container(
                          height: 4,
                          margin: const EdgeInsets.only(right: 5),
                          color: i <= _step ? _blue : const Color(0xffe9edf4),
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                  children: [
                    if (_step == 1)
                      _intro()
                    else if (_step == 2)
                      _selection()
                    else
                      _entry(),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Text(
                          _error!,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ),
                  ],
                ),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: _blue,
                        minimumSize: const Size.fromHeight(50),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: _saving
                          ? null
                          : _step == 1
                          ? () => setState(() => _step = 2)
                          : _step == 2
                          ? _continue
                          : _save,
                      child: Text(
                        _saving
                            ? 'Please wait...'
                            : _step == 3
                            ? (_offline
                                  ? 'Queue & Add Another'
                                  : _serverLoanId != null
                                  ? 'Finish uploading'
                                  : 'Save & Add Another')
                            : 'Continue',
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
  );
}
